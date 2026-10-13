"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PpvVerifiedActivity } from "../../components/ppv/ppv-verified-activity";
import {
  GWAP_ENTRY_INTENTS,
  type GwapEntryIntent,
} from "../../lib/entry-intent";
import type { EcosystemProduct } from "../../lib/ecosystem";
import { getProfileCompletion } from "../lib/os-state";
import { GwapGradientLink } from "./gwap-gradient-button";
import { useGwapOs } from "./os-provider";
import { WalletPortfolioCard } from "./wallet-portfolio-card";

type TrustFoundationItem = {
  href: string;
  icon: string;
  title: string;
  note: string;
  status: string;
};

export function DashboardView({
  products,
  initialIntent,
}: {
  products: EcosystemProduct[];
  initialIntent: GwapEntryIntent | null;
}) {
  const { account, gnsIdentity, state, syncStatus } = useGwapOs();
  const entryIntent = initialIntent;
  const profileCompletion = getProfileCompletion(state.profile);

  const identity =
    gnsIdentity.fullName ||
    gnsIdentity.name ||
    account.displayName ||
    "GWAP member";
  const intentConfig = entryIntent ? GWAP_ENTRY_INTENTS[entryIntent] : null;

  const nextAction = useMemo(() => {
    if (entryIntent) {
      const config = GWAP_ENTRY_INTENTS[entryIntent];

      if (entryIntent === "identity" && gnsIdentity.status === "found") {
        if (profileCompletion < 67) {
          return {
            href: "/app/profile",
            title: "Strengthen your digital identity",
            detail:
              "Your .gwap identity is active. Add the profile context that helps people understand who they are dealing with.",
            label: "Complete profile",
          };
        }

        return {
          href: "/app/identity",
          title: "Your identity foundation is active",
          detail:
            "Review the identity and account connections that carry your credibility across GWAP.",
          label: "Manage identity",
        };
      }

      return {
        href: config.actionHref,
        title: config.dashboardTitle,
        detail: config.dashboardDetail,
        label: config.actionLabel,
      };
    }

    if (gnsIdentity.status === "none") {
      return {
        href: "/app/identity",
        title: "Establish your digital identity",
        detail:
          "Claim a recognizable .gwap identity so your profile, reputation, and verified activity can resolve to one place.",
        label: "Create identity",
      };
    }

    if (profileCompletion < 67) {
      return {
        href: "/app/profile",
        title: "Give people useful context",
        detail:
          "Complete your public profile so people can understand who you are before they work or transact with you.",
        label: "Strengthen profile",
      };
    }

    if (gnsIdentity.scoreStatus !== "scored") {
      return {
        href: "/app/score",
        title: "Build your reputation signal",
        detail:
          "Review the trust signals available to GwapScore and see which verified signals can strengthen your reputation.",
        label: "Review reputation",
      };
    }

    return {
      href: "/app/ppv",
      title: "Turn trusted work into verified history",
      detail:
        "Use Private Proof Vault for proofs, agreements, and activity that can become durable evidence of what happened.",
      label: "Open Private Proof Vault",
    };
  }, [entryIntent, gnsIdentity.scoreStatus, gnsIdentity.status, profileCompletion]);

  const trustFoundation = useMemo<TrustFoundationItem[]>(
    () => [
      {
        href: "/app/identity",
        icon: "◎",
        title: "Identity",
        note:
          gnsIdentity.status === "found"
            ? `${gnsIdentity.fullName || gnsIdentity.name} is your active .gwap identity.`
            : gnsIdentity.status === "none"
              ? "Create a recognizable identity that your GWAP activity can resolve to."
              : "Identity status is temporarily unavailable.",
        status:
          gnsIdentity.status === "found"
            ? "Verified"
            : gnsIdentity.status === "none"
              ? "Set up"
              : "Check",
      },
      {
        href: "/app/score",
        icon: "↗",
        title: "Reputation",
        note:
          gnsIdentity.scoreStatus === "scored"
            ? `${gnsIdentity.scoreTier || "GwapScore"}${typeof gnsIdentity.score === "number" ? ` · ${gnsIdentity.score}` : ""}`
            : gnsIdentity.scoreMessage || "Your reputation signal is still developing.",
        status: gnsIdentity.scoreStatus === "scored" ? "Active" : "Build",
      },
      {
        href: "/app/profile",
        icon: "◇",
        title: "Profile context",
        note: `${profileCompletion}% complete · Give people useful context about who you are and what you do.`,
        status: profileCompletion >= 67 ? "Strong" : "Improve",
      },
      {
        href: "/app/ppv/activity",
        icon: "✓",
        title: "Verified activity",
        note: "Proofs and completed protocol activity can become factual records people can inspect.",
        status: "View",
      },
    ],
    [gnsIdentity, profileCompletion],
  );

  const recentProducts = useMemo(
    () =>
      state.recent
        .flatMap((item) => {
          const product = products.find((candidate) => candidate.slug === item.slug);
          return product
            ? [{ product, href: product.internalUrl || "/app/apps" }]
            : [];
        })
        .slice(0, 3),
    [products, state.recent],
  );

  const trustStatus =
    gnsIdentity.status === "found" && gnsIdentity.scoreStatus === "scored"
      ? "Trust foundation active"
      : gnsIdentity.status === "found"
        ? "Identity active · reputation developing"
        : "Trust foundation needs setup";

  return (
    <div className="gwapos-home">
      <section className="gwapos-hero-card" aria-labelledby="gwapos-home-title">
        <div className="gwapos-identity-line">
          <div>
            <p className="gwapos-kicker">GWAP TRUST HOME</p>
            <h1 id="gwapos-home-title">{identity}</h1>
            <p>
              Build credibility, prove progress, and keep the identity, reputation,
              and verified history people use to decide whether they can trust you.
            </p>
          </div>
          <span className="gwapos-status-orb" aria-hidden="true" />
        </div>

        <div className="gwapos-balance-line">
          <div>
            <small>TRUST STATUS</small>
            <p>{trustStatus}</p>
          </div>
          <small>
            {intentConfig?.label ?? `${profileCompletion}% profile complete`}
          </small>
        </div>

        <div className="gwapos-wallet-actions" aria-label="Trust actions">
          <Link className="gwapos-glass-action" href="/app/trust">
            Trust Graph
          </Link>
          <Link className="gwapos-glass-action" href="/app/identity">
            Identity
          </Link>
          <Link className="gwapos-glass-action" href="/app/score">
            Reputation
          </Link>
        </div>
      </section>

      <div className="gwapos-home-grid">
        <div>
          <section className="gwapos-section" aria-labelledby="trust-foundation-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Your Trust Foundation</p>
                <h2 id="trust-foundation-title">What people can learn about you</h2>
              </div>
              <Link href="/app/trust">Full Trust Graph →</Link>
            </div>

            <div className="gwapos-pulse">
              {trustFoundation.map((item) => (
                <Link className="gwapos-pulse-row" href={item.href} key={item.title}>
                  <span aria-hidden="true">{item.icon}</span>
                  <div>
                    <p>{item.title}</p>
                    <small>{item.note}</small>
                  </div>
                  <strong>{item.status}</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="gwapos-section" aria-labelledby="verified-activity-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Proof, Not Claims</p>
                <h2 id="verified-activity-title">Your verified activity</h2>
              </div>
              <Link href="/app/ppv/activity">Open activity →</Link>
            </div>
            <PpvVerifiedActivity
              wallet={account.verifiedWallet}
              domain={gnsIdentity.status === "found" ? gnsIdentity.name || undefined : undefined}
              title="Recent verified activity"
              receiptHref={(id) => `/app/vault/receipts/${id}`}
            />
          </section>
        </div>

        <div>
          <section className="gwapos-section" aria-labelledby="next-action-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Next Best Action</p>
                <h2 id="next-action-title">
                  {intentConfig ? "Move your goal forward" : "Strengthen what matters next"}
                </h2>
              </div>
            </div>

            <article className="gwapos-next-action">
              <div>
                <h3>{nextAction.title}</h3>
                <p>{nextAction.detail}</p>
              </div>
              <GwapGradientLink href={nextAction.href}>{nextAction.label} →</GwapGradientLink>
            </article>
          </section>

          <section className="gwapos-section" aria-labelledby="recent-work-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Your Work</p>
                <h2 id="recent-work-title">Keep making progress</h2>
              </div>
              <p>{syncStatus === "saved" ? "Synced" : "Syncing"}</p>
            </div>

            <div className="gwapos-pulse">
              {recentProducts.length ? (
                recentProducts.map(({ product, href }) => (
                  <Link className="gwapos-pulse-row" href={href} key={product.slug}>
                    <span aria-hidden="true">✦</span>
                    <div>
                      <p>{product.name}</p>
                      <small>Continue where you left off</small>
                    </div>
                    <strong>Resume</strong>
                  </Link>
                ))
              ) : (
                <Link className="gwapos-pulse-row" href="/app/ideas">
                  <span aria-hidden="true">+</span>
                  <div>
                    <p>Start making progress</p>
                    <small>Develop an idea or begin a project in GWAP OS.</small>
                  </div>
                  <strong>Start</strong>
                </Link>
              )}
            </div>
          </section>

          <section className="gwapos-section" aria-labelledby="quick-paths-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Quick Paths</p>
                <h2 id="quick-paths-title">What do you need right now?</h2>
              </div>
            </div>

            <div className="gwapos-pulse">
              <Link className="gwapos-pulse-row" href="/app/ideas/lab">
                <span aria-hidden="true">→</span>
                <div>
                  <p>Build something</p>
                  <small>Turn an idea into a real project.</small>
                </div>
                <strong>Build</strong>
              </Link>
              <Link className="gwapos-pulse-row" href="/app/score">
                <span aria-hidden="true">↗</span>
                <div>
                  <p>Strengthen reputation</p>
                  <small>Review the signals behind your credibility.</small>
                </div>
                <strong>Review</strong>
              </Link>
              <Link className="gwapos-pulse-row" href="/app/ppv">
                <span aria-hidden="true">◇</span>
                <div>
                  <p>Protect or prove work</p>
                  <small>Create proofs, agreements, and inspect verified activity.</small>
                </div>
                <strong>Open</strong>
              </Link>
              <Link className="gwapos-pulse-row" href="/#overview">
                <span aria-hidden="true">◎</span>
                <div>
                  <p>Choose a different goal</p>
                  <small>Change what GWAP should help you accomplish next.</small>
                </div>
                <strong>Change</strong>
              </Link>
            </div>
          </section>
        </div>
      </div>

      <section className="gwapos-section" aria-labelledby="wallet-context-title">
        <div className="gwapos-section-head">
          <div>
            <p className="gwapos-kicker">Supporting Infrastructure</p>
            <h2 id="wallet-context-title">Wallet context</h2>
          </div>
          <p>Available when you need it</p>
        </div>
        <div className="gwapos-portfolio-shell">
          <WalletPortfolioCard />
        </div>
      </section>
    </div>
  );
}
