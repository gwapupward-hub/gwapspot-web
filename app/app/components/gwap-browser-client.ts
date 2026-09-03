// Shared client types + helpers for the Gwap Browser UI (/app/browser).

export type BrowserProject = {
  id: string;
  address: string;
  slug: string;
  ownerGnsName: string;
  ownerAddress: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  visibility: "public" | "unlisted";
  version: number;
  deploymentHost: string;
  publishedAt: string;
  updatedAt: string;
};

export type BrowserSearchResponse = {
  items: BrowserProject[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  category: string | null;
  sort: "relevance" | "updated" | "new";
  categories: readonly string[];
};

export type BrowserResolution =
  | {
      kind: "profile";
      address: string;
      owner: string;
      ownerAddress: string;
      profileAddress: string;
      profileUrl: string | null;
      reason: "default" | "explicit" | "invalid_project" | "profile_label";
    }
  | {
      kind: "project";
      address: string;
      project: BrowserProject;
      target: { url: string; host: string };
      ownershipVerifiedAt: string;
      primaryAlias: boolean;
    }
  | { kind: "not_found"; address: string }
  | { kind: "temporarily_unavailable"; address: string };

export const BROWSER_CATEGORY_LABELS: Record<string, string> = {
  ai: "AI",
  web3: "Web3",
  saas: "SaaS",
  tools: "Tools",
  commerce: "Commerce",
  media: "Media",
  community: "Community",
  games: "Games",
  finance: "Finance",
  other: "Other",
};

export const GWAP_BROWSER_MARK = "/logos/gwap-agent.png";

export function categoryLabel(category: string) {
  return BROWSER_CATEGORY_LABELS[category] ?? category;
}

export function browserAddressHref(address: string) {
  return `/app/browser/${encodeURIComponent(address)}`;
}

/** Client-side mirror of the core classifier: is this an exact `.gwap` address? */
export function looksLikeGwapAddress(raw: string) {
  const value = raw.trim().toLowerCase().replace(/^(?:https?:\/\/|gwap:\/\/)/, "").replace(/[/.\s]+$/, "");
  return !/\s/.test(value) && value.endsWith(".gwap");
}

export function normalizeAddressInput(raw: string) {
  return raw.trim().toLowerCase().replace(/^(?:https?:\/\/|gwap:\/\/)/, "").replace(/^@/, "").replace(/[/.\s]+$/, "");
}

export function formatDate(iso: string) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
