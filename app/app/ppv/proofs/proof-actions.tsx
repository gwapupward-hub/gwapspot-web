"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets as usePrivySolanaWallets,
} from "@privy-io/react-auth/solana";
import bs58 from "bs58";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PPV_CORE_PROOF_KINDS,
  bytesToLowerHex,
  type PpvCoreProofKind,
} from "../../../lib/ppv/core";
import { useGwapOs } from "../../components/os-provider";
import styles from "../ppv.module.css";

type Capability = {
  state: "disabled" | "unavailable" | "read_only" | "ready";
  reasonCode: string | null;
};

type PreparedTransaction = {
  operationId: string;
  action: "create" | "revoke";
  chain: "solana:devnet";
  proofAddress: string;
  proofIdHex: string;
  transactionBase64: string;
  blockhash: string;
  lastValidBlockHeight: number;
  rpcProfileId: string;
};

type Confirmation =
  | {
      status: "pending";
      signature: string;
      proofAddress: string;
    }
  | {
      status: "finalized";
      signature: string;
      proofAddress: string;
      proofState: "active" | "revoked";
    };

type CoreProofRecord = {
  proofAddress: string;
  cluster: "devnet";
  schemaVersion: number;
  proofIdHex: string;
  authority: string;
  contentHashHex: string;
  contextHashHex: string;
  kind: PpvCoreProofKind;
  state: "active" | "revoked";
  createdAtUnix: number;
  revokedAtUnix: number;
};

type VerificationState = "idle" | "checking" | "verified" | "mismatch" | "error";

type PendingCoreAction = {
  operationId?: string;
  owner: string;
  action: "create" | "revoke";
  proofIdHex: string;
  proofAddress: string;
  signature: string;
  submittedAt: string;
  blockhash?: string;
  lastValidBlockHeight?: number;
};

type UiState =
  | "idle"
  | "preparing"
  | "signing"
  | "confirming"
  | "finalized"
  | "sync-required"
  | "expired"
  | "error";

const PENDING_KEY = "gwap-ppv-core-pending-v1";
const ZERO_HASH = "00".repeat(32);
const LEGACY_PENDING_EXPIRY_MS = 10 * 60 * 1_000;

function readApiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const value = body as { error?: unknown; code?: unknown };
  if (typeof value.error === "string" && typeof value.code === "string") {
    return `${value.error} [${value.code}]`;
  }
  return typeof value.error === "string" ? value.error : fallback;
}

function base64Bytes(value: string) {
  const decoded = window.atob(value);
  const out = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    out[index] = decoded.charCodeAt(index);
  }
  return out;
}

async function hashText(value: string) {
  const bytes = new TextEncoder().encode(value);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return bytesToLowerHex(new Uint8Array(digest));
}

function randomProofId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToLowerHex(bytes);
}

function proofIdValid(value: string) {
  return /^[0-9a-f]{32}$/.test(value.trim().toLowerCase());
}

function explorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

function loadPending(owner: string): PendingCoreAction | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCoreAction>;
    if (
      parsed.owner !== owner ||
      (parsed.action !== "create" && parsed.action !== "revoke") ||
      typeof parsed.proofIdHex !== "string" ||
      !proofIdValid(parsed.proofIdHex) ||
      typeof parsed.proofAddress !== "string" ||
      typeof parsed.signature !== "string" ||
      typeof parsed.submittedAt !== "string"
    ) {
      return null;
    }
    return parsed as PendingCoreAction;
  } catch {
    return null;
  }
}

function isLegacyPendingExpired(value: PendingCoreAction) {
  if (typeof value.lastValidBlockHeight === "number") return false;
  const submittedAt = Date.parse(value.submittedAt);
  return Number.isFinite(submittedAt) && Date.now() - submittedAt > LEGACY_PENDING_EXPIRY_MS;
}

function savePending(value: PendingCoreAction) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    // Pending recovery is helpful but not required for transaction correctness.
  }
}

function clearPending(owner: string) {
  try {
    const pending = loadPending(owner);
    if (pending?.owner === owner) window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Local persistence is optional.
  }
}

function terminalConfirmationCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/TRANSACTION_EXPIRED/.test(message)) return "TRANSACTION_EXPIRED";
  if (/TRANSACTION_FAILED/.test(message)) return "TRANSACTION_FAILED";
  return null;
}

function ppvClientErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/reject|declin|cancel/i.test(message)) return "WALLET_REJECTED";
  if (/insufficient|lamports|funds/i.test(message)) return "INSUFFICIENT_FUNDS";
  if (/simulation/i.test(message)) return "SIMULATION_FAILED";
  if (/blockhash|expired/i.test(message)) return "BLOCKHASH_ERROR";
  if (/network|rpc|fetch|timeout/i.test(message)) return "NETWORK_ERROR";
  return "UNKNOWN_CLIENT_ERROR";
}

function reportPpvClientEvent(
  event: "sign_started" | "sign_failed" | "broadcast_returned" | "confirm_started",
  action: "create" | "revoke",
  code?: string,
) {
  void fetch("/api/ppv/core/diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({
      event,
      action,
      code,
      walletType: "privy-solana",
    }),
  }).catch(() => undefined);
}

function actionError(error: unknown) {
  const message = error instanceof Error ? error.message : "PPV Core action failed.";
  if (/reject|declin|cancel/i.test(message)) {
    return "The wallet rejected the request. No new PPV state was confirmed.";
  }
  if (/insufficient|lamports|funds/i.test(message)) {
    return "This devnet wallet needs enough devnet SOL for account rent and the network fee.";
  }
  return message;
}

export function PpvProofActions({
  createCapability,
  revokeCapability,
}: {
  createCapability: Capability;
  revokeCapability: Capability;
}) {
  const { getAccessToken } = usePrivy();
  const { account } = useGwapOs();
  const { wallets } = usePrivySolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const inFlight = useRef(false);
  const [kind, setKind] = useState<PpvCoreProofKind>("document");
  const [evidence, setEvidence] = useState("");
  const [context, setContext] = useState("");
  const [proofIdHex, setProofIdHex] = useState("");
  const [proofAddress, setProofAddress] = useState("");
  const [signature, setSignature] = useState("");
  const [state, setState] = useState<UiState>("idle");
  const [verificationState, setVerificationState] =
    useState<VerificationState>("idle");
  const [verificationMessage, setVerificationMessage] = useState(
    "Paste the original evidence and verify it against the finalized on-chain commitment. Evidence stays in this browser.",
  );
  const [verifiedRecord, setVerifiedRecord] = useState<CoreProofRecord | null>(null);
  const [message, setMessage] = useState(
    "Evidence is hashed in this browser. Only the hashes are sent to the PPV transaction service.",
  );

  const writesReady = createCapability.state === "ready";
  const revokeReady = revokeCapability.state === "ready";
  const wallet = useMemo(
    () => wallets.find((candidate) => candidate.address === account.verifiedWallet),
    [account.verifiedWallet, wallets],
  );

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const confirm = useCallback(
    async (pending: PendingCoreAction, attempts = 14): Promise<Confirmation | null> => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const response = await authenticatedFetch("/api/ppv/core/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: pending.operationId,
            action: pending.action,
            proofIdHex: pending.proofIdHex,
            signature: pending.signature,
            blockhash: pending.blockhash,
            lastValidBlockHeight: pending.lastValidBlockHeight,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (response.status === 202) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_200));
          continue;
        }
        if (!response.ok) {
          throw new Error(readApiError(body, "PPV could not verify the transaction."));
        }
        return body as Confirmation;
      }
      return null;
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const pending = loadPending(account.verifiedWallet);
      if (!pending) return;
      setProofIdHex(pending.proofIdHex);
      setProofAddress(pending.proofAddress);
      setSignature(pending.signature);
      setState("sync-required");
      setMessage(
        "A PPV transaction was already broadcast from this wallet. Verify it before signing another one.",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [account.verifiedWallet]);

  useEffect(() => {
    setVerificationState("idle");
    setVerifiedRecord(null);
    setVerificationMessage(
      "Paste the original evidence and verify it against the finalized on-chain commitment. Evidence stays in this browser.",
    );
  }, [context, evidence, proofIdHex]);

  async function prepareAndSend(
    action: "create" | "revoke",
    payload: Record<string, unknown>,
  ) {
    if (inFlight.current) return;
    if (!wallet) {
      setState("error");
      setMessage(
        "Reconnect the Solana wallet that authenticated this GwapOS session before using PPV.",
      );
      return;
    }

    inFlight.current = true;
    let submitted: PendingCoreAction | null = null;
    try {
      setState("preparing");
      setMessage("Checking live PPV deployment evidence and preparing the devnet transaction…");
      const response = await authenticatedFetch("/api/ppv/core/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "PPV could not prepare this transaction."));
      }
      const prepared = body as PreparedTransaction;

      setProofIdHex(prepared.proofIdHex);
      setProofAddress(prepared.proofAddress);
      setState("signing");
      setMessage(
        action === "create"
          ? "Approve the PPV Core proof transaction. Phantom users must have Testnet Mode set to Solana Devnet before approving."
          : "Approve the PPV Core revocation transaction. Phantom users must have Testnet Mode set to Solana Devnet before approving.",
      );

      reportPpvClientEvent("sign_started", action);
      let result;
      try {
        result = await signAndSendTransaction({
          transaction: base64Bytes(prepared.transactionBase64),
          wallet,
          chain: prepared.chain,
          options: {
            optimisticBroadcast: true,
            skipSimulation: false,
          },
        });
      } catch (error) {
        reportPpvClientEvent("sign_failed", action, ppvClientErrorCode(error));
        throw error;
      }
      reportPpvClientEvent("broadcast_returned", action);
      const submittedSignature = bs58.encode(result.signature);
      submitted = {
        operationId: prepared.operationId,
        owner: account.verifiedWallet,
        action,
        proofIdHex: prepared.proofIdHex,
        proofAddress: prepared.proofAddress,
        signature: submittedSignature,
        submittedAt: new Date().toISOString(),
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
      };
      savePending(submitted);
      setSignature(submittedSignature);
      setState("confirming");
      setMessage("Transaction broadcast. Waiting for finalized Solana state…");
      reportPpvClientEvent("confirm_started", action);

      const resultConfirmation = await confirm(submitted);
      if (!resultConfirmation || resultConfirmation.status !== "finalized") {
        setState("sync-required");
        setMessage(
          "The transaction was broadcast but finalization is still pending. Retry verification—do not sign a duplicate transaction.",
        );
        return;
      }

      clearPending(account.verifiedWallet);
      setProofAddress(resultConfirmation.proofAddress);
      setState("finalized");
      setMessage(
        resultConfirmation.proofState === "active"
          ? "Proof finalized on devnet. The committed evidence bytes never left this browser."
          : "Revocation finalized. The original proof remains on chain as historical evidence.",
      );
    } catch (error) {
      if (submitted) {
        const terminalCode = terminalConfirmationCode(error);
        if (terminalCode) {
          clearPending(account.verifiedWallet);
          setState(terminalCode === "TRANSACTION_EXPIRED" ? "expired" : "error");
          setMessage(
            terminalCode === "TRANSACTION_EXPIRED"
              ? "The devnet transaction expired before finalization. No proof was confirmed, so it is safe to create a fresh proof."
              : "The devnet transaction reached the chain but failed. No proof was confirmed, so it is safe to create a fresh proof. If you use Phantom, verify Testnet Mode is set to Solana Devnet before retrying.",
          );
        } else {
          setState("sync-required");
          setMessage(
            "The transaction may have been broadcast. Retry verification before attempting another signature.",
          );
        }
      } else {
        setState("error");
        setMessage(actionError(error));
      }
    } finally {
      inFlight.current = false;
    }
  }

  async function createProof() {
    if (
      !writesReady ||
      !evidence.trim() ||
      inFlight.current ||
      state === "sync-required"
    ) return;
    try {
      const nextProofId = randomProofId();
      const [contentHashHex, contextHashHex] = await Promise.all([
        hashText(evidence),
        context.trim() ? hashText(context) : Promise.resolve(ZERO_HASH),
      ]);
      await prepareAndSend("create", {
        proofIdHex: nextProofId,
        contentHashHex,
        contextHashHex,
        kind,
      });
    } catch (error) {
      setState("error");
      setMessage(actionError(error));
    }
  }

  async function revokeProof() {
    const normalized = proofIdHex.trim().toLowerCase();
    if (
      !revokeReady ||
      !proofIdValid(normalized) ||
      inFlight.current ||
      state === "sync-required"
    ) return;
    await prepareAndSend("revoke", { proofIdHex: normalized });
  }

  async function verifyEvidenceAgainstProof() {
    const normalized = proofIdHex.trim().toLowerCase();
    if (
      !proofIdValid(normalized) ||
      !evidence.trim() ||
      verificationState === "checking"
    ) {
      return;
    }

    setVerificationState("checking");
    setVerificationMessage(
      "Hashing the evidence locally and reading the finalized Core proof…",
    );

    try {
      const [contentHashHex, contextHashHex] = await Promise.all([
        hashText(evidence),
        context.trim() ? hashText(context) : Promise.resolve(ZERO_HASH),
      ]);

      const response = await authenticatedFetch("/api/ppv/core/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofIdHex: normalized }),
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "PPV could not read this proof."));
      }

      const record = body as CoreProofRecord;
      setVerifiedRecord(record);
      setProofAddress(record.proofAddress);

      const contentMatches = contentHashHex === record.contentHashHex;
      const contextMatches = contextHashHex === record.contextHashHex;
      if (contentMatches && contextMatches) {
        setVerificationState("verified");
        setVerificationMessage(
          record.state === "active"
            ? "VERIFIED: these exact evidence and context bytes match the finalized active proof."
            : "VERIFIED: these exact evidence and context bytes match the finalized proof. The proof is revoked, so the historical commitment remains valid but no longer active.",
        );
      } else {
        setVerificationState("mismatch");
        setVerificationMessage(
          "MISMATCH: the current evidence or context does not match the finalized on-chain commitment.",
        );
      }
    } catch (error) {
      setVerifiedRecord(null);
      setVerificationState("error");
      setVerificationMessage(actionError(error));
    }
  }

  async function retryVerification() {
    const pending = loadPending(account.verifiedWallet);
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    try {
      setState("confirming");
      setMessage("Checking finalized PPV state…");
      const legacyExpired = isLegacyPendingExpired(pending);
      const result = await confirm(pending, legacyExpired ? 1 : 14);
      if (!result || result.status !== "finalized") {
        if (legacyExpired) {
          clearPending(account.verifiedWallet);
          setState("expired");
          setMessage(
            "The older devnet transaction did not land and its signing window has expired. No proof account was found, so it is safe to create a fresh proof.",
          );
          return;
        }
        setState("sync-required");
        setMessage("Still waiting for finalized Solana state. No new signature is needed.");
        return;
      }
      clearPending(account.verifiedWallet);
      setProofAddress(result.proofAddress);
      setSignature(result.signature);
      setState("finalized");
      setMessage(
        result.proofState === "active"
          ? "Proof finalized on devnet."
          : "Revocation finalized on devnet.",
      );
    } catch (error) {
      const terminalCode = terminalConfirmationCode(error);
      if (terminalCode) {
        clearPending(account.verifiedWallet);
        setState(terminalCode === "TRANSACTION_EXPIRED" ? "expired" : "error");
        setMessage(
          terminalCode === "TRANSACTION_EXPIRED"
            ? "The devnet transaction expired before it finalized. No proof account was confirmed, so it is safe to create a fresh proof."
            : "The devnet transaction was finalized as failed. No proof account was created, so it is safe to create a fresh proof. If you use Phantom, verify Testnet Mode is set to Solana Devnet before retrying.",
        );
      } else {
        setState("sync-required");
        setMessage(actionError(error));
      }
    } finally {
      inFlight.current = false;
    }
  }

  const busy =
    state === "preparing" || state === "signing" || state === "confirming";
  const recoveryPending = state === "sync-required";

  return (
    <section className={styles.proofWorkbench} aria-labelledby="ppv-proof-workbench">
      <header className={styles.workbenchHeader}>
        <div>
          <p className={styles.sectionKicker}>CORE WORKBENCH</p>
          <h2 id="ppv-proof-workbench">Commit evidence without uploading it.</h2>
        </div>
        <span className={writesReady ? styles.ready : styles.read_only}>
          {writesReady ? "DEVNET WRITES READY" : "READ-ONLY"}
        </span>
      </header>

      <div className={styles.networkNotice} role="note" aria-label="PPV devnet wallet requirement">
        <strong>PPV NETWORK: SOLANA DEVNET</strong>
        <p>
          External wallets must be connected in their devnet/testnet context for PPV writes.
          In Phantom: Settings → Developer Settings → Testnet Mode → Solana Devnet.
          Your normal GWAP login can stay the same; only the PPV transaction network must be devnet.
        </p>
      </div>

      <div className={styles.proofGrid}>
        <div className={styles.proofForm}>
          <label>
            <span>Evidence bytes</span>
            <textarea
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              rows={7}
              maxLength={20_000}
              disabled={busy || recoveryPending || !writesReady}
              placeholder="Paste the exact text you want to commit. It is hashed locally and is never sent to GWAP or Solana."
            />
          </label>
          <label>
            <span>Private context / manifest (optional)</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={3}
              maxLength={8_000}
              disabled={busy || recoveryPending || !writesReady}
              placeholder="Optional context to hash separately. Leave blank for no context commitment."
            />
          </label>
          <label>
            <span>Proof kind</span>
            <select
              value={kind}
              disabled={busy || recoveryPending || !writesReady}
              onChange={(event) => setKind(event.target.value as PpvCoreProofKind)}
            >
              {PPV_CORE_PROOF_KINDS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={busy || recoveryPending || !writesReady || !evidence.trim()}
            onClick={() => void createProof()}
          >
            {state === "preparing"
              ? "Checking deployment…"
              : state === "signing"
                ? "Waiting for wallet…"
                : state === "confirming"
                  ? "Finalizing…"
                  : "Create devnet proof"}
          </button>
          {!writesReady ? (
            <small>
              Create proof is locked: {createCapability.reasonCode ?? "FEATURE_DISABLED"}.
            </small>
          ) : null}
        </div>

        <aside className={styles.proofResult}>
          <span>STATUS</span>
          <strong>{state.replaceAll("-", " ").toUpperCase()}</strong>
          <p aria-live="polite">{message}</p>
          <dl>
            <div><dt>Proof ID</dt><dd>{proofIdHex || "generated at signing"}</dd></div>
            <div><dt>Proof account</dt><dd>{proofAddress || "pending"}</dd></div>
            <div><dt>Network</dt><dd>Solana devnet</dd></div>
          </dl>
          {signature ? (
            <a href={explorerUrl(signature)} target="_blank" rel="noreferrer">
              View transaction on Solana Explorer ↗
            </a>
          ) : null}
          {state === "sync-required" ? (
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => void retryVerification()}
            >
              Retry finalized verification
            </button>
          ) : null}
        </aside>
      </div>

      <section className={styles.verifyPanel} aria-labelledby="ppv-proof-verify">
        <div>
          <span>LOCAL VERIFICATION</span>
          <h3 id="ppv-proof-verify">Verify the exact bytes against Solana.</h3>
          <p>
            GWAP hashes the Evidence and optional Context fields in this browser.
            The server receives only the proof ID and returns the finalized commitment hashes.
          </p>
        </div>
        <div className={styles.verifyActions}>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={
              verificationState === "checking" ||
              !proofIdValid(proofIdHex.trim().toLowerCase()) ||
              !evidence.trim()
            }
            onClick={() => void verifyEvidenceAgainstProof()}
          >
            {verificationState === "checking" ? "Verifying…" : "Verify exact evidence"}
          </button>
          <strong
            className={
              verificationState === "verified"
                ? styles.verifySuccess
                : verificationState === "mismatch" || verificationState === "error"
                  ? styles.verifyFailure
                  : styles.verifyNeutral
            }
          >
            {verificationState.toUpperCase()}
          </strong>
        </div>
        <p className={styles.verifyMessage} aria-live="polite">
          {verificationMessage}
        </p>
        {verifiedRecord ? (
          <dl className={styles.verifyMeta}>
            <div><dt>Proof state</dt><dd>{verifiedRecord.state}</dd></div>
            <div><dt>Kind</dt><dd>{verifiedRecord.kind}</dd></div>
            <div><dt>Network</dt><dd>{verifiedRecord.cluster}</dd></div>
          </dl>
        ) : null}
      </section>

      <div className={styles.revokeBar}>
        <div>
          <span>REVOCATION</span>
          <p>Use the 32-character proof ID. Revocation preserves the original record and changes its state to revoked.</p>
        </div>
        <input
          aria-label="Proof ID to revoke"
          value={proofIdHex}
          onChange={(event) =>
            setProofIdHex(
              event.target.value.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 32),
            )
          }
          placeholder="32 hex characters"
          disabled={busy || !revokeReady || state === "sync-required"}
        />
        <button
          type="button"
          className={styles.secondaryAction}
          disabled={
            busy ||
            !revokeReady ||
            !proofIdValid(proofIdHex.trim().toLowerCase()) ||
            state === "sync-required"
          }
          onClick={() => void revokeProof()}
        >
          Revoke proof
        </button>
      </div>
    </section>
  );
}
