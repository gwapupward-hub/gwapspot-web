"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GwapScoreDisplay } from "../../components/gwap-score-display";
import type { GwapScoreResult } from "../../lib/gwap-score";
import type { EcosystemProduct } from "../../lib/ecosystem";
import { getProfileCompletion, type GwapPersona } from "../lib/os-state";
import { useGwapOs } from "./os-provider";
import { WalletPortfolioCard } from "./wallet-portfolio-card";

const outcomeActions = [
  {
    key: "reputation",
    href: "/app/score",
    label: "Build my reputation",
    product: "GwapScore",
    icon: "↗",
    note: "Understand your trust signal and what can strengthen it.",
  },
  {
    key: "identity",
    href: "/app/identity",
    label: "Verify my identity",
    product: "GNS",
    icon: "◎",
    note: "Claim or strengthen the digital identity attached to your wallet.",
  },
  {
    key: "opportunity",
    href: "/app/ideas",
    label: "Find an opportunity",
    product: "Daily Ideas",
    icon: "✦",
    note: "Discover, save, develop, validate, and build something useful.",
  },
  {
    key: "work",
    href: "/app/marketplace",
    label: "Turn trust into work",
    product: "Marketplace",
    icon: "▤",
    note: "Use reputation and verified identity in real economic activity.",
  },
  {
    key: "proof",
    href: "/app/vault",
    label: "Prove something privately",
    product: "Private Proof Vault",
    icon: "◇",
    note: "Prepare selective proof and credential workflows without oversharing.",
  },
  {
    key: "integrate",
    href: "/app/developer",
    label: "Integrate GWAP",
    product: "Developer API",
    icon: "{}",
    note: "Bring GWAP identity, intelligence, and trust signals into another product.",
  },
] as const;

type OutcomeKey = (typeof outcomeActions)[number]["key"];

const personaProfiles: Record<
  GwapPersona,
  {
    label: string;
    short: string;
    description: string;
    priorities: OutcomeKey[];
    recommendation: { href: string; title: string; detail: string; label: string };
  }
> = {
  general: {
    label: "Explore GWAP",
    short: "General",
    description: "Start with identity, trust, wallet intelligence, and opportunities.",
    priorities: ["identity", "reputation", "opportunity", "proof", "work", "integrate"],
    recommendation: {
      href: "/app/ideas",
      title: "Discover what GWAP can help you do",
      detail: "Use Daily Ideas and the trust tools around it to find an opportunity worth acting on.",
      label: "Explore opportunities",
    },
  },
  builder: {
    label: "Build products",
    short: "Builder",
    description: "Prioritize APIs, opportunities, wallet intelligence, and execution.",
    priorities: ["integrate", "opportunity", "identity", "reputation", "proof", "work"],
    recommendation: {
      href: "/app/developer",
      title: "Turn GWAP infrastructure into a building block",
      detail: "Create an API key and start integrating identity, wallet intelligence, and trust signals into your own product.",
      label: "Open developer tools",
    },
  },
  freelancer: {
    label: "Win clients",
    short: "Freelancer",
    description: "Prioritize credibility, proof, profile strength, and paid work.",
    priorities: ["reputation", "proof", "work", "identity", "opportunity", "integrate"],
    recommendation: {
      href: "/app/marketplace",
      title: "Put your credibility in front of real opportunities",
      detail: "Use your verified identity and reputation as context when you pursue work, clients, and collaborations.",
      label: "Explore work",
    },
  },
  creator: {
    label: "Grow my influence",
    short: "Creator",
    description: "Prioritize reputation, identity, proof, and monetizable opportunities.",
    priorities: ["reputation", "identity", "proof", "opportunity", "work", "integrate"],
    recommendation: {
      href: "/app/score",
      title: "Strengthen the trust behind your audience",
      detail: "Build a reputation layer that can travel with you into collaborations, sponsorships, commerce, and future social verification.",
      label: "Build reputation",
    },
  },
  investor: {
    label: "Evaluate opportunities",
    short: "Investor",
    description: "Prioritize wallet intelligence, identity, reputation, and counterparty trust.",
    priorities: ["reputation", "identity", "proof", "opportunity", "integrate", "work"],
    recommendation: {
      href: "/app/score",
      title: "Make trust part of your diligence process",
      detail: "Use identity and reputation signals alongside the mainnet portfolio view before you evaluate counterparties and opportunities.",
      label: "Inspect trust signals",
    },
  },
  business: {
    label: "Operate a business",
    short: "Business",
    description: "Prioritize integrations, counterparties, proof, reputation, and hiring.",
    priorities: ["integrate", "reputation", "proof", "work", "identity", "opportunity"],
    recommendation: {
      href: "/app/developer",
      title: "Bring GWAP trust infrastructure into your workflow",
      detail: "Use the developer layer to make wallet intelligence, identity, and trust signals available inside your own product or operations.",
      label: "Open developer tools",
    },
  },
};

