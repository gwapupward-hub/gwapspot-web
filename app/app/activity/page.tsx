"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PpvVerifiedActivity } from "../../components/ppv/ppv-verified-activity";
import { ecosystemProducts } from "../../lib/ecosystem";
import { useGwapOs } from "../components/os-provider";
import {
  readWalletActivity,
  subscribeWalletActivity,
  type WalletActivityRecord,
} from "../lib/wallet-activity";
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
  { key: "all", label: "All progress" },
  { key: "wallet", label: "Wallet context" },
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
  return signature.length > 16
    ? `${signature.slice(0, 7)}…${signature.slice(-7)}`
    : signature;
}

export default function ActivityPage() {
  const { account, gnsIdentity, state, syncStatus } = useGwapOs();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [walletActivity, setWalletActivity] = useState<WalletActivityRecord[]>([]);

  useEffect(() => {
    const refresh = () =>
      setWalletActivity(readWalletActivity(account.verifiedWallet));
    refresh();
    return subscribeWalletActivity(refresh);
  }, [account.verifiedWallet]);

  const privateEvents = useMemo<ActivityEvent[]>(() => {
    const items: ActivityEvent[] = [
      {
        id: "wallet-session",
        category: "identity",
        icon: "✓",
        title: "Current session authenticated",
        detail: `${shortenWalletAddress(account.verifiedWallet)} · session context only`,
        label: "Session",
        timestamp: null,
      },
    ];

    walletActivity.forEach((record) => {
      items.push({
        id: `wallet-${record.signature}`,
        category: "wallet",
        icon: "↗",
        title: `Sent ${record.amountSol} SOL`,
        detail: `Device-cached confirmation · ${record.recipientLabel} · ${signatureLabel(record.signature)}`,
        label: "Local",
        timestamp: record.createdAt,
      });
    });

    if (gnsIdentity.status === "found") {
      items.push({
        id: "gns-identity",
        category: "identity",
        icon: "◎",
        title: gnsIdentity.fullName || "Primary .gwap identity",
        detail: "Current identity context loaded into GWAP OS",
        label: "Context",
        timestamp: gnsIdentity.updatedAt,
        href: "/app/identity",
      });
    }

    if (state.profile.updatedAt) {
      items.push({
        id: "profile-update",
        category: "identity",
        icon: "◇",
        title: "Profile updated",
        detail:
          state.profile.displayName || state.profile.handle || "Profile saved",
        label: "Private",
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
        detail: "Opened in GWAP OS · resume context",
        label: "Private",
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
        label: "Private",
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
        label: "Private",
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
        label: "Private",
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

  const visibleEvents =
    filter === "all"
      ? privateEvents
      : privateEvents.filter((event) => event.category === filter);
  const nonSessionEvents = privateEvents.filter(
    (event) => event.id !== "wallet-session",
  );
  const profileHref =
    gnsIdentity.status === "found" && gnsIdentity.name
      ? `/profile/${encodeURIComponent(gnsIdentity.name)}`
      : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Verified Activity</p>
          <h1>Evidence first. Progress second.</h1>
          <p>
            GWAP separates facts it can verify from private activity that helps
            you keep moving.
          </p>
        </div>
        <span className={styles.sync}>{syncStatus}</span>
      </header>

      <section className={styles.summary} aria-label="Activity model">
        <div className={styles.summaryCard}>
          <span>Trust identity</span>
          <strong className={styles.green}>
            {gnsIdentity.status === "found"
              ? gnsIdentity.fullName
              : "Not established"}
          </strong>
        </div>
        <div className={styles.summaryCard}>
          <span>Evidence source</span>
          <strong>PPV receipts</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>Private progress</span>
          <strong>{nonSessionEvents.length}</strong>
        </div>
      </section>

      <section className={styles.evidenceIntro} aria-labelledby="verified-evidence-title">
        <div>
          <p className={styles.kicker}>Verified Evidence</p>
          <h2 id="verified-evidence-title">What GWAP can actually prove</h2>
          <p>
            This layer is limited to identity-bound PPV records that pass the
            existing attribution and environment checks. A receipt proves a
            recorded event; it does not guarantee future behavior.
          </p>
        </div>
        {profileHref ? (
          <Link className={styles.profileLink} href={profileHref}>
            Open public trust profile →
          </Link>
        ) : (
          <Link className={styles.profileLink} href="/app/identity">
            Establish public identity →
          </Link>
        )}
      </section>

      <div className={styles.verifiedShell}>
        <PpvVerifiedActivity
          wallet={account.verifiedWallet}
          domain={
            gnsIdentity.status === "found"
              ? gnsIdentity.name || undefined
              : undefined
          }
          title="Verified evidence feed"
          receiptHref={(id) => `/app/vault/receipts/${id}`}
        />
      </div>

      <section className={styles.privateSection} aria-labelledby="private-progress-title">
        <div className={styles.privateHeading}>
          <div>
            <p className={styles.kicker}>Private Progress</p>
            <h2 id="private-progress-title">Useful history, not trust evidence</h2>
            <p>
              App opens, saved ideas, project state, profile edits, and local
              wallet history help you resume work. They are not presented as
              reputation evidence merely because they happened inside GWAP OS.
            </p>
          </div>
          <span className={styles.privateBadge}>Private / contextual</span>
        </div>

        <nav className={styles.filters} aria-label="Filter private progress">
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

        <section className={styles.timeline} aria-label="Private GWAP OS progress">
          {visibleEvents.map((event) => {
            const content = (
              <>
                <span className={styles.icon} aria-hidden="true">
                  {event.icon}
                </span>
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
              <Link className={styles.row} href={event.href} key={event.id}>
                {content}
              </Link>
            ) : (
              <div className={styles.row} key={event.id}>
                {content}
              </div>
            );
          })}

          {!visibleEvents.length ? (
            <div className={styles.empty}>
              <strong>No private progress in this category yet.</strong>
              <p>
                GWAP OS keeps this section separate from verified evidence so
                routine product activity cannot masquerade as reputation.
              </p>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
