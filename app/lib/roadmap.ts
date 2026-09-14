export type RoadmapStatus = "Complete" | "Current" | "Next" | "Planned";

export type RoadmapPhase = {
  phase: string;
  title: string;
  status: RoadmapStatus;
  objective: string;
  homepageSummary: string;
  deliverables: readonly string[];
};

export const roadmapPhases = [
  {
    phase: "Phase 01",
    title: "Foundation",
    status: "Complete",
    objective: "Establish a credible public gateway and production baseline.",
    homepageSummary:
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
    status: "Current",
    objective: "Give every major venture a dedicated public destination.",
    homepageSummary:
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
    status: "Next",
    objective: "Connect users and data across ecosystem products.",
    homepageSummary:
      "Unified authentication, shared profiles, and cross-product identity and reputation data.",
    deliverables: [
      "Unified authentication and wallet connection",
      "Shared user and organization profiles",
      "GNS identity and GwapScore visibility",
      "Common analytics, notifications, and permissions",
    ],
  },
  {
    phase: "Phase 04",
    title: "Transactions",
    status: "Planned",
    objective: "Turn connected identity and trust into commercial utility.",
    homepageSummary:
      "Marketplace, payments, rewards, and partner transaction infrastructure.",
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
    objective: "Deliver one personalized control center for the network.",
    homepageSummary:
      "A unified operating layer for identity, reputation, products, assets, and activity.",
    deliverables: [
      "Unified dashboard across products",
      "Identity, score, proofs, assets, and activity",
      "Personalized product and community access",
      "Extensible operating layer for future ventures",
    ],
  },
] as const satisfies readonly RoadmapPhase[];

export function getRoadmapPhaseClass(status: RoadmapStatus) {
  if (status === "Complete") return "complete";
  if (status === "Current") return "current";
  if (status === "Next") return "started";
  return "planned";
}
