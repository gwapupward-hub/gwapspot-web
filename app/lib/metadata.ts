import type { Metadata } from "next";

const defaultImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "GWAP — Grind With A Purpose",
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  socialTitle?: string;
  image?: {
    url: string;
    alt: string;
    width?: number;
    height?: number;
  };
};

export function createPageMetadata({
  title,
  description,
  path,
  socialTitle = title + " | GWAP",
  image = defaultImage,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "GWAP",
      title: socialTitle,
      description,
      url: path,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      creator: "@_gwapspot",
      title: socialTitle,
      description,
      images: [image.url],
    },
  };
}
