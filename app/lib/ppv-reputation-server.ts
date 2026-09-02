import "server-only";

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getGnsApiBase } from "../app/lib/gns";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";
import { decodeAgreement, decodeProofRecord } from "./ppv-reputation-accounts.ts";
import {
  GNS_RECORD_SNAPSHOT_SCHEMA_VERSION,
  isSolanaAddress,
  type GnsRecordSnapshotV1,
  type GwapDeliverableReferenceV1,
  type ParticipantRole,
  type ReputationEventV1,
} from "./ppv-reputation/contracts.ts";
import { normalizeChainEvent, normalizeProductSubmission, type ChainEventEnvelope } from "./ppv-reputation/normalize.ts";
import { buildCredentialMetadata, evaluateCredentialEligibility, type CredentialEligibility } from "./ppv-reputation/eligibility.ts";
import { resolveSealState } from "./ppv-reputation/seal-state.ts";
import {
  ReputationProjection,
  toVerifiedActivityItem,
  type ChainVerification,
  type ProjectionStorage,
  type VerifiedActivityItem,
} from "./ppv-reputation-projection.ts";
import {
  parseHeliusWebhookPayload,
  parseRawTransaction,
  type ParsedTransaction,
  type PpvProgramIds,
} from "./ppv-reputation-webhook-core.ts";
import { signMintAuthorization, type MintAuthorization } from "./ppv-credential-core.ts";
import { finalizeDeliverableReference, type DeliverableDraft } from "./ppv-deliverable-adapters.ts";

/**
 * Server binding for the PPV reputation pipeline:
 *   Solana PPV event -> raw-body webhook -> CPI-event parser -> ReputationEventV1
 *   -> receipt projector -> GNS activity projection -> GwapScore facts.
 * Chain state is the truth. Redis is a projection that reconciliation can rebuild.
 */

export const PPV_CLUSTER = "devnet" as const;
const GNS_SNAPSHOT_TIMEOUT_MS = 4_000;
const RECONCILE_PAGE = 100;

export class PpvConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PpvConfigurationError";
  }
}

export class GnsUnavailableError extends Error {
  constructor() {
    super("GNS identity snapshot is temporarily unavailable");
    this.name = "GnsUnavailableError";
  }
}

export function getPpvProgramIds(): PpvProgramIds {
  const ppvCore = process.env.NEXT_PUBLIC_PPV_CORE_PROGRAM_ID?.trim() || "";
  const ppvCommerce = process.env.NEXT_PUBLIC_PPV_COMMERCE_PROGRAM_ID?.trim() || "";
  if (!isSolanaAddress(ppvCore) || !isSolanaAddress(ppvCommerce) || ppvCore === ppvCommerce) {
    throw new PpvConfigurationError("PPV program ids are not configured");
  }
  return { ppvCore, ppvCommerce };
}

export function isPpvReputationConfigured() {
  try {
    getPpvProgramIds();
    return true;
  } catch {
    return false;
  }
}

function rpcUrl() {
  // PPV Foundation lives on devnet. The app-wide SOLANA_RPC_URL points at
  // mainnet for Wallet Intelligence and must never be used here.
  return (
    process.env.PPV_SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_PPV_RPC_URL?.trim() ||
    clusterApiUrl(PPV_CLUSTER)
  );
}

let connection: Connection | null = null;
function getConnection() {
  if (!connection) connection = new Connection(rpcUrl(), { commitment: "confirmed" });
  return connection;
}

const storage: ProjectionStorage = {
  get: (key) => getWorkspaceRedis().get(key),
  set: (key, value) => getWorkspaceRedis().set(key, value),
  setIfAbsentValue: (key, value) => getWorkspaceRedis().setIfAbsentValue(key, value),
  setIfAbsent: (key, value, ttl) => getWorkspaceRedis().setIfAbsent(key, value, ttl),
  deleteIfValue: (key, value) => getWorkspaceRedis().deleteIfValue(key, value),
  key: (scope, subject) => getPrivateStorageKey(scope, subject),
};

