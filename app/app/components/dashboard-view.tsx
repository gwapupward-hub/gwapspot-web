"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GwapMojisPromo } from "../../components/gwapmojis-promo";
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
  const solBalance =
    portfolio.status === "ready" && portfolio.payload.sol.amount !== null
      ? `${portfolio.payload.sol.amount.toFixed(2)} SOL`
      : "—";
  const profileCompletion = getProfileCompletion(state.profile);

  const identity = useMemo(
    () => gnsIdentity.fullName || shortenWalletAddress(account.verifiedWallet),
    [account.verifiedWallet, gnsIdentity.fullName],
  );

  const nextAction = useMemo(() => {
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
  }, [gnsIdentity.scoreStatus, gnsIdentity.status, profileCompletion]);

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
  }, [gnsIdentity, products, state.recent, syncStatus]);

  return (
    <div className="gwapos-home">
      <section className="gwapos-hero-card" aria-labelledby="gwapos-home-title">
        <div className="gwapos-identity-line">
          <div>
            <p className="gwapos-kicker">Wallet Command Center</p>
            <h1 id="gwapos-home-title">{identity}</h1>
            <p>{shortenWalletAddress(account.verifiedWallet)} · Solana mainnet</p>
          </div>
          <span className="gwapos-status-orb" aria-hidden="true" />
        </div>

        <div className="gwapos-balance-line">
          <div>
            <small>AVAILABLE SOL</small>
            <p>{solBalance}</p>
          </div>
          <small>
            {gnsIdentity.status === "found" ? ".gwap connected" : "wallet verified"}
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
                <p className="gwapos-kicker">Wallet Intelligence</p>
                <h2 id="portfolio-title">Portfolio snapshot</h2>
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
                <h2 id="next-action-title">Recommended for this wallet</h2>
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
                <h2 id="quick-tools-title">Operate GwapOS</h2>
              </div>
            </div>

            <div className="gwapos-pulse">
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
                  <p>Open GwapOS apps</p>
                  <small>{products.length} ecosystem tools available</small>
                </div>
                <strong>View</strong>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
