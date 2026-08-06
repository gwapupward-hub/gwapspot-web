export type RecentLaunch = {
  slug: string;
  openedAt: string;
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
  productUpdates: boolean;
  communityUpdates: boolean;
};

export type GwapOsState = {
  profile: GwapProfile;
  favorites: string[];
  recent: RecentLaunch[];
  settings: GwapSettings;
};

export const GWAP_OS_STORAGE_KEY = "gwap-os-state-v1";

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
  settings: {
    compactMode: false,
    reduceMotion: false,
    productUpdates: true,
    communityUpdates: true,
  },
};

export function normalizeGwapOsState(value: unknown): GwapOsState {
  if (!value || typeof value !== "object") return defaultGwapOsState;

  const candidate = value as Partial<GwapOsState>;
  const profile = candidate.profile ?? defaultGwapOsState.profile;
  const settings = candidate.settings ?? defaultGwapOsState.settings;

  return {
    profile: {
      ...defaultGwapOsState.profile,
      ...profile,
    },
    favorites: Array.isArray(candidate.favorites)
      ? candidate.favorites.filter((item): item is string => typeof item === "string")
      : defaultGwapOsState.favorites,
    recent: Array.isArray(candidate.recent)
      ? candidate.recent
          .filter(
            (item): item is RecentLaunch =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as RecentLaunch).slug === "string" &&
              typeof (item as RecentLaunch).openedAt === "string",
          )
          .slice(0, 8)
      : [],
    settings: {
      ...defaultGwapOsState.settings,
      ...settings,
    },
  };
}

export function getProfileCompletion(profile: GwapProfile) {
  const fields = [
    profile.displayName,
    profile.handle,
    profile.bio,
    profile.primaryWallet,
    profile.website,
    profile.location,
  ];
  const completed = fields.filter((field) => field.trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
}
