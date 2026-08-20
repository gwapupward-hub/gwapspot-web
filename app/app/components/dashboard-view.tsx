"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GwapScoreDisplay } from "../../components/gwap-score-display";
import type { GwapScoreResult } from "../../lib/gwap-score";
import type { EcosystemProduct } from "../../lib/ecosystem";
import { getProfileCompletion } from "../lib/os-state";
import { useGwapOs } from "./os-provider";
import { WalletPortfolioCard } from "./wallet-portfolio-card";

const outcomeActions = [
  {
    href: "/app/score",
    label: "Build my reputation",
    product: "GwapScore",
    icon: "↗",
    note: "Understand your trust signal and what can strengthen it.",
  },
  {
    href: "/app/identity",
    label: "Verify my identity",
    product: "GNS",
    icon: "◎",
    note: "Claim or strengthen the digital identity attached to your wallet.",
  },
  {
    href: "/app/ideas",
    label: "Find an opportunity",
    product: "Daily Ideas",
    icon: "✦",
    note: "Discover, save, develop, validate, and build something useful.",
  },
  {
    href: "/app/marketplace",
    label: "Turn trust into work",
    product: "Marketplace",
    icon: "▤",
    note: "Use reputation and verified identity in real economic activity.",
  },
  {
    href: "/app/vault",
    label: "Prove something privately",
    product: "Private Proof Vault",
    icon: "◇",
    note: "Prepare selective proof and credential workflows without oversharing.",
  },
  {
    href: "/app/developer",
    label: "Integrate GWAP",
    product: "Developer API",
    icon: "{}",
    note: "Bring GWAP identity, intelligence, and trust signals into another product.",
  },
] as const;

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 5)}…${wallet.slice(-5)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function DashboardView({ products }: { products: EcosystemProduct[] }) {
  const { account, gnsIdentity, state, syncStatus } = useGwapOs();
  const liveProducts = products.filter((product) => product.status === "Live").length;
  const profileCompletion = getProfileCompletion(state.profile);

  const recentNames = useMemo(() => {
    return state.recent
      .map((item) => products.find((product) => product.slug === item.slug)?.name)
      .filter((value): value is string => Boolean(value))
      .slice(0, 3);
  }, [products, state.recent]);

  const identityTitle =
    gnsIdentity.fullName ||
    (gnsIdentity.status === "none"
      ? "Identity not initialized"
      : shortWallet(account.verifiedWallet));

  const score: GwapScoreResult = {
    status: gnsIdentity.scoreStatus,
    score: gnsIdentity.score,
    tier: gnsIdentity.scoreTier,
    message: gnsIdentity.scoreMessage,
  };

  const identityStrength = clamp(
    25 +
      (gnsIdentity.status === "found" ? 30 : 0) +
      Math.round((profileCompletion / 100) * 25) +
      (gnsIdentity.scoreStatus === "scored" ? 20 : 0),
    0,
    100,
  );

  const nextAction = useMemo(() => {
    if (gnsIdentity.status === "none") {
      return {
        href: "/app/identity",
        title: "Claim your digital identity",
        detail: "Attach a .gwap identity to your verified wallet so the rest of GWAP OS has a human-readable trust anchor.",
        label: "Initialize identity",
      };
    }
    if (profileCompletion < 67) {
      return {
        href: "/app/profile",
        title: "Complete your public profile",
        detail: "A stronger profile gives clients, collaborators, and counterparties more context before they decide to trust you.",
        label: "Strengthen profile",
      };
    }
    if (gnsIdentity.scoreStatus !== "scored") {
      return {
        href: "/app/score",
        title: "Understand your reputation",
        detail: "Inspect the trust signals available to GWAP and see what is still missing before reputation can become more useful.",
        label: "Open reputation",
      };
    }
    if (state.ideaProjects.length === 0) {
      return {
        href: "/app/ideas",
        title: "Turn trust into momentum",
        detail: "Your identity foundation is taking shape. Use Daily Ideas to discover an opportunity and move it toward execution.",
        label: "Discover opportunities",
      };
    }
    return {
      href: "/app/marketplace",
      title: "Put your credibility to work",
      detail: "Use your identity, reputation, and active projects to participate in economic activity across the GWAP ecosystem.",
      label: "Explore Marketplace",
    };
  }, [gnsIdentity.scoreStatus, gnsIdentity.status, profileCompletion, state.ideaProjects.length]);

  const logs = [
    `[identity] wallet verified: ${shortWallet(account.verifiedWallet)}`,
    gnsIdentity.status === "found"
      ? `[identity] .gwap resolved: ${gnsIdentity.fullName ?? gnsIdentity.name}`
      : gnsIdentity.status === "none"
        ? "[identity] .gwap identity not yet claimed"
        : "[identity] registry temporarily unavailable",
    `[trust] identity strength: ${identityStrength}%`,
    gnsIdentity.scoreStatus === "scored"
      ? `[trust] reputation signal: ${gnsIdentity.score}${gnsIdentity.scoreTier ? ` (${gnsIdentity.scoreTier})` : ""}`
      : `[trust] ${gnsIdentity.scoreMessage}`,
    `[wallet] portfolio source: Solana mainnet-beta`,
    `[sync] workspace: ${syncStatus}`,
    `[ecosystem] ${liveProducts} products currently live`,
    ...(recentNames.length ? [`[recent] ${recentNames.join(" · ")}`] : []),
  ];

  return (
    <div className="os-page os-home-v2">
      <section className="os-v2-hero">
        <div>
          <span className="os-terminal-label">GWAP://TRUST_OPERATING_LAYER</span>
          <h1>Turn your identity into <span>leverage.</span></h1>
          <p>Build credibility, understand what you own, prove what matters, discover opportunities, and put your reputation to work.</p>
        </div>
        <div className={`os-runtime-badge state-${gnsIdentity.status}`}>
          <i />
          <span>
            <small>IDENTITY STRENGTH</small>
            <strong>{identityStrength}%</strong>
          </span>
        </div>
      </section>

      <section className="os-v2-layout">
        <article className="os-identity-console">
          <div className="os-console-chrome"><span>WHO AM I?</span><span>{gnsIdentity.status === "found" ? "VERIFIED IDENTITY" : "IDENTITY SETUP"}</span></div>
          <div className="os-identity-body">
            <div className="os-v2-avatar" aria-hidden="true">{(gnsIdentity.name || account.displayName || "G").slice(0, 1).toUpperCase()}</div>
            <div className="os-identity-copy">
              <span className="os-terminal-label">YOUR GWAP IDENTITY</span>
              <h2>{identityTitle}</h2>
              <p>{gnsIdentity.bio || state.profile.bio || "Connect the signals that make your identity easier to trust and easier to understand."}</p>
              <div className="os-identity-meta">
                <span><small>WALLET</small><strong>{shortWallet(account.verifiedWallet)}</strong></span>
                <span><small>PROFILE</small><strong>{profileCompletion}%</strong></span>
                <span><small>STRENGTH</small><strong>{identityStrength}%</strong></span>
              </div>
              <div className="os-inline-actions">
                <Link href="/app/identity">Manage identity →</Link>
                <Link href="/app/profile">Strengthen profile</Link>
              </div>
            </div>
          </div>
        </article>

        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">HOW AM I TRUSTED?</span>
          <h2>{gnsIdentity.scoreStatus === "scored" ? "Your reputation is active." : "Your trust picture is still developing."}</h2>
          <GwapScoreDisplay result={score} />
          <p>{gnsIdentity.scoreMessage}</p>
          <Link href="/app/score">Understand your reputation →</Link>
        </aside>
      </section>

      <section className="os-v2-layout">
        <div>
          <div className="os-section-heading-v2">
            <span className="os-terminal-label">WHAT DO I OWN?</span>
            <p>Your verified wallet is read directly from Solana mainnet.</p>
          </div>
          <WalletPortfolioCard />
        </div>

        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">WHAT SHOULD I DO NEXT?</span>
          <h2>{nextAction.title}</h2>
          <p>{nextAction.detail}</p>
          <div className="os-inline-actions">
            <Link href={nextAction.href}>{nextAction.label} →</Link>
          </div>
          <small>GWAP OS recommends the next action from your current identity, profile, reputation, and active-work state.</small>
        </aside>
      </section>

      <section className="os-app-launcher">
        <div className="os-section-heading-v2">
          <span className="os-terminal-label">WHAT ARE YOU HERE TO DO?</span>
          <p>Choose an outcome. GWAP OS will take you to the capability that powers it.</p>
        </div>
        <div className="os-process-grid">
          {outcomeActions.map((action) => (
            <Link href={action.href} key={action.href} className="os-process-tile">
              <span className="os-process-icon" aria-hidden="true">{action.icon}</span>
              <span>
                <strong>{action.label}</strong>
                <small>POWERED BY {action.product.toUpperCase()}</small>
                <em>{action.note}</em>
              </span>
              <i aria-hidden="true">→</i>
            </Link>
          ))}
        </div>
      </section>

      <section className="os-v2-layout">
        <aside className="os-system-log" aria-label="GWAP trust activity log">
          <div className="os-console-chrome"><span>GWAP TRUST GRAPH</span><span>LIVE</span></div>
          <div className="os-log-lines">
            {logs.map((line, index) => (
              <p key={`${line}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{line}</p>
            ))}
          </div>
        </aside>
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">THE GWAP LOOP</span>
          <h2>Connect → Verify → Build reputation → Unlock value.</h2>
          <p>Every verified signal should make the rest of the operating system more useful—from identity and wallet intelligence to opportunities, work, and future proofs.</p>
          <small>Identity Strength measures verified coverage and profile completeness. It is not your GwapScore and is not a financial credit score.</small>
        </aside>
      </section>
    </div>
  );
}
