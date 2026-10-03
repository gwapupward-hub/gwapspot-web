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
import styles from "./agreement-workspace.module.css";

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
  executedAt: number;
  cancelledAt: number;
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

type UiState =
  | "idle"
  | "loading"
  | "preparing"
  | "signing"
  | "confirming"
  | "finalized"
  | "error";

type ReviewState = "idle" | "checking" | "match" | "mismatch" | "error";

type AgreementForm = {
  title: string;
  counterpartyWallet: string;
  summary: string;
  deliverables: string;
  paymentAmount: string;
  paymentAsset: "USDC" | "SOL" | "USD" | "OTHER";
  dueDate: string;
  milestones: string;
  revisionsAllowed: string;
  additionalTerms: string;
  expiryHours: string;
};

type CanonicalAgreementContent = {
  schemaVersion: 1;
  type: "ppv-commerce-agreement";
  title: string;
  summary: string;
  deliverables: string[];
};

type CanonicalAgreementTerms = {
  schemaVersion: 1;
  payment: {
    amount: string;
    asset: AgreementForm["paymentAsset"];
    mode: "terms-only";
  };
  dueDate: string | null;
  milestones: string[];
  revisionsAllowed: number;
  approvalRequired: true;
  additionalTerms: string;
};

const EMPTY_FORM: AgreementForm = {
  title: "",
  counterpartyWallet: "",
  summary: "",
  deliverables: "",
  paymentAmount: "",
  paymentAsset: "USDC",
  dueDate: "",
  milestones: "",
  revisionsAllowed: "0",
  additionalTerms: "",
  expiryHours: "24",
};

