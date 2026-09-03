import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PublicExperienceLayers } from "./components/public-experience-layers";
import "./styles.css";

const siteUrl = "https://www.gwapspot.com";
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;
const bingVerification = process.env.BING_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "GWAP — Grind With A Purpose", template: "%s | GWAP" },
  description: "Turn your Solana wallet into a portable .gwap identity, understand your reputation with GwapScore, and carry that trust through the GWAP network.",
  applicationName: "GWAP",
  category: "technology",
  keywords: ["GWAP", "GwapSpot", "GNS", "GwapScore", "Web3 identity", "Solana identity", "wallet reputation", "on-chain reputation"],
  authors: [{ name: "GWAP", url: siteUrl }],
  creator: "GWAP",
  publisher: "GWAP",
  alternates: { canonical: "/" },
  formatDetection: { address: false, email: false, telephone: false },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  verification: { ...(googleVerification ? { google: googleVerification } : {}), ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}) },
  openGraph: { type: "website", url: siteUrl, siteName: "GWAP", title: "GWAP — Identity + Reputation, Connected", description: "Build a portable .gwap identity, check wallet reputation with GwapScore, and enter the connected GWAP network.", images: [{ url: "/opengraph-image?v=20260809", width: 1200, height: 630, alt: "GWAP — Grind With A Purpose" }] },
  twitter: { card: "summary_large_image", title: "GWAP — Identity + Reputation, Connected", description: "Build your .gwap identity. Understand your reputation. Carry your trust forward.", images: ["/opengraph-image?v=20260809"], creator: "@_gwapspot" },
  icons: {
    icon: [
      { url: "/logos/gwap-agent.png", type: "image/png", sizes: "512x512" },
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/logos/gwap-agent.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#030504", colorScheme: "dark", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <style>{'html[data-gwap-app-host="true"] .premium-splash{display:none!important}'}</style>
        <Script id="gwap-intro-state" strategy="beforeInteractive">
          {'try{const root=document.documentElement;if(location.hostname.toLowerCase()==="app.gwapspot.com")root.dataset.gwapAppHost="true";if(sessionStorage.getItem("gwap-premium-intro-seen-v2")==="true")root.dataset.gwapIntroSeen="true"}catch(e){}'}
        </Script>
        <PublicExperienceLayers />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