export async function readChainVerification(subjectId: string, kind: "proof" | "agreement"): Promise<ChainVerification> {
  const checkedAt = new Date().toISOString();
  const info = await getConnection().getAccountInfo(new PublicKey(subjectId), "confirmed");
  if (!info) return { exists: false, revoked: false, authority: null, contentHash: null, checkedAt };
  const ids = getPpvProgramIds();
  const owner = info.owner.toBase58();
  const data = new Uint8Array(info.data);
  if (kind === "proof") {
    if (owner !== ids.ppvCore) return { exists: false, revoked: false, authority: null, contentHash: null, checkedAt };
    const proof = decodeProofRecord(data);
    if (!proof) return { exists: false, revoked: false, authority: null, contentHash: null, checkedAt };
    return { exists: true, revoked: proof.status === "revoked", authority: proof.authority, contentHash: proof.contentHash, checkedAt };
  }
  if (owner !== ids.ppvCommerce) return { exists: false, revoked: false, authority: null, contentHash: null, checkedAt };
  const agreement = decodeAgreement(data);
  if (!agreement) return { exists: false, revoked: false, authority: null, contentHash: null, checkedAt };
  return { exists: true, revoked: false, authority: agreement.partyA, contentHash: agreement.contentHash, checkedAt };
}

/** Marketplace agreements know which party buys; that hint only picks a role. */
async function roleHintsFor(event: ReputationEventV1): Promise<Readonly<Record<string, ParticipantRole>>> {
  if (!event.ppvProofId) return {};
  const reference = await getProjection().getDeliverableReference(event.ppvProofId);
  if (!reference || reference.sourceProduct !== "marketplace" || !reference.counterpartyWallet) return {};
  return { [reference.creatorWallet]: "seller", [reference.counterpartyWallet]: "buyer" };
}

let projection: ReputationProjection | null = null;
export function getProjection() {
  if (!projection) projection = new ReputationProjection(storage, readChainVerification, roleHintsFor);
  return projection;
}

/**
 * Snapshots the .gwap identity a wallet holds right now. "none" is a valid
 * answer and is frozen into the event; an outage is not, so it throws and the
 * webhook is retried instead of recording a wrong-forever null.
 */
