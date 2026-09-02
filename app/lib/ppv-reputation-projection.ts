import {
  isGwapDeliverableReferenceV1,
  isPpvReceiptV1,
  isReputationEventV1,
  type GnsRecordSnapshotV1,
  type GwapDeliverableReferenceV1,
  type ParticipantRole,
  type PpvReceiptV1,
  type PpvSealState,
  type ReputationEventV1,
} from "./ppv-reputation/contracts.ts";
import { projectReceipts, refreshReceiptState } from "./ppv-reputation/receipts.ts";
import { deriveSealFacts, resolveSealState, type SealFacts } from "./ppv-reputation/seal-state.ts";
import { computeReputationFacts, isReputationFactsV1, type ReputationFactsV1 } from "./ppv-reputation-facts.ts";

/**
 * The PPV projection. Chain state is the truth; everything in here is a cache
 * that can be rebuilt from chain by reconciliation. Writes are idempotent:
 * the same event ingested any number of times yields one stored event, one
 * receipt per participant, and no duplicate reputation input.
 */

export type ProjectionStorage = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  setIfAbsentValue<T>(key: string, value: T): Promise<boolean>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  deleteIfValue(key: string, value: string): Promise<boolean>;
  key(scope: string, subject: string): string;
};

/** Reads the current chain state of a proof or agreement account. */
export type ChainVerifier = (subjectId: string, kind: "proof" | "agreement") => Promise<ChainVerification>;

export type ChainVerification = {
  exists: boolean;
  revoked: boolean;
  authority: string | null;
  contentHash: string | null;
  checkedAt: string;
};

export type IngestResult = {
  eventId: string;
  stored: boolean;
  receiptIds: string[];
  sealState: PpvSealState;
};

const LOCK_TTL_SECONDS = 15;
const MAX_LIST = 5_000;
const VERIFICATION_TTL_MS = 10 * 60 * 1_000;

export class ReputationProjection {
  private readonly storage: ProjectionStorage;
  private readonly verifier: ChainVerifier;
  private readonly roleHints: (event: ReputationEventV1) => Promise<Readonly<Record<string, ParticipantRole>>>;

  constructor(
    storage: ProjectionStorage,
    verifier: ChainVerifier,
    roleHints: (event: ReputationEventV1) => Promise<Readonly<Record<string, ParticipantRole>>> = async () => ({}),
  ) {
    this.storage = storage;
    this.verifier = verifier;
    this.roleHints = roleHints;
  }

  private eventKey(eventId: string) {
    return this.storage.key("ppv-event", eventId);
  }
  private receiptKey(receiptId: string) {
    return this.storage.key("ppv-receipt", receiptId);
  }
  private subjectEventsKey(subjectId: string) {
    return this.storage.key("ppv-subject-events", subjectId);
  }
  private subjectReceiptsKey(subjectId: string) {
    return this.storage.key("ppv-subject-receipts", subjectId);
  }
  private walletReceiptsKey(wallet: string) {
    return this.storage.key("ppv-wallet-receipts", wallet);
  }
  private nameReceiptsKey(name: string) {
    return this.storage.key("ppv-name-receipts", name);
  }
  private txKey(signature: string) {
    return this.storage.key("ppv-tx", signature);
  }
  private verificationKey(subjectId: string) {
    return this.storage.key("ppv-subject-verified", subjectId);
  }
  private factsKey(wallet: string) {
    return this.storage.key("ppv-wallet-facts", wallet);
  }
  private deliverableKey(proofId: string) {
    return this.storage.key("ppv-deliverable", proofId);
  }
  private deliverableObjectKey(reference: Pick<GwapDeliverableReferenceV1, "sourceProduct" | "sourceObjectId" | "deliverableId">) {
    return this.storage.key("ppv-deliverable-object", `${reference.sourceProduct}:${reference.sourceObjectId}:${reference.deliverableId}`);
  }
  private lockKey(scope: string, subject: string) {
    return this.storage.key(`ppv-lock-${scope}`, subject);
  }

