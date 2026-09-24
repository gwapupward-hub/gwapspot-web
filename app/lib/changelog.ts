export type BuildLogKind =
  | "Brand"
  | "Experience"
  | "Infrastructure"
  | "Platform"
  | "Product";

export type BuildLogLink = {
  readonly label: string;
  readonly href: string;
};

export type BuildLogEntry = {
  readonly slug: string;
  readonly releasedAt: string;
  readonly kind: BuildLogKind;
  readonly status: "Live";
  readonly title: string;
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly links: readonly BuildLogLink[];
};

export type BuildLogSnapshot = {
  readonly entries: readonly BuildLogEntry[];
  readonly deployedRevision: string | null;
  readonly checkedAt: string;
  readonly source: "github-production-revision" | "static-fallback";
};

export const PUBLIC_SITE_URL = "https://www.gwapspot.com";

export const latestBuildLogEntry: BuildLogEntry = {
  slug: "harden-core-finalization-recovery",
  releasedAt: "2026-09-24T05:50:59Z",
  kind: "Infrastructure",
  status: "Live",
  title: "harden Core finalization recovery",
  summary:
    "PPV Core devnet recovery was hardened after live Phantom testing exposed a transaction-finalization gap.",
  highlights: [
    "Stopped optimistic PPV broadcasts so proof submission waits for a durable network send.",
    "Added proof-account recovery, transaction-expiry detection, and duplicate-submission protection.",
  ],
  links: [{ label: "Explore PPV", href: "/ppv" }],
};

