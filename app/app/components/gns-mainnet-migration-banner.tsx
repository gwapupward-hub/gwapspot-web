"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignAndSendTransaction,
  useWallets as usePrivySolanaWallets,
} from "@privy-io/react-auth/solana";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  GNS_PENDING_REGISTRATION_STORAGE_KEY,
  buildGnsRegistrationTransaction,
  encodeGnsSignature,
  getGnsExplorerUrl,
  getGnsPrivyChain,
  getGnsRpcUrl,
  isGnsRegistrationConfig,
  type GnsRegistrationConfig,
} from "../lib/gns-registration";
import { useGwapOs } from "./os-provider";

type MigrationStatus =
  | "unsupported"
  | "available"
  | "development-active"
  | "migration-eligible"
  | "reserved"
  | "mainnet-active";

type MigrationPayload = {
  status?: MigrationStatus;
  name?: string;
  fullName?: string;
  network?: "devnet" | "testnet" | "mainnet-beta" | null;
  owner?: string | null;
  migrationEligible?: boolean;
  error?: string;
};

type ActionState = {
  status: "idle" | "preparing" | "signing" | "confirming" | "syncing" | "submitted" | "success" | "error";
  message: string;
  signature: string | null;
  config: GnsRegistrationConfig | null;
};

function pendingReceipt(
  config: GnsRegistrationConfig,
  name: string,
  owner: string,
  signature: string,
) {
  try {
    window.localStorage.setItem(
      GNS_PENDING_REGISTRATION_STORAGE_KEY,
      JSON.stringify({
        config,
        name,
        owner,
        signature,
        submittedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Server-side receipt tracking remains available once the API is reached.
  }
}

function migrationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Mainnet migration failed.";
  if (/reject|declin|cancel/i.test(message)) {
    return "The wallet signature was cancelled. No migration transaction was submitted.";
  }
  if (/insufficient|lamports|funds/i.test(message)) {
    return "This wallet needs enough mainnet SOL for registration, account rent, and network fees.";
  }
  if (/blockhash|expired|block height/i.test(message)) {
    return "The migration transaction expired before confirmation. Check Explorer before signing again.";
  }
  return message;
}

export function GnsMainnetMigrationBanner() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const { publicKey, sendTransaction } = useWallet();
  const { wallets: privySolanaWallets } = usePrivySolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const inFlightRef = useRef(false);
  const [migration, setMigration] = useState<MigrationPayload | null>(null);
  const [action, setAction] = useState<ActionState>({
    status: "idle",
    message: "",
    signature: null,
    config: null,
  });

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const loadMigration = useCallback(async () => {
    if (gnsIdentity.status !== "found" || !gnsIdentity.name) return;
    try {
      const response = await authenticatedFetch(
        `/api/gns/migration-status?name=${encodeURIComponent(gnsIdentity.name)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as MigrationPayload | null;
      if (!response.ok || !payload?.status) return;
      setMigration(payload);
    } catch {
      // Migration state is optional while GNS remains on devnet.
    }
  }, [authenticatedFetch, gnsIdentity.name, gnsIdentity.status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMigration(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMigration]);

  async function migrateToMainnet() {
    if (
      inFlightRef.current ||
      gnsIdentity.status !== "found" ||
      !gnsIdentity.name ||
      migration?.status !== "migration-eligible" ||
      migration.migrationEligible !== true
    ) {
      return;
    }

    inFlightRef.current = true;
    const name = gnsIdentity.name;
    let signature = "";
    let transactionFailed = false;

    try {
      setAction({
        status: "preparing",
        message: "Loading the audited GNS mainnet configuration…",
        signature: null,
        config: null,
      });
      const configResponse = await authenticatedFetch("/api/gns/register", {
        cache: "no-store",
      });
      const configPayload = (await configResponse.json().catch(() => null)) as unknown;
      if (!configResponse.ok || !isGnsRegistrationConfig(configPayload)) {
        throw new Error(
          "GWAP OS is not yet configured for the GNS mainnet cutover.",
        );
      }
      if (configPayload.network !== "mainnet-beta") {
        throw new Error(
          "Mainnet migration is staged, but production signing remains disabled until the network cutover.",
        );
      }

      const owner = new PublicKey(account.verifiedWallet);
      const connection = new Connection(getGnsRpcUrl(configPayload.network), "confirmed");
      const transaction = buildGnsRegistrationTransaction({
        config: configPayload,
        name,
        owner,
      });
      const blockhash = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash.blockhash;
      transaction.feePayer = owner;

      setAction({
        status: "signing",
        message: `Approve the ${configPayload.feeSol} SOL mainnet migration in your verified wallet.`,
        signature: null,
        config: configPayload,
      });

      if (publicKey?.equals(owner) && sendTransaction) {
        signature = await sendTransaction(transaction, connection, {
          preflightCommitment: "confirmed",
          skipPreflight: false,
        });
      } else {
        const privyWallet = privySolanaWallets.find(
          (wallet) => wallet.address === account.verifiedWallet,
        );
        if (!privyWallet) {
          throw new Error(
            "Reconnect the Solana wallet that authenticated this GWAP OS session before migrating.",
          );
        }
        const result = await signAndSendTransaction({
          transaction: transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          }),
          wallet: privyWallet,
          chain: getGnsPrivyChain(configPayload.network),
          options: { optimisticBroadcast: true, skipSimulation: false },
        });
        signature = encodeGnsSignature(result.signature);
      }

      pendingReceipt(configPayload, name, account.verifiedWallet, signature);
      setAction({
        status: "confirming",
        message: "Mainnet transaction submitted. Waiting for Solana confirmation…",
        signature,
        config: configPayload,
      });

      const confirmation = await connection.confirmTransaction(
        { signature, ...blockhash },
        "confirmed",
      );
      if (confirmation.value.err) {
        transactionFailed = true;
        throw new Error("The GNS program rejected this mainnet migration transaction.");
      }

      setAction({
        status: "syncing",
        message: "Mainnet confirmed. Reconciling the canonical .gwap record…",
        signature,
        config: configPayload,
      });
      const syncResponse = await authenticatedFetch("/api/gns/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, txSignature: signature }),
      });
      const syncPayload = (await syncResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!syncResponse.ok) {
        setAction({
          status: "submitted",
          message:
            syncPayload?.error ||
            "Mainnet is confirmed and the receipt is queued for automatic registry reconciliation. Do not sign again.",
          signature,
          config: configPayload,
        });
        return;
      }

      setAction({
        status: "success",
        message: `${name}.gwap is mainnet-active.`,
        signature,
        config: configPayload,
      });
      await loadMigration();
      router.refresh();
    } catch (error) {
      if (signature && !transactionFailed) {
        setAction((current) => ({
          ...current,
          status: "submitted",
          message:
            "The transaction was broadcast. Automatic reconciliation will continue in GWAP OS—do not sign a duplicate transaction.",
          signature,
        }));
      } else {
        setAction((current) => ({
          ...current,
          status: "error",
          message: migrationError(error),
        }));
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  if (
    gnsIdentity.status !== "found" ||
    !gnsIdentity.name ||
    !migration ||
    migration.status === "unsupported" ||
    migration.status === "development-active" ||
    migration.status === "mainnet-active" ||
    migration.status === "available"
  ) {
    return null;
  }

  const eligible =
    migration.status === "migration-eligible" && migration.migrationEligible === true;
  const busy = ["preparing", "signing", "confirming", "syncing"].includes(action.status);
  const explorerUrl =
    action.signature && action.config
      ? getGnsExplorerUrl(action.signature, action.config.network)
      : null;

  return (
    <section className="os-runtime-panel os-runtime-note" aria-live="polite">
      <span className="os-terminal-label">GNS MAINNET MIGRATION</span>
      <h2>{eligible ? `${migration.fullName || `${gnsIdentity.name}.gwap`} is migration-ready.` : "This .gwap name is reserved."}</h2>
      <p>
        {eligible
          ? "Your verified wallet matches the canonical devnet owner. The same .gwap identity can move to mainnet without surrendering its namespace, profile, Genesis position, or primary-name state."
          : "The canonical .gwap namespace is reserved for its existing owner during mainnet migration. GWAP OS will not allow a different wallet to claim it."}
      </p>

      {eligible ? (
        <div className="os-inline-actions">
          <button
            className="os-primary-action"
            type="button"
            disabled={busy || action.status === "submitted" || action.status === "success"}
            onClick={() => void migrateToMainnet()}
          >
            {action.status === "signing"
              ? "Waiting for wallet…"
              : action.status === "confirming"
                ? "Confirming mainnet…"
                : action.status === "syncing"
                  ? "Reconciling identity…"
                  : action.status === "success"
                    ? "Mainnet active"
                    : "Migrate .gwap to mainnet"}
          </button>
          <span className="os-terminal-label">SAME OWNER · SAME NAME · MAINNET PDA</span>
        </div>
      ) : null}

      {action.message ? (
        <p className={`os-registration-output state-${action.status}`}>
          <span>›</span> {action.message}
        </p>
      ) : null}

      {explorerUrl ? (
        <a className="os-gns-explorer" href={explorerUrl} target="_blank" rel="noreferrer">
          View mainnet transaction on Solana Explorer ↗
        </a>
      ) : null}
    </section>
  );
}
