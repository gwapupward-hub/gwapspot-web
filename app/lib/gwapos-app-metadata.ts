import type { Metadata, Viewport } from "next";

// Canonical GwapOS wallet application identity (app.gwapspot.com only).
//
// This is intentionally separate from the public gwapspot.com identity defined
// in the root layout. It is applied per app route (the GwapOS experience —
// /os-entry, /os-sign-in, /refresh, /app/*) so the public marketing site keeps
// its own favicon, manifest, and social branding.
//
// Asset paths are versioned (`/gwapos/icons/v1/...`) for stable cache-busting:
// bump the version directory to invalidate aggressively-cached PWA/wallet icons
// without per-request query strings.

const ICON_BASE = "/gwapos/icons/v1";

export const GWAPOS_MANIFEST_PATH = "/gwapos/manifest.webmanifest";

export const gwapOsAppMetadata: Metadata = {
  applicationName: "GwapOS",
  manifest: GWAPOS_MANIFEST_PATH,
  icons: {
    icon: [
      { url: `${ICON_BASE}/gwapos-icon.svg`, type: "image/svg+xml" },
      { url: `${ICON_BASE}/gwapos-icon-32.png`, type: "image/png", sizes: "32x32" },
      { url: `${ICON_BASE}/gwapos-icon-16.png`, type: "image/png", sizes: "16x16" },
      { url: `${ICON_BASE}/gwapos-icon-192.png`, type: "image/png", sizes: "192x192" },
      { url: `${ICON_BASE}/gwapos-icon-512.png`, type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: `${ICON_BASE}/gwapos-icon-192.png`, type: "image/png" }],
    // Apple home-screen icon must be the opaque black tile, never transparent.
    apple: [
      { url: `${ICON_BASE}/gwapos-icon-180.png`, type: "image/png", sizes: "180x180" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "GwapOS",
    statusBarStyle: "black-translucent",
  },
};

export const gwapOsAppViewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};
