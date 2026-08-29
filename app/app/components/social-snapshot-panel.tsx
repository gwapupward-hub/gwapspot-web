"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";

type MetricValue =
  | { state: "observed"; value: number }
  | { state: "unavailable"; reason: string };

type SnapshotMetric =
  | "followers"
  | "following"
  | "lifetimePosts"
  | "recentPosts"
  | "likes"
  | "replies"
  | "reposts"
  | "quotes"
  | "impressions";

type Snapshot = {
  snapshotId: string;
  socialHandle: string;
  collectedAt: string;
  metrics: Record<SnapshotMetric, MetricValue>;
  window: { hours: number; postCount: number } | null;
  collection: { status: "ok" | "partial" | "failed"; diagnostic: string | null };
};

type MetricSeries = {
  metric: SnapshotMetric;
  latestValue: number | null;
  delta: number | null;
  unavailableCount: number;
};

type SnapshotPayload = {
  config: {
    enabled: boolean;
    cadenceHours: number;
    engagementWindowHours: number;
    retentionSnapshots: number;
    retentionDays: number;
    scoreImpact: "none";
  };
  verification: { status: string; socialHandle: string; verifiedAt: string | null } | null;
  subject: { socialHandle: string; nextSnapshotAt: string; lastSnapshotAt: string | null } | null;
  latest: Snapshot | null;
  series: MetricSeries[];
  page: { total: number };
};

const METRIC_LABELS: Record<SnapshotMetric, string> = {
  followers: "Followers",
  following: "Following",
  lifetimePosts: "Lifetime posts",
  recentPosts: "Posts in window",
  likes: "Likes in window",
  replies: "Replies in window",
  reposts: "Reposts in window",
  quotes: "Quotes in window",
  impressions: "Impressions",
};

const METRIC_ORDER: SnapshotMetric[] = [
  "followers",
  "following",
  "lifetimePosts",
  "recentPosts",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "impressions",
];

const UNAVAILABLE_LABELS: Record<string, string> = {
  not_authorized: "Not available — GWAP's X access cannot read this metric",
  not_returned: "Not available — X did not return this metric",
  rate_limited: "Not available — X rate-limited this collection",
  source_error: "Not available — X could not be read",
  no_posts_in_window: "Not available — no posts in the window",
};

function unavailableLabel(reason: string) {
  return UNAVAILABLE_LABELS[reason] || "Not available";
}

function formatDelta(delta: number | null) {
  if (delta === null) return null;
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`;
}

export function SocialSnapshotPanel() {
  const { getAccessToken } = usePrivy();
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch("/api/gwapscore/snapshots", {
      cache: "no-store",
      credentials: "same-origin",
      headers,
    });
    if (!response.ok) throw new Error("Snapshot history unavailable");
    setPayload((await response.json()) as SnapshotPayload);
    setUnavailable(false);
  }, [getAccessToken]);

  useEffect(() => {
    let active = true;
    const initial = window.setTimeout(() => {
      void load().catch(() => {
        if (active) setUnavailable(true);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initial);
    };
  }, [load]);

  if (unavailable) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-snapshots">
        <span className="os-terminal-label">GWAPSCORE SNAPSHOTS</span>
        <h2>Snapshot history is temporarily unavailable.</h2>
        <p>This infrastructure state does not reduce your Trust Coverage or GwapScore.</p>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-snapshots" role="status">
        <span className="os-terminal-label">GWAPSCORE SNAPSHOTS</span>
        <h2>Loading snapshot history…</h2>
      </section>
    );
  }

  const { config, verification, subject, latest, series, page } = payload;
  const evidenceNote = (
    <p>
      Snapshots are evidence collection only. They record what your verified account has
      demonstrated over time and <strong>do not change your GwapScore</strong>.
    </p>
  );

  if (verification?.status !== "verified") {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-snapshots">
        <span className="os-terminal-label">GWAPSCORE SNAPSHOTS · WAITING ON PROOF</span>
        <h2>Verify an account before GWAP can observe it.</h2>
        <p>
          Proof of Control establishes that you hold the account. Snapshots then record what that
          account demonstrates over time. Nothing is collected from an unverified account.
        </p>
        <div className="os-inline-actions">
          <a href="#social-verification">Verify your X account →</a>
        </div>
        {evidenceNote}
      </section>
    );
  }

  if (!config.enabled) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-snapshots">
        <span className="os-terminal-label">GWAPSCORE SNAPSHOTS · STAGED</span>
        <h2>Snapshot collection is built and waiting to be enabled.</h2>
        <p>
          @{verification.socialHandle} is verified, so it is eligible for observation. Scheduled
          collection starts once the snapshot worker is switched on for this environment.
        </p>
        {evidenceNote}
      </section>
    );
  }

  if (!latest) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-snapshots">
        <span className="os-terminal-label">GWAPSCORE SNAPSHOTS · SCHEDULED</span>
        <h2>First snapshot of @{verification.socialHandle} has not been collected yet.</h2>
        <p>
          GWAP observes verified accounts every {config.cadenceHours} hours over a{" "}
          {Math.round(config.engagementWindowHours / 24)}-day engagement window.
          {subject?.nextSnapshotAt
            ? ` Next collection is due ${new Date(subject.nextSnapshotAt).toLocaleString()}.`
            : ""}
        </p>
        {evidenceNote}
      </section>
    );
  }

  const seriesByMetric = new Map(series.map((entry) => [entry.metric, entry]));

  return (
    <section className="os-runtime-panel os-runtime-note" id="social-snapshots">
      <span className="os-terminal-label">
        GWAPSCORE SNAPSHOTS · {page.total} COLLECTED
      </span>
      <h2>What @{latest.socialHandle} has demonstrated over time.</h2>
      <p>
        Latest observation {new Date(latest.collectedAt).toLocaleString()} ·{" "}
        {latest.collection.status === "ok"
          ? "complete"
          : latest.collection.status === "partial"
            ? "partial — X returned only some of this account's public data"
            : "failed — X could not be read for this slot"}
        . Engagement is summed over the last {Math.round(config.engagementWindowHours / 24)} days.
      </p>

      <div className="os-identity-console">
        <div className="os-console-chrome">
          <span>gwapscore.snapshot.read</span>
          <span>EVERY {config.cadenceHours}H</span>
        </div>
        <dl>
          {METRIC_ORDER.map((metric) => {
            const value = latest.metrics[metric];
            const entry = seriesByMetric.get(metric);
            const delta = formatDelta(entry?.delta ?? null);
            return (
              <div key={metric}>
                <dt>{METRIC_LABELS[metric]}</dt>
                <dd>
                  {value.state === "observed" ? (
                    <>
                      {value.value.toLocaleString()}
                      {delta ? <small> ({delta} since first snapshot)</small> : null}
                    </>
                  ) : (
                    <em>{unavailableLabel(value.reason)}</em>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <p>
        Retained for up to {config.retentionSnapshots} snapshots ({config.retentionDays} days).
        Metrics GWAP could not read are recorded as unavailable, never as zero, so missing evidence
        is never mistaken for bad reputation.
      </p>
      {evidenceNote}
    </section>
  );
}