const HEX_ID = /^[0-9a-f]{32}$/;

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function canonicalDocuments(form: AgreementForm) {
  const content: CanonicalAgreementContent = {
    schemaVersion: 1,
    type: "ppv-commerce-agreement",
    title: form.title.trim(),
    summary: form.summary.trim(),
    deliverables: splitLines(form.deliverables),
  };
  const parsedRevisions = Number(form.revisionsAllowed);
  const terms: CanonicalAgreementTerms = {
    schemaVersion: 1,
    payment: {
      amount: form.paymentAmount.trim(),
      asset: form.paymentAsset,
      mode: "terms-only",
    },
    dueDate: form.dueDate || null,
    milestones: splitLines(form.milestones),
    revisionsAllowed:
      Number.isInteger(parsedRevisions) && parsedRevisions >= 0
        ? parsedRevisions
        : 0,
    approvalRequired: true,
    additionalTerms: form.additionalTerms.trim(),
  };
  return {
    content,
    terms,
    contentJson: JSON.stringify(content, null, 2),
    termsJson: JSON.stringify(terms, null, 2),
  };
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function hydrateForm(
  contentJson: string,
  termsJson: string,
  counterpartyWallet: string,
  fallbackTitle: string,
): AgreementForm {
  const content = parseJsonObject(contentJson);
  const terms = parseJsonObject(termsJson);
  const payment =
    terms?.payment && typeof terms.payment === "object" && !Array.isArray(terms.payment)
      ? (terms.payment as Record<string, unknown>)
      : null;

  const deliverables = Array.isArray(content?.deliverables)
    ? content.deliverables.filter((value): value is string => typeof value === "string")
    : [];
  const milestones = Array.isArray(terms?.milestones)
    ? terms.milestones.filter((value): value is string => typeof value === "string")
    : [];
  const rawAsset = typeof payment?.asset === "string" ? payment.asset : "USDC";
  const paymentAsset: AgreementForm["paymentAsset"] =
    rawAsset === "SOL" || rawAsset === "USD" || rawAsset === "OTHER"
      ? rawAsset
      : "USDC";

  return {
    title:
      typeof content?.title === "string" && content.title.trim()
        ? content.title
        : fallbackTitle,
    counterpartyWallet,
    summary:
      typeof content?.summary === "string"
        ? content.summary
        : typeof content?.body === "string"
          ? content.body
          : "",
    deliverables: deliverables.join("\n"),
    paymentAmount: typeof payment?.amount === "string" ? payment.amount : "",
    paymentAsset,
    dueDate: typeof terms?.dueDate === "string" ? terms.dueDate : "",
    milestones: milestones.join("\n"),
    revisionsAllowed:
      typeof terms?.revisionsAllowed === "number"
        ? String(terms.revisionsAllowed)
        : "0",
    additionalTerms:
      typeof terms?.additionalTerms === "string" ? terms.additionalTerms : "",
    expiryHours: "24",
  };
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

function shortWallet(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

function readApiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const value = body as { error?: unknown; code?: unknown };
  if (typeof value.error === "string" && typeof value.code === "string") {
    return `${value.error} [${value.code}]`;
  }
  return typeof value.error === "string" ? value.error : fallback;
}

function userMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "PPV Commerce action failed.";
  if (/reject|declin|cancel/i.test(message)) {
    return "The wallet rejected the request. No agreement change was confirmed.";
  }
  if (/insufficient|lamports|funds/i.test(message)) {
    return "This wallet needs enough devnet SOL for transaction fees and account rent.";
  }
  return message;
}

function formatUnix(value: number) {
  if (!value) return "—";
  return new Date(value * 1_000).toLocaleString();
}

function statusLabel(record: AgreementRecord | null) {
  if (!record) return "DRAFT";
  if (record.state === "executed") return "EXECUTED";
  if (record.state === "cancelled") return "CANCELLED";
  return "AWAITING APPROVALS";
}

export function PpvAgreementWorkspace({
  environment,
  mutationCapability,
  layerCapability,
}: {
  environment: PpvRuntimeEnvironmentV1 | null;
  mutationCapability: Capability;
  layerCapability: Capability;
}) {
  const { getAccessToken } = usePrivy();
  const { account, runtimeMode } = useGwapOs();
  const { wallets } = usePrivySolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const inFlight = useRef(false);

  const [form, setForm] = useState<AgreementForm>(EMPTY_FORM);
  const [record, setRecord] = useState<AgreementRecord | null>(null);
  const [agreementAddress, setAgreementAddress] = useState("");
  const [agreementIdHex, setAgreementIdHex] = useState("");
  const [signature, setSignature] = useState("");
  const [state, setState] = useState<UiState>("idle");
  const [message, setMessage] = useState(
    "Create an agreement in plain language. GWAP generates the canonical documents and hashes behind the scenes.",
  );
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [reviewMessage, setReviewMessage] = useState(
    "After the agreement is finalized on devnet, review the exact version before signing.",
  );
  const [inboxItems, setInboxItems] = useState<CommerceInboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [networkConfirmed, setNetworkConfirmed] = useState(false);
  const [loadedDocuments, setLoadedDocuments] = useState<{
    contentJson: string;
    termsJson: string;
  } | null>(null);
  const [draftChanged, setDraftChanged] = useState(false);

  const generatedDocuments = useMemo(() => canonicalDocuments(form), [form]);
  const activeDocuments =
    loadedDocuments && !draftChanged ? loadedDocuments : generatedDocuments;

  const writesReady = mutationCapability.state === "ready";
  const readsReady =
    layerCapability.state === "ready" || layerCapability.state === "read_only";
  const wallet = useMemo(
    () => wallets.find((candidate) => candidate.address === account.verifiedWallet),
    [account.verifiedWallet, wallets],
  );
  const expectedChain = environment
    ? walletChainForPpvCluster(environment.cluster)
    : null;
  const walletChainSupport = useMemo(
    () =>
      wallet && expectedChain
        ? inspectWalletChainSupport(wallet, expectedChain)
        : "unknown",
    [expectedChain, wallet],
  );
  const walletReady =
    writesReady &&
    Boolean(wallet) &&
    expectedChain === "solana:devnet" &&
    networkConfirmed &&
    walletChainSupport !== "unsupported";
  const busy =
    state === "loading" ||
    state === "preparing" ||
    state === "signing" ||
    state === "confirming";
  const currentSigner =
    record?.partyA === account.verifiedWallet
      ? record.sigA
      : record?.partyB === account.verifiedWallet
        ? record.sigB
        : null;
  const isCreator = !record || record.partyA === account.verifiedWallet;
  const canEdit =
    !record || (record.state === "pending" && record.partyA === account.verifiedWallet);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const updateForm = useCallback(
    <K extends keyof AgreementForm>(key: K, value: AgreementForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      setDraftChanged(true);
      setReviewState("idle");
      setReviewedVersion(null);
      setReviewMessage(
        record
          ? "Draft changed. Publish a revision before either party signs this edited version."
          : "Your agreement draft is ready for review before it is created.",
      );
    },
    [record],
  );

  const loadInbox = useCallback(async () => {
    if (runtimeMode !== "devnet") return;
    setInboxLoading(true);
    try {
      const response = await authenticatedFetch("/api/ppv/commerce/inbox", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status !== 404 && response.status !== 401) {
          setMessage("The agreement inbox could not be refreshed. Existing chain state is unaffected.");
        }
        return;
      }
      const payload = (await response.json()) as CommerceInboxPayload;
      setInboxItems(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setMessage("The agreement inbox could not be refreshed. Existing chain state is unaffected.");
    } finally {
      setInboxLoading(false);
    }
  }, [authenticatedFetch, runtimeMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInbox(), 0);
    return () => window.clearTimeout(timer);
  }, [account.verifiedWallet, loadInbox]);

  useEffect(() => {
    setNetworkConfirmed(false);
  }, [account.verifiedWallet]);

  async function confirm(operationId: string, submittedSignature: string) {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await authenticatedFetch("/api/ppv/commerce/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId,
          signature: submittedSignature,
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
    throw new Error(
      "The transaction was broadcast but finalization is still pending. Do not submit a duplicate agreement action.",
    );
  }

  async function syncInbox(next: AgreementRecord) {
    const response = await authenticatedFetch("/api/ppv/commerce/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partyA: next.partyA,
        agreementIdHex: next.agreementId,
        content: activeDocuments.contentJson,
        terms: activeDocuments.termsJson,
      }),
    });
    if (response.ok) await loadInbox();
  }

  async function prepareAndSend(
    action: CommerceAction,
    payload: Record<string, unknown>,
  ) {
    if (inFlight.current || !writesReady) return null;
    if (!wallet || !environment || !expectedChain) {
      throw new Error("Reconnect the Solana wallet used by this GWAP session.");
    }
    if (walletChainSupport === "unsupported") {
      throw new Error("This connected wallet does not advertise Solana Devnet support.");
    }
    if (!networkConfirmed) {
      throw new Error(
        "Confirm Solana Devnet readiness before opening the wallet approval request.",
      );
    }

    inFlight.current = true;
    try {
      setState("preparing");
      setMessage("Preparing the exact agreement transaction on Solana Devnet…");
      const response = await authenticatedFetch("/api/ppv/commerce/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(
          readApiError(body, "PPV could not prepare this Commerce transaction."),
        );
      }
      const prepared = body as PreparedTransaction;
      assertPreparedPpvEnvironment({
        expected: environment,
        prepared,
        layer: "commerce",
      });

      setState("signing");
      setMessage("Approve this exact agreement transaction in your GWAP wallet.");
      void authenticatedFetch("/api/ppv/commerce/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "sign_started",
          action,
          walletType: "agreement-workspace",
        }),
      }).catch(() => undefined);

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
        void authenticatedFetch("/api/ppv/commerce/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "sign_failed",
            action,
            code: "WALLET_HANDOFF_FAILED",
            walletType: "agreement-workspace",
          }),
        }).catch(() => undefined);
        throw error;
      }

      if (!result?.signature || result.signature.length !== 64) {
        throw new Error("The wallet returned without a valid Solana transaction signature.");
      }
      const submittedSignature = bs58.encode(result.signature);
      setSignature(submittedSignature);
      void authenticatedFetch("/api/ppv/commerce/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "broadcast_returned",
          action,
          walletType: "agreement-workspace",
        }),
      }).catch(() => undefined);

      setState("confirming");
      setMessage("Transaction broadcast. Waiting for finalized agreement state…");
      const finalized = await confirm(prepared.operationId, submittedSignature);
      if (finalized.status !== "finalized") {
        throw new Error("The agreement transaction has not finalized yet.");
      }

      const next = {
        ...finalized.agreement,
        agreementAddress: finalized.agreementAddress,
      };
      setRecord(next);
      setAgreementAddress(finalized.agreementAddress);
      setAgreementIdHex(next.agreementId);
      await syncInbox(next).catch(() => undefined);
      setLoadedDocuments({
        contentJson: activeDocuments.contentJson,
        termsJson: activeDocuments.termsJson,
      });
      setDraftChanged(false);
      setReviewState("idle");
      setReviewedVersion(null);
      setState("finalized");
      setMessage(
        `${action.toUpperCase()} finalized. Agreement version ${next.version} is ${next.state}.`,
      );
      return next;
    } finally {
      inFlight.current = false;
    }
  }

  async function createAgreement() {
    if (
      !form.title.trim() ||
      !form.counterpartyWallet.trim() ||
      !form.summary.trim() ||
      !form.deliverables.trim()
    ) {
      setState("error");
      setMessage("Add a title, counterparty wallet, scope, and at least one deliverable.");
      return;
    }
    const hours = Number(form.expiryHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 8_760) {
      setState("error");
      setMessage("Agreement expiration must be between 1 and 8,760 hours.");
      return;
    }

    try {
      const [contentHashHex, termsHashHex] = await Promise.all([
        hashDocumentHexV1(generatedDocuments.content),
        hashDocumentHexV1(generatedDocuments.terms),
      ]);
      const id = randomAgreementId();
      setAgreementIdHex(id);
      await prepareAndSend("create", {
        agreementIdHex: id,
        partyB: form.counterpartyWallet.trim(),
        contentHashHex,
        termsHashHex,
        expiresAtUnix: Math.floor(Date.now() / 1_000) + hours * 3_600,
      });
    } catch (error) {
      setState("error");
      setMessage(userMessage(error));
    }
  }

  async function reviseAgreement() {
    if (!record || record.state !== "pending" || !isCreator) return;
    try {
      const [contentHashHex, termsHashHex] = await Promise.all([
        hashDocumentHexV1(generatedDocuments.content),
        hashDocumentHexV1(generatedDocuments.terms),
      ]);
      await prepareAndSend("revise", {
        partyA: record.partyA,
        agreementIdHex: record.agreementId,
        expectedVersion: record.version,
        contentHashHex,
        termsHashHex,
      });
    } catch (error) {
      setState("error");
      setMessage(userMessage(error));
    }
  }

  async function reviewExactVersion() {
    if (!record) return;
    setReviewState("checking");
    setReviewMessage("Comparing this human-readable agreement to the finalized fingerprints…");
    try {
      const contentDocument = parseJsonObject(activeDocuments.contentJson);
      const termsDocument = parseJsonObject(activeDocuments.termsJson);
      if (!contentDocument || !termsDocument) {
        throw new Error("The structured agreement documents are invalid.");
      }
      const [contentHashHex, termsHashHex] = await Promise.all([
        hashDocumentHexV1(contentDocument),
        hashDocumentHexV1(termsDocument),
      ]);
      if (
        contentHashHex !== record.contentHash ||
        termsHashHex !== record.termsHash
      ) {
        setReviewState("mismatch");
        setReviewedVersion(null);
        setReviewMessage(
          "This draft differs from the finalized agreement. Publish a revision before signing.",
        );
        return;
      }
      setReviewState("match");
      setReviewedVersion(record.version);
      setReviewMessage(
        `Verified: this is the exact content and terms committed by agreement version ${record.version}.`,
      );
    } catch (error) {
      setReviewState("error");
      setReviewedVersion(null);
      setReviewMessage(userMessage(error));
    }
  }

  async function signAgreement() {
    if (
      !record ||
      record.state !== "pending" ||
      reviewState !== "match" ||
      reviewedVersion !== record.version ||
      currentSigner
    ) {
      return;
    }
    try {
      const contentDocument = parseJsonObject(activeDocuments.contentJson);
      const termsDocument = parseJsonObject(activeDocuments.termsJson);
      if (!contentDocument || !termsDocument) {
        throw new Error("The structured agreement documents are invalid.");
      }
      const [contentHashHex, termsHashHex] = await Promise.all([
        hashDocumentHexV1(contentDocument),
        hashDocumentHexV1(termsDocument),
      ]);
      await prepareAndSend("sign", {
        partyA: record.partyA,
        agreementIdHex: record.agreementId,
        expectedVersion: record.version,
        contentHashHex,
        termsHashHex,
      });
    } catch (error) {
      setState("error");
      setMessage(userMessage(error));
    }
  }

  async function cancelAgreement() {
    if (!record || record.state !== "pending") return;
    try {
      await prepareAndSend("cancel", {
        partyA: record.partyA,
        agreementIdHex: record.agreementId,
      });
    } catch (error) {
      setState("error");
      setMessage(userMessage(error));
    }
  }

  async function openInboxItem(item: CommerceInboxItem) {
    if (inFlight.current || !readsReady) return;
    inFlight.current = true;
    try {
      setState("loading");
      setMessage("Loading the latest finalized agreement version…");
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
      setRecord(next);
      setAgreementAddress(next.agreementAddress);
      setAgreementIdHex(next.agreementId);
      setLoadedDocuments({ contentJson: item.content, termsJson: item.terms });
      setDraftChanged(false);
      setForm(
        hydrateForm(
          item.content,
          item.terms,
          next.partyA === account.verifiedWallet ? next.partyB : next.partyA,
          item.title,
        ),
      );

      const contentDocument = parseJsonObject(item.content);
      const termsDocument = parseJsonObject(item.terms);
      if (contentDocument && termsDocument) {
        const [contentHashHex, termsHashHex] = await Promise.all([
          hashDocumentHexV1(contentDocument),
          hashDocumentHexV1(termsDocument),
        ]);
        if (
          contentHashHex === next.contentHash &&
          termsHashHex === next.termsHash
        ) {
          setReviewState("match");
          setReviewedVersion(next.version);
          setReviewMessage(
            `Verified: the delivered documents match finalized version ${next.version}.`,
          );
        } else {
          setReviewState("mismatch");
          setReviewedVersion(null);
          setReviewMessage("The delivered documents do not match the finalized fingerprints. Do not sign.");
        }
      }
      setState("idle");
      setMessage(
        next.state === "pending"
          ? "Agreement loaded. Review every term before approving this exact version."
          : `Agreement loaded. Current state: ${next.state}.`,
      );
    } catch (error) {
      setState("error");
      setMessage(userMessage(error));
    } finally {
      inFlight.current = false;
    }
  }

  function startNewAgreement() {
    setForm(EMPTY_FORM);
    setRecord(null);
    setAgreementAddress("");
    setAgreementIdHex("");
    setSignature("");
    setLoadedDocuments(null);
    setDraftChanged(false);
    setReviewState("idle");
    setReviewedVersion(null);
    setState("idle");
    setMessage(
      "Create an agreement in plain language. GWAP generates the canonical documents and hashes behind the scenes.",
    );
  }

  const timeline = useMemo(() => {
    if (!record) return [] as { label: string; at: number }[];
    const entries = [{ label: "Agreement created", at: record.createdAt }];
    if (record.sigA) {
      entries.push({
        label: `Party A approved version ${record.sigA.versionSigned}`,
        at: record.sigA.signedAt,
      });
    }
    if (record.sigB) {
      entries.push({
        label: `Party B approved version ${record.sigB.versionSigned}`,
        at: record.sigB.signedAt,
      });
    }
    if (record.executedAt) entries.push({ label: "Agreement executed", at: record.executedAt });
    if (record.cancelledAt) entries.push({ label: "Agreement cancelled", at: record.cancelledAt });
    return entries.sort((left, right) => left.at - right.at);
  }, [record]);

  return (
    <section className={styles.workspace} aria-labelledby="agreement-workspace-title">
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>PPV COMMERCE · AGREEMENT WORKSPACE</p>
          <h2 id="agreement-workspace-title">One agreement. One version. Every approval in one place.</h2>
          <p className={styles.heroCopy}>
            Write the agreement like a normal contract. GWAP converts it to deterministic structured data, commits only the fingerprints on Solana Devnet, and keeps both parties on the exact same version.
          </p>
        </div>
        <div className={styles.heroActions}>
          <span className={writesReady ? styles.ready : styles.gated}>
            {writesReady ? "DEVNET READY" : "WRITES GATED"}
          </span>
          {record ? (
            <button type="button" className={styles.textButton} onClick={startNewAgreement}>
              + New agreement
            </button>
          ) : null}
        </div>
      </header>

      <section className={styles.networkBar}>
        <div>
          <strong>Wallet approval network</strong>
          <span>
            Embedded GWAP Wallet transactions are routed to Devnet by Privy. External wallets must also have Solana Devnet/Testnet Mode selected.
          </span>
        </div>
        <button
          type="button"
          className={networkConfirmed ? styles.confirmedButton : styles.secondaryButton}
          disabled={!wallet || walletChainSupport === "unsupported"}
          onClick={() => setNetworkConfirmed(true)}
        >
          {networkConfirmed ? "Devnet confirmed" : "Confirm Solana Devnet"}
        </button>
      </section>

      <div className={styles.workspaceGrid}>
        <main className={styles.documentColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <span>AGREEMENT</span>
                <h3>{record ? `Version ${record.version}` : "Create a new agreement"}</h3>
              </div>
              <span className={styles.statusPill} data-state={record?.state ?? "draft"}>
                {statusLabel(record)}
              </span>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.fullWidth}>
                <span>Agreement title</span>
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value.slice(0, 120))}
                  placeholder="Website development agreement"
                  disabled={busy || !canEdit}
                />
              </label>

              <label className={styles.fullWidth}>
                <span>Counterparty wallet</span>
                <input
                  value={form.counterpartyWallet}
                  onChange={(event) => updateForm("counterpartyWallet", event.target.value.trim())}
                  placeholder="Solana wallet address"
                  disabled={busy || Boolean(record) || !canEdit}
                />
                <small>.gwap identity resolution can plug into this field next; the devnet contract currently resolves parties by wallet.</small>
              </label>

              <label className={styles.fullWidth}>
                <span>Scope / what are you agreeing to?</span>
                <textarea
                  value={form.summary}
                  onChange={(event) => updateForm("summary", event.target.value.slice(0, 6_000))}
                  rows={5}
                  placeholder="Describe the work, sale, service, obligation, or exchange in plain language."
                  disabled={busy || !canEdit}
                />
              </label>

              <label className={styles.fullWidth}>
                <span>Deliverables</span>
                <textarea
                  value={form.deliverables}
                  onChange={(event) => updateForm("deliverables", event.target.value.slice(0, 6_000))}
                  rows={5}
                  placeholder={"One deliverable per line\nHomepage design\nResponsive implementation\nSource files"}
                  disabled={busy || !canEdit}
                />
              </label>

              <label>
                <span>Payment amount</span>
                <input
                  value={form.paymentAmount}
                  onChange={(event) => updateForm("paymentAmount", event.target.value.slice(0, 64))}
                  placeholder="500"
                  disabled={busy || !canEdit}
                />
              </label>

              <label>
                <span>Payment asset</span>
                <select
                  value={form.paymentAsset}
                  onChange={(event) =>
                    updateForm(
                      "paymentAsset",
                      event.target.value as AgreementForm["paymentAsset"],
                    )
                  }
                  disabled={busy || !canEdit}
                >
                  <option value="USDC">USDC</option>
                  <option value="SOL">SOL</option>
                  <option value="USD">USD</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>

              <label>
                <span>Due date</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => updateForm("dueDate", event.target.value)}
                  disabled={busy || !canEdit}
                />
              </label>

              <label>
                <span>Revisions allowed</span>
                <input
                  inputMode="numeric"
                  value={form.revisionsAllowed}
                  onChange={(event) =>
                    updateForm(
                      "revisionsAllowed",
                      event.target.value.replace(/[^0-9]/g, "").slice(0, 3),
                    )
                  }
                  disabled={busy || !canEdit}
                />
              </label>

              <label className={styles.fullWidth}>
                <span>Milestone plan</span>
                <textarea
                  value={form.milestones}
                  onChange={(event) => updateForm("milestones", event.target.value.slice(0, 6_000))}
                  rows={4}
                  placeholder={"One milestone per line\nDesign approval\nDevelopment delivery\nFinal acceptance"}
                  disabled={busy || !canEdit}
                />
                <small>Milestones are agreement terms in v1. Escrow release approvals remain disabled until the custody gate is approved.</small>
              </label>

              <label className={styles.fullWidth}>
                <span>Additional terms</span>
                <textarea
                  value={form.additionalTerms}
                  onChange={(event) => updateForm("additionalTerms", event.target.value.slice(0, 6_000))}
                  rows={4}
                  placeholder="Cancellation, acceptance, ownership, licensing, delivery, or other conditions."
                  disabled={busy || !canEdit}
                />
              </label>

              {!record ? (
                <label>
                  <span>Agreement expires in</span>
                  <div className={styles.inputSuffix}>
                    <input
                      inputMode="numeric"
                      value={form.expiryHours}
                      onChange={(event) =>
                        updateForm(
                          "expiryHours",
                          event.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                        )
                      }
                      disabled={busy || !canEdit}
                    />
                    <span>hours</span>
                  </div>
                </label>
              ) : null}
            </div>

            <div className={styles.notice}>
              <strong>Payment is terms-only in this pilot.</strong>
              <p>No SOL, USDC, or fiat is transferred by this agreement screen. PPV Escrow remains read-only with the custody gate closed.</p>
            </div>

            <div className={styles.primaryActions}>
              {!record ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || !walletReady}
                  onClick={() => void createAgreement()}
                >
                  {state === "preparing"
                    ? "Preparing…"
                    : state === "signing"
                      ? "Waiting for wallet…"
                      : state === "confirming"
                        ? "Finalizing…"
                        : "Create agreement"}
                </button>
              ) : null}

              {record?.state === "pending" && isCreator && draftChanged ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || !walletReady}
                  onClick={() => void reviseAgreement()}
                >
                  Publish revision
                </button>
              ) : null}
            </div>
          </section>

          {record ? (
            <section className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <span>EXACT VERSION REVIEW</span>
                  <h3>Review first. Approve second.</h3>
                </div>
                <span
                  className={styles.reviewBadge}
                  data-review={reviewState}
                >
                  {reviewState === "match" ? "VERIFIED" : reviewState.toUpperCase()}
                </span>
              </div>

              <div className={styles.reviewDocument}>
                <div>
                  <span>Scope</span>
                  <p>{form.summary || "No scope supplied."}</p>
                </div>
                <div>
                  <span>Deliverables</span>
                  {splitLines(form.deliverables).length ? (
                    <ul>
                      {splitLines(form.deliverables).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No deliverables supplied.</p>
                  )}
                </div>
                <div className={styles.reviewFacts}>
                  <p><span>Payment</span><strong>{form.paymentAmount || "—"} {form.paymentAsset}</strong></p>
                  <p><span>Due</span><strong>{form.dueDate || "—"}</strong></p>
                  <p><span>Revisions</span><strong>{form.revisionsAllowed || "0"}</strong></p>
                </div>
                {form.additionalTerms ? (
                  <div>
                    <span>Additional terms</span>
                    <p>{form.additionalTerms}</p>
                  </div>
                ) : null}
              </div>

              <p className={styles.reviewMessage} aria-live="polite">{reviewMessage}</p>

              <div className={styles.primaryActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy || draftChanged}
                  onClick={() => void reviewExactVersion()}
                >
                  {reviewState === "checking" ? "Verifying…" : "Verify exact version"}
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    busy ||
                    !walletReady ||
                    record.state !== "pending" ||
                    reviewState !== "match" ||
                    reviewedVersion !== record.version ||
                    Boolean(currentSigner)
                  }
                  onClick={() => void signAgreement()}
                >
                  {currentSigner
                    ? "You approved this version"
                    : record.partyB === account.verifiedWallet
                      ? "Approve & sign agreement"
                      : "Approve & sign exact version"}
                </button>
                {record.state === "pending" ? (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={busy || !walletReady}
                    onClick={() => void cancelAgreement()}
                  >
                    {record.partyB === account.verifiedWallet
                      ? "Decline agreement"
                      : "Cancel agreement"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </main>

        <aside className={styles.sideColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <span>APPROVAL STATUS</span>
                <h3>{statusLabel(record)}</h3>
              </div>
            </div>

            <div className={styles.approvalList}>
              <div className={styles.approvalRow}>
                <span className={record?.sigA ? styles.approvedDot : styles.pendingDot} />
                <div>
                  <strong>Party A · Creator</strong>
                  <small>{record ? shortWallet(record.partyA) : shortWallet(account.verifiedWallet)}</small>
                </div>
                <b>{record?.sigA ? `Signed v${record.sigA.versionSigned}` : "Pending"}</b>
              </div>
              <div className={styles.approvalRow}>
                <span className={record?.sigB ? styles.approvedDot : styles.pendingDot} />
                <div>
                  <strong>Party B · Counterparty</strong>
                  <small>{record ? shortWallet(record.partyB) : form.counterpartyWallet ? shortWallet(form.counterpartyWallet) : "Not set"}</small>
                </div>
                <b>{record?.sigB ? `Signed v${record.sigB.versionSigned}` : "Pending"}</b>
              </div>
            </div>

            <div className={styles.statusMessage} data-state={state}>
              <strong>{state.replaceAll("-", " ").toUpperCase()}</strong>
              <p aria-live="polite">{message}</p>
            </div>

            {record ? (
              <dl className={styles.metaList}>
                <div><dt>Version</dt><dd>{record.version}</dd></div>
                <div><dt>Expires</dt><dd>{formatUnix(record.expiresAt)}</dd></div>
                <div><dt>Network</dt><dd>Solana Devnet</dd></div>
              </dl>
            ) : null}

            {signature ? (
              <a
                className={styles.explorerLink}
                href={ppvExplorerTransactionUrl(signature, environment?.cluster ?? "devnet")}
                target="_blank"
                rel="noreferrer"
              >
                View latest transaction on Solana Explorer ↗
              </a>
            ) : null}
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <span>AGREEMENT INBOX</span>
                <h3>Sent & received</h3>
              </div>
              <button
                type="button"
                className={styles.textButton}
                disabled={inboxLoading}
                onClick={() => void loadInbox()}
              >
                {inboxLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className={styles.inboxList}>
              {inboxItems.length ? (
                inboxItems.map((item) => {
                  const incoming = item.partyB === account.verifiedWallet;
                  const awaiting = incoming && item.state === "pending" && !item.sigB;
                  return (
                    <button
                      key={item.agreementAddress}
                      type="button"
                      className={styles.inboxItem}
                      data-pending={awaiting || undefined}
                      disabled={busy}
                      onClick={() => void openInboxItem(item)}
                    >
                      <div>
                        <strong>{item.title}</strong>
                        <small>{incoming ? "From" : "To"} {shortWallet(incoming ? item.partyA : item.partyB)} · v{item.version}</small>
                      </div>
                      <span>{awaiting ? "REVIEW" : item.state.toUpperCase()}</span>
                    </button>
                  );
                })
              ) : (
                <p className={styles.emptyState}>
                  {inboxLoading ? "Checking agreements…" : "No delivered devnet agreements yet."}
                </p>
              )}
            </div>
          </section>

          {record && timeline.length ? (
            <section className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <span>ACTIVITY</span>
                  <h3>Agreement history</h3>
                </div>
              </div>
              <ol className={styles.timeline}>
                {timeline.map((entry) => (
                  <li key={`${entry.label}-${entry.at}`}>
                    <span />
                    <div>
                      <strong>{entry.label}</strong>
                      <small>{formatUnix(entry.at)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>

      <details className={styles.advanced}>
        <summary>Advanced · structured agreement & protocol details</summary>
        <p>
          These documents are generated by GWAP. Normal users never need to write JSON; the structured form exists so PPV can deterministically hash and verify the exact agreement version.
        </p>
        <div className={styles.advancedGrid}>
          <div>
            <span>CONTENT DOCUMENT · READ ONLY</span>
            <pre>{activeDocuments.contentJson}</pre>
          </div>
          <div>
            <span>TERMS DOCUMENT · READ ONLY</span>
            <pre>{activeDocuments.termsJson}</pre>
          </div>
        </div>
        <dl className={styles.protocolMeta}>
          <div><dt>Agreement ID</dt><dd>{agreementIdHex || "generated when created"}</dd></div>
          <div><dt>Agreement account</dt><dd>{agreementAddress || "created after finalization"}</dd></div>
          <div><dt>Content fingerprint</dt><dd>{record?.contentHash || "available after creation"}</dd></div>
          <div><dt>Terms fingerprint</dt><dd>{record?.termsHash || "available after creation"}</dd></div>
          <div><dt>Network</dt><dd>{environment?.cluster ?? "unverified"}</dd></div>
          <div><dt>RPC profile</dt><dd>{environment?.rpcProfileId ?? "unverified"}</dd></div>
        </dl>
      </details>

      {!writesReady ? (
        <p className={styles.gateMessage}>
          Commerce writes are currently gated: {mutationCapability.reasonCode ?? "FEATURE_DISABLED"}.
        </p>
      ) : null}
    </section>
  );
}