export const buildLogEntries: readonly BuildLogEntry[] = [
  latestBuildLogEntry,
  {
    slug: "activate-gated-core-devnet-proof-actions",
    releasedAt: "2026-09-24T03:09:36Z",
    kind: "Infrastructure",
    status: "Live",
    title: "activate gated Core devnet proof actions",
    summary:
      "GWAP OS now has a server-gated, wallet-signed PPV Core proof path on Solana devnet while Commerce, Escrow, mainnet, and real-value custody stay disabled.",
    highlights: [
      "Added authenticated prepare and finalized-confirm services for proof create and revoke.",
      "Hashes evidence locally before signing so raw evidence bytes do not leave the browser.",
    ],
    links: [{ label: "Explore PPV", href: "/ppv" }],
  },
  {
    slug: "ecosystem-layers-and-shareable-lookups",
    releasedAt: "2026-08-09T21:18:04Z",
    kind: "Product",
    status: "Live",
    title: "Ecosystem layers and shareable lookups",
    summary:
      "GWAP Infrastructure and GWAP Experiences now read as two connected layers, while successful wallet and .gwap lookups can travel as reusable links.",
    highlights: [
      "Organized all eight products without changing their routes or status.",
      "Added native sharing, clipboard fallback, and deep-link replay.",
      "Applied the same ecosystem model to the homepage and full directory.",
    ],
    links: [
      { label: "Explore ecosystem", href: "/ecosystem" },
      { label: "Try a lookup", href: "/#top" },
    ],
  },
  {
    slug: "homepage-wallet-and-name-utility",
    releasedAt: "2026-08-09T20:27:09Z",
    kind: "Product",
    status: "Live",
    title: "Homepage wallet and .gwap utility",
    summary:
      "The homepage became a working product entry point with no-signup wallet intelligence and .gwap name checks inside a compact Liquid Glass module.",
    highlights: [
      "Added strict server-side validation and distributed rate limiting.",
      "Made public lookups resilient to bounded GNS cold starts.",
      "Rendered real metric values in the initial server response.",
    ],
    links: [{ label: "Try it live", href: "/#top" }],
  },
  {
    slug: "new-social-sharing-artwork",
    releasedAt: "2026-08-09T07:53:14Z",
    kind: "Brand",
    status: "Live",
    title: "New social sharing artwork",
    summary:
      "Shared GWAPSpot links now use the official crown and wordmark in a platform-ready 1200×630 preview card.",
    highlights: [
      "Preserved the complete crown and lettering from the supplied artwork.",
      "Updated both Open Graph and X/Twitter presentation.",
    ],
    links: [{ label: "Visit GWAPSpot", href: "/" }],
  },
  {
    slug: "cinematic-page-transitions",
    releasedAt: "2026-08-09T07:21:58Z",
    kind: "Experience",
    status: "Live",
    title: "Cinematic page transitions",
    summary:
      "Navigation now carries a longer, branded GWAP transition with clearer depth, progress, and reveal timing.",
    highlights: [
      "Staged the GWAP, OCCO, and GNS marks as one transition lockup.",
      "Kept the reduced-motion path fast and accessible.",
    ],
    links: [{ label: "Explore the site", href: "/ecosystem" }],
  },
  {
    slug: "enter-tha-gwapspot-splash",
    releasedAt: "2026-08-09T06:38:43Z",
    kind: "Experience",
    status: "Live",
    title: "Enter Tha GwapSpot splash experience",
    summary:
      "The opening animation now fills every screen, holds the cinematic moment, and reveals an intentional entry control after 2.75 seconds.",
    highlights: [
      "Centered the official artwork across wide and narrow displays.",
      "Preserved session-only behavior and safe-area support.",
    ],
    links: [{ label: "Enter GWAPSpot", href: "/" }],
  },
  {
    slug: "gwap-os-entry-and-wallet-handoff",
    releasedAt: "2026-08-09T04:27:36Z",
    kind: "Platform",
    status: "Live",
    title: "Faster GWAP OS entry and wallet handoff",
    summary:
      "GWAP OS is easier to find, the center emblem opens it directly, and a completed wallet sign-in now continues into the authenticated workspace.",
    highlights: [
      "Added prominent desktop and mobile OS entry points.",
      "Added Back and GWAPSpot home controls to wallet sign-in.",
      "Preserved server-sanitized redirects and protected-route guards.",
    ],
    links: [{ label: "Open GWAP OS", href: "/app" }],
  },
  {
    slug: "gns-registration-inside-gwap-os",
    releasedAt: "2026-08-09T03:36:35Z",
    kind: "Infrastructure",
    status: "Live",
    title: "GNS registration inside GWAP OS",
    summary:
      "Authenticated users can start the canonical GNS registration flow from System Initialization without leaving the operating system.",
    highlights: [
      "Supports external and embedded Solana wallets.",
      "Pins cluster, program, and treasury configuration server-side.",
      "Resumes interrupted registry sync without charging twice.",
    ],
    links: [{ label: "Open identity", href: "/app/identity" }],
  },
  {
    slug: "gwap-os-identity-runtime",
    releasedAt: "2026-08-09T02:11:24Z",
    kind: "Platform",
    status: "Live",
    title: "GWAP OS identity runtime",
    summary:
      "The authenticated product moved from a conventional dashboard to an identity-first terminal workspace powered by GNS and GwapScore signals.",
    highlights: [
      "Added GNS reverse resolution with graceful limited mode.",
      "Added a command palette, app dock, wallet balance, and boot sequence.",
      "Kept Marketplace and PPV write surfaces fail-closed until their services are mounted.",
    ],
    links: [{ label: "Launch GWAP OS", href: "/app" }],
  },
];

const publicDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

const publicTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

const publicDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});

export function formatBuildLogDate(releasedAt: string) {
  return publicDateFormatter.format(new Date(releasedAt));
}

export function formatBuildLogTime(releasedAt: string) {
  return publicTimeFormatter.format(new Date(releasedAt));
}

export function formatBuildLogDay(releasedAt: string) {
  return publicDayFormatter.format(new Date(releasedAt));
}

export function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
}

export function renderBuildLogRss(
  entries: readonly BuildLogEntry[] = buildLogEntries,
) {
  const items = entries
    .map((entry) => {
      const itemUrl = `${PUBLIC_SITE_URL}/changelog#${entry.slug}`;
      const description = [entry.summary, ...entry.highlights].join(" ");

      return `    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(itemUrl)}</link>
      <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
      <pubDate>${new Date(entry.releasedAt).toUTCString()}</pubDate>
      <category>${escapeXml(entry.kind)}</category>
      <description>${escapeXml(description)}</description>
    </item>`;
    })
    .join("\n");

  const latestDate = entries[0]?.releasedAt ?? new Date(0).toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GWAP Build Log</title>
    <link>${PUBLIC_SITE_URL}/changelog</link>
    <description>Verified GWAP product releases and production improvements.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(latestDate).toUTCString()}</lastBuildDate>
    <atom:link href="${PUBLIC_SITE_URL}/changelog/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
