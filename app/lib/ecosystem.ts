export type ProductStatus = "Live" | "Beta" | "In Development" | "Planned";
export type ProductAccent = "green" | "purple" | "orange";
export type ProductCategory = "infrastructure" | "experience";

export type EcosystemProduct = {
  slug: string;
  name: string;
  eyebrow: string;
  category: ProductCategory;
  status: ProductStatus;
  accent: ProductAccent;
  logo: string;
  summary: string;
  description: string;
  role: string;
  audience: string;
  capabilities: string[];
  roadmap: string[];
  internalUrl?: string;
  internalLabel?: string;
  externalUrl?: string;
  externalLabel?: string;
};

export const ecosystemProducts: EcosystemProduct[] = [
  {
    slug: "gns",
    name: "GNS",
    eyebrow: "Digital identity",
    category: "infrastructure",
    status: "Live",
    accent: "green",
    logo: "/logos/gns.webp",
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
    externalUrl: "https://gwapspot.fun/name",
    externalLabel: "Launch GNS",
  },
  {
    slug: "gwapscore",
    name: "GwapScore",
    eyebrow: "On-chain reputation",
    category: "infrastructure",
    status: "Live",
    accent: "green",
    logo: "/logos/gwapscore.svg",
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
    externalUrl: "https://gwapscore.live/",
    externalLabel: "Explore GwapScore",
  },
  {
    slug: "dimi",
    name: "DIMI",
    eyebrow: "Creator technology",
    category: "experience",
    status: "Beta",
    accent: "purple",
    logo: "/logos/dimi.webp",
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
    slug: "daily-ideas",
    name: "Daily Ideas 2.0",
    eyebrow: "Opportunity engine",
    category: "experience",
    status: "Live",
    accent: "green",
    logo: "/logos/daily-ideas-2.webp",
    summary: "Turn inspiration into execution through practical opportunity discovery, development, validation, and project launch.",
    description:
      "Daily Ideas 2.0 helps people discover worthwhile opportunities, save the strongest ideas, develop them into structured plans, validate demand, and move real projects toward launch.",
    role: "The discovery, innovation, development, and execution layer for the GWAP ecosystem.",
    audience: "Founders, creators, builders, students, operators, and anyone deciding what useful project to pursue next.",
    capabilities: [
      "Personalized opportunity discovery across the canonical category system",
      "Shared saves and project state across GWAP OS and Telegram",
      "Guided development, validation, MVP, architecture, and launch planning",
      "A persistent Discover → Save → Develop → Validate → Build → Launch lifecycle",
    ],
    roadmap: [
      "Deepen evidence-backed validation and market research workflows",
      "Expand collaboration, attribution, and optional GNS publishing",
      "Improve personalization from useful repeat behavior without unnecessary generation",
    ],
    internalUrl: "/app/ideas",
    internalLabel: "Open Daily Ideas",
  },
  {
    slug: "money-neva-sleeps",
    name: "Money Neva $leeps",
    eyebrow: "Lifestyle brand",
    category: "experience",
    status: "Live",
    accent: "orange",
    logo: "/logos/money-neva-sleeps.webp",
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
    category: "experience",
    status: "In Development",
    accent: "orange",
    logo: "/logos/marketplace.webp",
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
    externalUrl: "https://gwapspot.store/",
    externalLabel: "Open Marketplace",
  },
  {
    slug: "occo",
    name: "OCCO",
    eyebrow: "Credit infrastructure",
    category: "infrastructure",
    status: "Planned",
    accent: "purple",
    logo: "/logos/occo-official.svg",
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
    category: "infrastructure",
    status: "Planned",
    accent: "purple",
    logo: "/logos/private-proof-vault.webp",
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

export const ecosystemGroups = [
  {
    id: "infrastructure",
    label: "GWAP Infrastructure",
    eyebrow: "Core protocol layer",
    description:
      "Identity, reputation, wallet intelligence, credit context, and private verification—the rails that make the ecosystem trustworthy.",
    signals: ["GNS", "GwapScore", "Wallet Intelligence", "OCCO", "PPV"],
  },
  {
    id: "experience",
    label: "GWAP Experiences",
    eyebrow: "Products people use",
    description:
      "Creative, opportunity, commerce, and lifestyle products that turn the shared infrastructure into useful everyday experiences.",
    signals: ["DIMI", "Daily Ideas", "Marketplace", "Lifestyle"],
  },
] as const satisfies ReadonlyArray<{
  id: ProductCategory;
  label: string;
  eyebrow: string;
  description: string;
  signals: readonly string[];
}>;

export const ecosystemProductGroups = ecosystemGroups.map((group) => ({
  ...group,
  products: ecosystemProducts.filter((product) => product.category === group.id),
}));

export function getProductDestination(product: EcosystemProduct) {
  return `/ecosystem/${product.slug}`;
}

export function isExternalProductDestination(_product: EcosystemProduct) {
  return false;
}

export const ecosystemProductIndexBySlug = new Map(
  ecosystemProducts.map((product, index) => [product.slug, index]),
);

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
