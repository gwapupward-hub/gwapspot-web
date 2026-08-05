import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import PremiumSplash from "./components/premium-splash";
import { Telemetry } from "./telemetry";
import "./globals.css";
import "./expansion.css";
import "./launch.css";
import "./premium-splash.css";
import "./loading-screen.css";
import "./premium-ui.css";
import "./premium-ui-sections.css";
import "./premium-ui-story.css";
import "./premium-ui-motion.css";
import "./premium-ui-responsive.css";
import "./premium-ui-scroll.css";
import "./logo-fixes.css";

const siteUrl = "https://www.gwapspot.com";
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;
const bingVerification = process.env.BING_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "GWAP — Grind With A Purpose", template: "%s | GWAP" },
  description: "The premium gateway to the GWAP ecosystem—digital identity, on-chain reputation, commerce, creativity, AI, and community.",
  applicationName: "GWAP",
  category: "technology",
  keywords: ["GWAP", "GwapSpot", "GNS", "GwapScore", "Web3 identity", "on-chain reputation", "digital ecosystem"],
  authors: [{ name: "GWAP", url: siteUrl }],
  creator: "GWAP",
  publisher: "GWAP",
  alternates: { canonical: "/" },
  formatDetection: { address: false, email: false, telephone: false },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  verification: { ...(googleVerification ? { google: googleVerification } : {}), ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}) },
  openGraph: { type: "website", url: siteUrl, siteName: "GWAP", title: "GWAP — The Future Rewards Purpose", description: "A premium Web3 ecosystem for identity, reputation, commerce, creativity, AI, and community.", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "GWAP — Grind With A Purpose" }] },
  twitter: { card: "summary_large_image", title: "GWAP — The Future Rewards Purpose", description: "Explore the connected GWAP ecosystem.", images: ["/opengraph-image"], creator: "@_gwapspot" },
  icons: { icon: [{ url: "/logos/gwap.svg", type: "image/svg+xml", sizes: "any" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }], shortcut: [{ url: "/logos/gwap.svg", type: "image/svg+xml" }], apple: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }] },
};

export const viewport: Viewport = { themeColor: "#030504", colorScheme: "dark", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'try{if(sessionStorage.getItem("gwap-premium-intro-seen-v1")==="true")document.documentElement.dataset.gwapIntroSeen="true"}catch(e){}' }} />
      </head>
      <body>
        <PremiumSplash />
        {children}
        <Telemetry />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
