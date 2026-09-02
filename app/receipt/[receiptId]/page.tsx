import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PpvReceiptActions } from "../../components/ppv/ppv-receipt-actions";
import { PpvReceiptCard } from "../../components/ppv/ppv-receipt-card";
import "../../components/ppv/ppv.css";
import { getProjection, isPpvReputationConfigured } from "../../lib/ppv-reputation-server";

export const dynamic = "force-dynamic";

const RECEIPT_ID = /^rcpt_[0-9a-f]{40}$/;

export const metadata: Metadata = {
  title: "PPV Receipt",
  description: "A participant receipt for a verifiable PPV protocol record.",
  robots: { index: false, follow: false },
};

/**
 * Public receipt page. Anyone with the link can verify the record; only
 * facts already visible on chain plus the GNS snapshot are shown. Minting is
 * never offered here because there is no authenticated holder.
 */
export default async function PublicReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  if (!RECEIPT_ID.test(receiptId) || !isPpvReputationConfigured()) notFound();

  let receipt = null;
  try {
    receipt = await getProjection().getReceipt(receiptId);
  } catch {
    receipt = null;
  }
  if (!receipt) notFound();

  return (
    <main style={{ width: "min(100%, 880px)", margin: "0 auto", padding: "32px 16px 64px" }}>
      <p style={{ margin: "0 0 14px", fontSize: 10 }}>
        <Link href="/" style={{ color: "#13dd13" }}>GWAP</Link> · Private Proof Vault receipt
      </p>
      <PpvReceiptCard receipt={receipt} actions={<PpvReceiptActions receipt={receipt} canMint={false} />} />
    </main>
  );
}
