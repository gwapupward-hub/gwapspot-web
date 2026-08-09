"use client";

import Link from "next/link";
import { useGwapOs } from "./os-provider";

export function ScoreView() {
  const { account, gnsIdentity } = useGwapOs();
  const hasScore = gnsIdentity.score !== null;
  const clamped = hasScore ? Math.max(300, Math.min(900, gnsIdentity.score ?? 300)) : 300;
  const progress = ((clamped - 300) / 600) * 100;

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading"><span className="os-terminal-label">~/score</span><h1>Reputation signal.</h1><p>GWAP OS displays the canonical 300–900 GwapScore returned with your GNS profile. Tier labels come from the scoring service; this UI does not invent thresholds.</p></header>
      <section className="os-runtime-grid">
        <article className="os-runtime-panel os-score-console">
          <div className="os-console-chrome"><span>gwapscore.read</span><span>{hasScore ? "LIVE" : "NO SIGNAL"}</span></div>
          <div className="os-score-number"><small>PROTOCOL SCORE</small><strong>{gnsIdentity.score ?? "—"}</strong><span>{gnsIdentity.scoreTier || "tier unavailable"}</span></div>
          <div className="os-score-track" aria-label={hasScore ? `GwapScore ${gnsIdentity.score} out of 900` : "GwapScore unavailable"}><i style={{ width: hasScore ? `${progress}%` : "0%" }} /></div>
          <div className="os-score-range"><span>300</span><span>900</span></div>
          <dl><div><dt>Wallet</dt><dd>{account.verifiedWallet}</dd></div><div><dt>Identity</dt><dd>{gnsIdentity.fullName || "No .gwap detected"}</dd></div><div><dt>Verification</dt><dd>{gnsIdentity.verified ? "VERIFIED" : "UNVERIFIED"}</dd></div></dl>
        </article>
        <aside className="os-runtime-panel os-runtime-note"><span className="os-terminal-label">SOURCE STATUS</span><h2>{gnsIdentity.status === "found" ? "Identity-linked score." : "Score lookup unavailable."}</h2><p>{gnsIdentity.status === "found" ? "The score displayed here is read from the current GNS public profile response and remains read-only inside this first OS runtime." : "Initialize a GNS identity or retry when the registry is healthy to surface the wallet score."}</p><Link href="/app/identity">Open Identity</Link></aside>
      </section>
    </div>
  );
}
