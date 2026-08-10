import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GwapContinuityLayer } from "./components/gwap-continuity-layer";
import { GwapInteractionLayer } from "./components/gwap-interaction-layer";
import { GwapSystemMemoryLayer } from "./components/gwap-system-memory-layer";
import PremiumSplash from "./components/premium-splash";
import { Telemetry } from "./telemetry";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";

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
  openGraph: { type: "website", url: siteUrl, siteName: "GWAP", title: "GWAP — The Future Rewards Purpose", description: "A premium Web3 ecosystem for identity, reputation, commerce, creativity, AI, and community.", images: [{ url: "/opengraph-image?v=20260809", width: 1200, height: 630, alt: "GWAP — Grind With A Purpose" }] },
  twitter: { card: "summary_large_image", title: "GWAP — The Future Rewards Purpose", description: "Explore the connected GWAP ecosystem.", images: ["/opengraph-image?v=20260809"], creator: "@_gwapspot" },
  icons: {
    icon: [
      { url: "/logos/gwap-agent.png", type: "image/png", sizes: "1024x1024" },
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/logos/gwap-agent.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#030504", colorScheme: "dark", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="gwap-intro-state" strategy="beforeInteractive">
          {'try{if(sessionStorage.getItem("gwap-premium-intro-seen-v2")==="true")document.documentElement.dataset.gwapIntroSeen="true"}catch(e){}'}
        </Script>
        <PremiumSplash />
        <GwapInteractionLayer />
        <GwapSystemMemoryLayer />
        <GwapContinuityLayer />
        {children}
        <Telemetry />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
