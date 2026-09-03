"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets as usePrivySolanaWallets,
} from "@privy-io/react-auth/solana";
import { Connection, PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { GwapScoreDisplay } from "../../components/gwap-score-display";
import type { GwapScoreResult } from "../../lib/gwap-score";
import {
  GNS_PENDING_REGISTRATION_STORAGE_KEY,
  buildGnsRegistrationTransaction,
  encodeGnsSignature,
  getGnsExplorerUrl,
  getGnsPrivyChain,
  getGnsRpcUrl,
  isGnsRegistrationConfig,
  isValidGnsName,
  normalizeGnsName,
  parsePendingGnsRegistration,
  type GnsRegistrationConfig,
  type PendingGnsRegistration,
} from "../lib/gns-registration";
import { useGwapOs } from "./os-provider";
import { GnsProfileEditor } from "./gns-profile-editor";

type SearchState =
  | { status: "idle"; message: string }
  | { status: "checking"; message: string }
  | { status: "available"; message: string }
  | { status: "taken"; message: string }
  | { status: "error"; message: string };

type RegistrationState = {
  status:
    | "idle"
    | "signing"
    | "confirming"
    | "recording"
    | "sync-required"
    | "success"
    | "error";
  message: string;
  name?: string;
  signature?: string;
};

type ApiPayload = {
  error?: string;
  recovered?: boolean;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function readPendingRegistration(owner: string) {
  try {
    const raw = window.localStorage.getItem(
      GNS_PENDING_REGISTRATION_STORAGE_KEY,
    );
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    const pending = parsePendingGnsRegistration(value, owner);
    if (
      !pending &&
      value &&
      typeof value === "object" &&
      (value as { owner?: unknown }).owner === owner
    ) {
      window.localStorage.removeItem(GNS_PENDING_REGISTRATION_STORAGE_KEY);
    }
    return pending;
  } catch {
    return null;
  }
}

function writePendingRegistration(pending: PendingGnsRegistration) {
  try {
    window.localStorage.setItem(
      GNS_PENDING_REGISTRATION_STORAGE_KEY,
      JSON.stringify(pending),
    );
  } catch {
    // The in-memory state still prevents a duplicate transaction this session.
  }
}

function clearPendingRegistration(owner: string) {
  try {
    const raw = window.localStorage.getItem(
      GNS_PENDING_REGISTRATION_STORAGE_KEY,
    );
    if (!raw) return;
    const value = JSON.parse(raw) as { owner?: unknown };
    if (value?.owner === owner) {
      window.localStorage.removeItem(GNS_PENDING_REGISTRATION_STORAGE_KEY);
    }
  } catch {
    try {
      window.localStorage.removeItem(GNS_PENDING_REGISTRATION_STORAGE_KEY);
    } catch {
      // Browser storage is optional; the live state remains authoritative.
    }
  }
}

function registrationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Registration failed.";
  if (/reject|declin|cancel/i.test(message)) {
    return "The wallet signature was cancelled. No transaction was submitted.";
  }
  if (/insufficient|lamports|funds/i.test(message)) {
    return "This verified wallet needs enough devnet SOL for the 0.01 SOL registration fee, account rent, and network fee.";
  }
  if (/blockhash|expired|block height/i.test(message)) {
    return "The transaction expired before confirmation. Check the explorer before trying again.";
  }
  return message;
}

export function IdentityView() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const { wallets: privySolanaWallets } = usePrivySolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const checkRequestRef = useRef(0);
  const registrationInFlightRef = useRef(false);
  const [name, setName] = useState("");
  const [candidate, setCandidate] = useState("");
  const [config, setConfig] = useState<GnsRegistrationConfig | null>(null);
  const [search, setSearch] = useState<SearchState>({
    status: "idle",
    message: "Enter a .gwap name to query the registry.",
  });
  const [registration, setRegistration] = useState<RegistrationState>({
    status: "idle",
    message: "Availability must be confirmed before a transaction is built.",
  });

  useEffect(() => {
    if (gnsIdentity.status === "found") {
      clearPendingRegistration(account.verifiedWallet);
      return;
    }

    const timer = window.setTimeout(() => {
      const pending = readPendingRegistration(account.verifiedWallet);
      if (!pending) return;
      setName(pending.name);
      setCandidate(pending.name);
      setConfig(pending.config);
      setSearch({
        status: "available",
        message: `${pending.name}.gwap → TRANSACTION SUBMITTED`,
      });
      setRegistration({
        status: "sync-required",
        message:
          "A submitted transaction is awaiting registry verification. Retry sync—do not sign a second transaction.",
        name: pending.name,
        signature: pending.signature,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [account.verifiedWallet, gnsIdentity.status]);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  async function readPayload(response: Response) {
    try {
      return (await response.json()) as ApiPayload;
    } catch {
      return {};
    }
  }

  async function checkName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestId = ++checkRequestRef.current;
    const nextCandidate = normalizeGnsName(name);
    if (!isValidGnsName(nextCandidate)) {
      setCandidate("");
      setConfig(null);
      setSearch({
        status: "error",
        message: "Use 1–32 lowercase letters, numbers, or internal hyphens.",
      });
      return;
    }

    setCandidate(nextCandidate);
    setConfig(null);
    setRegistration({
      status: "idle",
      message: "Preparing the canonical GNS deployment configuration.",
    });
    setSearch({
      status: "checking",
      message: `checking ${nextCandidate}.gwap...`,
    });

    try {
      const availabilityResponse = await authenticatedFetch(
        `/api/gns/resolve?name=${encodeURIComponent(nextCandidate)}`,
      );
      const availability = (await readPayload(availabilityResponse)) as ApiPayload & {
        available?: boolean;
      };
      if (requestId !== checkRequestRef.current) return;
      if (!availabilityResponse.ok) {
        throw new Error(availability.error || "Registry request failed.");
      }
      if (availability.available !== true) {
        setSearch({
          status: "taken",
          message: `${nextCandidate}.gwap → TAKEN`,
        });
        setRegistration({
          status: "idle",
          message: "Choose another name to continue initialization.",
        });
        return;
      }

      const configResponse = await authenticatedFetch("/api/gns/register");
      const configPayload = (await configResponse.json()) as unknown;
      if (requestId !== checkRequestRef.current) return;
      if (!configResponse.ok || !isGnsRegistrationConfig(configPayload)) {
        const errorPayload = configPayload as ApiPayload;
        throw new Error(
          errorPayload?.error
            ? errorPayload.error
            : "GNS registration configuration is unavailable.",
        );
      }

      setConfig(configPayload);
      setSearch({
        status: "available",
        message: `${nextCandidate}.gwap → AVAILABLE`,
      });
      setRegistration({
        status: "idle",
        message: "Ready to build the verified Anchor registration transaction.",
      });
    } catch (error) {
      if (requestId !== checkRequestRef.current) return;
      setConfig(null);
      setSearch({
        status: "error",
        message:
          error instanceof Error ? error.message : "Registry request failed.",
      });
    }
  }

  async function syncReceipt(signature: string, registrationName: string) {
    const response = await authenticatedFetch("/api/gns/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: registrationName, txSignature: signature }),
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(
        payload.error || "GNS could not verify the confirmed transaction.",
      );
    }
    return payload;
  }

  async function completeInitialization(
    signature: string,
    registrationName: string,
  ) {
    setRegistration({
      status: "recording",
      message: "Verifying the receipt and mounting your identity in GNS…",
      name: registrationName,
      signature,
    });
    const payload = await syncReceipt(signature, registrationName);
    clearPendingRegistration(account.verifiedWallet);
    setRegistration({
      status: "success",
      message: payload.recovered
        ? `${registrationName}.gwap was recovered from its confirmed transaction.`
        : `${registrationName}.gwap is registered and mounted.`,
      name: registrationName,
      signature,
    });
    router.refresh();
  }

  async function registerName() {
    if (
      registrationInFlightRef.current ||
      !config ||
      search.status !== "available" ||
      !candidate
    ) return;

    registrationInFlightRef.current = true;
    const registrationName = candidate;

    let submittedSignature = "";
    let transactionFailed = false;

    try {
      const owner = new PublicKey(account.verifiedWallet);
      const connection = new Connection(getGnsRpcUrl(config.network), "confirmed");
      const transaction = buildGnsRegistrationTransaction({
        config,
        name: registrationName,
        owner,
      });
      const blockhash = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash.blockhash;
      transaction.feePayer = owner;

      setRegistration({
        status: "signing",
        message: `Approve the ${config.feeSol} SOL ${config.network} registration in your verified wallet.`,
        name: registrationName,
      });

      const privyWallet = privySolanaWallets.find(
        (wallet) => wallet.address === account.verifiedWallet,
      );
      if (!privyWallet) {
        throw new Error(
          "Reconnect the Solana wallet that authenticated this OS session before registering.",
        );
      }

      const result = await signAndSendTransaction({
        transaction: transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
        wallet: privyWallet,
        chain: getGnsPrivyChain(config.network),
        options: { optimisticBroadcast: true, skipSimulation: false },
      });
      submittedSignature = encodeGnsSignature(result.signature);

      writePendingRegistration({
        config,
        name: registrationName,
        owner: account.verifiedWallet,
        signature: submittedSignature,
        submittedAt: new Date().toISOString(),
      });

      setRegistration({
        status: "confirming",
        message: "Transaction submitted. Waiting for Solana confirmation…",
        name: registrationName,
        signature: submittedSignature,
      });
      const confirmation = await connection.confirmTransaction(
        { signature: submittedSignature, ...blockhash },
        "confirmed",
      );
      if (confirmation.value.err) {
        transactionFailed = true;
        clearPendingRegistration(account.verifiedWallet);
        throw new Error("The GNS program rejected this transaction on chain.");
      }

      await completeInitialization(submittedSignature, registrationName);
    } catch (error) {
      if (submittedSignature && !transactionFailed) {
        setRegistration({
          status: "sync-required",
          message:
            "The transaction was broadcast, but OS could not finish verification. Retry registry sync—do not sign a second transaction.",
          name: registrationName,
          signature: submittedSignature,
        });
        return;
      }
      setRegistration({
        status: "error",
        message: registrationErrorMessage(error),
        name: registrationName,
      });
    } finally {
      registrationInFlightRef.current = false;
    }
  }

  async function retryRegistrySync() {
    const registrationName = registration.name || candidate;
    if (
      registrationInFlightRef.current ||
      !registration.signature ||
      !registrationName
    ) return;
    registrationInFlightRef.current = true;
    try {
      await completeInitialization(registration.signature, registrationName);
    } catch (error) {
      setRegistration({
        status: "sync-required",
        message: registrationErrorMessage(error),
        name: registrationName,
        signature: registration.signature,
      });
    } finally {
      registrationInFlightRef.current = false;
    }
  }

  function discardPendingTransaction() {
    clearPendingRegistration(account.verifiedWallet);
    setCandidate("");
    setConfig(null);
    setSearch({
      status: "idle",
      message: "Recheck availability before building another transaction.",
    });
    setRegistration({
      status: "idle",
      message: "The failed transaction was cleared from this browser.",
    });
  }

  function updateName(value: string) {
    if (registrationInFlightRef.current || registration.signature) return;
    checkRequestRef.current += 1;
    setName(value.toLowerCase().replace(/[^a-z0-9-.]/g, "").slice(0, 37));
    setCandidate("");
    setConfig(null);
    setSearch({
      status: "idle",
      message: "Check this name before building a transaction.",
    });
    setRegistration({
      status: "idle",
      message: "Availability must be confirmed before a transaction is built.",
    });
  }

  if (gnsIdentity.status === "found") {
    const score: GwapScoreResult = {
      status: gnsIdentity.scoreStatus,
      score: gnsIdentity.score,
      tier: gnsIdentity.scoreTier,
      message: gnsIdentity.scoreMessage,
    };
    return (
      <div className="os-page os-runtime-page">
        <header className="os-runtime-heading">
          <span className="os-terminal-label">~/identity</span>
          <h1>Identity mounted.</h1>
          <p>Your connected wallet reverse-resolved to an active GNS profile.</p>
        </header>
        <section className="os-runtime-grid">
          <article className="os-runtime-panel os-profile-terminal">
            <div className="os-v2-avatar" aria-hidden="true">
              {(gnsIdentity.name || "G").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <span className="os-terminal-label">PRIMARY NAME</span>
              <h2>{gnsIdentity.fullName}</h2>
              <p>{gnsIdentity.bio || "No public bio published."}</p>
            </div>
            <dl>
              <div><dt>Wallet</dt><dd>{account.verifiedWallet}</dd></div>
              <div><dt>Verified</dt><dd>{gnsIdentity.verified ? "YES" : "PENDING"}</dd></div>
            </dl>
            <GwapScoreDisplay result={score} variant="card" />
            <div className="os-inline-actions">
              {gnsIdentity.profileUrl ? <a href={gnsIdentity.profileUrl} target="_blank" rel="noreferrer">Open public profile ↗</a> : null}
              <a href="https://gwapspot.fun/" target="_blank" rel="noreferrer">Manage in GNS ↗</a>
            </div>
          </article>
          <aside className="os-runtime-panel os-runtime-note">
            <span className="os-terminal-label">PROFILE PIPELINE</span>
            <h2>GNS is the source of truth.</h2>
            <p>GWAP OS reads the active .gwap identity and score without blocking entry if the registry slows down.</p>
            <code>wallet → /domains/:wallet → /profile/:name → OS</code>
          </aside>
        </section>
        {gnsIdentity.name ? <GnsProfileEditor name={gnsIdentity.name} /> : null}
      </div>
    );
  }

  const isBusy =
    registration.status === "signing" ||
    registration.status === "confirming" ||
    registration.status === "recording";
  const nameLocked = isBusy || Boolean(registration.signature);
  const registerLabel =
    registration.status === "signing"
      ? "Waiting for wallet…"
      : registration.status === "confirming"
        ? "Confirming on Solana…"
        : registration.status === "recording"
          ? "Mounting identity…"
          : `Register ${candidate}.gwap`;
  const explorerUrl =
    registration.signature && config
      ? getGnsExplorerUrl(registration.signature, config.network)
      : null;

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/identity/init</span>
        <h1>System Initialization.</h1>
        <p>
          {gnsIdentity.status === "none"
            ? "No .gwap profile was detected for this wallet. Claim one here without leaving GWAP OS."
            : "The GNS lookup timed out. You can retry a name check without leaving limited mode."}
        </p>
      </header>
      <section className="os-runtime-grid">
        <article className="os-runtime-panel">
          <div className="os-console-chrome">
            <span>gns.register</span>
            <span>{isBusy ? registration.status.toUpperCase() : search.status.toUpperCase()}</span>
          </div>
          <form className="os-name-search" onSubmit={checkName}>
            <label htmlFor="gwap-name">Desired identity</label>
            <div>
              <span>$ lookup</span>
              <input
                id="gwap-name"
                value={name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="yourname"
                autoComplete="off"
                maxLength={37}
                disabled={nameLocked}
              />
              <strong>.gwap</strong>
            </div>
            <button type="submit" disabled={search.status === "checking" || nameLocked}>
              {search.status === "checking" ? "Checking..." : "Check availability"}
            </button>
          </form>
          <p className={`os-search-output state-${search.status}`} aria-live="polite">
            <span>›</span> {search.message}
          </p>

          {search.status === "available" && config ? (
            <div className="os-gns-transaction">
              <dl className="os-gns-config">
                <div><dt>Registration fee</dt><dd>{config.feeSol} SOL</dd></div>
                <div><dt>Network</dt><dd>{config.network}</dd></div>
                <div><dt>Duration</dt><dd>1 year</dd></div>
                <div><dt>Mode</dt><dd>Anchor PDA</dd></div>
                <div><dt>Program</dt><dd>{shortAddress(config.programId)}</dd></div>
                <div><dt>Treasury</dt><dd>{shortAddress(config.treasury)}</dd></div>
              </dl>

              <p className={`os-registration-output state-${registration.status}`} aria-live="polite">
                <span>›</span> {registration.message}
              </p>

              {registration.status === "sync-required" ? (
                <div className="os-gns-recovery-actions">
                  <button className="os-primary-action" type="button" onClick={() => void retryRegistrySync()}>
                    Retry registry sync
                  </button>
                  <button className="os-gns-discard" type="button" onClick={discardPendingTransaction}>
                    Clear only if Explorer shows failed
                  </button>
                </div>
              ) : registration.status !== "success" ? (
                <button className="os-primary-action" type="button" disabled={isBusy} onClick={() => void registerName()}>
                  {registerLabel}
                </button>
              ) : null}

              {explorerUrl ? (
                <a className="os-gns-explorer" href={explorerUrl} target="_blank" rel="noreferrer">
                  View transaction on Solana Explorer ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </article>
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">INITIALIZATION STATUS</span>
          <h2>Signed write flow mounted.</h2>
          <p>
            GWAP OS builds the canonical GNS instruction locally. Your verified wallet signs it, Solana confirms it, and the GNS backend verifies the on-chain name record before the identity is mounted.
          </p>
          <ol className="os-gns-steps">
            <li><span>01</span> Check live availability</li>
            <li><span>02</span> Sign with verified wallet</li>
            <li><span>03</span> Confirm and verify receipt</li>
          </ol>
          <p className="os-runtime-warning">
            GNS currently runs on Solana devnet. The 0.01 SOL registration fee is separate from account rent and the network fee.
          </p>
          <Link href="/app">Return to workspace</Link>
        </aside>
      </section>
    </div>
  );
}
