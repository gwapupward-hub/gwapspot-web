import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PpvReceiptActions } from "../../../../components/ppv/ppv-receipt-actions";
import { PpvReceiptCard } from "../../../../components/ppv/ppv-receipt-card";
import "../../../../components/ppv/ppv.css";
import { getAuthenticatedWalletIdentity } from "../../../../lib/privy-server";
import { getProjection, isPpvReputationConfigured } from "../../../../lib/ppv-reputation-server";
import styles from "../../vault-mode.module.css";

export const dynamic = "force-dynamic";

const RECEIPT_ID = /^rcpt_[0-9a-f]{40}$/;

export default async function VaultReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const identity = await getAuthenticatedWalletIdentity();
  const { receiptId } = await params;
  if (!identity) redirect(`/sign-in?redirect_url=/app/vault/receipts/${receiptId}`);
  if (!RECEIPT_ID.test(receiptId) || !isPpvReputationConfigured()) notFound();

  let receipt = null;
  try {
    receipt = await getProjection().getReceipt(receiptId);
  } catch {
    receipt = null;
  }
  if (!receipt) notFound();

  const isHolder = receipt.holderWallet === identity.verifiedWallet;

  return (
    <div className={styles.page}>
      <p style={{ margin: "0 0 12px", fontSize: 10 }}>
        <Link href="/app/vault/receipts" style={{ color: "#13dd13" }}>← Your receipts</Link>
      </p>
      <PpvReceiptCard receipt={receipt} actions={<PpvReceiptActions receipt={receipt} canMint={isHolder} />} />
      {!isHolder ? (
        <aside className={styles.notice} style={{ marginTop: 12 }}>
          <strong>You are viewing another participant&apos;s receipt.</strong>
          <p>Only the holder wallet can request a credential for it.</p>
        </aside>
      ) : null}
    </div>
  );
}
