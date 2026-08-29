"use client";

import Link from "next/link";
import { GwapScoreDisplay } from "../../components/gwap-score-display";
import type { GwapScoreResult } from "../../lib/gwap-score";
import { useGwapOs } from "./os-provider";
import { SocialSnapshotPanel } from "./social-snapshot-panel";
import { SocialVerificationPanel } from "./social-verification-panel";

export function ScoreView() {
  const { account, gnsIdentity } = useGwapOs();
  const hasScore = gnsIdentity.scoreStatus === "scored" && gnsIdentity.score !== null;
  const clamped = hasScore ? Math.max(300, Math.min(900, gnsIdentity.score ?? 300)) : 300;
  const progress = ((clamped - 300) / 600) * 100;
  const score: GwapScoreResult = {
    status: gnsIdentity.scoreStatus,
    score: gnsIdentity.score,
    tier: gnsIdentity.scoreTier,
    message: gnsIdentity.scoreMessage,
  };

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/score</span>
        <h1>Build reputation people can verify.</h1>
        <p>
          GwapScore combines reputation signals with explicit proof of account control. Social verification strengthens provenance; it does not silently rewrite the current score model.
        </p>
      </header>

      <section className="os-runtime-grid">
        <article className="os-runtime-panel os-score-console">
          <div className="os-console-chrome"><span>gwapscore.read</span><span>{hasScore ? "LIVE" : "NO SIGNAL"}</span></div>
          <GwapScoreDisplay result={score} variant="hero" />
          <div className="os-score-track" aria-label={hasScore ? `GwapScore ${gnsIdentity.score} out of 900` : "GwapScore unavailable"}><i style={{ width: hasScore ? `${progress}%` : "0%" }} /></div>
          <div className="os-score-range"><span>300</span><span>900</span></div>
          <dl>
            <div><dt>Wallet</dt><dd>{account.verifiedWallet}</dd></div>
            <div><dt>Identity</dt><dd>{gnsIdentity.fullName || "No .gwap detected"}</dd></div>
            <div><dt>Verification</dt><dd>{gnsIdentity.verified ? "VERIFIED" : "UNVERIFIED"}</dd></div>
          </dl>
        </article>
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">SOURCE STATUS</span>
          <h2>{hasScore ? "Canonical wallet score." : gnsIdentity.scoreStatus === "unscored" ? "Wallet is unscored." : "Score service unavailable."}</h2>
          <p>{gnsIdentity.scoreMessage} Identity resolution, social Proof-of-Control, and scoring remain separate provenance layers, so one service cannot manufacture another signal.</p>
          <div className="os-inline-actions">
            <Link href="/app/trust">Open Trust Graph →</Link>
            <Link href="/app/trust/relationships">View relationships →</Link>
          </div>
        </aside>
      </section>

      <SocialVerificationPanel />
      <SocialSnapshotPanel />
    </div>
  );
}
