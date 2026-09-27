export const roadmapPhases = [
  {
    phase: "Phase 01",
    title: "Foundation",
    status: "Complete",
    railClass: "complete",
    objective: "Establish a credible public gateway and production baseline.",
    homeSummary:
      "Flagship website, production foundation, analytics, and ecosystem positioning.",
    deliverables: [
      "Flagship GWAP website and visual system",
      "Product positioning and ecosystem map",
      "Production analytics, error handling, security, and SEO",
      "GitHub-to-Vercel release workflow",
    ],
  },
  {
    phase: "Phase 02",
    title: "Expansion",
    status: "Complete",
    railClass: "complete",
    objective: "Give every major venture a dedicated public destination.",
    homeSummary:
      "Premium discovery, product surfaces, community, and partner-ready storytelling.",
    deliverables: [
      "Complete ecosystem directory",
      "Dedicated product pages",
      "About, roadmap, community, and partnership pages",
      "Stronger internal navigation and search coverage",
    ],
  },
  {
    phase: "Phase 03",
    title: "Integration",
    status: "Current",
    railClass: "current",
    objective: "Connect users and data across ecosystem products.",
    homeSummary:
      "Wallet authentication and the GWAP OS identity runtime are live; shared profiles and cross-product data continue rolling out.",
    deliverables: [
      "Wallet authentication and connection",
      "GWAP OS identity runtime",
      "Shared GNS identity and GwapScore context",
      "Cross-product profiles, analytics, notifications, and permissions",
    ],
  },
  {
    phase: "Phase 04",
    title: "Transactions",
    status: "Next",
    railClass: "",
    objective: "Turn connected identity and trust into commercial utility.",
    homeSummary:
      "Turn connected identity and trust into marketplace, payment, escrow, proof, and partner utility.",
    deliverables: [
      "Marketplace listings and merchant tools",
      "Payments, escrow, disputes, and proof workflows",
      "Rewards, memberships, and ecosystem benefits",
      "Partner APIs and integration programs",
    ],
  },
  {
    phase: "Phase 05",
    title: "GWAP OS",
    status: "Planned",
    railClass: "",
    objective:
      "Evolve the live GWAP OS into one personalized control center for the network.",
    homeSummary:
      "Expand GWAP OS into the personalized control center for the full network.",
    deliverables: [
      "Unified dashboard across products",
      "Identity, score, proofs, assets, and activity",
      "Personalized product and community access",
      "Extensible operating layer for future ventures",
    ],
  },
] as const;

export const roadmapCurrentPriority = {
  title: "Finish integration before expanding transaction scope.",
  description:
    "The current move is to harden wallet and authentication flows, connect GNS and GwapScore through GWAP OS, and standardize shared profiles, analytics, notifications, and permissions before broadening public transaction infrastructure.",
} as const;
