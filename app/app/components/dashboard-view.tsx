"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GwapMojisPromo } from "../../components/gwapmojis-promo";
import {
  GWAP_ENTRY_INTENTS,
  GWAP_ENTRY_INTENT_STORAGE_KEY,
  isGwapEntryIntent,
  type GwapEntryIntent,
} from "../../lib/entry-intent";
import type { EcosystemProduct } from "../../lib/ecosystem";
import { getProfileCompletion } from "../lib/os-state";
import { useWalletPortfolio } from "../lib/use-wallet-portfolio";
import { shortenWalletAddress } from "../lib/wallet-format";
import { GwapGradientLink } from "./gwap-gradient-button";
import { useGwapOs } from "./os-provider";
import { WalletPortfolioCard } from "./wallet-portfolio-card";

export function DashboardView({ products }: { products: EcosystemProduct[] }) {
  const { account, gnsIdentity, state, syncStatus } = useGwapOs();
  const portfolio = useWalletPortfolio();
  const [entryIntent, setEntryIntent] = useState<GwapEntryIntent | null>(null);
  const solBalance =
    portfolio.status === "ready" && portfolio.payload.sol.amount !== null
      ? `${portfolio.payload.sol.amount.toFixed(2)} SOL`
      : "—";
  const profileCompletion = getProfileCompletion(state.profile);

  useEffect(() => {
    try {
      const storedIntent = window.localStorage.getItem(GWAP_ENTRY_INTENT_STORAGE_KEY);
      if (isGwapEntryIntent(storedIntent)) setEntryIntent(storedIntent);
    } catch {
      // Personalization gracefully falls back when browser storage is unavailable.
    }
  }, []);

  const identity = useMemo(
    () => gnsIdentity.fullName || shortenWalletAddress(account.verifiedWallet),
    [account.verifiedWallet, gnsIdentity.fullName],
  );

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
              "Your .gwap identity is active. Complete the profile context that people and GWAP products can actually use.",
            label: "Complete profile",
          };
        }

        return {
          href: "/app/identity",
          title: "Your identity foundation is active",
          detail:
            "Review your .gwap identity, connected wallet, and profile details before carrying that identity into reputation and commerce.",
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
        title: "Claim your GwapOS identity",
        detail:
          "Turn this wallet into a human-readable .gwap identity that can travel across the GWAP ecosystem.",
        label: "Claim .gwap",
      };
    }

    if (profileCompletion < 67) {
      return {
        href: "/app/profile",
        title: "Strengthen your identity",
        detail:
          "Complete your public profile so counterparties have useful context before they transact with you.",
        label: "Complete profile",
      };
    }

    if (gnsIdentity.scoreStatus !== "scored") {
      return {
        href: "/app/score",
        title: "Activate your reputation layer",
        detail:
          "Review the trust signals available to GwapScore and see what is still missing.",
        label: "Open GwapScore",
      };
    }

    return {
      href: "/app/vault",
      title: "Put your identity to work",
      detail:
        "Review the proof and exact-version agreement capabilities available through Private Proof Vault.",
      label: "Open Vault",
    };
  }, [entryIntent, gnsIdentity.scoreStatus, gnsIdentity.status, profileCompletion]);

  const pulse = useMemo(() => {
    const items = [
      gnsIdentity.status === "found"
        ? {
            icon: "◎",
            title: `${gnsIdentity.fullName ?? gnsIdentity.name} is active`,
            note: "Primary GwapOS identity",
            status: "Live",
          }
        : gnsIdentity.status === "none"
          ? {
              icon: "+",
              title: "No .gwap identity yet",
              note: "Claim one to make this wallet human-readable",
              status: "Action",
            }
          : {
              icon: "!",
              title: "Identity registry unavailable",
              note: "Wallet access still works while GNS recovers",
              status: "Degraded",
            },
      gnsIdentity.scoreStatus === "scored"
        ? {
            icon: "↗",
            title: `GwapScore ${gnsIdentity.score ?? "—"}`,
            note: gnsIdentity.scoreTier || "Reputation signal active",
            status: "Updated",
          }
        : {
            icon: "↗",
            title: "Reputation still developing",
            note: gnsIdentity.scoreMessage,
            status: "Review",
          },
      syncStatus === "saved"
        ? {
            icon: "✓",
            title: "GwapOS state synced",
            note: "Your workspace is current",
            status: "Saved",
          }
        : {
            icon: "•",
            title: "Workspace sync in progress",
            note: "Your wallet remains authenticated",
            status: syncStatus,
          },
    ];

    if (entryIntent) {
      const config = GWAP_ENTRY_INTENTS[entryIntent];
      items.unshift({
        icon: "→",
        title: config.label,
        note: "Your selected starting goal",
        status: "Focus",
      });
    }

    if (state.recent.length) {
      const recentProduct = products.find(
        (product) => product.slug === state.recent[0]?.slug,
      );
      if (recentProduct) {
        items.push({
          icon: "✦",
          title: `Recent: ${recentProduct.name}`,
          note: "Continue where you left off",
          status: "Recent",
        });
      }
    }

    return items.slice(0, 4);
  }, [entryIntent, gnsIdentity, products, state.recent, syncStatus]);

  const heroTitle = intentConfig?.dashboardTitle ?? identity;
  const heroDetail =
    intentConfig?.dashboardDetail ??
    `${shortenWalletAddress(account.verifiedWallet)} · Solana mainnet`;

  return (
    <div className="gwapos-home">
      <section className="gwapos-hero-card" aria-labelledby="gwapos-home-title">
        <div className="gwapos-identity-line">
          <div>
            <p className="gwapos-kicker">{intentConfig ? "Your GWAP goal" : "GWAP OS"}</p>
            <h1 id="gwapos-home-title">{heroTitle}</h1>
            <p>{heroDetail}</p>
          </div>
          <span className="gwapos-status-orb" aria-hidden="true" />
        </div>

        <div className="gwapos-balance-line">
          <div>
            <small>AVAILABLE SOL</small>
            <p>{solBalance}</p>
          </div>
          <small>
            {intentConfig?.label ??
              (gnsIdentity.status === "found" ? ".gwap connected" : "wallet verified")}
          </small>
        </div>

        <div className="gwapos-wallet-actions" aria-label="Wallet actions">
          <Link className="gwapos-glass-action" href="/app/send">
            Send
          </Link>
          <Link className="gwapos-glass-action" href="/app/receive">
            Receive
          </Link>
          <button
            className="gwapos-glass-action"
            type="button"
            disabled
            title="Swap remains gated until the wallet transaction pass"
          >
            Swap
          </button>
        </div>
      </section>

      <GwapMojisPromo surface="gwapos_home" variant="compact" />

      <div className="gwapos-home-grid">
        <div>
          <section className="gwapos-section" aria-labelledby="pulse-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Your Pulse</p>
                <h2 id="pulse-title">What matters right now</h2>
              </div>
              <p>{pulse.length} signals</p>
            </div>

            <div className="gwapos-pulse">
              {pulse.map((item) => (
                <div className="gwapos-pulse-row" key={`${item.title}-${item.status}`}>
                  <span aria-hidden="true">{item.icon}</span>
                  <div>
                    <p>{item.title}</p>
                    <small>{item.note}</small>
                  </div>
                  <strong>{item.status}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="gwapos-section" aria-labelledby="portfolio-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Wallet Context</p>
                <h2 id="portfolio-title">Connected wallet snapshot</h2>
              </div>
              <p>Live wallet data</p>
            </div>
            <div className="gwapos-portfolio-shell">
              <WalletPortfolioCard />
            </div>
          </section>
        </div>

        <div>
          <section className="gwapos-section" aria-labelledby="next-action-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Next Action</p>
                <h2 id="next-action-title">
                  {intentConfig ? "Recommended for your goal" : "Recommended for this account"}
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

          <section className="gwapos-section" aria-labelledby="quick-tools-title">
            <div className="gwapos-section-head">
              <div>
                <p className="gwapos-kicker">Quick Tools</p>
                <h2 id="quick-tools-title">Operate GWAP OS</h2>
              </div>
            </div>

            <div className="gwapos-pulse">
              <Link className="gwapos-pulse-row" href="/#overview">
                <span aria-hidden="true">→</span>
                <div>
                  <p>Choose a different goal</p>
                  <small>Return to the audience-first starting paths</small>
                </div>
                <strong>Change</strong>
              </Link>
              <Link className="gwapos-pulse-row" href="/app/vault">
                <span aria-hidden="true">◇</span>
                <div>
                  <p>Open Proof Vault</p>
                  <small>Proof and agreement foundation</small>
                </div>
                <strong>Open</strong>
              </Link>
              <Link className="gwapos-pulse-row" href="/app/identity">
                <span aria-hidden="true">◎</span>
                <div>
                  <p>Manage identity</p>
                  <small>.gwap, profile, and wallet</small>
                </div>
                <strong>Open</strong>
              </Link>
              <Link className="gwapos-pulse-row" href="/app/apps">
                <span aria-hidden="true">✦</span>
                <div>
                  <p>Open GWAP OS apps</p>
                  <small>{products.length} ecosystem tools available</small>
                </div>
                <strong>View</strong>
              </Link>
              <Link className="gwapos-pulse-row" href="/app/settings">
                <span aria-hidden="true">⚙</span>
                <div>
                  <p>Account settings</p>
                  <small>Preferences, linked accounts, and sign-out</small>
                </div>
                <strong>Open</strong>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
