"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GwapMojisPromo } from "../../components/gwapmojis-promo";
import { PpvVerifiedActivity } from "../../components/ppv/ppv-verified-activity";
import {
  createActivationProgress,
  GWAP_ACTIVATION_COOKIE_KEY,
  GWAP_ACTIVATION_SELECTED_EVENT,
  GWAP_ACTIVATION_SIGNAL_COOKIE_KEY,
  GWAP_ACTIVATION_STORAGE_KEY,
  serializeActivationSelection,
  type ActivationSignal,
} from "../../lib/activation-analytics";
import {
  GWAP_ENTRY_INTENTS,
  GWAP_ENTRY_INTENT_COOKIE_KEY,
  GWAP_ENTRY_INTENT_STORAGE_KEY,
  type GwapEntryIntent,
} from "../../lib/entry-intent";
import type { EcosystemProduct } from "../../lib/ecosystem";
import { getNextBestAction } from "../../lib/next-best-action";
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

function seedSuggestedActivation(intent: GwapEntryIntent) {
  const progress = createActivationProgress(intent);
  const selection = serializeActivationSelection(progress);

  try {
    window.localStorage.setItem(GWAP_ENTRY_INTENT_STORAGE_KEY, intent);
    window.localStorage.setItem(
      GWAP_ACTIVATION_STORAGE_KEY,
      JSON.stringify(progress),
    );
  } catch {
    // Browser storage is optional; the first-party cookies remain the fallback.
  }

  const host = window.location.hostname.toLowerCase();
  const sharedDomain = host === "gwapspot.com" || host.endsWith(".gwapspot.com");
  const domain = sharedDomain ? "; Domain=.gwapspot.com" : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const scope = `Path=/; SameSite=Lax${domain}${secure}`;
  const persistent = `${scope}; Max-Age=2592000`;
  document.cookie = `${GWAP_ACTIVATION_SIGNAL_COOKIE_KEY}=; ${scope}; Max-Age=0`;
  document.cookie = `${GWAP_ENTRY_INTENT_COOKIE_KEY}=${encodeURIComponent(intent)}; ${persistent}`;
  document.cookie = `${GWAP_ACTIVATION_COOKIE_KEY}=${encodeURIComponent(selection)}; ${persistent}`;
  window.dispatchEvent(
    new CustomEvent(GWAP_ACTIVATION_SELECTED_EVENT, { detail: selection }),
  );
}

export function DashboardView({
  products,
  initialIntent,
  initialSignal,
}: {
  products: EcosystemProduct[];
  initialIntent: GwapEntryIntent | null;
  initialSignal: ActivationSignal | null;
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

  const nextAction = useMemo(
    () =>
      getNextBestAction({
        entryIntent,
        signal: initialSignal,
        identityStatus: gnsIdentity.status,
        profileCompletion,
        scoreStatus: gnsIdentity.scoreStatus,
      }),
    [
      entryIntent,
      gnsIdentity.scoreStatus,
      gnsIdentity.status,
      initialSignal,
      profileCompletion,
    ],
  );
  const advanceIntent = nextAction.nextIntent;

  const nextActionHeading =
    nextAction.mode === "advance"
      ? "Advance from your last milestone"
      : nextAction.mode === "resume"
        ? "Resume what is already in motion"
        : intentConfig
          ? "Move your goal forward"
          : "Strengthen what matters next";

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

  const goalStatus =
    initialSignal?.kind === "completed"
      ? "Milestone complete · next step ready"
      : initialSignal?.kind === "resumed"
        ? "Existing progress detected"
        : intentConfig?.label ?? `${profileCompletion}% profile complete`;

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
          <small>{goalStatus}</small>
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
                <h2 id="next-action-title">{nextActionHeading}</h2>
              </div>
            </div>

            <article className="gwapos-next-action">
              <div>
                <h3>{nextAction.title}</h3>
                <p>{nextAction.detail}</p>
              </div>
              <GwapGradientLink
                href={nextAction.href}
                onClick={
                  advanceIntent
                    ? () => seedSuggestedActivation(advanceIntent)
                    : undefined
                }
              >
                {nextAction.label} →
              </GwapGradientLink>
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
              <Link className="gwapos-pulse-row" href="/app/settings">
                <span aria-hidden="true">⚙</span>
                <div>
                  <p>Account settings</p>
                  <small>Manage account access, linked services, wallet context, and sign-out.</small>
                </div>
                <strong>Open</strong>
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

      <GwapMojisPromo surface="gwapos_home" variant="compact" />
    </div>
  );
}
