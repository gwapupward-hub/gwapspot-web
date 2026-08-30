"use client";

import Link from "next/link";
import styles from "./resilience.module.css";

export default function GwapOsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.statePage}>
      <section className={styles.stateCard} role="alert">
        <p className={styles.kicker}>GWAP OS / RECOVERY</p>
        <h1 className={styles.title}>This surface hit a temporary problem.</h1>
        <p className={styles.copy}>
          Your authenticated wallet session stays intact. Retry this GwapOS surface or return home without signing in again.
        </p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={reset}>
            Try again
          </button>
          <Link className={styles.secondary} href="/app">
            Return home
          </Link>
        </div>
        {error.digest ? <p className={styles.detail}>Recovery reference: {error.digest}</p> : null}
      </section>
    </div>
  );
}
