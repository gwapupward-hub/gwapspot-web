export type ProductStatus = "Live" | "Beta" | "In Development" | "Planned";
export type ProductAccent = "green" | "purple" | "orange";

export type EcosystemProduct = {
  slug: string;
  name: string;
  eyebrow: string;
  status: ProductStatus;
  accent: ProductAccent;
  summary: string;
  description: string;
  role: string;
  audience: string;
  capabilities: string[];
  roadmap: string[];
  externalUrl?: string;
  externalLabel?: string;
};

export const ecosystemProducts: EcosystemProduct[] = [
  {
    slug: "gns",
    name: "GNS",
    eyebrow: "Digital identity",
    status: "Live",
    accent: "green",
    summary: ".gwap names, wallet-linked profiles, and a portable identity layer for the open web.",
    description:
      "GNS turns a wallet into a readable, portable identity. Each .gwap name can connect addresses, public profile information, links, payments, and reputation into one recognizable destination.",
    role: "The identity and naming layer for the GWAP ecosystem.",
    audience: "Wallet users, creators, communities, merchants, and applications that need a human-readable identity layer.",
    capabilities: [
      ".gwap name registration and ownership",
      "Wallet-linked public profiles",
      "Links, bios, themes, and payment settings",
      "GwapScore and verification integration",
    ],
    roadmap: [
      "Expand profile customization and premium controls",
      "Release developer SDKs and partner integration tools",
      "Add broader chain and application support",
    ],
    externalUrl: "https://gwapspot.fun/",
    externalLabel: "Launch GNS",
  },
  {
    slug: "gwapscore",
    name: "GwapScore",
    eyebrow: "On-chain reputation",
    status: "Live",
    accent: "green",
    summary: "A transparent 300–900 reputation and credit-intelligence layer for wallets and applications.",
    description:
      "GwapScore converts wallet activity, verified identity, counterparty history, disputes, and other explainable signals into a consistent 300–900 protocol score.",
    role: "The shared trust and reputation layer across GWAP products.",
    audience: "Wallet users, marketplaces, lenders, communities, and applications that need understandable risk signals.",
    capabilities: [
      "Deterministic 300–900 protocol scoring",
      "Explainable score factors and history",
      "Wallet intelligence and counterparty context",
      "Verification badges and partner APIs",
    ],
    roadmap: [
      "Expand protocol and chain coverage",
      "Ship issuer and partner onboarding tools",
      "Introduce deeper risk and reputation analytics",
    ],
    externalUrl: "https://gwapspot.fun/",
    externalLabel: "Explore GwapScore",
  },
  {
    slug: "dimi",
    name: "DIMI",
    eyebrow: "Creator technology",
    status: "Beta",
    accent: "purple",
    summary: "A music creation and collaboration platform built for modern artists and digital ownership.",
    description:
      "DIMI is designed to help artists create, collaborate, manage rights, and prove ownership without forcing creative work into disconnected tools.",
    role: "The creator and music-production layer of the ecosystem.",
    audience: "Independent artists, producers, engineers, songwriters, and digital creative teams.",
    capabilities: [
      "Mobile-first music creation workflows",
      "Private collaboration rooms",
      "Proof-of-creation and ownership records",
      "Splits, escrow, and distribution infrastructure",
    ],
    roadmap: [
      "Expand recording, comping, and mixing tools",
      "Add real-time collaboration and professional integrations",
      "Launch distribution and automated split settlement",
    ],
    externalUrl: "https://dimimusic.xyz/",
    externalLabel: "Open DIMI",
  },
  {
    slug: "isnad-sunnah",
    name: "Isnad Sunnah",
    eyebrow: "Islamic AI",
    status: "Live",
    accent: "green",
    summary: "An AI-powered Islamic knowledge assistant grounded in the Qur’an, Sunnah, and trusted scholarship.",
    description:
      "Isnad Sunnah organizes specialized Islamic knowledge modules into one learning assistant, with source-aware answers and a focus on practical, trustworthy guidance.",
    role: "The knowledge and guided-learning layer within GWAP.",
    audience: "Students, families, communities, teachers, and anyone seeking structured Islamic learning.",
    capabilities: [
      "Islamic Teacher Core",
      "Tafsīr, Hadith, Fiqh, Seerah, and Tarbiyah modules",
      "Citation-aware responses and conversation history",
      "Telegram bot and mobile-first mini app",
    ],
    roadmap: [
      "Add guided learning paths and daily knowledge",
      "Expand Arabic study and research tools",
      "Introduce community study circles and classrooms",
    ],
    externalUrl: "https://isnadsunnah.vercel.app/",
    externalLabel: "Open Isnad Sunnah",
  },
  {
    slug: "money-neva-sleeps",
    name: "Money Neva $leeps",
    eyebrow: "Lifestyle brand",
    status: "Live",
    accent: "orange",
    summary: "Street-luxury apparel and culture built around ambition, discipline, and purposeful hustle.",
    description:
      "Money Neva $leeps translates the GWAP mindset into apparel, visual culture, and community identity built for people who move with intention.",
    role: "The lifestyle, apparel, and culture arm of GWAP.",
    audience: "Builders, creators, entrepreneurs, athletes, and communities aligned with purposeful ambition.",
    capabilities: [
      "MN$ Elite apparel and visual identity",
      "Men’s and women’s product lines",
      "Campaign visuals and digital merchandise",
      "Community-led brand collaborations",
    ],
    roadmap: [
      "Launch organized seasonal collections",
      "Expand product photography and commerce",
      "Develop creator and community collaborations",
    ],
    externalUrl: "https://slink.bigovideo.tv/xkN2rK",
    externalLabel: "Visit MN$",
  },
  {
    slug: "marketplace",
    name: "GwapSpot Marketplace",
    eyebrow: "Digital commerce",
    status: "In Development",
    accent: "orange",
    summary: "A unified marketplace for ecosystem products, services, creators, and verified participants.",
    description:
      "The marketplace will connect identity, reputation, payments, products, and services so users can transact through one trusted GWAP gateway.",
    role: "The commerce and transaction layer for the ecosystem.",
    audience: "Verified buyers, sellers, service providers, creators, and ecosystem partners.",
    capabilities: [
      "Identity-aware listings and profiles",
      "Reputation and verification signals",
      "Crypto and traditional payment support",
      "Escrow, disputes, and proof management",
    ],
    roadmap: [
      "Release verified listings and merchant profiles",
      "Integrate GNS, GwapScore, and payment rails",
      "Add escrow, disputes, rewards, and partner tools",
    ],
  },
  {
    slug: "occo",
    name: "OCCO",
    eyebrow: "Credit infrastructure",
    status: "Planned",
    accent: "purple",
    summary: "An on-chain credit bureau designed to make wallet-level risk and credibility understandable.",
    description:
      "OCCO will provide institutional-grade wallet lookup, score interpretation, and credit intelligence for users, partners, and regulated decision-makers.",
    role: "The credit-bureau and institutional intelligence layer.",
    audience: "Financial applications, lenders, analysts, institutions, protocols, and advanced wallet users.",
    capabilities: [
      "Public wallet and score lookup",
      "Credit and reputation explanations",
      "Protocol activity and risk signals",
      "Partner APIs and institutional reporting",
    ],
    roadmap: [
      "Launch a Solana-first public lookup experience",
      "Expand protocol adapters and data coverage",
      "Develop institutional and regulatory reporting",
    ],
  },
  {
    slug: "private-proof-vault",
    name: "Private Proof Vault",
    eyebrow: "Verification layer",
    status: "Planned",
    accent: "purple",
    summary: "A privacy-aware system for storing, managing, and verifying important digital proofs.",
    description:
      "Private Proof Vault is planned as a controlled layer for evidence, credentials, agreements, and verification records that should not live openly on a public profile.",
    role: "The private evidence and verification layer across GWAP.",
    audience: "Individuals, merchants, creators, counterparties, and applications that need selective proof sharing.",
    capabilities: [
      "Private proof storage and organization",
      "Selective access and verification controls",
      "Agreement, dispute, and credential support",
      "Connections to identity and reputation records",
    ],
    roadmap: [
      "Define the proof schema and permission model",
      "Integrate disputes, agreements, and attestations",
      "Add partner verification and controlled sharing",
    ],
  },
];

export const productBySlug = new Map(
  ecosystemProducts.map((product) => [product.slug, product]),
);

export const socialLinks = [
  { label: "X", href: "https://x.com/_gwapspot?s=21", description: "Public updates and announcements" },
  { label: "Telegram", href: "https://t.me/thagwapspot", description: "Community discussion and direct updates" },
  { label: "GitHub", href: "https://github.com/Gwapoholics", description: "Open development and repositories" },
  {
    label: "Instagram",
    href: "https://www.instagram.com/_gwapspot?igsh=emlydnV6eXljYjd4",
    description: "Brand visuals, releases, and community media",
  },
] as const;
