import type { NextConfig } from "next";

const commonSecurityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const websiteFrameProtection = [
  { key: "X-Frame-Options", value: "DENY" },
];

const telegramFrameProtection = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  },
];

const gwapAppOrigin = "https://app.gwapspot.com";
const gwapPublicHosts = ["gwapspot.com", "www.gwapspot.com"];
const gwapAppOwnedRoutes = [
  { source: "/app", destination: "/app" },
  { source: "/app/:path*", destination: "/app/:path*" },
  { source: "/sign-in", destination: "/sign-in" },
  { source: "/sign-in/:path*", destination: "/sign-in/:path*" },
  { source: "/refresh", destination: "/refresh" },
  { source: "/os-entry", destination: "/os-entry" },
  { source: "/os-entry/:path*", destination: "/os-entry/:path*" },
  { source: "/os-sign-in", destination: "/os-sign-in" },
  { source: "/os-sign-in/:path*", destination: "/os-sign-in/:path*" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      ...gwapPublicHosts.flatMap((host) =>
        gwapAppOwnedRoutes.map(({ source, destination }) => ({
          source,
          has: [{ type: "host" as const, value: host }],
          destination: `${gwapAppOrigin}${destination}`,
          permanent: true,
        })),
      ),
      {
        source: "/:path*",
        has: [{ type: "host", value: "gwapspot.com" }],
        destination: "https://www.gwapspot.com/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/logos/gns.png", destination: "/logos/gns.webp" },
      { source: "/logos/occo.png", destination: "/logos/occo.webp" },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: commonSecurityHeaders },
      { source: "/", headers: websiteFrameProtection },
      { source: "/:path((?!telegram(?:/|$)).*)", headers: websiteFrameProtection },
      { source: "/telegram", headers: telegramFrameProtection },
      { source: "/telegram/:path*", headers: telegramFrameProtection },
      // Brand artwork lives at unversioned paths, so it must stay revalidatable
      // rather than `immutable`. A 30 day fresh window with a one year
      // stale-while-revalidate serves repeat views from cache immediately while
      // still letting an updated asset roll out on the next background fetch.
      ...[
        "/logos/:path*",
        "/brand/:path*",
        "/gwap-splash.webp",
        "/logo.png",
        "/icon-192.png",
        "/icon-512.png",
        "/apple-touch-icon.png",
      ].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=31536000" },
        ],
      })),
      // The GwapMojis pack is a frozen published release and the GwapOS icons
      // sit behind a versioned `/v1/` path segment, so both are safe to mark
      // immutable: a change ships under a new filename or version segment.
      ...[
        "/gwapmojis/stickers/:path*",
        "/gwapmojis/share/:path*",
        "/gwapos/icons/v1/:path*",
      ].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      })),
      {
        // The pack is a public marketing asset served straight from `public/`.
        // Content-Disposition keeps Safari and Chrome saving a stable filename
        // even when the anchor's download attribute is not honoured.
        source: "/downloads/GwapMojis-GwapMode-33.zip",
        headers: [
          { key: "Content-Type", value: "application/zip" },
          {
            key: "Content-Disposition",
            value: 'attachment; filename="GwapMojis-GwapMode-33.zip"',
          },
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
