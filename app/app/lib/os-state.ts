import type { GwapScoreStatus, GwapScoreTier } from "../../lib/gwap-score";

export type RecentLaunch = {
  slug: string;
  openedAt: string;
};

export type DailyIdea = {
  id: string;
  title: string;
  category: "web3" | "saas" | "ai" | "general";
  summary: string;
  problem: string;
  opportunity: string;
  difficulty: "Starter" | "Intermediate" | "Advanced";
  savedAt: string;
};

export type GwapProfile = {
  displayName: string;
  handle: string;
  bio: string;
  primaryWallet: string;
  website: string;
  location: string;
  updatedAt: string;
};

export type GwapSettings = {
  compactMode: boolean;
  reduceMotion: boolean;
  bootAnimation: boolean;
  productUpdates: boolean;
  communityUpdates: boolean;
};

export type GwapOsState = {
  profile: GwapProfile;
  favorites: string[];
  recent: RecentLaunch[];
  ideas: DailyIdea[];
  settings: GwapSettings;
};

export type GwapAccount = {
  displayName: string;
  email: string;
  embeddedWallet: string | null;
  verifiedWallet: string;
  walletProvider: "embedded" | "external";
};

export type GnsIdentity = {
  status: "found" | "none" | "unavailable";
  name: string | null;
  fullName: string | null;
  avatar: string | null;
  bio: string | null;
  score: number | null;
  scoreTier: GwapScoreTier | null;
  scoreStatus: GwapScoreStatus;
  scoreMessage: string;
  verified: boolean;
  isGenesis: boolean;
  tier: "premium" | "free" | null;
  profileUrl: string | null;
  updatedAt: string | null;
};

export const GWAP_OS_STORAGE_KEY = "gwap-os-state-v1";
export const MAX_GWAP_OS_STATE_BYTES = 24_000;

const safeText = (value: unknown, fallback: string, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;

const safeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const safeSlug = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);

function normalizeIdea(value: unknown): DailyIdea | null {
  if (!value || typeof value !== "object") return null;
  const idea = value as Partial<DailyIdea>;
  const category = ["web3", "saas", "ai", "general"].includes(idea.category ?? "")
    ? (idea.category as DailyIdea["category"])
    : "general";
  const difficulty = ["Starter", "Intermediate", "Advanced"].includes(idea.difficulty ?? "")
    ? (idea.difficulty as DailyIdea["difficulty"])
    : "Intermediate";
  const id = safeText(idea.id, "", 80).replace(/[^A-Za-z0-9_-]/g, "");
  const title = safeText(idea.title, "", 120);
  if (!id || !title) return null;
  const savedAt = safeText(idea.savedAt, "", 40);
  return {
    id,
    title,
    category,
    summary: safeText(idea.summary, "", 480),
    problem: safeText(idea.problem, "", 480),
    opportunity: safeText(idea.opportunity, "", 480),
    difficulty,
    savedAt: !Number.isNaN(Date.parse(savedAt)) ? savedAt : new Date(0).toISOString(),
  };
}

export const defaultGwapOsState: GwapOsState = {
  profile: {
    displayName: "GWAP Builder",
    handle: "gwap-builder",
    bio: "",
    primaryWallet: "",
    website: "",
    location: "",
    updatedAt: "",
  },
  favorites: ["gns", "gwapscore", "isnad-sunnah"],
  recent: [],
  ideas: [],
  settings: {
    compactMode: false,
    reduceMotion: false,
    bootAnimation: true,
    productUpdates: true,
    communityUpdates: true,
  },
};

export function createDefaultGwapOsState(): GwapOsState {
  return {
    profile: { ...defaultGwapOsState.profile },
    favorites: [...defaultGwapOsState.favorites],
    recent: [],
    ideas: [],
    settings: { ...defaultGwapOsState.settings },
  };
}

export function normalizeGwapOsState(value: unknown): GwapOsState {
  if (!value || typeof value !== "object") return createDefaultGwapOsState();

  const candidate = value as Partial<GwapOsState>;
  const profile =
    candidate.profile && typeof candidate.profile === "object"
      ? candidate.profile
      : defaultGwapOsState.profile;
  const settings =
    candidate.settings && typeof candidate.settings === "object"
      ? candidate.settings
      : defaultGwapOsState.settings;

  return {
    profile: {
      displayName: safeText(profile.displayName, defaultGwapOsState.profile.displayName, 80),
      handle: safeText(profile.handle, defaultGwapOsState.profile.handle, 40)
        .replace(/^@/, "")
        .replace(/[^A-Za-z0-9._-]/g, ""),
      bio: safeText(profile.bio, "", 240),
      primaryWallet: safeText(profile.primaryWallet, "", 128),
      website: safeText(profile.website, "", 240),
      location: safeText(profile.location, "", 100),
      updatedAt: safeText(profile.updatedAt, "", 40),
    },
    favorites: Array.isArray(candidate.favorites)
      ? [...new Set(candidate.favorites.filter(safeSlug))].slice(0, 24)
      : [...defaultGwapOsState.favorites],
    recent: Array.isArray(candidate.recent)
      ? candidate.recent
          .filter(
            (item): item is RecentLaunch =>
              Boolean(item) &&
              typeof item === "object" &&
              safeSlug((item as RecentLaunch).slug) &&
              typeof (item as RecentLaunch).openedAt === "string" &&
              !Number.isNaN(Date.parse((item as RecentLaunch).openedAt)),
          )
          .map((item) => ({ slug: item.slug, openedAt: item.openedAt.slice(0, 40) }))
          .slice(0, 8)
      : [],
    ideas: Array.isArray(candidate.ideas)
      ? candidate.ideas.map(normalizeIdea).filter((idea): idea is DailyIdea => Boolean(idea)).slice(0, 12)
      : [],
    settings: {
      compactMode: safeBoolean(settings.compactMode, defaultGwapOsState.settings.compactMode),
      reduceMotion: safeBoolean(settings.reduceMotion, defaultGwapOsState.settings.reduceMotion),
      bootAnimation: safeBoolean(settings.bootAnimation, defaultGwapOsState.settings.bootAnimation),
      productUpdates: safeBoolean(settings.productUpdates, defaultGwapOsState.settings.productUpdates),
      communityUpdates: safeBoolean(settings.communityUpdates, defaultGwapOsState.settings.communityUpdates),
    },
  };
}

export function areGwapOsStatesEqual(left: GwapOsState, right: GwapOsState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function getProfileCompletion(profile: GwapProfile) {
  const fields = [profile.displayName, profile.handle, profile.bio, profile.primaryWallet, profile.website, profile.location];
  const completed = fields.filter((field) => field.trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
}
