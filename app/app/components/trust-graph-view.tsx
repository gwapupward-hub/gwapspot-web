"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { deriveTrustGraph, type TrustSignal } from "../lib/trust-graph";
import { useGwapOs } from "./os-provider";

type AccountLinkPayload = {
  linkedAccounts?: {
    telegram?: { userId?: string } | null;
  };
};

type SocialVerificationPayload = {
  summary?: {
    enabled?: boolean;
    verifiedCount?: number;
  };
};

type SocialSummary = {
  enabled: boolean;
  verifiedCount: number;
};

function signalStateLabel(signal: TrustSignal) {
  if (signal.state === "verified") return "VERIFIED";
  if (signal.state === "incomplete") return "ACTION NEEDED";
  if (signal.state === "planned") return "PLANNED";
  return "UNAVAILABLE";
}

export function TrustGraphView() {
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity, state } = useGwapOs();
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const [socialVerification, setSocialVerification] = useState<SocialSummary | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4500);

    void getAccessToken()
      .then(async (token) => {
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const [accountResult, socialResult] = await Promise.allSettled([
          fetch("/api/account", {
            cache: "no-store",
            credentials: "same-origin",
            headers,
            signal: controller.signal,
          }).then(async (response) => {
            if (!response.ok) throw new Error("Account link status unavailable");
            return (await response.json()) as AccountLinkPayload;
          }),
          fetch("/api/gwapscore/social-verification", {
            cache: "no-store",
            credentials: "same-origin",
            headers,
            signal: controller.signal,
          }).then(async (response) => {
            if (!response.ok) throw new Error("Social verification unavailable");
            return (await response.json()) as SocialVerificationPayload;
          }),
        ]);

        if (!active) return;
        setTelegramLinked(
          accountResult.status === "fulfilled"
            ? Boolean(accountResult.value.linkedAccounts?.telegram)
            : null,
        );
        if (socialResult.status === "fulfilled") {
          setSocialVerification({
            enabled: socialResult.value.summary?.enabled === true,
            verifiedCount:
              typeof socialResult.value.summary?.verifiedCount === "number"
                ? socialResult.value.summary.verifiedCount
                : 0,
          });
        } else {
          setSocialVerification(null);
        }
      })
      .catch(() => {
        if (!active) return;
        setTelegramLinked(null);
        setSocialVerification(null);
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [getAccessToken]);

  const graph = useMemo(
    () =>
      deriveTrustGraph({
        gnsIdentity,
        state,
        telegramLinked,
        walletVerified: Boolean(account.verifiedWallet),
        socialVerification,
      }),
    [account.verifiedWallet, gnsIdentity, socialVerification, state, telegramLinked],
  );

  const verifiedCount = graph.signals.filter((signal) => signal.state === "verified").length;
  const incompleteCount = graph.signals.filter((signal) => signal.state === "incomplete").length;
  const plannedCount = graph.signals.filter((signal) => signal.state === "planned").length;

  return (
    <div className="os-page os-home-v2">
      <section className="os-v2-hero">
        <div>
          <span className="os-terminal-label">GWAP://TRUST_GRAPH</span>
          <h1>Know what makes you <span>credible.</span></h1>
          <p>
            Your Trust Graph shows which identity, reputation, and account signals GWAP can verify today, what still needs attention, and which capabilities are still being built.
          </p>
        </div>
        <div className="os-runtime-badge state-found">
          <i />
          <span>
            <small>TRUST COVERAGE</small>
            <strong>{graph.coverage}%</strong>
          </span>
        </div>
      </section>

      <section className="os-v2-layout">
        <article className="os-identity-console">
          <div className="os-console-chrome"><span>YOUR TRUST ANCHOR</span><span>LIVE SIGNALS</span></div>
          <div className="os-identity-body">
            <div className="os-v2-avatar" aria-hidden="true">{(gnsIdentity.name || account.displayName || "G").slice(0, 1).toUpperCase()}</div>
            <div className="os-identity-copy">
              <span className="os-terminal-label">CANONICAL GWAP IDENTITY</span>
              <h2>{gnsIdentity.fullName || gnsIdentity.name || account.displayName}</h2>
              <p>
                GWAP builds trust from independently useful signals. No single signal is treated as proof of everything, and planned capabilities do not count toward live coverage.
              </p>
              <div className="os-identity-meta">
                <span><small>VERIFIED</small><strong>{verifiedCount}</strong></span>
                <span><small>NEEDS ACTION</small><strong>{incompleteCount}</strong></span>
                <span><small>PLANNED</small><strong>{plannedCount}</strong></span>
              </div>
            </div>
          </div>
        </article>

        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">NEXT TRUST ACTION</span>
          <h2>{graph.nextAction ? graph.nextAction.label : "Your current live signals are covered."}</h2>
          <p>
            {graph.nextAction
              ? graph.nextAction.summary
              : "GWAP has no incomplete live trust signal to recommend right now. Planned capabilities remain excluded until their backends are active."}
          </p>
          {graph.nextAction?.href && graph.nextAction.actionLabel ? (
            <Link href={graph.nextAction.href}>{graph.nextAction.actionLabel} →</Link>
          ) : null}
        </aside>
      </section>

      <section className="os-app-launcher">
        <div className="os-section-heading-v2">
          <span className="os-terminal-label">TRUST SIGNALS</span>
          <p>See what GWAP can verify, what you can strengthen, and what is still roadmap-only.</p>
        </div>
        <div className="os-process-grid">
          {graph.signals.map((signal) => (
            <article key={signal.id} className="os-process-tile">
              <span className="os-process-icon" aria-hidden="true">
                {signal.state === "verified" ? "✓" : signal.state === "planned" ? "◇" : signal.state === "incomplete" ? "+" : "!"}
              </span>
              <span>
                <strong>{signal.label}</strong>
                <small>{signalStateLabel(signal)} · POWERED BY {signal.product.toUpperCase()}</small>
                <em>{signal.summary}</em>
                {signal.href && signal.actionLabel ? <Link href={signal.href}>{signal.actionLabel} →</Link> : null}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="os-v2-layout">
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">RELATIONSHIP PROVENANCE</span>
          <h2>See why GWAP believes your accounts are connected.</h2>
          <p>
            Trust Coverage tells you which signals exist. Relationship Graph shows the underlying account, wallet, .gwap, Telegram, and verified social connections—and the provenance behind each edge.
          </p>
          <Link href="/app/trust/relationships">Open Relationship Graph →</Link>
        </aside>
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">WHAT TRUST COVERAGE MEANS</span>
          <h2>Coverage is not your GwapScore.</h2>
          <p>
            Trust Coverage measures how many currently available verification signals are present. GwapScore is a separate reputation model. Neither should be presented as a financial credit score.
          </p>
          <Link href="/app/score">Open GwapScore →</Link>
        </aside>
      </section>

      <section className="os-v2-layout">
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">PRIVATE PROOFS</span>
          <h2>Private Proof Vault remains the next planned trust capability.</h2>
          <p>
            Proof Vault stays excluded from live coverage until its secure backend exists. Social Proof-of-Control activates independently when its signed platform verifier is connected.
          </p>
          <Link href="/app/vault">View Proof Vault status →</Link>
        </aside>
      </section>
    </div>
  );
}
