"use client";

import Link from "next/link";
import { useState } from "react";
import { GwapScoreDisplay } from "../../components/gwap-score-display";
import type { GwapScoreResult } from "../../lib/gwap-score";
import { useGwapOs } from "./os-provider";
import { GnsProfileEditor } from "./gns-profile-editor";
import { IdentityView } from "./identity-view";
import styles from "./identity-wallet-view.module.css";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function IdentityWalletView() {
  const { account, gnsIdentity } = useGwapOs();
  const [copied, setCopied] = useState(false);

  if (gnsIdentity.status !== "found") return <IdentityView />;

  const score: GwapScoreResult = {
    status: gnsIdentity.scoreStatus,
    score: gnsIdentity.score,
    tier: gnsIdentity.scoreTier,
    message: gnsIdentity.scoreMessage,
  };

  const displayName = gnsIdentity.fullName || `${gnsIdentity.name}.gwap`;
  const scoreLabel = gnsIdentity.score == null ? "Pending" : String(gnsIdentity.score);

  async function copyWallet() {
    try {
      await navigator.clipboard.writeText(account.verifiedWallet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>GWAP IDENTITY</p>
        <div className={styles.identityRow}>
          <div className={styles.avatar} aria-hidden="true">
            {gnsIdentity.avatar ? <img src={gnsIdentity.avatar} alt="" /> : (gnsIdentity.name || "G").slice(0, 1).toUpperCase()}
          </div>
          <div className={styles.nameBlock}>
            <h1>{displayName}</h1>
            <p>{shortAddress(account.verifiedWallet)}</p>
            <span className={styles.verified}>{gnsIdentity.verified ? "● Verified identity" : "○ Verification pending"}</span>
          </div>
        </div>
        <p className={styles.bio}>{gnsIdentity.bio || "Your .gwap name is now the primary identity for this GwapOS session."}</p>
        <div className={styles.actions}>
          {gnsIdentity.profileUrl ? <a className={styles.primary} href={gnsIdentity.profileUrl} target="_blank" rel="noreferrer">Open public profile ↗</a> : <Link className={styles.primary} href="/app/profile">Complete profile →</Link>}
          <button className={styles.secondary} type="button" onClick={copyWallet}>{copied ? "Wallet copied" : "Copy wallet"}</button>
          <a className={styles.secondary} href="https://gwapspot.fun/" target="_blank" rel="noreferrer">Manage .gwap ↗</a>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <div><p className={styles.eyebrow}>IDENTITY SNAPSHOT</p><h2>Your GwapOS account</h2></div>
            <small>GNS source of truth</small>
          </header>
          <div className={styles.stats}>
            <div className={styles.stat}><span>.gwap</span><strong className={styles.green}>{displayName}</strong></div>
            <div className={styles.stat}><span>GwapScore</span><strong>{scoreLabel}</strong></div>
            <div className={styles.stat}><span>Identity</span><strong>{gnsIdentity.verified ? "Verified" : "Pending"}</strong></div>
            <div className={styles.stat}><span>Tier</span><strong>{gnsIdentity.isGenesis ? "Genesis" : gnsIdentity.tier || "Standard"}</strong></div>
          </div>
          <div style={{ marginTop: 14 }}><GwapScoreDisplay result={score} variant="card" /></div>
        </section>

        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <div><p className={styles.eyebrow}>CONNECTED WALLET</p><h2>Identity anchor</h2></div>
            <small>{account.walletProvider === "external" ? "External wallet" : "Embedded wallet"}</small>
          </header>
          <div className={styles.wallet}>
            <div><span>Verified Solana wallet</span><strong>{account.verifiedWallet}</strong></div>
            <button type="button" onClick={copyWallet}>{copied ? "COPIED" : "COPY"}</button>
          </div>
          <div className={styles.pipeline} style={{ marginTop: 12 }}>
            <div className={styles.pipelineRow}><span className={styles.pipelineIcon}>◎</span><div><strong>.gwap resolution</strong><small>{displayName} is mounted for this wallet.</small></div><span className={styles.pipelineState}>Live</span></div>
            <div className={styles.pipelineRow}><span className={styles.pipelineIcon}>◇</span><div><strong>GwapScore context</strong><small>Reputation travels with your GwapOS identity.</small></div><span className={styles.pipelineState}>{gnsIdentity.scoreStatus === "ready" ? "Live" : "Sync"}</span></div>
            <div className={styles.pipelineRow}><span className={styles.pipelineIcon}>✓</span><div><strong>Proof of ownership</strong><small>The wallet that authenticated this session anchors the identity.</small></div><span className={styles.pipelineState}>{gnsIdentity.verified ? "Verified" : "Pending"}</span></div>
          </div>
        </section>
      </div>

      {gnsIdentity.name ? <div className={styles.profileEditor}><GnsProfileEditor name={gnsIdentity.name} /></div> : null}
    </div>
  );
}
