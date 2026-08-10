import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

export const GNS_PROFILE_THEMES = ["midnight", "neon", "mono"] as const;
export const GNS_PROFILE_MAX_LINKS = 20;
export const GNS_PROFILE_MAX_BYTES = 16_384;

export type GnsProfileTheme = (typeof GNS_PROFILE_THEMES)[number];

export type GnsProfileSocials = {
  twitter: string | null;
  discord: string | null;
  telegram: string | null;
  instagram: string | null;
  website: string | null;
};

export type GnsProfileLink = {
  title: string;
  url: string;
  icon: string | null;
  order: number;
};

export type GnsPaymentSettings = {
  sol_enabled: boolean;
  usdc_enabled: boolean;
  recipient_wallet: string | null;
};

export type GnsProfileUpdatePayload = {
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  socials: GnsProfileSocials;
  links: GnsProfileLink[];
  theme: GnsProfileTheme;
  is_score_hidden: boolean;
  payments: GnsPaymentSettings | null;
};

export type GnsPublicProfile = {
  name: string;
  full_name: string;
  owner: string;
  status: "active" | "expired";
  tier: "premium" | "free";
  is_genesis: boolean;
  position: number;
  claimed: boolean;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  socials: GnsProfileSocials;
  links: GnsProfileLink[];
  theme: GnsProfileTheme;
  score: number | null;
  score_tier: string | null;
  score_hidden: boolean;
  payments: GnsPaymentSettings;
  verified: boolean;
  updated_at: string | null;
};

export type GnsSignedProfileEnvelope = {
  payload: GnsProfileUpdatePayload;
  public_key: string;
  signature: string;
  nonce: string;
  ts: number;
};

type UnknownRecord = Record<string, unknown>;

export class GnsProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GnsProfileValidationError";
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nullableText(value: unknown, label: string, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new GnsProfileValidationError(`${label} must be text.`);
  }
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new GnsProfileValidationError(
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  return text;
}

function nullableHttpUrl(value: unknown, label: string, maxLength = 300) {
  const text = nullableText(value, label, maxLength);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new GnsProfileValidationError(
      `${label} must be a complete http:// or https:// URL.`,
    );
  }
}

function isSolanaAddress(value: string) {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function normalizeGnsProfileName(value: string) {
  return value.trim().toLowerCase().replace(/\.gwap$/, "");
}

export function isValidGnsProfileName(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(
    normalizeGnsProfileName(value),
  );
}

function normalizeSocials(value: unknown): GnsProfileSocials {
  const socials = asRecord(value) || {};
  return {
    twitter: nullableText(socials.twitter, "Twitter", 100),
    discord: nullableText(socials.discord, "Discord", 100),
    telegram: nullableText(socials.telegram, "Telegram", 100),
    instagram: nullableText(socials.instagram, "Instagram", 100),
    website: nullableHttpUrl(socials.website, "Website"),
  };
}

function normalizeLinks(value: unknown): GnsProfileLink[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new GnsProfileValidationError("Links must be a list.");
  }
  if (value.length > GNS_PROFILE_MAX_LINKS) {
    throw new GnsProfileValidationError(
      `Add no more than ${GNS_PROFILE_MAX_LINKS} links.`,
    );
  }
  return value.map((item, index) => {
    const link = asRecord(item);
    if (!link) throw new GnsProfileValidationError(`Link ${index + 1} is invalid.`);
    const title = nullableText(link.title, `Link ${index + 1} title`, 80);
    if (!title) {
      throw new GnsProfileValidationError(`Link ${index + 1} needs a title.`);
    }
    const url = nullableHttpUrl(link.url, `Link ${index + 1} URL`);
    if (!url) {
      throw new GnsProfileValidationError(`Link ${index + 1} needs a URL.`);
    }
    return {
      title,
      url,
      icon: nullableText(link.icon, `Link ${index + 1} icon`, 40),
      order: index,
    };
  });
}

function normalizePayments(value: unknown): GnsPaymentSettings | null {
  if (value === null || value === undefined) return null;
  const payments = asRecord(value);
  if (!payments) {
    throw new GnsProfileValidationError("Payment settings are invalid.");
  }
  const recipient = nullableText(
    payments.recipient_wallet,
    "Payment wallet",
    44,
  );
  if (recipient && !isSolanaAddress(recipient)) {
    throw new GnsProfileValidationError("Payment wallet must be a Solana address.");
  }
  return {
    sol_enabled: payments.sol_enabled === true,
    usdc_enabled: payments.usdc_enabled === true,
    recipient_wallet: recipient,
  };
}

export function normalizeGnsProfilePayload(value: unknown): GnsProfileUpdatePayload {
  const payload = asRecord(value);
  if (!payload) throw new GnsProfileValidationError("Profile payload is invalid.");
  const theme = payload.theme;
  if (!GNS_PROFILE_THEMES.includes(theme as GnsProfileTheme)) {
    throw new GnsProfileValidationError("Choose a supported profile theme.");
  }

  return {
    bio: nullableText(payload.bio, "Bio", 280),
    avatar: nullableHttpUrl(payload.avatar, "Avatar"),
    banner: nullableHttpUrl(payload.banner, "Banner"),
    socials: normalizeSocials(payload.socials),
    links: normalizeLinks(payload.links),
    theme: theme as GnsProfileTheme,
    is_score_hidden: payload.is_score_hidden === true,
    payments: normalizePayments(payload.payments),
  };
}

