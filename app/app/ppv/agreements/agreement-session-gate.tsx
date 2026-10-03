"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWallets as usePrivySolanaWallets } from "@privy-io/react-auth/solana";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useGwapOs } from "../../components/os-provider";
import styles from "./agreement-workspace.module.css";

function shortWallet(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

export function PpvAgreementSessionGate({ children }: { children: ReactNode }) {
  const { authenticated, ready } = usePrivy();
  const { account } = useGwapOs();
  const { wallets } = usePrivySolanaWallets();

  const activeWallet = useMemo(
    () => wallets.find((candidate) => candidate.address === account.verifiedWallet),
    [account.verifiedWallet, wallets],
  );

  const status = !ready
    ? {
        ready: false,
        label: "CHECKING SESSION",
        title: "Confirming your GWAP session…",
        detail: "Agreement actions stay locked until Privy finishes restoring the authenticated signer.",
      }
    : !authenticated
      ? {
          ready: false,
          label: "SESSION EXPIRED",
          title: "Your GWAP session is no longer authenticated.",
          detail: "Sign in again before creating, revising, approving, or declining an agreement. No PPV transaction was submitted.",
        }
      : !account.verifiedWallet
        ? {
            ready: false,
            label: "WALLET PENDING",
            title: "GWAP is still attaching your verified Solana wallet.",
            detail: "Keep this page open. Agreement actions will unlock after the authenticated wallet identity is available.",
          }
        : !activeWallet
          ? {
              ready: false,
              label: "WALLET SWITCHING",
              title: "The authenticated signer changed or the wallet is still reconnecting.",
              detail: `GWAP expects ${shortWallet(account.verifiedWallet)}. Reconnect that wallet or finish the account switch before continuing.`,
            }
          : {
              ready: true,
              label: "SESSION READY",
              title: `Signer ${shortWallet(account.verifiedWallet)} is active.`,
              detail: "This workspace is now bound to the authenticated signer. Solana Devnet confirmation is handled inside the agreement workspace before any wallet request opens.",
            };

  return (
    <>
      <section className={styles.networkBar} aria-live="polite">
        <div>
          <strong>{status.title}</strong>
          <span>{status.detail}</span>
        </div>
        <span className={status.ready ? styles.ready : styles.gated}>
          {status.label}
        </span>
        {!ready || authenticated ? null : (
          <Link
            className={styles.textButton}
            href="/os-sign-in?redirect_url=%2Fapp%2Fppv%2Fagreements"
          >
            Sign in again
          </Link>
        )}
      </section>

      {status.ready ? <div key={account.verifiedWallet}>{children}</div> : null}
    </>
  );
}
