import { redirect } from "next/navigation";

export default async function PpvReceiptAliasPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  redirect(`/app/vault/receipts/${encodeURIComponent(receiptId)}`);
}
