"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets as usePrivySolanaWallets,
} from "@privy-io/react-auth/solana";
import bs58 from "bs58";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hashDocumentHexV1 } from "../../../lib/ppv-sdk/canonical";
import {
  assertPreparedPpvEnvironment,
  inspectWalletChainSupport,
  ppvExplorerTransactionUrl,
  walletChainForPpvCluster,
  type PpvRuntimeEnvironmentV1,
} from "../../../lib/ppv/environment";
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

type CommerceInboxItem = {
  agreementAddress: string;
  agreementIdHex: string;
  partyA: string;
  partyB: string;
  version: number;
  state: "pending" | "executed" | "cancelled";
  sigA: AgreementSignature | null;
  sigB: AgreementSignature | null;
  contentHash: string;
  termsHash: string;
  content: string;
  terms: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  inboxUpdatedAt: string;
};

type CommerceInboxPayload = {
  items: CommerceInboxItem[];
  pendingIncoming: number;
};

type PreparedTransaction = {
  operationId: string;
  action: CommerceAction;
  cluster: "devnet";
  chain: "solana:devnet";
  genesisHash: string;
  programId: string;
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

type PreparedBoundAgreementProof = {
  operationId: string;
  action: "create";
  chain: "solana:devnet";
  proofAddress: string;
  proofIdHex: string;
  transactionBase64: string;
  blockhash: string;
  lastValidBlockHeight: number;
  rpcProfileId: string;
  binding: {
    schemaVersion: 1;
    agreementAddress: string;
    agreementIdHex: string;
    agreementVersion: number;
    termsHashHex: string;
    contextHashHex: string;
    proofKind: "agreement";
  };
};

type BoundProofConfirmation =
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
      projection?: { status?: "projected" | "deferred" };
    };

type BoundProofState =
  | "idle"
  | "preparing"
  | "signing"
  | "confirming"
  | "finalized"
  | "sync-required"
  | "error";

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

