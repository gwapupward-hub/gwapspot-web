import type { Metadata } from "next";
import { GwapBrowserDetailView } from "../../components/gwap-browser-detail-view";
import { gwapBrowserFlags } from "../../../lib/gwap-browser-server";
import "../../gwap-browser.css";

export const metadata: Metadata = {
  title: "Gwap Browser — GWAP OS",
  description: "Resolve an exact .gwap address to a verified GNS profile or a published project.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GwapBrowserAddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const { enabled } = gwapBrowserFlags();
  let decoded = address;
  try {
    decoded = decodeURIComponent(address);
  } catch {
    decoded = address;
  }
  return <GwapBrowserDetailView address={decoded.slice(0, 160)} enabled={enabled} />;
}