export async function resolveGnsSnapshot(wallet: string): Promise<GnsRecordSnapshotV1 | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GNS_SNAPSHOT_TIMEOUT_MS);
  try {
    const response = await fetch(`${getGnsApiBase()}/domains/${encodeURIComponent(wallet)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new GnsUnavailableError();
    const payload = (await response.json()) as { domains?: Array<Record<string, unknown>> };
    const domains = Array.isArray(payload.domains) ? payload.domains : [];
    const active = domains.filter((d) => d && d.status !== "expired");
    const primary = active.find((d) => d.is_primary === true) ?? active[0];
    const name = typeof primary?.name === "string" ? primary.name.trim().toLowerCase() : "";
    if (!name || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(name)) return null;
    return {
      schemaVersion: GNS_RECORD_SNAPSHOT_SCHEMA_VERSION,
      name,
      fullName: `${name}.gwap`,
      owner: wallet,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof GnsUnavailableError) throw error;
    throw new GnsUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

/** Current owner of a .gwap name, for activity lookups by domain. */
export async function resolveGnsOwner(name: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GNS_SNAPSHOT_TIMEOUT_MS);
  try {
    const response = await fetch(`${getGnsApiBase()}/resolve/${encodeURIComponent(name)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { found?: boolean; owner?: string | null };
    return payload.found === true && isSolanaAddress(payload.owner) ? payload.owner : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export type IngestSummary = {
  signature: string;
  events: number;
  stored: number;
  receipts: number;
  malformed: number;
  skipped: "failed" | "duplicate" | null;
};

async function ingestEnvelope(envelope: ChainEventEnvelope) {
  const event = await normalizeChainEvent(envelope, {
    resolveGns: resolveGnsSnapshot,
    expectedProgramIds: getPpvProgramIds(),
    lookupDeliverable: (proofId) => getProjection().getDeliverableReference(proofId),
  });
  return getProjection().ingest(event);
}

export async function ingestParsedTransaction(parsed: ParsedTransaction, options: { force?: boolean } = {}): Promise<IngestSummary> {
  const summary: IngestSummary = { signature: parsed.signature, events: parsed.envelopes.length, stored: 0, receipts: 0, malformed: parsed.malformed, skipped: null };
  if (parsed.failed) return { ...summary, skipped: "failed" };
  if (!options.force && parsed.envelopes.length && (await getProjection().hasProcessedTransaction(parsed.signature))) {
    // Re-ingesting is safe (idempotent); skipping is only an optimisation.
    return { ...summary, skipped: "duplicate" };
  }
  const eventIds: string[] = [];
  for (const envelope of parsed.envelopes) {
    const result = await ingestEnvelope(envelope);
    eventIds.push(result.eventId);
    if (result.stored) summary.stored += 1;
    summary.receipts += result.receiptIds.length;
  }
  if (parsed.envelopes.length) await getProjection().markTransaction(parsed.signature, { slot: parsed.slot, eventIds });
  return summary;
}

export async function ingestWebhookPayload(payload: unknown) {
  const { transactions, skipped } = parseHeliusWebhookPayload(payload, getPpvProgramIds());
  const results: IngestSummary[] = [];
  for (const transaction of transactions) results.push(await ingestParsedTransaction(transaction));
  return { results, skippedItems: skipped };
}

export async function fetchParsedTransaction(signature: string): Promise<ParsedTransaction | null> {
  const response = await getConnection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!response) return null;
  const message = response.transaction.message;
  const accountKeys = message.getAccountKeys({
    accountKeysFromLookups: response.meta?.loadedAddresses ?? undefined,
  });
  const staticKeys = accountKeys.staticAccountKeys.map((key) => key.toBase58());
  const compiled = message.compiledInstructions;
  const raw = {
    slot: response.slot,
    blockTime: response.blockTime ?? null,
    transaction: {
      signatures: response.transaction.signatures,
      message: { accountKeys: staticKeys, instructions: compiled.map((ix) => ({ programIdIndex: ix.programIdIndex, data: "" })) },
    },
    meta: {
      err: response.meta?.err ?? null,
      loadedAddresses: response.meta?.loadedAddresses
        ? {
            writable: response.meta.loadedAddresses.writable.map((key) => key.toBase58()),
            readonly: response.meta.loadedAddresses.readonly.map((key) => key.toBase58()),
          }
        : undefined,
      innerInstructions: response.meta?.innerInstructions ?? [],
    },
  };
  return parseRawTransaction(raw, getPpvProgramIds());
}

/**
 * Walks each PPV program's signature history and replays anything the
 * projection has not recorded. Dropped webhooks therefore cannot permanently
 * corrupt history: the next reconciliation pass repairs it from chain.
 */
export async function reconcilePrograms(options: { maxTransactions?: number } = {}) {
  const ids = getPpvProgramIds();
  const budget = Math.max(1, Math.min(500, options.maxTransactions ?? 100));
  const report = { scanned: 0, replayed: 0, stored: 0, receipts: 0, errors: 0 };
  for (const programId of [ids.ppvCore, ids.ppvCommerce]) {
    let before: string | undefined;
    let remaining = budget;
    while (remaining > 0) {
      const page = await getConnection().getSignaturesForAddress(new PublicKey(programId), { before, limit: Math.min(RECONCILE_PAGE, remaining) }, "confirmed");
      if (!page.length) break;
      for (const entry of page) {
        remaining -= 1;
        report.scanned += 1;
        if (entry.err) continue;
        if (await getProjection().hasProcessedTransaction(entry.signature)) continue;
        try {
          const parsed = await fetchParsedTransaction(entry.signature);
          if (!parsed) continue;
          const summary = await ingestParsedTransaction(parsed, { force: true });
          report.replayed += 1;
          report.stored += summary.stored;
          report.receipts += summary.receipts;
        } catch (error) {
          report.errors += 1;
          console.error("ppv_reconcile_error", { signature: entry.signature, name: error instanceof Error ? error.name : "Error" });
        }
      }
      before = page[page.length - 1]?.signature;
      if (page.length < RECONCILE_PAGE) break;
    }
  }
  return report;
}

export class DeliverableRegistrationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "DeliverableRegistrationError";
  }
}