  private async withLock<T>(scope: string, subject: string, work: () => Promise<T>): Promise<T> {
    const key = this.lockKey(scope, subject);
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await this.storage.setIfAbsent(key, token, LOCK_TTL_SECONDS)) {
        try {
          return await work();
        } finally {
          await this.storage.deleteIfValue(key, token).catch(() => false);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25 + attempt * 10));
    }
    throw new Error(`PPV projection lock timeout for ${scope}`);
  }

  private async appendUnique(key: string, scope: string, subject: string, id: string) {
    await this.withLock(scope, subject, async () => {
      const list = normalizeIdList(await this.storage.get<unknown>(key));
      if (list.includes(id)) return;
      list.push(id);
      await this.storage.set(key, list.slice(-MAX_LIST));
    });
  }

  static subjectOf(event: Pick<ReputationEventV1, "agreementId" | "ppvProofId">): { id: string; kind: "proof" | "agreement" } | null {
    if (event.agreementId) return { id: event.agreementId, kind: "agreement" };
    if (event.ppvProofId) return { id: event.ppvProofId, kind: "proof" };
    return null;
  }

  /** Stores the event if new; returns the version that is on record. */
  async recordEvent(event: ReputationEventV1): Promise<{ event: ReputationEventV1; stored: boolean }> {
    if (!isReputationEventV1(event)) throw new TypeError("refusing to store an invalid reputation event");
    const stored = await this.storage.setIfAbsentValue(this.eventKey(event.eventId), event);
    if (stored) return { event, stored: true };
    const existing = await this.storage.get<unknown>(this.eventKey(event.eventId));
    if (!isReputationEventV1(existing)) throw new Error("stored reputation event is corrupt");
    return { event: existing, stored: false };
  }

  async getEvent(eventId: string) {
    const value = await this.storage.get<unknown>(this.eventKey(eventId));
    return isReputationEventV1(value) ? value : null;
  }

  async getReceipt(receiptId: string) {
    const value = await this.storage.get<unknown>(this.receiptKey(receiptId));
    return isPpvReceiptV1(value) ? value : null;
  }

  async listSubjectEvents(subjectId: string): Promise<ReputationEventV1[]> {
    const ids = normalizeIdList(await this.storage.get<unknown>(this.subjectEventsKey(subjectId)));
    const events = await Promise.all(ids.map((id) => this.getEvent(id)));
    return events.filter((e): e is ReputationEventV1 => e !== null);
  }

  private async listReceiptsByKey(key: string): Promise<PpvReceiptV1[]> {
    const ids = normalizeIdList(await this.storage.get<unknown>(key));
    const receipts = await Promise.all(ids.map((id) => this.getReceipt(id)));
    return receipts
      .filter((r): r is PpvReceiptV1 => r !== null)
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
  }

  listWalletReceipts(wallet: string) {
    return this.listReceiptsByKey(this.walletReceiptsKey(wallet));
  }

  /** Receipts recorded while a wallet held this name. The holder wallet stays on every receipt. */
  listNameReceipts(name: string) {
    return this.listReceiptsByKey(this.nameReceiptsKey(name));
  }

  listSubjectReceipts(subjectId: string) {
    return this.listReceiptsByKey(this.subjectReceiptsKey(subjectId));
  }

  async hasProcessedTransaction(signature: string) {
    return (await this.storage.get<unknown>(this.txKey(signature))) !== null;
  }

  async markTransaction(signature: string, record: { slot: number | null; eventIds: string[] }) {
    await this.storage.set(this.txKey(signature), { ...record, processedAt: new Date().toISOString() });
  }

  async verifySubject(subjectId: string, kind: "proof" | "agreement", options: { force?: boolean } = {}): Promise<ChainVerification> {
    const cached = await this.storage.get<ChainVerification>(this.verificationKey(subjectId));
    if (
      !options.force &&
      cached &&
      typeof cached.checkedAt === "string" &&
      Date.now() - Date.parse(cached.checkedAt) < VERIFICATION_TTL_MS
    ) {
      return cached;
    }
    const fresh = await this.verifier(subjectId, kind);
    await this.storage.set(this.verificationKey(subjectId), fresh);
    return fresh;
  }

  async sealFactsFor(subjectId: string, kind: "proof" | "agreement", events?: ReputationEventV1[]): Promise<SealFacts> {
    const [subjectEvents, verification] = await Promise.all([
      events ? Promise.resolve(events) : this.listSubjectEvents(subjectId),
      this.verifySubject(subjectId, kind),
    ]);
    const facts = deriveSealFacts(subjectEvents, { chainVerified: verification.exists });
    if (verification.revoked) facts.proofRevoked = true;
    return facts;
  }

  /**
   * Ingests one normalized event: stores it (first write wins), projects a
   * receipt per participant, indexes them by wallet, by GNS snapshot name and
   * by subject, and refreshes seal state across the subject's receipts.
   */
  async ingest(candidate: ReputationEventV1): Promise<IngestResult> {
    const { event, stored } = await this.recordEvent(candidate);
    const subject = ReputationProjection.subjectOf(event);
    const subjectId = subject?.id ?? event.eventId;
    const subjectKind = subject?.kind ?? "proof";

    await this.appendUnique(this.subjectEventsKey(subjectId), "subject", subjectId, event.eventId);
    const subjectEvents = await this.listSubjectEvents(subjectId);
    const facts = await this.sealFactsFor(subjectId, subjectKind, subjectEvents);
    const sealState = resolveSealState(facts);
    const roleHints = await this.roleHints(event);

    const receipts = projectReceipts(event, { sealState, disputeOpen: facts.disputeOpen, roleHints });
    const receiptIds: string[] = [];
    const wallets = new Set<string>();
    for (const receipt of receipts) {
      const existing = await this.getReceipt(receipt.receiptId);
      const next = existing
        ? refreshReceiptState(existing, { sealState, disputeOpen: facts.disputeOpen, mintEligible: existing.mintEligible, credentialMint: existing.credentialMint })
        : receipt;
      await this.storage.set(this.receiptKey(next.receiptId), next);
      if (!existing) {
        await this.appendUnique(this.walletReceiptsKey(next.holderWallet), "wallet", next.holderWallet, next.receiptId);
        await this.appendUnique(this.subjectReceiptsKey(subjectId), "subject-receipts", subjectId, next.receiptId);
        if (next.holderGnsRecord) {
          await this.appendUnique(this.nameReceiptsKey(next.holderGnsRecord.name), "name", next.holderGnsRecord.name, next.receiptId);
        }
      }
      receiptIds.push(next.receiptId);
      wallets.add(next.holderWallet);
    }

    // The new event may have moved the ladder for every receipt on this subject.
    for (const other of await this.listSubjectReceipts(subjectId)) {
      if (receiptIds.includes(other.receiptId)) continue;
      if (other.sealState !== sealState || other.disputeOpen !== facts.disputeOpen) {
        await this.storage.set(
          this.receiptKey(other.receiptId),
          refreshReceiptState(other, { sealState, disputeOpen: facts.disputeOpen, mintEligible: other.mintEligible, credentialMint: other.credentialMint }),
        );
      }
      wallets.add(other.holderWallet);
    }

    for (const wallet of wallets) await this.refreshFacts(wallet);
    return { eventId: event.eventId, stored, receiptIds, sealState };
  }

  async refreshFacts(wallet: string): Promise<ReputationFactsV1> {
    const receipts = await this.listWalletReceipts(wallet);
    const facts = computeReputationFacts(wallet, receipts);
    await this.storage.set(this.factsKey(wallet), facts);
    return facts;
  }

  async getFacts(wallet: string): Promise<ReputationFactsV1 | null> {
    const value = await this.storage.get<unknown>(this.factsKey(wallet));
    return isReputationFactsV1(value) ? value : null;
  }

  async updateReceiptCredential(receiptId: string, state: { mintEligible: boolean; credentialMint: string | null }) {
    return this.withLock("receipt", receiptId, async () => {
      const receipt = await this.getReceipt(receiptId);
      if (!receipt) return null;
      const next = refreshReceiptState(receipt, { sealState: receipt.sealState, disputeOpen: receipt.disputeOpen, ...state });
      await this.storage.set(this.receiptKey(receiptId), next);
      await this.refreshFacts(receipt.holderWallet);
      return next;
    });
  }

  async getDeliverableReference(proofId: string): Promise<GwapDeliverableReferenceV1 | null> {
    const value = await this.storage.get<unknown>(this.deliverableKey(proofId));
    return isGwapDeliverableReferenceV1(value) ? value : null;
  }

  async findDeliverableReference(reference: Pick<GwapDeliverableReferenceV1, "sourceProduct" | "sourceObjectId" | "deliverableId">) {
    const proofId = await this.storage.get<unknown>(this.deliverableObjectKey(reference));
    return typeof proofId === "string" ? this.getDeliverableReference(proofId) : null;
  }

  /** A proof anchors one deliverable and a deliverable is anchored by one proof; the first registration wins. */
  async registerDeliverableReference(reference: GwapDeliverableReferenceV1): Promise<{ reference: GwapDeliverableReferenceV1; stored: boolean }> {
    if (!isGwapDeliverableReferenceV1(reference)) throw new TypeError("refusing to store an invalid deliverable reference");
    return this.withLock("deliverable", reference.ppvProofId, async () => {
      const existing = await this.getDeliverableReference(reference.ppvProofId);
      if (existing) return { reference: existing, stored: false };
      const byObject = await this.findDeliverableReference(reference);
      if (byObject) return { reference: byObject, stored: false };
      await this.storage.set(this.deliverableKey(reference.ppvProofId), reference);
      await this.storage.set(this.deliverableObjectKey(reference), reference.ppvProofId);
      return { reference, stored: true };
    });
  }
}

function normalizeIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export type VerifiedActivityItem = {
  receiptId: string;
  eventId: string;
  sealState: PpvSealState;
  disputeOpen: boolean;
  sourceProduct: PpvReceiptV1["sourceProduct"];
  eventType: PpvReceiptV1["eventType"];
  outcome: PpvReceiptV1["outcome"];
  role: ParticipantRole;
  holderWallet: string;
  holderGnsRecord: GnsRecordSnapshotV1 | null;
  counterpartyWallets: string[];
  counterpartyGnsRecords: Array<GnsRecordSnapshotV1 | null>;
  amount: string | null;
  mint: string | null;
  ppvProofId: string | null;
  agreementId: string | null;
  transactionSignature: string;
  completedAt: string;
  mintEligible: boolean;
  credentialMint: string | null;
};

/** Public, factual view of a receipt for GNS Verified Activity. No score, no label. */
export function toVerifiedActivityItem(receipt: PpvReceiptV1): VerifiedActivityItem {
  return {
    receiptId: receipt.receiptId,
    eventId: receipt.eventId,
    sealState: receipt.sealState,
    disputeOpen: receipt.disputeOpen,
    sourceProduct: receipt.sourceProduct,
    eventType: receipt.eventType,
    outcome: receipt.outcome,
    role: receipt.role,
    holderWallet: receipt.holderWallet,
    holderGnsRecord: receipt.holderGnsRecord,
    counterpartyWallets: receipt.counterpartyWallets,
    counterpartyGnsRecords: receipt.counterpartyGnsRecords,
    amount: receipt.amount,
    mint: receipt.mint,
    ppvProofId: receipt.ppvProofId,
    agreementId: receipt.agreementId,
    transactionSignature: receipt.transactionSignature,
    completedAt: receipt.completedAt,
    mintEligible: receipt.mintEligible,
    credentialMint: receipt.credentialMint,
  };
}
