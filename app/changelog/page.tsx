import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  SparkIcon,
} from "../components/site-shell";
import {
  PUBLIC_SITE_URL,
  buildLogEntries,
  formatBuildLogDate,
  formatBuildLogDay,
  formatBuildLogTime,
} from "../lib/changelog";
import { createPageMetadata } from "../lib/metadata";

const pageMetadata = createPageMetadata({
  title: "Build Log",
  description:
    "Follow verified GWAP product releases, infrastructure improvements, and production updates.",
  path: "/changelog",
  socialTitle: "GWAP Build Log | Shipped in public",
});

export const metadata: Metadata = {
  ...pageMetadata,
  alternates: {
    canonical: "/changelog",
    types: { "application/rss+xml": "/changelog/feed.xml" },
  },
};

const latestEntry = buildLogEntries[0];
const workstreamCount = new Set(buildLogEntries.map((entry) => entry.kind)).size;

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "GWAP Build Log",
  description: pageMetadata.description,
  url: `${PUBLIC_SITE_URL}/changelog`,
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: buildLogEntries.length,
    itemListElement: buildLogEntries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "CreativeWork",
        name: entry.title,
        description: entry.summary,
        datePublished: entry.releasedAt,
        url: `${PUBLIC_SITE_URL}/changelog#${entry.slug}`,
      },
    })),
  },
};

export default function ChangelogPage() {
  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />

      <PageHero
        eyebrow="Build log"
        title="Proof over promises."
        description="A public record of what GWAP ships, improves, and verifies in production. Roadmaps show direction; this page shows receipts."
      >
        <Link className="primary-button" href="/roadmap">
          View the roadmap <ArrowIcon />
        </Link>
        <a className="secondary-button" href="/changelog/feed.xml">
          Follow via RSS <ArrowIcon />
        </a>
      </PageHero>

      <section className="inner-section directory-summary build-log-summary" aria-label="Build log summary">
        <div className="summary-stat">
          <span>VERIFIED RELEASES</span>
          <strong>{String(buildLogEntries.length).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>LATEST SHIP</span>
          <strong>{formatBuildLogDay(latestEntry.releasedAt)}</strong>
        </div>
        <div className="summary-stat">
          <span>WORKSTREAMS</span>
          <strong>{String(workstreamCount).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>DELIVERY STATUS</span>
          <strong>LIVE</strong>
        </div>
      </section>

      <section className="inner-section build-log-section" aria-labelledby="release-history-heading">
        <div className="inner-section-heading build-log-heading">
          <span className="eyebrow">
            <SparkIcon /> Release history
          </span>
          <h2 id="release-history-heading">Built in public. Verified in production.</h2>
          <p>
            Every entry below represents merged, deployed work. Click an entry&apos;s
            hash to get a direct link you can share.
          </p>
        </div>

        <ol className="build-log-timeline">
          {buildLogEntries.map((entry) => (
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

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> What comes next
            </span>
            <h2>Follow the plan. Check the proof.</h2>
            <p>
              The roadmap explains where the ecosystem is going. The build log
              records what actually reaches production.
            </p>
          </div>
          <Link className="primary-button" href="/roadmap">
            Explore the roadmap <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
