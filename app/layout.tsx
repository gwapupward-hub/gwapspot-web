import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://gwapspot.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GWAP — Grind With A Purpose",
    template: "%s | GWAP",
  },
  description:
    "The official home of the GWAP ecosystem—digital identity, on-chain reputation, commerce, creativity, AI, and community.",
  applicationName: "GWAP",
  keywords: [
    "GWAP",
    "GwapSpot",
    "GNS",
    "GwapScore",
    "Web3 identity",
    "on-chain reputation",
    "digital ecosystem",
  ],
  authors: [{ name: "GWAP" }],
  creator: "GWAP",
  publisher: "GWAP",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "GWAP",
    title: "GWAP — One Ecosystem. Built With Purpose.",
    description:
      "Digital identity, reputation, commerce, creativity, AI, and community—connected under one ecosystem.",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "GWAP logo" }],
  },
  twitter: {
    card: "summary",
    title: "GWAP — One Ecosystem. Built With Purpose.",
    description:
      "Explore the growing GWAP ecosystem of identity, reputation, commerce, creativity, and AI products.",
    images: ["/logo.png"],
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
      <body>{children}</body>
    </html>
  );
}