/**
 * Registers a product deliverable against a PPV proof. The proof is re-read
 * from chain: it must exist, belong to the caller, and commit to the claimed
 * hash. Only then is the `proof.submitted` event recorded, and only by
 * borrowing the chain coordinates of the indexed `proof.created` event.
 */
export async function registerDeliverable(input: {
  draft: DeliverableDraft;
  callerWallet: string;
  proofTransactionSignature?: string | null;
}) {
  const { draft, callerWallet } = input;
  if (draft.creatorWallet !== callerWallet) throw new DeliverableRegistrationError("Only the proof authority can anchor a deliverable.", 403);

  const chain = await getProjection().verifySubject(draft.ppvProofId, "proof", { force: true });
  if (!chain.exists) throw new DeliverableRegistrationError("That PPV proof does not exist on chain.", 404);
  if (chain.revoked) throw new DeliverableRegistrationError("That PPV proof has been revoked.", 409);
  if (chain.authority !== callerWallet) throw new DeliverableRegistrationError("That PPV proof belongs to a different wallet.", 403);
  if (chain.contentHash !== draft.proofHash) throw new DeliverableRegistrationError("The proof hash does not match the on-chain commitment.", 409);

  let created = (await getProjection().listSubjectEvents(draft.ppvProofId)).find((e) => e.eventType === "proof.created") ?? null;
  if (!created && input.proofTransactionSignature) {
    const parsed = await fetchParsedTransaction(input.proofTransactionSignature);
    if (parsed) await ingestParsedTransaction(parsed, { force: true });
    created = (await getProjection().listSubjectEvents(draft.ppvProofId)).find((e) => e.eventType === "proof.created") ?? null;
  }
  if (!created) {
    throw new DeliverableRegistrationError("The proof creation has not been indexed yet. Provide its transaction signature or retry shortly.", 409);
  }

  const [creatorGnsRecord, counterpartyGnsRecord] = await Promise.all([
    resolveGnsSnapshot(draft.creatorWallet),
    draft.counterpartyWallet ? resolveGnsSnapshot(draft.counterpartyWallet) : Promise.resolve(null),
  ]);
  const reference: GwapDeliverableReferenceV1 = finalizeDeliverableReference(draft, creatorGnsRecord, new Date().toISOString());
  const registered = await getProjection().registerDeliverableReference(reference);
  if (!registered.stored) {
    const same =
      registered.reference.sourceProduct === reference.sourceProduct &&
      registered.reference.sourceObjectId === reference.sourceObjectId &&
      registered.reference.deliverableId === reference.deliverableId &&
      registered.reference.ppvProofId === reference.ppvProofId;
    if (!same) throw new DeliverableRegistrationError("That proof or deliverable is already anchored to something else.", 409);
  }

  const submission = normalizeProductSubmission({
    reference: registered.reference,
    proofCreated: created,
    submittedAt: registered.reference.createdAt,
    counterpartyGnsRecord,
  });
  const ingest = await getProjection().ingest(submission);
  return { reference: registered.reference, event: submission, receiptIds: ingest.receiptIds, stored: registered.stored };
}

export type ActivityLookup = { wallet?: string | null; domain?: string | null; proofId?: string | null; receiptId?: string | null };

export type VerifiedActivityResponse = {
  schemaVersion: 1;
  resolvedBy: "wallet" | "domain" | "proofId" | "receiptId";
  wallet: string | null;
  domain: string | null;
  items: VerifiedActivityItem[];
};

