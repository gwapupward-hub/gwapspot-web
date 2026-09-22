"use client";

import Link from "next/link";
import { useGwapOs } from "../components/os-provider";
import styles from "./apps.module.css";

type AppCard = {
  href: string;
  name: string;
  note: string;
  icon: string;
  state: string;
  detail: string;
  muted?: boolean;
};

export default function AppsPage() {
  const { gnsIdentity, state } = useGwapOs();

  const scoreState = gnsIdentity.scoreStatus === "scored" && gnsIdentity.score !== null
    ? String(gnsIdentity.score)
    : gnsIdentity.scoreStatus === "unscored"
      ? "Unscored"
      : "Unavailable";

  const apps: AppCard[] = [
    {
      href: "/app/identity",
      name: "GNS Identity",
      note: ".gwap identity, wallet profile and account context",
      icon: "◎",
      state: gnsIdentity.fullName || "Wallet only",
      detail: gnsIdentity.status === "found" ? "Primary identity" : "Claim .gwap",
    },
    {
      href: "/app/score",
      name: "GwapScore",
      note: "Reputation and trust signals attached to your identity",
      icon: "↗",
      state: scoreState,
      detail: gnsIdentity.scoreTier || "Score context",
    },
    {
      href: "/app/ppv",
      name: "Private Proof Vault",
      note: "Proofs, exact-version agreements, test escrow and verified activity",
      icon: "◇",
      state: "Staged",
      detail: "Devnet · fail closed",
    },
    {
      href: "/app/ideas",
      name: "Daily Ideas 2.0",
      note: "Discover, save, develop, validate, build and launch",
      icon: "✦",
      state: `${state.ideas.length} saved`,
      detail: `${state.ideaProjects.length} projects`,
    },
    {
      href: "/app/marketplace",
      name: "Marketplace",
      note: "Identity-aware work, services and ecosystem commerce",
      icon: "▤",
      state: `${state.marketplaceIntents.length} requests`,
      detail: "Workspace",
    },
    {
      href: "/app/trust",
      name: "Trust Graph",
      note: "Relationships and identity-aware trust context",
      icon: "⌘",
      state: "Explore",
      detail: "Relationships",
    },
    {
      href: "/app/browser",
      name: "Gwap Browser",
      note: "Discover and open projects built with GWAP by exact .gwap address or keyword",
      icon: "⌕",
      state: "In development",
      detail: "Resolve · discover",
    },
    {
      href: "/app/developer",
      name: "Developer",
      note: "GWAP integration and developer tools",
      icon: "{}",
      state: "Tools",
      detail: "Integrate",
      muted: true,
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Apps</p>
          <h1>Your GwapOS tools</h1>
          <p>See useful state before opening a product.</p>
        </div>
        <span className={styles.count}>{apps.length} available</span>
      </header>

      <p className={styles.sectionLabel}>Installed in GwapOS</p>
      <section className={styles.grid} aria-label="GwapOS apps">
        {apps.map((app) => (
          <Link
            className={`${styles.card} ${app.muted ? styles.muted : ""}`}
            href={app.href}
            key={app.href}
          >
            <span className={styles.icon} aria-hidden="true">{app.icon}</span>
            <div className={styles.body}>
              <h2>{app.name}</h2>
              <p>{app.note}</p>
            </div>
            <div className={styles.state}>
              <strong>{app.state}</strong>
              <small>{app.detail}</small>
            </div>
          </Link>
        ))}
      </section>

      <p className={styles.note}>
        Apps are part of the operating layer, not external product links. Their cards surface account-aware context where GwapOS already has reliable state.
      </p>
    </div>
  );
}
