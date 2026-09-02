import Link from "next/link";
import { redirect } from "next/navigation";
import { EVENT_TYPE_LABELS, ROLE_LABELS, SEAL_STATE_LABELS, SOURCE_PRODUCT_LABELS, formatCompletedAt } from "../../../components/ppv/ppv-labels";
import "../../../components/ppv/ppv.css";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { getProjection, isPpvReputationConfigured } from "../../../lib/ppv-reputation-server";
import styles from "../vault-mode.module.css";

export const dynamic = "force-dynamic";

export default async function VaultReceiptsPage() {
  const identity = await getAuthenticatedWalletIdentity();
  if (!identity) redirect("/sign-in?redirect_url=/app/vault/receipts");

  const configured = isPpvReputationConfigured();
  let receipts: Awaited<ReturnType<ReturnType<typeof getProjection>["listWalletReceipts"]>> = [];
  let unavailable = false;
  if (configured) {
    try {
      receipts = await getProjection().listWalletReceipts(identity.verifiedWallet);
    } catch {
      unavailable = true;
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>PPV RECEIPTS</p>
        <h1>Your participant receipts.</h1>
        <p>
          One receipt per role you held in a PPV-recorded event. Each one is a deterministic view of an immutable protocol record; the wallet that held it is the authority, and the .gwap name shown is the one you held at the time.
        </p>
        <div className={styles.heroMeta}>
          <span className={styles.chip}>{identity.verifiedWallet.slice(0, 6)}…{identity.verifiedWallet.slice(-4)}</span>
          <span className={styles.chip}>{receipts.length} receipt{receipts.length === 1 ? "" : "s"}</span>
          <Link className={styles.chip} href="/app/vault">← Vault</Link>
        </div>
      </section>

      <section className={styles.section}>
        {!configured ? (
          <aside className={styles.notice}><strong>PPV receipts are not connected on this deployment.</strong><p>Set the PPV program ids to enable the indexer.</p></aside>
        ) : unavailable ? (
          <aside className={styles.notice}><strong>Receipts are temporarily unavailable.</strong><p>The projection store could not be reached. Chain state is unaffected.</p></aside>
        ) : receipts.length ? (
          <div className="ppv-receipt-list">
            {receipts.map((receipt) => (
              <Link key={receipt.receiptId} href={`/app/vault/receipts/${receipt.receiptId}`}>
                <span>
                  <strong>{EVENT_TYPE_LABELS[receipt.eventType]} · {ROLE_LABELS[receipt.role]}</strong>
                  <small>{receipt.sourceProduct ? SOURCE_PRODUCT_LABELS[receipt.sourceProduct] : "PPV"} · {formatCompletedAt(receipt.completedAt)}</small>
                </span>
                <span className="ppv-state" data-state={receipt.sealState}>{SEAL_STATE_LABELS[receipt.sealState]}</span>
              </Link>
            ))}
          </div>
        ) : (
          <aside className={styles.notice}><strong>No receipts yet.</strong><p>Receipts appear when a PPV proof or agreement involving this wallet is indexed.</p></aside>
        )}
      </section>
    </div>
  );
}