export function profilePayloadFromPublicProfile(
  profile: GnsPublicProfile,
): GnsProfileUpdatePayload {
  return {
    bio: profile.bio,
    avatar: profile.avatar,
    banner: profile.banner,
    socials: { ...profile.socials },
    links: profile.links.map((link) => ({ ...link })),
    theme: profile.theme,
    is_score_hidden: profile.score_hidden,
    payments: { ...profile.payments },
  };
}

export function normalizeGnsPublicProfile(value: unknown): GnsPublicProfile | null {
  const profile = asRecord(value);
  const name = typeof profile?.name === "string" ? normalizeGnsProfileName(profile.name) : "";
  const owner = typeof profile?.owner === "string" ? profile.owner.trim() : "";
  if (!isValidGnsProfileName(name) || !isSolanaAddress(owner)) return null;

  const readText = (field: unknown, maxLength: number) =>
    typeof field === "string" && field.trim()
      ? field.trim().slice(0, maxLength)
      : null;
  const socials = asRecord(profile?.socials) || {};
  const rawLinks = Array.isArray(profile?.links) ? profile.links : [];
  const links: GnsProfileLink[] = rawLinks
    .slice(0, GNS_PROFILE_MAX_LINKS)
    .map(asRecord)
    .filter((link): link is UnknownRecord => Boolean(link))
    .map((link, index) => ({
      title: readText(link.title, 80) || `Link ${index + 1}`,
      url: readText(link.url, 300) || "",
      icon: readText(link.icon, 40),
      order: index,
    }));
  const rawPayments = asRecord(profile?.payments) || {};
  const theme = GNS_PROFILE_THEMES.includes(profile?.theme as GnsProfileTheme)
    ? (profile?.theme as GnsProfileTheme)
    : "midnight";

  return {
      name,
      full_name:
        typeof profile?.full_name === "string" ? profile.full_name : `${name}.gwap`,
      owner,
      status: profile?.status === "expired" ? "expired" : "active",
      tier: profile?.tier === "premium" ? "premium" : "free",
      is_genesis: profile?.is_genesis === true,
      position:
        typeof profile?.position === "number" && Number.isFinite(profile.position)
          ? profile.position
          : 0,
      claimed: profile?.claimed === true,
      bio: readText(profile?.bio, 280),
      avatar: readText(profile?.avatar, 300),
      banner: readText(profile?.banner, 300),
      socials: {
        twitter: readText(socials.twitter, 100),
        discord: readText(socials.discord, 100),
        telegram: readText(socials.telegram, 100),
        instagram: readText(socials.instagram, 100),
        website: readText(socials.website, 300),
      },
      links,
      theme,
      score:
        typeof profile?.score === "number" && Number.isFinite(profile.score)
          ? profile.score
          : null,
      score_tier:
        typeof profile?.score_tier === "string" ? profile.score_tier : null,
      score_hidden: profile?.score_hidden === true,
      payments: {
        sol_enabled: rawPayments.sol_enabled === true,
        usdc_enabled: rawPayments.usdc_enabled === true,
        recipient_wallet: readText(rawPayments.recipient_wallet, 44) || owner,
      },
      verified: profile?.verified === true,
      updated_at:
        typeof profile?.updated_at === "string" ? profile.updated_at : null,
    };
}

export function isAuthorizedProfileOwner(
  profile: Pick<GnsPublicProfile, "owner">,
  verifiedWallet: string,
) {
  return profile.owner === verifiedWallet;
}

export function assertAuthorizedGnsProfileUpdate({
  profile,
  verifiedWallet,
  signer,
  payload,
}: {
  profile: Pick<GnsPublicProfile, "owner" | "is_genesis">;
  verifiedWallet: string;
  signer: string;
  payload: Pick<GnsProfileUpdatePayload, "is_score_hidden">;
}) {
  if (profile.owner !== verifiedWallet || signer !== verifiedWallet) {
    throw new GnsProfileValidationError(
      "The authenticated wallet does not own this profile.",
    );
  }
  if (payload.is_score_hidden && !profile.is_genesis) {
    throw new GnsProfileValidationError(
      "Only Genesis identities can hide their GwapScore.",
    );
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

async function profileDigest(payload: GnsProfileUpdatePayload) {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signGnsProfileUpdate({
  name,
  payload,
  publicKey,
  signMessage,
}: {
  name: string;
  payload: GnsProfileUpdatePayload;
  publicKey: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<GnsSignedProfileEnvelope> {
  const normalizedName = normalizeGnsProfileName(name);
  if (!isValidGnsProfileName(normalizedName)) {
    throw new GnsProfileValidationError("The profile name is invalid.");
  }
  if (!isSolanaAddress(publicKey)) {
    throw new GnsProfileValidationError("Reconnect the verified Solana wallet.");
  }
  const normalizedPayload = normalizeGnsProfilePayload(payload);
  const nonce = makeNonce();
  const ts = Math.floor(Date.now() / 1_000);
  const digest = await profileDigest(normalizedPayload);
  const message = new TextEncoder().encode(
    `gns:update-profile:v2:${normalizedName}:${nonce}:${ts}:${digest}`,
  );
  const signature = await signMessage(message);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new GnsProfileValidationError("The wallet returned an invalid signature.");
  }

  return {
    payload: normalizedPayload,
    public_key: publicKey,
    signature: bs58.encode(signature),
    nonce,
    ts,
  };
}
