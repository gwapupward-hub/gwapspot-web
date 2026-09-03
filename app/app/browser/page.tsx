import type { Metadata } from "next";
import { Suspense } from "react";
import { GwapBrowserView } from "../components/gwap-browser-view";
import { gwapBrowserFlags } from "../../lib/gwap-browser-server";
import "../gwap-browser.css";

export const metadata: Metadata = {
  title: "Gwap Browser — GWAP OS",
  description: "Discover and open projects built with GWAP by exact .gwap address or keyword.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function BrowserFallback() {
  return (
    <div className="os-page os-runtime-page gwb-page">
      <section className="gwb-state gwb-glass" aria-busy="true">
        <span className="os-terminal-label">GWAP BROWSER</span>
        <h2>Loading Gwap Browser…</h2>
      </section>
    </div>
  );
}

export default function GwapBrowserPage() {
  const { enabled } = gwapBrowserFlags();
  return (
    <Suspense fallback={<BrowserFallback />}>
      <GwapBrowserView enabled={enabled} />
    </Suspense>
  );
}
