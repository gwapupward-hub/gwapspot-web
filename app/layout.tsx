import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Telemetry } from "./telemetry";
import "./globals.css";

const siteUrl = "https://www.gwapspot.com";
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;
const bingVerification = process.env.BING_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GWAP — Grind With A Purpose",
    template: "%s | GWAP",
  },
  description:
    "The official home of the GWAP ecosystem—digital identity, on-chain reputation, commerce, creativity, AI, and community.",
  applicationName: "GWAP",
  category: "technology",
  keywords: [
    "GWAP",
    "GwapSpot",
    "GNS",
    "GwapScore",
    "Web3 identity",
    "on-chain reputation",
    "digital ecosystem",
  ],
  authors: [{ name: "GWAP", url: siteUrl }],
  creator: "GWAP",
  publisher: "GWAP",
  alternates: { canonical: "/" },
  formatDetection: { address: false, email: false, telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    ...(googleVerification ? { google: googleVerification } : {}),
    ...(bingVerification
      ? { other: { "msvalidate.01": bingVerification } }
      : {}),
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "GWAP",
    title: "GWAP — One Ecosystem. Built With Purpose.",
    description:
      "Digital identity, reputation, commerce, creativity, AI, and community—connected under one ecosystem.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "GWAP — One Ecosystem. Built With Purpose.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GWAP — One Ecosystem. Built With Purpose.",
    description:
      "Explore the growing GWAP ecosystem of identity, reputation, commerce, creativity, and AI products.",
    images: ["/opengraph-image"],
    creator: "@_gwapspot",
  },
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Telemetry />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
