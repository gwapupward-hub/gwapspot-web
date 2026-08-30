"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGwapOs } from "../components/os-provider";
import styles from "./receive-mode.module.css";

export default function ReceivePage() {
  const { account, gnsIdentity } = useGwapOs();
  const [status, setStatus] = useState("");

  const identity = useMemo(
    () => gnsIdentity.fullName || "Wallet only",
    [gnsIdentity.fullName],
  );

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied`);
    } catch {
      setStatus(`Could not copy ${label.toLowerCase()}`);
    }
  }

  async function share() {
    const text = gnsIdentity.fullName
      ? `Send to ${gnsIdentity.fullName}\n${account.verifiedWallet}`
      : `Send to my Solana wallet\n${account.verifiedWallet}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "GWAP OS receive", text });
        setStatus("Receive details shared");
        return;
      } catch {
        return;
      }
    }

    await copy(text, "Receive details");
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Receive</p>
        <h1>Receive to your verified wallet.</h1>
        <p>
          Share your canonical Solana address or your connected .gwap identity. GwapOS does not
          custody funds or create a transaction for this action.
        </p>

        <div className={styles.identity}>
          <small>Primary identity</small>
          <strong>{identity}</strong>
        </div>
      </section>

      <section className={styles.grid} aria-label="Receive details">
        <article className={styles.card}>
          {gnsIdentity.fullName ? (
            <div className={styles.row}>
              <div>
                <small>.gwap identity</small>
                <div className={styles.value}>{gnsIdentity.fullName}</div>
              </div>
              <button
                className={styles.button}
                type="button"
                onClick={() => void copy(gnsIdentity.fullName!, ".gwap")}
              >
                Copy
              </button>
            </div>
          ) : null}

          <div className={styles.row}>
            <div>
              <small>Verified Solana wallet</small>
              <div className={styles.value}>{account.verifiedWallet}</div>
            </div>
            <button
              className={styles.button}
              type="button"
              onClick={() => void copy(account.verifiedWallet, "Wallet address")}
            >
              Copy
            </button>
          </div>

          <div className={styles.row}>
            <div>
              <small>Share receive details</small>
              <div className={styles.value}>Use your device share sheet when available.</div>
            </div>
            <button
              className={`${styles.button} ${styles.buttonPrimary}`}
              type="button"
              onClick={() => void share()}
            >
              Share
            </button>
          </div>

          <div className={styles.status} role="status" aria-live="polite">{status}</div>
        </article>
      </section>

      <p className={styles.notice}>
        Verify the address before receiving assets. Only send Solana-compatible assets to this
        Solana wallet. <Link href="/app/identity">Review identity →</Link>
      </p>
    </div>
  );
}
