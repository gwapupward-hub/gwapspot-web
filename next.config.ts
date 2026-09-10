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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
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
      {
        source: "/logos/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/gwap-splash.webp",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/gwapmojis/stickers/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
        ],
      },
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
