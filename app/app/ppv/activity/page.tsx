import Link from "next/link";
import { getPpvWorkspaceReadiness } from "../../../lib/ppv/readiness.server";
import styles from "../ppv.module.css";

export const dynamic = "force-dynamic";

export default async function PpvActivityPage() {
  const readiness = await getPpvWorkspaceReadiness();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>PPV ACTIVITY · DEVNET</p>
          <h1>Evidence before labels.</h1>
          <p className={styles.lede}>
            Existing PPV receipts and normalized activity remain the canonical history surface.
            Finalized and pending evidence must stay distinct.
          </p>
        </div>
        <div className={styles.network}>
          <span>CHAIN STATUS</span>
          <strong>{readiness.errorCode ?? "Readiness checked"}</strong>
          <small>Failed or confirmed-only transactions cannot receive a finalized PPV seal.</small>
        </div>
      </section>

      <nav className={styles.nav} aria-label="PPV workspace">
        <Link href="/app/ppv">Overview</Link>
        <Link href="/app/ppv/proofs">Proofs</Link>
        <Link href="/app/ppv/agreements">Agreements</Link>
        <Link href="/app/ppv/escrow">Escrow</Link>
        <Link href="/app/ppv/activity">Activity</Link>
        <Link href="/app/vault/receipts">Receipts</Link>
      </nav>

      <section className={styles.work}>
        <div>
          <p className={styles.sectionKicker}>CANONICAL HISTORY</p>
          <h2>Reuse the receipt pipeline, don’t fork it.</h2>
          <p>
            Chain-derived receipts, GNS snapshots and reputation projections already exist in
            GwapOS. This workspace routes back to those canonical records while the next integration
            slice upgrades their finality boundary.
          </p>
        </div>
        <div className={styles.actionGrid}>
          <Link href="/app/vault/receipts"><strong>Open receipts</strong><span>Canonical PPV receipt list</span></Link>
          <Link href="/app/ppv"><strong>Network status</strong><span>Deployment and capability truth</span></Link>
        </div>
      </section>
    </div>
  );
}
