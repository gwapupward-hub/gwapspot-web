import Link from "next/link";
import styles from "./resilience.module.css";

export default function GwapOsNotFound() {
  return (
    <div className={styles.statePage}>
      <section className={styles.stateCard}>
        <p className={styles.kicker}>GWAP OS / ROUTE</p>
        <h1 className={styles.title}>That workspace surface is not available.</h1>
        <p className={styles.copy}>
          The route may have moved, been gated, or not be part of the current Wallet Mode release.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/app">
            Return home
          </Link>
          <Link className={styles.secondary} href="/app/apps">
            Open Apps
          </Link>
        </div>
      </section>
    </div>
  );
}
