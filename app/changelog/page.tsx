import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  SparkIcon,
} from "../components/site-shell";
import { getBuildLogSnapshot } from "../lib/changelog-live.server";
import { PUBLIC_SITE_URL } from "../lib/changelog";
import { createPageMetadata } from "../lib/metadata";
import { LiveBuildLog } from "./live-build-log";

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

export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  const snapshot = await getBuildLogSnapshot();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "GWAP Build Log",
    description: pageMetadata.description,
    url: `${PUBLIC_SITE_URL}/changelog`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: snapshot.entries.length,
      itemListElement: snapshot.entries.map((entry, index) => ({
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

      <LiveBuildLog initialSnapshot={snapshot} />

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