function shortWallet(value: string) {
  return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-7)}` : value;
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
  environment,
  mutationCapability,
  coreMutationCapability,
  layerCapability,
}: {
  environment: PpvRuntimeEnvironmentV1 | null;
  mutationCapability: Capability;
  coreMutationCapability: Capability;
  layerCapability: Capability;
}) {
  const { getAccessToken } = usePrivy();
  const { account, runtimeMode } = useGwapOs();
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
    "Draft content and machine-readable terms locally. Devnet writes commit only canonical hashes on-chain; the optional devnet inbox can deliver the matching test documents to the counterparty.",
  );
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [reviewMessage, setReviewMessage] = useState(
    "Load an agreement, then compare these local documents to the exact finalized version before signing.",
  );
  const [networkConfirmedForWallet, setNetworkConfirmedForWallet] = useState<string | null>(null);
  const [boundProofState, setBoundProofState] = useState<BoundProofState>("idle");
  const [boundProofMessage, setBoundProofMessage] = useState(
    "Execute the agreement first. Party A can then create a Core proof bound to the finalized terms.",
  );
  const [boundProofId, setBoundProofId] = useState("");
  const [boundProofAddress, setBoundProofAddress] = useState("");
  const [boundProofSignature, setBoundProofSignature] = useState("");
  const [inboxItems, setInboxItems] = useState<CommerceInboxItem[]>([]);
  const [inboxState, setInboxState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [inboxMessage, setInboxMessage] = useState(
    "Pending agreements addressed to this wallet appear here automatically.",
  );

  const writesReady = mutationCapability.state === "ready";
  const readsAvailable = layerCapability.state === "ready" || layerCapability.state === "read_only";
  const wallet = useMemo(
    () => wallets.find((candidate) => candidate.address === account.verifiedWallet),
    [account.verifiedWallet, wallets],
  );
  const expectedWalletChain = environment
    ? walletChainForPpvCluster(environment.cluster)
    : null;
  const walletChainSupport = useMemo(
    () =>
      wallet && expectedWalletChain
        ? inspectWalletChainSupport(wallet, expectedWalletChain)
        : "unknown",
    [expectedWalletChain, wallet],
  );
  const walletNetworkConfirmed =
    networkConfirmedForWallet === account.verifiedWallet;
  const walletNetworkReady =
    writesReady &&
    expectedWalletChain === "solana:devnet" &&
    walletNetworkConfirmed &&
    walletChainSupport !== "unsupported";
  const coreWritesReady = coreMutationCapability.state === "ready";

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const loadInbox = useCallback(async () => {
    if (runtimeMode !== "devnet") {
      setInboxItems([]);
      setInboxState("idle");
      return;
    }

    setInboxState("loading");
    try {
      const response = await authenticatedFetch("/api/ppv/commerce/inbox", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        setInboxItems([]);
        setInboxState(response.status === 404 ? "idle" : "error");
        if (response.status !== 404) {
          setInboxMessage("The Commerce inbox could not be loaded. Manual agreement lookup still works.");
        }
        return;
      }

      const payload = (await response.json()) as CommerceInboxPayload;
      setInboxItems(Array.isArray(payload.items) ? payload.items : []);
      setInboxState("ready");
      setInboxMessage(
        payload.pendingIncoming > 0
          ? `${payload.pendingIncoming} agreement${payload.pendingIncoming === 1 ? "" : "s"} waiting for your review.`
          : "No incoming agreements are waiting for your signature.",
      );
    } catch {
      setInboxState("error");
      setInboxMessage("The Commerce inbox could not be loaded. Manual agreement lookup still works.");
    }
  }, [authenticatedFetch, runtimeMode]);

  const syncInbox = useCallback(
    async (agreement: AgreementRecord) => {
      if (
        runtimeMode !== "devnet" ||
        !content.trim() ||
        !terms.trim()
      ) {
        return false;
      }

      try {
        const response = await authenticatedFetch("/api/ppv/commerce/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partyA: agreement.partyA,
            agreementIdHex: agreement.agreementId,
            content,
            terms,
          }),
        });
        if (!response.ok) {
          setInboxMessage(
            "The on-chain agreement finalized, but the devnet inbox handoff did not sync. You can retry by loading the agreement and reviewing it manually.",
          );
          return false;
        }
        window.dispatchEvent(new Event("gwap:ppv-commerce-inbox-changed"));
        await loadInbox();
        return true;
      } catch {
        setInboxMessage(
          "The on-chain agreement finalized, but the devnet inbox handoff did not sync. The chain state remains authoritative.",
        );
        return false;
      }
    },
    [authenticatedFetch, content, loadInbox, runtimeMode, terms],
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

  useEffect(() => {
    void loadInbox();
  }, [account.verifiedWallet, loadInbox]);

  function applyRecord(next: AgreementRecord & { agreementAddress?: string }) {
    setRecord(next);
    setPartyA(next.partyA);
    setPartyB(next.partyB);
    setAgreementIdHex(next.agreementId);
    if (next.agreementAddress) setAgreementAddress(next.agreementAddress);
    resetReview();
  }

  async function openInboxItem(item: CommerceInboxItem) {
    if (inFlight.current || !readsAvailable) return;

    inFlight.current = true;
    try {
      setState("loading");
      setMessage("Loading the latest finalized agreement state…");
      setContent(item.content);
      setTerms(item.terms);
      const response = await authenticatedFetch("/api/ppv/commerce/agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyA: item.partyA,
          agreementIdHex: item.agreementIdHex,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(body, "PPV could not load this agreement."));
      }

      const next = body as AgreementRecord & { agreementAddress: string };
      applyRecord(next);
      setAgreementAddress(next.agreementAddress);

      const hashes = await localHashes(item.content, item.terms);
      if (
        hashes.contentHashHex === next.contentHash &&
        hashes.termsHashHex === next.termsHash
      ) {
        setReviewState("match");
        setReviewedVersion(next.version);
        setReviewMessage(
          `VERIFIED: the delivered devnet documents match finalized agreement version ${next.version}. Read them carefully before accepting.`,
        );
      } else {
        setReviewState("mismatch");
        setReviewedVersion(null);
        setReviewMessage(
          "The inbox documents no longer match the finalized agreement. Do not sign this version.",
        );
      }

      setState("idle");
      setMessage(
        next.state === "pending"
          ? "Agreement loaded from your inbox. Review the document, then accept or decline."
          : `Agreement loaded from your inbox. Current state: ${next.state}.`,
      );
    } catch (error) {
      setState("error");
      setMessage(actionError(error));
    } finally {
      inFlight.current = false;
    }
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
    if (!environment || !expectedWalletChain) {
      setState("error");
      setMessage(
        "PPV cannot verify the runtime environment. No wallet request was opened.",
      );
      return;
    }
    if (walletChainSupport === "unsupported") {
      setState("error");
      setMessage(
        "This wallet does not advertise Solana Devnet support. Use a Devnet-capable Solana wallet before retrying.",
      );
      return;
    }
    if (!walletNetworkConfirmed) {
      setState("error");
      setMessage(
        "Before signing, enable Testnet Mode → Solana Devnet in your wallet, then confirm Devnet readiness below. Your draft stays intact.",
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
      try {
        assertPreparedPpvEnvironment({
          expected: environment,
          prepared,
          layer: "commerce",
        });
      } catch {
        throw new Error(
          "PPV environment verification changed before signing. No wallet request was opened; reload the workbench and retry.",
        );
      }
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
        const code = clientErrorCode(error);
        reportClientEvent("sign_failed", action, code);
        if (code === "NETWORK_ERROR") {
          setNetworkConfirmedForWallet(null);
          throw new Error(
            "The wallet could not submit the Devnet transaction. Re-check Testnet Mode → Solana Devnet, then retry; your Commerce state is preserved.",
          );
        }
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
      await syncInbox(resultConfirmation.agreement);
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

  async function createBoundAgreementProof() {
    if (
      inFlight.current ||
      !record ||
      record.state !== "executed" ||
      record.partyA !== account.verifiedWallet ||
      !agreementAddress ||
      !coreWritesReady
    ) {
      return;
    }
    if (!wallet) {
      setBoundProofState("error");
      setBoundProofMessage(
        "Reconnect Party A's Solana wallet before creating the bound Core proof.",
      );
      return;
    }
    if (!walletNetworkReady) {
      setBoundProofState("error");
      setBoundProofMessage(
        "Confirm Phantom is in Testnet Mode → Solana Devnet before creating the bound proof.",
      );
      return;
    }

    inFlight.current = true;
    try {
      setBoundProofState("preparing");
      setBoundProofMessage(
        "Re-reading the executed Commerce agreement and preparing its canonical Core proof…",
      );
      const response = await authenticatedFetch(
        "/api/ppv/commerce/agreement-proof/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partyA: record.partyA,
            agreementIdHex: record.agreementId,
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(
          readApiError(body, "PPV could not prepare the bound agreement proof."),
        );
      }
      const prepared = body as PreparedBoundAgreementProof;
      if (
        prepared.chain !== "solana:devnet" ||
        prepared.binding.agreementAddress !== agreementAddress ||
        prepared.binding.agreementIdHex !== record.agreementId ||
        prepared.binding.agreementVersion !== record.version ||
        prepared.binding.termsHashHex !== record.termsHash ||
        prepared.binding.proofKind !== "agreement"
      ) {
        throw new Error(
          "The prepared Core proof does not match the finalized Commerce agreement. No wallet request was opened.",
        );
      }

      setBoundProofId(prepared.proofIdHex);
      setBoundProofAddress(prepared.proofAddress);
      setBoundProofState("signing");
      setBoundProofMessage(
        "Approve the Core agreement-proof transaction in Phantom on Solana Devnet.",
      );

      const signed = await signAndSendTransaction({
        transaction: base64Bytes(prepared.transactionBase64),
        wallet,
        chain: prepared.chain,
        options: {
          optimisticBroadcast: true,
          skipSimulation: false,
        },
      });
      const submittedSignature = bs58.encode(signed.signature);
      setBoundProofSignature(submittedSignature);
      setBoundProofState("confirming");
      setBoundProofMessage(
        "Bound Core proof broadcast. Waiting for finalized proof state and Verified Activity projection…",
      );

      let confirmation: BoundProofConfirmation | null = null;
      for (let attempt = 0; attempt < 14; attempt += 1) {
        const confirmResponse = await authenticatedFetch("/api/ppv/core/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: prepared.operationId,
            action: "create",
            proofIdHex: prepared.proofIdHex,
            signature: submittedSignature,
            lastValidBlockHeight: prepared.lastValidBlockHeight,
          }),
        });
        const confirmBody = (await confirmResponse.json().catch(() => ({}))) as unknown;
        if (confirmResponse.status === 202) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_200));
          continue;
        }
        if (!confirmResponse.ok) {
          throw new Error(
            readApiError(confirmBody, "PPV could not verify the bound Core proof."),
          );
        }
        confirmation = confirmBody as BoundProofConfirmation;
        break;
      }

      if (!confirmation || confirmation.status !== "finalized") {
        setBoundProofState("sync-required");
        setBoundProofMessage(
          "The bound proof was broadcast but finalization is still pending. Do not create another proof; use the Proofs workbench to verify this proof ID.",
        );
        return;
      }

      setBoundProofState("finalized");
      setBoundProofAddress(confirmation.proofAddress);
      setBoundProofMessage(
        confirmation.projection?.status === "projected"
          ? "Bound Core proof finalized and projected into Verified Activity."
          : "Bound Core proof finalized. Activity projection is deferred and can be repaired from chain.",
      );
    } catch (error) {
      setBoundProofState("error");
      setBoundProofMessage(actionError(error));
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
      await syncInbox(result.agreement);
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
          GWAP verifies the PPV RPC genesis, deployment profile, program identity and
          prepared transaction before any wallet prompt opens. External Solana wallets
          do not reliably expose their actively selected cluster, so Testnet Mode →
          Solana Devnet must also be confirmed explicitly before a signed write.
        </p>
        {writesReady ? (
          <div className={styles.agreementActions}>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={!wallet || walletChainSupport === "unsupported"}
              onClick={() => setNetworkConfirmedForWallet(account.verifiedWallet)}
            >
              {walletNetworkConfirmed
                ? "Devnet confirmed for this wallet"
                : "Confirm wallet is on Solana Devnet"}
            </button>
            <small>
              {walletChainSupport === "unsupported"
                ? "This connected wallet does not advertise Devnet support."
                : walletChainSupport === "supported"
                  ? "Devnet is supported; confirmation records the wallet's current Testnet Mode selection."
                  : "GWAP cannot read the wallet's active cluster, so this confirmation is required."}
            </small>
          </div>
        ) : null}
      </div>

      {runtimeMode === "devnet" ? (
        <section className={styles.inboxPanel} aria-labelledby="ppv-commerce-inbox">
          <header className={styles.inboxHeader}>
            <div>
              <span>COUNTERPARTY INBOX</span>
              <h3 id="ppv-commerce-inbox">Contracts sent to this wallet</h3>
              <p>{inboxMessage}</p>
            </div>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={inboxState === "loading"}
              onClick={() => void loadInbox()}
            >
              {inboxState === "loading" ? "Refreshing…" : "Refresh inbox"}
            </button>
          </header>

          {inboxItems.length > 0 ? (
            <div className={styles.inboxList}>
              {inboxItems.map((item) => {
                const incoming = item.partyB === account.verifiedWallet;
                const awaitingResponse =
                  incoming && item.state === "pending" && item.sigB === null;
                const counterparty = incoming ? item.partyA : item.partyB;

                return (
                  <button
                    key={item.agreementAddress}
                    type="button"
                    className={styles.inboxItem}
                    data-pending={awaitingResponse || undefined}
                    disabled={busy || recoveryPending}
                    onClick={() => void openInboxItem(item)}
                  >
                    <span className={styles.inboxItemCopy}>
                      <strong>{item.title}</strong>
                      <small>
                        {incoming ? "From" : "To"} {shortWallet(counterparty)} · v{item.version}
                      </small>
                    </span>
                    <span
                      className={
                        awaitingResponse ? styles.inboxAction : styles.inboxState
                      }
                    >
                      {awaitingResponse ? "REVIEW" : item.state.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className={styles.inboxEmpty}>
              {inboxState === "loading"
                ? "Checking this wallet for agreements…"
                : "No delivered devnet agreements are indexed for this wallet yet."}
            </p>
          )}

          <small className={styles.inboxPrivacy}>
            DEVNET TEST STORAGE: documents in this inbox are stored in authenticated
            private workspace storage for testing only. Do not use confidential
            production contract terms until PPV envelope encryption is enabled.
          </small>
        </section>
      ) : null}

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
                !walletNetworkReady ||
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
                !walletNetworkReady ||
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
            <a
              href={ppvExplorerTransactionUrl(
                signature,
                environment?.cluster ?? "devnet",
              )}
              target="_blank"
              rel="noreferrer"
            >
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
          <h3 id="ppv-commerce-review">Review. Verify. Then accept or decline.</h3>
          <p>
            Manual drafts stay in this browser. When the devnet inbox is enabled,
            finalized test documents are delivered through authenticated private
            workspace storage. GWAP independently re-hashes them and enables approval
            only when they match the current finalized agreement exactly.
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
              !walletNetworkReady ||
              record?.state !== "pending" ||
              reviewState !== "match" ||
              reviewedVersion !== record?.version ||
              Boolean(currentSigner)
            }
            onClick={() => void signAgreement()}
          >
            {record?.partyB === account.verifiedWallet
              ? "Accept agreement"
              : "Sign exact current version"}
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={
              busy ||
              recoveryPending ||
              !walletNetworkReady ||
              record?.state !== "pending"
            }
            onClick={() => void cancelAgreement()}
          >
            {record?.partyB === account.verifiedWallet
              ? "Decline agreement"
              : "Cancel pending agreement"}
          </button>
        </div>

        {record?.state === "executed" ? (
          <div className={styles.verifyActions}>
            <div>
              <span>CORE BINDING</span>
              <p>
                Party A can create a Core proof whose content hash is the executed
                agreement&apos;s finalized terms hash and whose context commits to this
                exact Commerce account.
              </p>
            </div>
            <button
              type="button"
              className={styles.primaryAction}
              disabled={
                busy ||
                boundProofState === "preparing" ||
                boundProofState === "signing" ||
                boundProofState === "confirming" ||
                !coreWritesReady ||
                !walletNetworkReady ||
                record.partyA !== account.verifiedWallet
              }
              onClick={() => void createBoundAgreementProof()}
            >
              {boundProofState === "preparing"
                ? "Preparing bound proof…"
                : boundProofState === "signing"
                  ? "Waiting for Phantom…"
                  : boundProofState === "confirming"
                    ? "Finalizing bound proof…"
                    : boundProofState === "finalized"
                      ? "Bound proof created"
                      : "Create bound Core proof"}
            </button>
            <p className={styles.verifyMessage} aria-live="polite">
              {record.partyA === account.verifiedWallet
                ? boundProofMessage
                : "Switch back to Party A to create the canonical bound Core proof."}
            </p>
            {boundProofId ? (
              <dl className={styles.verifyMeta}>
                <div><dt>Proof ID</dt><dd>{boundProofId}</dd></div>
                <div><dt>Proof account</dt><dd>{boundProofAddress || "pending"}</dd></div>
              </dl>
            ) : null}
            {boundProofSignature ? (
              <a
                href={ppvExplorerTransactionUrl(
                  boundProofSignature,
                  environment?.cluster ?? "devnet",
                )}
                target="_blank"
                rel="noreferrer"
              >
                View bound proof transaction on Solana Explorer ↗
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
