import styles from "./ppv.module.css";

export default function PpvLoading() {
  return (
    <div className={styles.page} aria-busy="true">
      <section className={styles.loading}>
        <span />
        <div>
          <strong>Checking PPV readiness</strong>
          <p>Verifying the dedicated network and deployment state.</p>
        </div>
      </section>
    </div>
  );
}
