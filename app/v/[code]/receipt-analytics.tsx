"use client";

import { useEffect, type ReactNode } from "react";

type Props = { code: string; theme: string };

function track(event: string, code: string, theme: string) {
  void fetch("/api/public-proof/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, challengeCode: code, theme }),
    keepalive: true,
  }).catch(() => undefined);
}

export function ReceiptAnalytics({ code, theme }: Props) {
  useEffect(() => { track("receipt_viewed", code, theme); }, [code, theme]);
  return null;
}

export function ReceiptCta({ code, theme, href, children, primary = false, accent }: Props & { href: string; children: ReactNode; primary?: boolean; accent: string }) {
  return (
    <a href={href} onClick={() => track("receipt_cta_clicked", code, theme)} style={primary
      ? { background: accent, color: "#050505", padding: "13px 18px", borderRadius: 12, fontWeight: 800, textDecoration: "none" }
      : { border: "1px solid rgba(255,255,255,.18)", padding: "13px 18px", borderRadius: 12, fontWeight: 800, textDecoration: "none", color: "inherit" }}>
      {children}
    </a>
  );
}
