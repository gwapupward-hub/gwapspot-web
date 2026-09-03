import styles from "./resilience.module.css";

export default function GwapOsLoading() {
  return (
    <div className={styles.statePage} role="status" aria-live="polite" aria-busy="true">
      <section className={styles.stateCard}>
        <img
          className="gwapos-loading-mark"
          src="/gwapos/icons/v1/gwapos-icon-transparent-256.png"
          alt=""
          aria-hidden="true"
          width={96}
          height={96}
        />
        <p className={styles.kicker}>GWAP OS</p>
        <h1 className={styles.title}>Loading your workspace…</h1>
        <p className={styles.copy}>
          Keeping the wallet shell stable while this GwapOS surface finishes loading.
        </p>
        <div className={styles.skeleton} aria-hidden="true">
          <div className={`${styles.line} ${styles.lineShort}`} />
          <div className={styles.block} />
          <div className={styles.block} />
          <div className={styles.line} />
        </div>
      </section>
    </div>
  );
}
