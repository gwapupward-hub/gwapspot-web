"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GwapScoreDisplay } from "../../components/gwap-score-display";
import type { GwapScoreResult } from "../../lib/gwap-score";
import type { EcosystemProduct } from "../../lib/ecosystem";
import { useGwapOs } from "./os-provider";

const coreApps = [
  { href: "/app/marketplace", label: "Marketplace", command: "~/marketplace/browse", icon: "▤", note: "Deals, escrow, disputes" },
  { href: "/app/identity", label: "Identity / GNS", command: "~/identity", icon: "◎", note: ".gwap identity and profile" },
  { href: "/app/vault", label: "Private Proof Vault", command: "~/vault", icon: "◇", note: "Selective proof workspace" },
  { href: "/app/score", label: "GwapScore", command: "~/score", icon: "↗", note: "300–900 reputation signal" },
] as const;

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 5)}…${wallet.slice(-5)}`;
}

export function DashboardView({ products }: { products: EcosystemProduct[] }) {
  const { account, gnsIdentity, state, syncStatus } = useGwapOs();
  const liveProducts = products.filter((product) => product.status === "Live").length;
  const recentNames = useMemo(() => {
    return state.recent
      .map((item) => products.find((product) => product.slug === item.slug)?.name)
      .filter((value): value is string => Boolean(value))
      .slice(0, 3);
  }, [products, state.recent]);

  const identityTitle = gnsIdentity.fullName || (gnsIdentity.status === "none" ? "UNINITIALIZED" : shortWallet(account.verifiedWallet));
  const identityStatus = gnsIdentity.status === "found" ? "IDENTITY VERIFIED" : gnsIdentity.status === "none" ? "SYSTEM INITIALIZATION REQUIRED" : "LIMITED MODE";
  const score: GwapScoreResult = {
    status: gnsIdentity.scoreStatus,
    score: gnsIdentity.score,
    tier: gnsIdentity.scoreTier,
    message: gnsIdentity.scoreMessage,
  };

  const logs = [
    `[auth] wallet verified: ${shortWallet(account.verifiedWallet)}`,
    gnsIdentity.status === "found"
      ? `[gns] reverse-resolve: ${gnsIdentity.fullName ?? gnsIdentity.name}`
      : gnsIdentity.status === "none"
        ? "[gns] no .gwap identity detected"
        : "[gns] registry lookup timed out; entry not blocked",
    gnsIdentity.scoreStatus !== "scored"
      ? `[score] ${gnsIdentity.scoreMessage}`
      : `[score] protocol score: ${gnsIdentity.score}${gnsIdentity.scoreTier ? ` (${gnsIdentity.scoreTier})` : ""}`,
    `[sync] workspace: ${syncStatus}`,
    `[apps] ${liveProducts} ecosystem products currently live`,
    ...(recentNames.length ? [`[recent] ${recentNames.join(" · ")}`] : []),
  ];

  return (
    <div className="os-page os-home-v2">
      <section className="os-v2-hero">
        <div>
          <span className="os-terminal-label">GWAP://SECURE_WORKSPACE</span>
          <h1>Welcome to your <span>Gwap OS.</span></h1>
          <p>Identity, reputation, commerce, and proofs share one wallet-native runtime.</p>
        </div>
        <div className={`os-runtime-badge state-${gnsIdentity.status}`}>
          <i />
          <span><small>RUNTIME</small><strong>{gnsIdentity.status === "unavailable" ? "LIMITED" : "ONLINE"}</strong></span>
        </div>
      </section>

      <section className="os-v2-layout">
        <article className="os-identity-console">
          <div className="os-console-chrome"><span>~/identity/current</span><span>{identityStatus}</span></div>
          <div className="os-identity-body">
            <div className="os-v2-avatar" aria-hidden="true">{(gnsIdentity.name || account.displayName || "G").slice(0, 1).toUpperCase()}</div>
            <div className="os-identity-copy">
              <span className="os-terminal-label">CONNECTED IDENTITY</span>
              <h2>{identityTitle}</h2>
              <p>{gnsIdentity.bio || state.profile.bio || "No public bio has been published for this identity yet."}</p>
              <div className="os-identity-meta">
                <span><small>WALLET</small><strong>{shortWallet(account.verifiedWallet)}</strong></span>
                <GwapScoreDisplay result={score} />
                <span><small>SYNC</small><strong>{syncStatus.toUpperCase()}</strong></span>
              </div>
              <div className="os-inline-actions">
                {gnsIdentity.status === "found" && gnsIdentity.profileUrl ? <a href={gnsIdentity.profileUrl} target="_blank" rel="noreferrer">Public profile ↗</a> : <Link href="/app/identity">Initialize identity →</Link>}
                <Link href="/app/score">Inspect score</Link>
              </div>
            </div>
          </div>
        </article>

        <aside className="os-system-log" aria-label="System activity log">
          <div className="os-console-chrome"><span>~/var/log/gwap</span><span>LIVE</span></div>
          <div className="os-log-lines">
            {logs.map((line, index) => <p key={`${line}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{line}</p>)}
          </div>
        </aside>
      </section>

      <section className="os-app-launcher">
        <div className="os-section-heading-v2"><span className="os-terminal-label">APPLICATIONS</span><p>Select a process to open inside the workspace.</p></div>
        <div className="os-process-grid">
          {coreApps.map((app) => (
            <Link href={app.href} key={app.href} className="os-process-tile">
              <span className="os-process-icon" aria-hidden="true">{app.icon}</span>
              <span><strong>{app.label}</strong><small>{app.command}</small><em>{app.note}</em></span>
              <i aria-hidden="true">→</i>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
