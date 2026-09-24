"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowIcon, SparkIcon } from "../components/site-shell";
import {
  formatBuildLogDate,
  formatBuildLogDay,
  formatBuildLogTime,
  type BuildLogEntry,
  type BuildLogSnapshot,
} from "../lib/changelog";

const POLL_MS = 15_000;

export function LiveBuildLog({
  initialSnapshot,
}: {
  initialSnapshot: BuildLogSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [syncState, setSyncState] = useState<"live" | "refreshing" | "degraded">(
    initialSnapshot.source === "static-fallback" ? "degraded" : "live",
  );

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const refresh = async () => {
      if (cancelled || document.visibilityState !== "visible") {
        timer = window.setTimeout(refresh, POLL_MS);
        return;
      }

      setSyncState((current) => (current === "degraded" ? current : "refreshing"));
      try {
        const response = await fetch("/api/changelog/live", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("BUILD_LOG_SYNC_FAILED");
        const next = (await response.json()) as BuildLogSnapshot;
        if (!cancelled) {
          setSnapshot(next);
          setSyncState(next.source === "static-fallback" ? "degraded" : "live");
        }
      } catch {
        if (!cancelled) setSyncState("degraded");
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, POLL_MS);
      }
    };

    timer = window.setTimeout(refresh, POLL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const entries = snapshot.entries;
  const latestEntry = entries[0];
  const workstreamCount = useMemo(
    () => new Set(entries.map((entry) => entry.kind)).size,
    [entries],
  );

  return (
    <>
      <section
        className="inner-section directory-summary build-log-summary"
        aria-label="Build log summary"
      >
        <div className="summary-stat">
          <span>VERIFIED RELEASES</span>
          <strong>{String(entries.length).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>LATEST SHIP</span>
          <strong>{latestEntry ? formatBuildLogDay(latestEntry.releasedAt) : "—"}</strong>
        </div>
        <div className="summary-stat">
          <span>WORKSTREAMS</span>
          <strong>{String(workstreamCount).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>LIVE SYNC</span>
          <strong className={`build-log-sync-state build-log-sync-state--${syncState}`}>
            {syncState === "refreshing"
              ? "SYNCING"
              : syncState === "degraded"
                ? "FALLBACK"
                : "LIVE"}
          </strong>
        </div>
      </section>

      <section
        className="inner-section build-log-section"
        aria-labelledby="release-history-heading"
      >
        <div className="inner-section-heading build-log-heading">
          <span className="eyebrow">
            <SparkIcon /> Release history
          </span>
          <h2 id="release-history-heading">Built in public. Verified in production.</h2>
          <p>
            The newest production merges are synchronized automatically from the
            deployed GitHub revision. This page checks for a newer live release
            every 15 seconds while it is open.
          </p>
          <div className="build-log-live-meta" aria-live="polite">
            <span>
              <i aria-hidden="true" />
              {snapshot.source === "github-production-revision"
                ? "Production revision connected"
                : "Static fallback active"}
            </span>
            {snapshot.deployedRevision ? (
              <code>{snapshot.deployedRevision.slice(0, 7)}</code>
            ) : null}
          </div>
        </div>

        <ol className="build-log-timeline">
          {entries.map((entry: BuildLogEntry) => (
            <li className="build-log-entry" id={entry.slug} key={entry.slug}>
              <div className="build-log-date">
                <time dateTime={entry.releasedAt}>
                  <span>{formatBuildLogDate(entry.releasedAt)}</span>
                  <small>{formatBuildLogTime(entry.releasedAt)}</small>
                </time>
                <i aria-hidden="true" />
              </div>

              <article className={`build-log-card build-log-card--${entry.kind.toLowerCase()}`}>
                <div className="build-log-card-glow" aria-hidden="true" />
                <header className="build-log-card-header">
                  <div className="build-log-meta">
                    <span>{entry.kind}</span>
                    <small><i /> {entry.status}</small>
                  </div>
                  <a
                    className="build-log-permalink"
                    href={`#${entry.slug}`}
                    aria-label={`Direct link to ${entry.title}`}
                  >
                    #
                  </a>
                </header>

                <h3>{entry.title}</h3>
                <p>{entry.summary}</p>

                <ul className="build-log-highlights">
                  {entry.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>

                <footer className="build-log-links">
                  {entry.links.map((link) => (
                    <Link href={link.href} key={`${entry.slug}-${link.href}`}>
                      {link.label} <ArrowIcon />
                    </Link>
                  ))}
                </footer>
              </article>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