export async function lookupVerifiedActivity(lookup: ActivityLookup, limit = 50): Promise<VerifiedActivityResponse | null> {
  const projection = getProjection();
  if (lookup.receiptId) {
    const receipt = await projection.getReceipt(lookup.receiptId);
    return { schemaVersion: 1, resolvedBy: "receiptId", wallet: receipt?.holderWallet ?? null, domain: null, items: receipt ? [toVerifiedActivityItem(receipt)] : [] };
  }
  if (lookup.proofId) {
    const receipts = await projection.listSubjectReceipts(lookup.proofId);
    return { schemaVersion: 1, resolvedBy: "proofId", wallet: null, domain: null, items: receipts.slice(0, limit).map(toVerifiedActivityItem) };
  }
  if (lookup.domain) {
    const name = lookup.domain.trim().toLowerCase().replace(/\.gwap$/, "");
    const owner = await resolveGnsOwner(name);
    if (!owner) return { schemaVersion: 1, resolvedBy: "domain", wallet: null, domain: `${name}.gwap`, items: [] };
    // History belongs to the wallet. A name that moved shows its new owner's
    // activity; the previous owner's receipts stay with the previous owner.
    const receipts = await projection.listWalletReceipts(owner);
    return { schemaVersion: 1, resolvedBy: "domain", wallet: owner, domain: `${name}.gwap`, items: receipts.slice(0, limit).map(toVerifiedActivityItem) };
  }
  if (lookup.wallet) {
    const receipts = await projection.listWalletReceipts(lookup.wallet);
    return { schemaVersion: 1, resolvedBy: "wallet", wallet: lookup.wallet, domain: null, items: receipts.slice(0, limit).map(toVerifiedActivityItem) };
  }
  return null;
}

export type CredentialPreparation =
  | { eligible: true; metadata: ReturnType<typeof buildCredentialMetadata>; authorization: MintAuthorization; verificationUri: string }
  | { eligible: false; reasons: Extract<CredentialEligibility, { eligible: false }>["reasons"] };

/**
 * Evaluates NFT eligibility from chain-derived facts and, when eligible,
 * returns public metadata plus a server-signed mint authorization. No mint
 * happens here; the holder decides whether to mint at all.
 */
export async function prepareCredential(receiptId: string, requestedBy: string, origin: string): Promise<CredentialPreparation | null> {
  const projection = getProjection();
  const receipt = await projection.getReceipt(receiptId);
  if (!receipt) return null;
  const subject = ReputationProjection.subjectOf(receipt) ?? { id: receipt.eventId, kind: "proof" as const };
  const [facts, proof] = await Promise.all([
    projection.sealFactsFor(subject.id, subject.kind),
    receipt.ppvProofId ? projection.verifySubject(receipt.ppvProofId, "proof", { force: true }) : Promise.resolve<ChainVerification>({ exists: false, revoked: false, authority: null, contentHash: null, checkedAt: new Date().toISOString() }),
  ]);
  const eligibility = evaluateCredentialEligibility({ receipt, requestedBy, proof, facts });
  const sealState = resolveSealState(facts);
  if (receipt.mintEligible !== eligibility.eligible || receipt.sealState !== sealState) {
    await projection.updateReceiptCredential(receiptId, { mintEligible: eligibility.eligible, credentialMint: receipt.credentialMint });
  }
  if (!eligibility.eligible) return { eligible: false, reasons: eligibility.reasons };
  const verificationUri = `${origin.replace(/\/+$/, "")}/receipt/${receiptId}`;
  const metadata = buildCredentialMetadata(eligibility, verificationUri);
  const secret = process.env.PPV_CREDENTIAL_SIGNING_SECRET || "";
  const authorization = signMintAuthorization({ receiptId, holderWallet: requestedBy, metadata }, secret);
  return { eligible: true, metadata, authorization, verificationUri };
}