const personaOrder: GwapPersona[] = ["builder", "freelancer", "creator", "investor", "business", "general"];

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 5)}…${wallet.slice(-5)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function DashboardView({ products }: { products: EcosystemProduct[] }) {
  const { account, gnsIdentity, state, syncStatus, updateSettings } = useGwapOs();
  const liveProducts = products.filter((product) => product.status === "Live").length;
  const profileCompletion = getProfileCompletion(state.profile);
  const persona = state.settings.persona;
  const personaProfile = personaProfiles[persona];

  const recentNames = useMemo(() => {
    return state.recent
      .map((item) => products.find((product) => product.slug === item.slug)?.name)
      .filter((value): value is string => Boolean(value))
      .slice(0, 3);
  }, [products, state.recent]);

  const personalizedActions = useMemo(() => {
    const priority = new Map(personaProfile.priorities.map((key, index) => [key, index]));
    return [...outcomeActions].sort(
      (left, right) => (priority.get(left.key) ?? 99) - (priority.get(right.key) ?? 99),
    );
  }, [personaProfile.priorities]);

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
    return personaProfile.recommendation;
  }, [gnsIdentity.scoreStatus, gnsIdentity.status, personaProfile.recommendation, profileCompletion]);

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
    `[workspace] mode: ${personaProfile.short.toLowerCase()}`,
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

      <section className="os-app-launcher">
        <div className="os-section-heading-v2">
          <span className="os-terminal-label">PERSONALIZE MY GWAP OS</span>
          <p>Tell GWAP OS what kind of value you are here to create. This changes emphasis and recommendations, not your access.</p>
        </div>
        <div className="os-process-grid">
          {personaOrder.map((option) => {
            const profile = personaProfiles[option];
            const active = option === persona;
            return (
              <button
                type="button"
                key={option}
                className={`os-process-tile${active ? " is-active" : ""}`}
                aria-pressed={active}
                onClick={() => updateSettings({ persona: option })}
              >
                <span className="os-process-icon" aria-hidden="true">{active ? "●" : "○"}</span>
                <span>
                  <strong>{profile.label}</strong>
                  <small>{profile.short.toUpperCase()} MODE</small>
                  <em>{profile.description}</em>
                </span>
                <i aria-hidden="true">{active ? "✓" : "→"}</i>
              </button>
            );
          })}
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
          <span className="os-terminal-label">WHAT SHOULD I DO NEXT? · {personaProfile.short.toUpperCase()}</span>
          <h2>{nextAction.title}</h2>
          <p>{nextAction.detail}</p>
          <div className="os-inline-actions">
            <Link href={nextAction.href}>{nextAction.label} →</Link>
          </div>
          <small>Identity and profile prerequisites stay universal. After that, recommendations adapt to what you use GWAP OS to accomplish.</small>
        </aside>
      </section>

      <section className="os-app-launcher">
        <div className="os-section-heading-v2">
          <span className="os-terminal-label">WHAT ARE YOU HERE TO DO?</span>
          <p>Actions are ordered for {personaProfile.short.toLowerCase()} mode. Every capability remains available.</p>
        </div>
        <div className="os-process-grid">
          {personalizedActions.map((action) => (
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
