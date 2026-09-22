import Link from "next/link";
import styles from "./vault-mode.module.css";

const actions = [
  {
    icon: "◇",
    title: "Create proof",
    detail: "Timestamp a content hash with your wallet authority.",
    state: "Foundation ready",
    className: styles.foundation,
  },
  {
    icon: "✎",
    title: "Create agreement",
    detail: "Create an exact-version bilateral agreement.",
    state: "Foundation ready",
    className: styles.foundation,
  },
  {
    icon: "$",
    title: "Create invoice",
    detail: "Invoice flows are intentionally outside the current PPV foundation.",
    state: "Roadmap",
    className: styles.roadmap,
  },
  {
    icon: "↔",
    title: "Start escrow",
    detail: "Custody remains disabled until later security and audit gates.",
    state: "Roadmap",
    className: styles.roadmap,
  },
] as const;

export default function VaultPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>PRIVATE PROOF VAULT</p>
        <h1>Protect the work. Bind the terms.</h1>
        <p>
          PPV is the GwapOS evidence and agreement layer. The current foundation is
          non-custodial: proofs and exact-version agreements exist at the protocol
          level, while invoices, token settlement, and escrow remain intentionally gated.
        </p>
        <div className={styles.heroMeta}>
          <span className={styles.chip}>Wallet-authorized</span>
          <span className={styles.chip}>Non-custodial</span>
          <span className={styles.chip}>Fail closed</span>
          <Link className={styles.chip} href="/app/vault/receipts">PPV receipts →</Link>
        </div>
      </section>

      <section className={styles.actions} aria-label="Vault actions">
        {actions.map((action) => (
          <article key={action.title} className={`${styles.action} ${action.className}`}>
            <span className={styles.actionIcon} aria-hidden="true">{action.icon}</span>
            <div className={styles.actionText}>
              <strong>{action.title}</strong>
              <small>{action.detail}</small>
            </div>
            <span className={styles.actionState}>{action.state}</span>
          </article>
        ))}
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2>Vault status</h2>
          <p>Current PPV foundation</p>
        </header>

        <div className={styles.grid}>
          <article className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <span>PROOFS</span>
                <h3>Evidence commitments</h3>
              </div>
              <span className={`${styles.status} ${styles.ready}`}>Protocol ready</span>
            </header>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowIcon}>◇</span>
                <div><strong>Wallet-authorized timestamp</strong><small>Commit a hash without putting private source bytes on-chain.</small></div>
                <span className={styles.rowState}>Ready</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowIcon}>↺</span>
                <div><strong>Permanent revocation marker</strong><small>Revocation adds history instead of erasing evidence.</small></div>
                <span className={styles.rowState}>Ready</span>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <span>AGREEMENTS</span>
                <h3>Exact-version terms</h3>
              </div>
              <span className={`${styles.status} ${styles.ready}`}>Protocol ready</span>
            </header>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowIcon}>✎</span>
                <div><strong>Create + revise</strong><small>Every revision targets the version it replaces and clears prior signatures.</small></div>
                <span className={styles.rowState}>Ready</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowIcon}>✓</span>
                <div><strong>Sign + execute</strong><small>Signatures bind to the exact version and content hash shown to the wallet.</small></div>
                <span className={styles.rowState}>Ready</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <aside className={styles.notice}>
        <strong>The native PPV workspace now owns deployment readiness.</strong>
        <p>
          Canonical program IDs are established, but public devnet is not yet compatible with
          the full workspace: Commerce is absent at its configured ID and Escrow still reflects
          the older pre-RR13-001 deployment. Writes fail closed until exact artifact evidence
          passes. <Link href="/app/ppv">Open PPV workspace →</Link>
        </p>
      </aside>
    </div>
  );
}
