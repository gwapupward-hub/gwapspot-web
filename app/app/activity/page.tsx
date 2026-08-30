"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ecosystemProducts } from "../../lib/ecosystem";
import { useGwapOs } from "../components/os-provider";
import { readWalletActivity, subscribeWalletActivity, type WalletActivityRecord } from "../lib/wallet-activity";
import { shortenWalletAddress } from "../lib/wallet-format";
import styles from "./activity.module.css";

type ActivityFilter = "all" | "wallet" | "identity" | "apps" | "ideas" | "work";
type ActivityEvent = {
  id: string;
  category: Exclude<ActivityFilter, "all">;
  icon: string;
  title: string;
  detail: string;
  label: string;
  timestamp: string | null;
  href?: string;
};

const filters: Array<{ key: ActivityFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "wallet", label: "Wallet" },
  { key: "identity", label: "Identity" },
  { key: "apps", label: "Apps" },
  { key: "ideas", label: "Ideas" },
  { key: "work", label: "Work" },
];

function formatTime(value: string | null) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function signatureLabel(signature: string) {
  return signature.length > 16 ? `${signature.slice(0, 7)}…${signature.slice(-7)}` : signature;
}

export default function ActivityPage() {
  const { account, gnsIdentity, state, syncStatus } = useGwapOs();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [walletActivity, setWalletActivity] = useState<WalletActivityRecord[]>([]);

  useEffect(() => {
    const refresh = () => setWalletActivity(readWalletActivity());
    refresh();
    return subscribeWalletActivity(refresh);
  }, []);

  const events = useMemo<ActivityEvent[]>(() => {
    const items: ActivityEvent[] = [
      {
        id: "wallet-session",
        category: "identity",
        icon: "✓",
        title: "Wallet authenticated",
        detail: shortenWalletAddress(account.verifiedWallet),
        label: "Wallet",
        timestamp: null,
      },
    ];

    walletActivity.forEach((record) => {
      items.push({
        id: `wallet-${record.signature}`,
        category: "wallet",
        icon: "↗",
        title: `Sent ${record.amountSol} SOL`,
        detail: `To ${record.recipientLabel} · ${signatureLabel(record.signature)}`,
        label: "Confirmed",
        timestamp: record.createdAt,
      });
    });

    if (gnsIdentity.status === "found") {
      items.push({
        id: "gns-identity",
        category: "identity",
        icon: "◎",
        title: gnsIdentity.fullName || "Primary .gwap identity",
        detail: "Primary GwapOS identity resolved",
        label: "Identity",
        timestamp: gnsIdentity.updatedAt,
        href: "/app/identity",
      });
    }

    if (state.profile.updatedAt) {
      items.push({
        id: "profile-update",
        category: "identity",
        icon: "◇",
        title: "GwapOS profile updated",
        detail: state.profile.displayName || state.profile.handle || "Profile saved",
        label: "Profile",
        timestamp: state.profile.updatedAt,
        href: "/app/identity",
      });
    }

    state.recent.forEach((item) => {
      const product = ecosystemProducts.find((entry) => entry.slug === item.slug);
      items.push({
        id: `app-${item.slug}-${item.openedAt}`,
        category: "apps",
        icon: "✦",
        title: product?.name || item.slug,
        detail: "Opened in GwapOS",
        label: "App",
        timestamp: item.openedAt,
        href: product?.internalUrl || "/app/apps",
      });
    });

    state.ideas.forEach((idea) => {
      items.push({
        id: `idea-${idea.id}`,
        category: "ideas",
        icon: "✧",
        title: idea.title,
        detail: `${idea.category.toUpperCase()} · ${idea.difficulty}`,
        label: "Saved",
        timestamp: idea.savedAt,
        href: "/app/ideas",
      });
    });

    state.ideaProjects.forEach((project) => {
      items.push({
        id: `project-${project.id}`,
        category: "work",
        icon: "◆",
        title: project.title,
        detail: `Project · ${project.status}`,
        label: "Project",
        timestamp: project.updatedAt,
        href: "/app/ideas/lab",
      });
    });

    state.marketplaceIntents.forEach((intent) => {
      items.push({
        id: `intent-${intent.id}`,
        category: "work",
        icon: "↗",
        title: `${intent.role[0].toUpperCase()}${intent.role.slice(1)} request`,
        detail: `Marketplace · ${intent.status}`,
        label: "Work",
        timestamp: intent.updatedAt,
        href: "/app/marketplace",
      });
    });

    return items.sort((a, b) => {
      if (!a.timestamp) return -1;
      if (!b.timestamp) return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [account.verifiedWallet, gnsIdentity, state, walletActivity]);

  const visibleEvents = filter === "all" ? events : events.filter((event) => event.category === filter);
  const nonSessionEvents = events.filter((event) => event.id !== "wallet-session");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Activity</p>
          <h1>Your GwapOS timeline</h1>
          <p>Wallet, identity, apps, ideas and work in one place.</p>
        </div>
        <span className={styles.sync}>{syncStatus}</span>
      </header>

      <section className={styles.summary} aria-label="Activity summary">
        <div className={styles.summaryCard}>
          <span>Events</span>
          <strong>{nonSessionEvents.length}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>Identity</span>
          <strong className={styles.green}>{gnsIdentity.status === "found" ? gnsIdentity.fullName : "Wallet"}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>Confirmed sends</span>
          <strong>{walletActivity.length}</strong>
        </div>
      </section>

      <nav className={styles.filters} aria-label="Filter activity">
        {filters.map((item) => (
          <button
            className={`${styles.filter} ${filter === item.key ? styles.filterActive : ""}`}
            key={item.key}
            onClick={() => setFilter(item.key)}
            type="button"
            aria-pressed={filter === item.key}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className={styles.timeline} aria-label="GwapOS activity timeline">
        {visibleEvents.map((event) => {
          const content = (
            <>
              <span className={styles.icon} aria-hidden="true">{event.icon}</span>
              <div className={styles.body}>
                <p>{event.title}</p>
                <small>{event.detail}</small>
              </div>
              <div className={styles.meta}>
                <strong>{event.label}</strong>
                <time>{formatTime(event.timestamp)}</time>
              </div>
            </>
          );

          return event.href ? (
            <Link className={styles.row} href={event.href} key={event.id}>{content}</Link>
          ) : (
            <div className={styles.row} key={event.id}>{content}</div>
          );
        })}

        {!visibleEvents.length ? (
          <div className={styles.empty}>
            <strong>No activity in this category yet.</strong>
            <p>Confirmed sends are cached on this device after Solana confirmation. GwapOS does not invent pending or failed wallet history.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
