"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets as usePrivySolanaWallets,
} from "@privy-io/react-auth/solana";
import bs58 from "bs58";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hashDocumentHexV1 } from "../../../lib/ppv-sdk/canonical";
import { useGwapOs } from "../../components/os-provider";
import styles from "../ppv.module.css";

type Capability = {
  state: "disabled" | "unavailable" | "read_only" | "ready";
  reasonCode: string | null;
};

type CommerceAction = "create" | "revise" | "sign" | "cancel";

type AgreementSignature = {
  signer: string;
  versionSigned: number;
  contentHashSigned: string;
  termsHashSigned: string;
  signedAt: number;
};

type AgreementRecord = {
  cluster?: "devnet";
  agreementAddress?: string;
  schemaVersion: number;
  agreementId: string;
  partyA: string;
  partyB: string;
  version: number;
  contentHash: string;
  termsHash: string;
  sigA: AgreementSignature | null;
  sigB: AgreementSignature | null;
  state: "pending" | "executed" | "cancelled";
  createdAt: number;
  expiresAt: number;
  executedAt: number;
  cancelledAt: number;
};

type PreparedTransaction = {
  operationId: string;
  action: CommerceAction;
  chain: "solana:devnet";
  agreementAddress: string;
  agreementIdHex: string;
  partyA: string;
  partyB: string;
  currentVersion: number;
  resultingVersion: number;
  contentHashHex: string;
  termsHashHex: string;
  transactionBase64: string;
  blockhash: string;
  lastValidBlockHeight: number;
  rpcProfileId: string;
};

type Confirmation =
  | {
      status: "pending";
      signature: string;
      agreementAddress: string;
    }
  | {
      status: "finalized";
      signature: string;
      agreementAddress: string;
      agreement: AgreementRecord;
      verification: string;
    };

type PendingCommerceAction = {
  operationId: string;
  owner: string;
  action: CommerceAction;
  agreementIdHex: string;
  partyA: string;
  agreementAddress: string;
  signature: string;
  submittedAt: string;
};

type UiState =
  | "idle"
  | "loading"
  | "preparing"
  | "signing"
  | "confirming"
  | "finalized"
  | "sync-required"
  | "expired"
  | "error";

type ReviewState = "idle" | "checking" | "match" | "mismatch" | "error";

const PENDING_KEY = "gwap-ppv-commerce-pending-v1";
const HEX_ID = /^[0-9a-f]{32}$/;
const DEFAULT_EXPIRY_HOURS = "24";

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

function randomAgreementId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validAgreementId(value: string) {
  return HEX_ID.test(value.trim().toLowerCase());
}

function explorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

function parseDocument(value: string, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

async function localHashes(content: string, terms: string) {
  return Promise.all([
    hashDocumentHexV1(parseDocument(content, "Content")),
    hashDocumentHexV1(parseDocument(terms, "Terms")),
  ]).then(([contentHashHex, termsHashHex]) => ({
    contentHashHex,
    termsHashHex,
  }));
}

function loadPending(owner: string): PendingCommerceAction | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCommerceAction>;
    if (
      parsed.owner !== owner ||
      !parsed.operationId ||
      !parsed.signature ||
      !parsed.partyA ||
      !parsed.agreementAddress ||
      !parsed.agreementIdHex ||
      !validAgreementId(parsed.agreementIdHex) ||
      !["create", "revise", "sign", "cancel"].includes(parsed.action ?? "")
    ) {
      return null;
    }
    return parsed as PendingCommerceAction;
  } catch {
    return null;
  }
}

function savePending(value: PendingCommerceAction) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    // Durable server operation state remains authoritative.
  }
}

function clearPending(owner: string) {
  try {
    const pending = loadPending(owner);
    if (pending?.owner === owner) window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Local recovery is optional.
  }
}

function terminalCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/TRANSACTION_EXPIRED/.test(message)) return "TRANSACTION_EXPIRED";
  if (/TRANSACTION_FAILED/.test(message)) return "TRANSACTION_FAILED";
  return null;
}

function clientErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/reject|declin|cancel/i.test(message)) return "WALLET_REJECTED";
  if (/insufficient|lamports|funds/i.test(message)) return "INSUFFICIENT_FUNDS";
  if (/simulation/i.test(message)) return "SIMULATION_FAILED";
  if (/blockhash|expired/i.test(message)) return "BLOCKHASH_ERROR";
  if (/network|rpc|fetch|timeout/i.test(message)) return "NETWORK_ERROR";
  return "UNKNOWN_CLIENT_ERROR";
}

function actionError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "PPV Commerce action failed.";
  if (/reject|declin|cancel/i.test(message)) {
    return "The wallet rejected the request. No Commerce state was confirmed.";
  }
  if (/insufficient|lamports|funds/i.test(message)) {
    return "This wallet needs enough devnet SOL for the Commerce transaction and account rent.";
  }
  return message;
}

function reportClientEvent(
  event: "sign_started" | "sign_failed" | "broadcast_returned" | "confirm_started",
  action: CommerceAction,
  code?: string,
) {
  void fetch("/api/ppv/commerce/diagnostics", {
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

export function PpvAgreementActions({
  mutationCapability,
  layerCapability,
}: {
  mutationCapability: Capability;
  layerCapability: Capability;
}) {
  const { getAccessToken } = usePrivy();
  const { account } = useGwapOs();
  const { wallets } = usePrivySolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const inFlight = useRef(false);

  const [partyA, setPartyA] = useState("");
  const [partyB, setPartyB] = useState("");
  const [agreementIdHex, setAgreementIdHex] = useState("");
  const [content, setContent] = useState("");
  const [terms, setTerms] = useState("");
  const [expiryHours, setExpiryHours] = useState(DEFAULT_EXPIRY_HOURS);
  const [record, setRecord] = useState<AgreementRecord | null>(null);
  const [agreementAddress, setAgreementAddress] = useState("");
  const [signature, setSignature] = useState("");
  const [state, setState] = useState<UiState>("idle");
  const [message, setMessage] = useState(
    "Draft content and machine-readable terms locally. Only canonical SHA-256 hashes are sent when Commerce writes become available.",
  );
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [reviewMessage, setReviewMessage] = useState(
    "Load an agreement, then compare these local documents to the exact finalized version before signing.",
  );

  const writesReady = mutationCapability.state === "ready";
  const readsAvailable = layerCapability.state === "ready" || layerCapability.state === "read_only";
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

  const resetReview = useCallback(() => {
    setReviewState("idle");
    setReviewedVersion(null);
    setReviewMessage(
      "Load an agreement, then compare these local documents to the exact finalized version before signing.",
    );
  }, []);

  const confirm = useCallback(
    async (pending: PendingCommerceAction, attempts = 14): Promise<Confirmation | null> => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const response = await authenticatedFetch("/api/ppv/commerce/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: pending.operationId,
            signature: pending.signature,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (response.status === 202) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_200));
          continue;
        }
        if (!response.ok) {
          throw new Error(
            readApiError(body, "PPV could not verify the Commerce transaction."),
          );
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
      setPartyA(pending.partyA);
      setAgreementIdHex(pending.agreementIdHex);
      setAgreementAddress(pending.agreementAddress);
      setSignature(pending.signature);
      setState("sync-required");
      setMessage(
        "A Commerce transaction was already broadcast from this wallet. Verify it before signing another one.",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [account.verifiedWallet]);

  function applyRecord(next: AgreementRecord & { agreementAddress?: string }) {
    setRecord(next);
    setPartyA(next.partyA);
    setPartyB(next.partyB);
    setAgreementIdHex(next.agreementId);
    if (next.agreementAddress) setAgreementAddress(next.agreementAddress);
    resetReview();
  }

  async function loadAgreement() {
    const normalized = agreementIdHex.trim().toLowerCase();
    if (
      inFlight.current ||
      !readsAvailable ||
      !validAgreementId(normalized) ||
      !partyA.trim()
    ) {
      return;
    }
    inFlight.current = true;
    try {
      setState("loading");
      setMessage("Reading the finalized Commerce agreement…");
      const response = await authenticatedFetch("/api/ppv/commerce/agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyA: partyA.trim(),
          agreementIdHex: normalized,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "PPV could not load this agreement."));
      }
      const next = body as AgreementRecord & { agreementAddress: string };
      applyRecord(next);
      setAgreementAddress(next.agreementAddress);
      setState("idle");
      setMessage(
        `Loaded finalized agreement version ${next.version}. Review the exact local content and terms before signing.`,
      );
    } catch (error) {
      setState("error");
      setMessage(actionError(error));
    } finally {
      inFlight.current = false;
    }
  }

  async function reviewCurrentVersion() {
    if (!record || !content.trim() || !terms.trim()) return;
    setReviewState("checking");
    setReviewMessage("Canonicalizing and hashing the local documents…");
    try {
      const hashes = await localHashes(content, terms);
      if (
        hashes.contentHashHex === record.contentHash &&
        hashes.termsHashHex === record.termsHash
      ) {
        setReviewState("match");
        setReviewedVersion(record.version);
        setReviewMessage(
          `MATCH: local content and terms are the exact bytes committed by version ${record.version}.`,
        );
      } else {
        setReviewState("mismatch");
        setReviewedVersion(null);
        setReviewMessage(
          "MISMATCH: local content or terms differ from the finalized agreement. Do not sign this version.",
        );
      }
    } catch (error) {
      setReviewState("error");
      setReviewedVersion(null);
      setReviewMessage(actionError(error));
    }
  }

  async function prepareAndSend(
    action: CommerceAction,
    payload: Record<string, unknown>,
  ) {
    if (inFlight.current || !writesReady) return;
    if (!wallet) {
      setState("error");
      setMessage(
        "Reconnect the Solana wallet that authenticated this GwapOS session before using PPV Commerce.",
      );
      return;
    }

    inFlight.current = true;
    let submitted: PendingCommerceAction | null = null;
    try {
      setState("preparing");
      setMessage("Checking Commerce deployment evidence and preparing the devnet transaction…");
      const response = await authenticatedFetch("/api/ppv/commerce/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "PPV could not prepare this Commerce transaction."));
      }
      const prepared = body as PreparedTransaction;
      setPartyA(prepared.partyA);
      setPartyB(prepared.partyB);
      setAgreementIdHex(prepared.agreementIdHex);
      setAgreementAddress(prepared.agreementAddress);
      resetReview();

      setState("signing");
      setMessage(
        "Approve the exact Commerce transaction. Phantom must be in Testnet Mode → Solana Devnet.",
      );
      reportClientEvent("sign_started", action);

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
        reportClientEvent("sign_failed", action, clientErrorCode(error));
        throw error;
      }

      reportClientEvent("broadcast_returned", action);
      const submittedSignature = bs58.encode(result.signature);
      submitted = {
        operationId: prepared.operationId,
        owner: account.verifiedWallet,
        action,
        agreementIdHex: prepared.agreementIdHex,
        partyA: prepared.partyA,
        agreementAddress: prepared.agreementAddress,
        signature: submittedSignature,
        submittedAt: new Date().toISOString(),
      };
      savePending(submitted);
      setSignature(submittedSignature);
      setState("confirming");
      setMessage("Commerce transaction broadcast. Waiting for finalized state…");
      reportClientEvent("confirm_started", action);

      const resultConfirmation = await confirm(submitted);
      if (!resultConfirmation || resultConfirmation.status !== "finalized") {
        setState("sync-required");
        setMessage(
          "The Commerce transaction was broadcast but finalization is still pending. Retry verification before signing anything else.",
        );
        return;
      }

      clearPending(account.verifiedWallet);
      setAgreementAddress(resultConfirmation.agreementAddress);
      applyRecord({
        ...resultConfirmation.agreement,
        agreementAddress: resultConfirmation.agreementAddress,
      });
      setState("finalized");
      setMessage(
        `${action.toUpperCase()} finalized. Agreement version ${resultConfirmation.agreement.version} is now ${resultConfirmation.agreement.state}.`,
      );
    } catch (error) {
      if (submitted) {
        const terminal = terminalCode(error);
        if (terminal) {
          clearPending(account.verifiedWallet);
          setState(terminal === "TRANSACTION_EXPIRED" ? "expired" : "error");
          setMessage(
            terminal === "TRANSACTION_EXPIRED"
              ? "The Commerce transaction expired before finalization. It is safe to prepare a fresh action."
              : "The Commerce transaction finalized as failed. No successful agreement mutation was confirmed.",
          );
        } else {
          setState("sync-required");
          setMessage(
            "The Commerce transaction may have been broadcast. Retry finalized verification before another signature.",
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

  async function createAgreement() {
    if (!content.trim() || !terms.trim() || !partyB.trim()) return;
    try {
      const hours = Number(expiryHours);
      if (!Number.isInteger(hours) || hours <= 0 || hours > 8_760) {
        throw new Error("Expiry must be between 1 and 8,760 hours.");
      }
      const hashes = await localHashes(content, terms);
      await prepareAndSend("create", {
        agreementIdHex: randomAgreementId(),
        partyB: partyB.trim(),
        contentHashHex: hashes.contentHashHex,
        termsHashHex: hashes.termsHashHex,
        expiresAtUnix: Math.floor(Date.now() / 1_000) + hours * 3_600,
      });
    } catch (error) {
      setState("error");
      setMessage(actionError(error));
    }
  }

  async function reviseAgreement() {
    if (!record || record.state !== "pending" || !content.trim() || !terms.trim()) return;
    try {
      const hashes = await localHashes(content, terms);
      await prepareAndSend("revise", {
        partyA: record.partyA,
        agreementIdHex: record.agreementId,
        expectedVersion: record.version,
        contentHashHex: hashes.contentHashHex,
        termsHashHex: hashes.termsHashHex,
      });
    } catch (error) {
      setState("error");
      setMessage(actionError(error));
    }
  }

  async function signAgreement() {
    if (
      !record ||
      record.state !== "pending" ||
      reviewState !== "match" ||
      reviewedVersion !== record.version
    ) {
      return;
    }
    try {
      const hashes = await localHashes(content, terms);
      if (
        hashes.contentHashHex !== record.contentHash ||
        hashes.termsHashHex !== record.termsHash
      ) {
        resetReview();
        throw new Error(
          "The local documents changed after review. Review the current version again before signing.",
        );
      }
      await prepareAndSend("sign", {
        partyA: record.partyA,
        agreementIdHex: record.agreementId,
        expectedVersion: record.version,
        contentHashHex: hashes.contentHashHex,
        termsHashHex: hashes.termsHashHex,
      });
    } catch (error) {
      setState("error");
      setMessage(actionError(error));
    }
  }

  async function cancelAgreement() {
    if (!record || record.state !== "pending") return;
    await prepareAndSend("cancel", {
      partyA: record.partyA,
      agreementIdHex: record.agreementId,
    });
  }

  async function retryFinalization() {
    const pending = loadPending(account.verifiedWallet);
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    try {
      setState("confirming");
      setMessage("Checking finalized Commerce state…");
      const result = await confirm(pending);
      if (!result || result.status !== "finalized") {
        setState("sync-required");
        setMessage("Still waiting for finalized Commerce state. Do not sign a duplicate.");
        return;
      }
      clearPending(account.verifiedWallet);
      setAgreementAddress(result.agreementAddress);
      applyRecord({
        ...result.agreement,
        agreementAddress: result.agreementAddress,
      });
      setSignature(result.signature);
      setState("finalized");
      setMessage(
        `Recovered finalized agreement version ${result.agreement.version} (${result.agreement.state}).`,
      );
    } catch (error) {
      const terminal = terminalCode(error);
      if (terminal) {
        clearPending(account.verifiedWallet);
        setState(terminal === "TRANSACTION_EXPIRED" ? "expired" : "error");
      } else {
        setState("sync-required");
      }
      setMessage(actionError(error));
    } finally {
      inFlight.current = false;
    }
  }

  const busy =
    state === "loading" ||
    state === "preparing" ||
    state === "signing" ||
    state === "confirming";
  const recoveryPending = state === "sync-required";
  const currentSigner =
    record?.partyA === account.verifiedWallet
      ? record.sigA
      : record?.partyB === account.verifiedWallet
        ? record.sigB
        : null;

  return (
    <section className={styles.proofWorkbench} aria-labelledby="ppv-commerce-workbench">
      <header className={styles.workbenchHeader}>
        <div>
          <p className={styles.sectionKicker}>COMMERCE WORKBENCH</p>
          <h2 id="ppv-commerce-workbench">Agree to the exact version. Nothing implied.</h2>
        </div>
        <span className={writesReady ? styles.ready : styles.read_only}>
          {writesReady ? "DEVNET WRITES READY" : "DEPLOYMENT GATED"}
        </span>
      </header>

      <div className={styles.networkNotice} role="note">
        <strong>PPV COMMERCE · SOLANA DEVNET</strong>
        <p>
          Drafting and canonical hashing are available in the interface now. Wallet
          mutations stay locked until the canonical Commerce program is deployed and
          independently approved. When writes open, Phantom must be in Testnet Mode → Solana Devnet.
        </p>
      </div>

      <div className={styles.proofGrid}>
        <div className={styles.proofForm}>
          <label>
            <span>Party A / creator wallet</span>
            <input
              value={partyA}
              onChange={(event) => {
                setPartyA(event.target.value.trim());
                setRecord(null);
                resetReview();
              }}
              placeholder="Creator wallet — needed when loading an existing agreement"
              disabled={busy || recoveryPending}
            />
          </label>
          <label>
            <span>Party B / counterparty wallet</span>
            <input
              value={partyB}
              onChange={(event) => {
                setPartyB(event.target.value.trim());
                resetReview();
              }}
              placeholder="Counterparty Solana wallet"
              disabled={busy || recoveryPending}
            />
          </label>
          <label>
            <span>Agreement ID</span>
            <input
              value={agreementIdHex}
              onChange={(event) => {
                setAgreementIdHex(
                  event.target.value
                    .toLowerCase()
                    .replace(/[^0-9a-f]/g, "")
                    .slice(0, 32),
                );
                setRecord(null);
                resetReview();
              }}
              placeholder="32 hex characters — generated automatically for new agreements"
              disabled={busy || recoveryPending}
            />
          </label>
          <div className={styles.agreementActions}>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={
                busy ||
                recoveryPending ||
                !readsAvailable ||
                !partyA.trim() ||
                !validAgreementId(agreementIdHex)
              }
              onClick={() => void loadAgreement()}
            >
              Load finalized agreement
            </button>
          </div>

          <label>
            <span>Content document · JSON</span>
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                resetReview();
              }}
              rows={7}
              maxLength={20_000}
              disabled={busy || recoveryPending}
              placeholder={'{"title":"Statement of work","body":"Exact deliverable text"}'}
            />
          </label>
          <label>
            <span>Machine-readable terms · JSON</span>
            <textarea
              value={terms}
              onChange={(event) => {
                setTerms(event.target.value);
                resetReview();
              }}
              rows={7}
              maxLength={20_000}
              disabled={busy || recoveryPending}
              placeholder={'{"amountBaseUnits":"2500000","paymentMode":"test-only"}'}
            />
          </label>
          <label>
            <span>New agreement expiry · hours</span>
            <input
              inputMode="numeric"
              value={expiryHours}
              onChange={(event) =>
                setExpiryHours(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
              disabled={busy || recoveryPending}
            />
          </label>

          <div className={styles.agreementActions}>
            <button
              type="button"
              className={styles.primaryAction}
              disabled={
                busy ||
                recoveryPending ||
                !writesReady ||
                !partyB.trim() ||
                !content.trim() ||
                !terms.trim()
              }
              onClick={() => void createAgreement()}
            >
              Create agreement
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={
                busy ||
                recoveryPending ||
                !writesReady ||
                record?.state !== "pending" ||
                !content.trim() ||
                !terms.trim()
              }
              onClick={() => void reviseAgreement()}
            >
              Propose revision
            </button>
          </div>
          {!writesReady ? (
            <small>
              Commerce writes are locked: {mutationCapability.reasonCode ?? "FEATURE_DISABLED"}.
              Drafts never bypass deployment readiness.
            </small>
          ) : null}
        </div>

        <aside className={styles.proofResult}>
          <span>AGREEMENT STATUS</span>
          <strong>{state.replaceAll("-", " ").toUpperCase()}</strong>
          <p aria-live="polite">{message}</p>
          <dl>
            <div><dt>Agreement</dt><dd>{agreementAddress || "not loaded"}</dd></div>
            <div><dt>Version</dt><dd>{record?.version ?? "—"}</dd></div>
            <div><dt>State</dt><dd>{record?.state ?? "—"}</dd></div>
            <div><dt>Party A</dt><dd>{record?.partyA || partyA || "—"}</dd></div>
            <div><dt>Party B</dt><dd>{record?.partyB || partyB || "—"}</dd></div>
            <div><dt>Your signature</dt><dd>{currentSigner ? `v${currentSigner.versionSigned}` : "not signed"}</dd></div>
          </dl>
          {signature ? (
            <a href={explorerUrl(signature)} target="_blank" rel="noreferrer">
              View transaction on Solana Explorer ↗
            </a>
          ) : null}
          {recoveryPending ? (
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => void retryFinalization()}
            >
              Retry finalized verification
            </button>
          ) : null}
        </aside>
      </div>

      <section className={styles.verifyPanel} aria-labelledby="ppv-commerce-review">
        <div>
          <span>EXACT VERSION REVIEW</span>
          <h3 id="ppv-commerce-review">Hash locally. Compare. Then sign.</h3>
          <p>
            Content and terms stay in this browser. GWAP compares their canonical hashes to
            the finalized agreement and enables signing only after an exact match.
          </p>
        </div>
        <div className={styles.verifyActions}>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={!record || !content.trim() || !terms.trim() || busy}
            onClick={() => void reviewCurrentVersion()}
          >
            {reviewState === "checking" ? "Reviewing…" : "Review current version"}
          </button>
          <strong
            className={
              reviewState === "match"
                ? styles.verifySuccess
                : reviewState === "mismatch" || reviewState === "error"
                  ? styles.verifyFailure
                  : styles.verifyNeutral
            }
          >
            {reviewState.toUpperCase()}
          </strong>
        </div>
        <p className={styles.verifyMessage} aria-live="polite">{reviewMessage}</p>
        {record ? (
          <dl className={styles.verifyMeta}>
            <div><dt>Current version</dt><dd>{record.version}</dd></div>
            <div><dt>Party A signed</dt><dd>{record.sigA ? `v${record.sigA.versionSigned}` : "no"}</dd></div>
            <div><dt>Party B signed</dt><dd>{record.sigB ? `v${record.sigB.versionSigned}` : "no"}</dd></div>
          </dl>
        ) : null}
        <div className={styles.agreementActions}>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={
              busy ||
              recoveryPending ||
              !writesReady ||
              record?.state !== "pending" ||
              reviewState !== "match" ||
              reviewedVersion !== record?.version ||
              Boolean(currentSigner)
            }
            onClick={() => void signAgreement()}
          >
            Sign exact current version
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={
              busy ||
              recoveryPending ||
              !writesReady ||
              record?.state !== "pending"
            }
            onClick={() => void cancelAgreement()}
          >
            Cancel pending agreement
          </button>
        </div>
      </section>
    </section>
  );
}
