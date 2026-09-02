import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Gwap Browser V1 — pure core.
//
// Owns exact `.gwap` address grammar, query classification, publication and
// deployment validation, stable identifiers, visibility rules, primary-route
// resolution, and deterministic search scoring. No I/O, no framework imports,
// so every rule here is unit-testable and shared by the API routes and UI.
//
// Grammar is intentionally locked to the current production GNS rules
// (lowercase ASCII letters, digits, internal hyphens). Expanding it requires a
// coordinated GNS protocol/backend/client migration, not a Browser-only change.
// ---------------------------------------------------------------------------

export const GWAP_TLD = "gwap";
export const GNS_OWNER_NAME_MAX = 32;
export const PROJECT_SLUG_MAX = 48;

/** Current GNS owner grammar: 1–32 chars, no leading/trailing hyphen. */
export const OWNER_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
/** Project slug grammar: same character rules, 1–48 chars. */
export const PROJECT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const PROFILE_LABEL = "profile";

/** Labels that can never become a project route beneath an owner. */
export const RESERVED_PROJECT_SLUGS: ReadonlySet<string> = new Set([
  "profile",
  "www",
  "app",
  "api",
  "admin",
  "browser",
  "dashboard",
  "settings",
  "support",
  "gwap",
  "gns",
]);

export const PUBLICATION_TITLE_MIN = 3;
export const PUBLICATION_TITLE_MAX = 80;
export const PUBLICATION_SUMMARY_MIN = 12;
export const PUBLICATION_SUMMARY_MAX = 280;
export const PUBLICATION_TAG_MAX_COUNT = 8;
export const PUBLICATION_TAG_MAX_LENGTH = 24;
export const DEPLOYMENT_URL_MAX_LENGTH = 2048;

export const GWAP_BROWSER_CATEGORIES = [
  "ai",
  "web3",
  "saas",
  "tools",
  "commerce",
  "media",
  "community",
  "games",
  "finance",
  "other",
] as const;

export type GwapBrowserCategory = (typeof GWAP_BROWSER_CATEGORIES)[number];

export const GWAP_BROWSER_CATEGORY_LABELS: Record<GwapBrowserCategory, string> = {
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

/** Registry caps for the bounded V1 document. See docs/GWAP_BROWSER_V1.md. */
export const GWAP_BROWSER_MAX_PUBLICATIONS = 2_000;
export const GWAP_BROWSER_MAX_PUBLICATIONS_PER_OWNER = 50;
export const GWAP_BROWSER_SEARCH_MAX_LIMIT = 24;
export const GWAP_BROWSER_SEARCH_DEFAULT_LIMIT = 20;
export const GWAP_BROWSER_SEARCH_MAX_OFFSET = 2_000;
export const GWAP_BROWSER_QUERY_MAX_LENGTH = 120;

/** Ownership proof older than this must be revalidated before opening. */
export const GWAP_BROWSER_OWNERSHIP_TTL_MS = 15 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceDeploymentProvider = "vercel" | "cloudflare" | "netlify" | "other";

export const WORKSPACE_DEPLOYMENT_PROVIDERS: WorkspaceDeploymentProvider[] = [
  "vercel",
  "cloudflare",
  "netlify",
  "other",
];

export type WorkspaceDeploymentRecord = {
  id: string; // dep_<stable hash>
  workspaceId: string;
  projectId: string;
  provider: WorkspaceDeploymentProvider;
  url: string; // canonical HTTPS URL
  status: "configured";
  createdBy: string; // GWAP account ID
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  schemaVersion: 1;
};

export type GwapBrowserVisibility = "public" | "unlisted" | "private";
export type GwapBrowserPublishedVisibility = Exclude<GwapBrowserVisibility, "private">;
export type GwapBrowserPublicationStatus = "published" | "suspended";

export type GwapBrowserPublicationDraft = {
  workspaceId: string;
  projectId: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  visibility: GwapBrowserVisibility;
  attestedDeploymentControl: boolean;
  updatedBy: string;
  updatedAt: string;
  schemaVersion: 1;
};

export type GwapBrowserPublication = {
  id: string; // pub_<stable hash of workspace>
  workspaceId: string;
  projectId: string;
  ownerAccountId: string;
  ownerWallet: string;
  ownerGnsName: string; // no .gwap suffix
  slug: string;
  address: string; // slug.owner.gwap
  title: string;
  summary: string;
  category: string;
  tags: string[];
  deploymentUrl: string; // snapshot at publish time
  deploymentHash: string; // deterministic change detection
  visibility: GwapBrowserPublishedVisibility;
  status: GwapBrowserPublicationStatus;
  version: number;
  ownershipVerifiedAt: string;
  publishedAt: string;
  updatedAt: string;
  schemaVersion: 1;
};

export type GwapBrowserOwnerRoute = {
  ownerGnsName: string;
  ownerAccountId: string;
  mode: "profile" | "project";
  primaryPublicationId: string | null;
  updatedAt: string;
  schemaVersion: 1;
};

export type GwapBrowserRegistry = {
  publications: GwapBrowserPublication[];
  ownerRoutes: GwapBrowserOwnerRoute[];
  updatedAt: string;
  schemaVersion: 1;
};

// ---------------------------------------------------------------------------
// Address grammar
// ---------------------------------------------------------------------------

export type GwapAddress =
  | { kind: "owner"; owner: string; address: string }
  | { kind: "profile"; owner: string; address: string }
  | { kind: "project"; owner: string; slug: string; address: string };

export type GwapAddressParseFailure =
  | "empty"
  | "not_gwap"
  | "nested"
  | "invalid_owner"
  | "invalid_slug"
  | "reserved_slug";

export type GwapAddressParse =
  | { ok: true; value: GwapAddress }
  | { ok: false; reason: GwapAddressParseFailure };

function stripAddressDecoration(raw: string) {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^(?:https?:\/\/|gwap:\/\/)/, "");
  value = value.replace(/^@/, "");
  value = value.replace(/[/.\s]+$/, "");
  return value;
}

/** Trims, lowercases, and strips protocol/decoration from a raw address. */
export function normalizeGwapAddressInput(raw: unknown) {
  if (typeof raw !== "string") return "";
  return stripAddressDecoration(raw);
}

export function isValidOwnerName(value: unknown): value is string {
  return typeof value === "string" && OWNER_NAME_PATTERN.test(value);
}

export function isReservedProjectSlug(value: string) {
  return RESERVED_PROJECT_SLUGS.has(value);
}

export type SlugValidation =
  | { ok: true; slug: string }
  | { ok: false; reason: "invalid" | "reserved" };

export function validateProjectSlug(raw: unknown): SlugValidation {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const slug = raw.trim().toLowerCase();
  if (!PROJECT_SLUG_PATTERN.test(slug)) return { ok: false, reason: "invalid" };
  if (isReservedProjectSlug(slug)) return { ok: false, reason: "reserved" };
  return { ok: true, slug };
}

export function ownerAddress(owner: string) {
  return `${owner}.${GWAP_TLD}`;
}

export function profileAddress(owner: string) {
  return `${PROFILE_LABEL}.${owner}.${GWAP_TLD}`;
}

export function projectAddress(owner: string, slug: string) {
  return `${slug}.${owner}.${GWAP_TLD}`;
}

/**
 * Parses an exact `.gwap` address. V1 supports exactly:
 *   owner.gwap · profile.owner.gwap · project.owner.gwap
 * Nested routes (a.b.owner.gwap) are rejected.
 */
export function parseGwapAddress(raw: unknown): GwapAddressParse {
  const value = normalizeGwapAddressInput(raw);
  if (!value) return { ok: false, reason: "empty" };
  if (/\s/.test(value)) return { ok: false, reason: "not_gwap" };

  const labels = value.split(".");
  if (labels.length < 2 || labels[labels.length - 1] !== GWAP_TLD) {
    return { ok: false, reason: "not_gwap" };
  }
  const parts = labels.slice(0, -1);
  if (parts.length > 2) return { ok: false, reason: "nested" };

  const owner = parts[parts.length - 1];
  if (!isValidOwnerName(owner)) return { ok: false, reason: "invalid_owner" };

  if (parts.length === 1) {
    return { ok: true, value: { kind: "owner", owner, address: ownerAddress(owner) } };
  }

  const label = parts[0];
  if (label === PROFILE_LABEL) {
    return { ok: true, value: { kind: "profile", owner, address: profileAddress(owner) } };
  }
  if (!PROJECT_SLUG_PATTERN.test(label)) return { ok: false, reason: "invalid_slug" };
  if (isReservedProjectSlug(label)) return { ok: false, reason: "reserved_slug" };
  return {
    ok: true,
    value: { kind: "project", owner, slug: label, address: projectAddress(owner, label) },
  };
}

// ---------------------------------------------------------------------------
// Query classification
// ---------------------------------------------------------------------------

export type GwapBrowserQuery =
  | { type: "address"; address: GwapAddress; raw: string }
  | { type: "search"; query: string }
  | { type: "invalid_address"; reason: GwapAddressParseFailure; raw: string }
  | { type: "empty" };

/** Bounds, trims, and collapses whitespace in a keyword query. */
export function normalizeSearchQuery(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GWAP_BROWSER_QUERY_MAX_LENGTH);
}

/**
 * Decides whether input is an exact `.gwap` address or a keyword search.
 * Anything ending in `.gwap` (after normalization) is treated as an address
 * attempt so malformed addresses surface a precise error instead of a search.
 */
export function classifyBrowserQuery(raw: unknown): GwapBrowserQuery {
  const query = normalizeSearchQuery(raw);
  if (!query) return { type: "empty" };

  const candidate = normalizeGwapAddressInput(query);
  const looksLikeAddress = !/\s/.test(candidate) && candidate.endsWith(`.${GWAP_TLD}`);
  if (!looksLikeAddress) return { type: "search", query };

  const parsed = parseGwapAddress(candidate);
  if (parsed.ok) return { type: "address", address: parsed.value, raw: candidate };
  return { type: "invalid_address", reason: parsed.reason, raw: candidate };
}

export function describeAddressFailure(reason: GwapAddressParseFailure) {
  switch (reason) {
    case "empty":
      return "Enter a .gwap address or a keyword.";
    case "not_gwap":
      return "Exact addresses end in .gwap, like emerald.gwap or store.emerald.gwap.";
    case "nested":
      return "Gwap Browser V1 supports owner.gwap, profile.owner.gwap, and project.owner.gwap only.";
    case "invalid_owner":
      return "Owner names use 1–32 lowercase letters, numbers, or internal hyphens.";
    case "invalid_slug":
      return "Project names use 1–48 lowercase letters, numbers, or internal hyphens.";
    case "reserved_slug":
      return "That project name is reserved.";
    default:
      return "That address could not be read.";
  }
}

// ---------------------------------------------------------------------------
// Deployment URL policy
// ---------------------------------------------------------------------------

export type DeploymentUrlFailure =
  | "empty"
  | "too_long"
  | "control_characters"
  | "unparseable"
  | "scheme"
  | "credentials"
  | "hostname"
  | "private_network";

export type DeploymentUrlValidation =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: DeploymentUrlFailure };

const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".onion", ".lan"];

function isPublicHostname(host: string) {
  if (!host || host.length > 253) return false;
  if (host.startsWith("[") || host.includes(":")) return false; // IPv6 literal
  if (IPV4_PATTERN.test(host)) return false;
  if (host === "localhost") return false;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => HOST_LABEL_PATTERN.test(label))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,63}$/.test(tld);
}

/**
 * Accepts only canonical public HTTPS destinations. Never fetches the URL —
 * V1 stores a user-attested deployment target and nothing more.
 */
export function validateDeploymentUrl(raw: unknown): DeploymentUrlValidation {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > DEPLOYMENT_URL_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return { ok: false, reason: "control_characters" };
  if (trimmed.startsWith("//")) return { ok: false, reason: "scheme" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (parsed.username || parsed.password) return { ok: false, reason: "credentials" };

  const host = parsed.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "hostname" };
  if (IPV4_PATTERN.test(host) || host.startsWith("[") || host === "localhost") {
    return { ok: false, reason: "private_network" };
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "private_network" };
  }
  if (!isPublicHostname(host)) return { ok: false, reason: "hostname" };

  parsed.hash = "";
  const url = parsed.toString();
  if (url.length > DEPLOYMENT_URL_MAX_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, url, host };
}

export function describeDeploymentUrlFailure(reason: DeploymentUrlFailure) {
  switch (reason) {
    case "empty":
      return "Enter the live HTTPS URL of your deployment.";
    case "too_long":
      return "That URL is too long.";
    case "control_characters":
      return "That URL contains characters that cannot be stored.";
    case "unparseable":
      return "That does not look like a valid URL.";
    case "scheme":
      return "Only https:// deployment URLs are accepted.";
    case "credentials":
      return "Remove the username or password from the URL.";
    case "hostname":
      return "Use a public hostname, like my-app.vercel.app.";
    case "private_network":
      return "Raw IP addresses and private network hosts are not accepted.";
    default:
      return "That URL could not be validated.";
  }
}

export function isDeploymentProvider(value: unknown): value is WorkspaceDeploymentProvider {
  return (
    value === "vercel" || value === "cloudflare" || value === "netlify" || value === "other"
  );
}

/** Deterministic provider inference from the deployment hostname. */
export function inferDeploymentProvider(host: string): WorkspaceDeploymentProvider {
  const value = host.toLowerCase();
  if (value === "vercel.app" || value.endsWith(".vercel.app")) return "vercel";
  if (value === "pages.dev" || value.endsWith(".pages.dev") || value.endsWith(".workers.dev")) {
    return "cloudflare";
  }
  if (value === "netlify.app" || value.endsWith(".netlify.app")) return "netlify";
  return "other";
}

export const DEPLOYMENT_PROVIDER_LABELS: Record<WorkspaceDeploymentProvider, string> = {
  vercel: "Vercel",
  cloudflare: "Cloudflare",
  netlify: "Netlify",
  other: "Other",
};

export function deploymentHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Stable identifiers + hashes
// ---------------------------------------------------------------------------

function stableDigest(input: string, length: number) {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

export const DEPLOYMENT_ID_PATTERN = /^dep_[a-f0-9]{24}$/;
export const PUBLICATION_ID_PATTERN = /^pub_[a-f0-9]{24}$/;

export function deriveDeploymentId(workspaceId: string) {
  return `dep_${stableDigest(`deployment::${workspaceId}`, 24)}`;
}

export function derivePublicationId(workspaceId: string) {
  return `pub_${stableDigest(`publication::${workspaceId}`, 24)}`;
}

export function isPublicationId(value: unknown): value is string {
  return typeof value === "string" && PUBLICATION_ID_PATTERN.test(value);
}

/** Deterministic change detection for a deployment target. */
export function deploymentHash(provider: WorkspaceDeploymentProvider, url: string) {
  return stableDigest(`${provider}::${url}`, 16);
}

// ---------------------------------------------------------------------------
// Publication metadata validation
// ---------------------------------------------------------------------------

export function isGwapBrowserCategory(value: unknown): value is GwapBrowserCategory {
  return typeof value === "string" && (GWAP_BROWSER_CATEGORIES as readonly string[]).includes(value);
}

export function isGwapBrowserVisibility(value: unknown): value is GwapBrowserVisibility {
  return value === "public" || value === "unlisted" || value === "private";
}

/** Maps an existing workspace category onto the Browser category set. */
export function defaultBrowserCategory(workspaceCategory: string): GwapBrowserCategory {
  const value = workspaceCategory.trim().toLowerCase();
  return isGwapBrowserCategory(value) ? value : "other";
}

function collapseText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export type BoundedTextResult =
  | { ok: true; value: string }
  | { ok: false; reason: "invalid" | "too_short" | "too_long" };

export function boundedPublicationText(
  raw: unknown,
  min: number,
  max: number,
): BoundedTextResult {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const value = collapseText(raw);
  if (value.length < min) return { ok: false, reason: "too_short" };
  if (value.length > max) return { ok: false, reason: "too_long" };
  return { ok: true, value };
}

export type TagsResult =
  | { ok: true; tags: string[] }
  | { ok: false; reason: "invalid" | "too_many" | "invalid_tag" };

const TAG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;

export function normalizeTag(raw: unknown) {
  if (typeof raw !== "string") return null;
  const tag = collapseText(raw).toLowerCase().replace(/\s+/g, "-").replace(/^#/, "");
  return TAG_PATTERN.test(tag) && tag.length <= PUBLICATION_TAG_MAX_LENGTH ? tag : null;
}

/** Accepts an array or a comma-separated string of tags. */
export function normalizeTags(raw: unknown): TagsResult {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : raw === undefined || raw === null
        ? []
        : null;
  if (!list) return { ok: false, reason: "invalid" };
  const tags: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") return { ok: false, reason: "invalid_tag" };
    if (!item.trim()) continue;
    const tag = normalizeTag(item);
    if (!tag) return { ok: false, reason: "invalid_tag" };
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > PUBLICATION_TAG_MAX_COUNT) return { ok: false, reason: "too_many" };
  return { ok: true, tags };
}

export type DraftFieldErrors = Partial<
  Record<"slug" | "title" | "summary" | "category" | "tags" | "visibility", string>
>;

export type DraftValidation =
  | {
      ok: true;
      value: Pick<
        GwapBrowserPublicationDraft,
        "slug" | "title" | "summary" | "category" | "tags" | "visibility" | "attestedDeploymentControl"
      >;
    }
  | { ok: false; errors: DraftFieldErrors };

/** Validates every user-supplied publication field with bounded, strict rules. */
export function validatePublicationDraftInput(input: Record<string, unknown>): DraftValidation {
  const errors: DraftFieldErrors = {};

  const slug = validateProjectSlug(input.slug);
  if (!slug.ok) {
    errors.slug =
      slug.reason === "reserved"
        ? "That project name is reserved."
        : "Use 1–48 lowercase letters, numbers, or internal hyphens.";
  }

  const title = boundedPublicationText(input.title, PUBLICATION_TITLE_MIN, PUBLICATION_TITLE_MAX);
  if (!title.ok) {
    errors.title =
      title.reason === "too_long"
        ? `Keep the title under ${PUBLICATION_TITLE_MAX} characters.`
        : `Add a title of at least ${PUBLICATION_TITLE_MIN} characters.`;
  }

  const summary = boundedPublicationText(
    input.summary,
    PUBLICATION_SUMMARY_MIN,
    PUBLICATION_SUMMARY_MAX,
  );
  if (!summary.ok) {
    errors.summary =
      summary.reason === "too_long"
        ? `Keep the summary under ${PUBLICATION_SUMMARY_MAX} characters.`
        : `Add a summary of at least ${PUBLICATION_SUMMARY_MIN} characters.`;
  }

  const category = typeof input.category === "string" ? input.category.trim().toLowerCase() : "";
  if (!isGwapBrowserCategory(category)) errors.category = "Choose a category.";

  const tags = normalizeTags(input.tags);
  if (!tags.ok) {
    errors.tags =
      tags.reason === "too_many"
        ? `Use at most ${PUBLICATION_TAG_MAX_COUNT} tags.`
        : "Tags use lowercase letters, numbers, or hyphens (max 24 characters each).";
  }

  const visibility = input.visibility;
  if (!isGwapBrowserVisibility(visibility)) errors.visibility = "Choose Public, Unlisted, or Private.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      slug: (slug as { ok: true; slug: string }).slug,
      title: (title as { ok: true; value: string }).value,
      summary: (summary as { ok: true; value: string }).value,
      category: category as GwapBrowserCategory,
      tags: (tags as { ok: true; tags: string[] }).tags,
      visibility: visibility as GwapBrowserVisibility,
      attestedDeploymentControl: input.attestedDeploymentControl === true,
    },
  };
}

// ---------------------------------------------------------------------------
// Visibility + status rules
// ---------------------------------------------------------------------------

/** A publication can be opened by exact address only while published. */
export function isExactResolvable(publication: GwapBrowserPublication) {
  return (
    publication.status === "published" &&
    (publication.visibility === "public" || publication.visibility === "unlisted")
  );
}

/** Only published + Public records appear in keyword discovery. */
export function isDiscoverable(publication: GwapBrowserPublication) {
  return publication.status === "published" && publication.visibility === "public";
}

export function isPublishableVisibility(
  value: GwapBrowserVisibility,
): value is GwapBrowserPublishedVisibility {
  return value === "public" || value === "unlisted";
}

/** Fields whose change bumps the publication version. */
export type PublicationSnapshot = Pick<
  GwapBrowserPublication,
  "slug" | "title" | "summary" | "category" | "tags" | "visibility" | "deploymentUrl" | "deploymentHash"
>;

export function publicationSnapshotEquals(a: PublicationSnapshot, b: PublicationSnapshot) {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.summary === b.summary &&
    a.category === b.category &&
    a.visibility === b.visibility &&
    a.deploymentUrl === b.deploymentUrl &&
    a.deploymentHash === b.deploymentHash &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
  );
}

export function isOwnershipProofFresh(
  publication: Pick<GwapBrowserPublication, "ownershipVerifiedAt">,
  now = Date.now(),
  ttlMs = GWAP_BROWSER_OWNERSHIP_TTL_MS,
) {
  const verified = Date.parse(publication.ownershipVerifiedAt);
  if (Number.isNaN(verified)) return false;
  return now - verified >= 0 && now - verified <= ttlMs;
}

// ---------------------------------------------------------------------------
// Primary route resolution
// ---------------------------------------------------------------------------

export type PrimaryRouteResolution =
  | { mode: "profile"; reason: "default" | "explicit" | "invalid_project" }
  | { mode: "project"; publication: GwapBrowserPublication };

/**
 * Resolves what `owner.gwap` should point at. Profile is the default and the
 * safe fallback whenever the chosen project is missing, unpublished,
 * suspended, private, or no longer owned by the same account/name.
 */
export function resolvePrimaryRoute(
  owner: string,
  route: GwapBrowserOwnerRoute | null | undefined,
  publications: GwapBrowserPublication[],
): PrimaryRouteResolution {
  if (!route || route.ownerGnsName !== owner) return { mode: "profile", reason: "default" };
  if (route.mode !== "project" || !route.primaryPublicationId) {
    return { mode: "profile", reason: "explicit" };
  }
  const publication = publications.find((entry) => entry.id === route.primaryPublicationId);
  if (
    !publication ||
    publication.ownerGnsName !== owner ||
    publication.ownerAccountId !== route.ownerAccountId ||
    !isExactResolvable(publication)
  ) {
    return { mode: "profile", reason: "invalid_project" };
  }
  return { mode: "project", publication };
}

// ---------------------------------------------------------------------------
// Deterministic search
// ---------------------------------------------------------------------------

export const SEARCH_MAX_TOKENS = 8;

export function tokenizeSearchQuery(query: string) {
  const tokens: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9.]+/)) {
    const token = raw.replace(/^\.+|\.+$/g, "").slice(0, 32);
    if (!token || tokens.includes(token)) continue;
    tokens.push(token);
    if (tokens.length >= SEARCH_MAX_TOKENS) break;
  }
  return tokens;
}

export const SEARCH_SCORE = {
  exactAddress: 1_000,
  prefix: 500,
  allTokensTitleOrTags: 300,
  ownerOrCategory: 150,
  summaryToken: 40,
  titleToken: 60,
} as const;

/**
 * Scores a publication for a query. Zero means "not a match". Purely
 * lexical and deterministic — no AI, no usage signals.
 */
export function scorePublication(publication: GwapBrowserPublication, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const tokens = tokenizeSearchQuery(normalized);
  if (!tokens.length) return 0;

  const title = publication.title.toLowerCase();
  const summary = publication.summary.toLowerCase();
  const address = publication.address.toLowerCase();
  const tags = publication.tags.map((tag) => tag.toLowerCase());
  const owner = publication.ownerGnsName.toLowerCase();
  const category = publication.category.toLowerCase();
  const compactQuery = normalizeGwapAddressInput(normalized);

  let score = 0;
  if (compactQuery && address === compactQuery) score += SEARCH_SCORE.exactAddress;
  if (
    (compactQuery && address.startsWith(compactQuery)) ||
    title.startsWith(normalized)
  ) {
    score += SEARCH_SCORE.prefix;
  }

  const titleWords = title.split(/[^a-z0-9]+/).filter(Boolean);
  const inTitleOrTags = (token: string) =>
    titleWords.some((word) => word.startsWith(token)) || tags.some((tag) => tag.startsWith(token));
  const matchedTitle = tokens.filter(inTitleOrTags);
  if (matchedTitle.length === tokens.length) score += SEARCH_SCORE.allTokensTitleOrTags;
  score += matchedTitle.length * SEARCH_SCORE.titleToken;

  if (tokens.some((token) => token === owner || token === category || `${token}` === `${owner}.gwap`)) {
    score += SEARCH_SCORE.ownerOrCategory;
  }

  const summaryMatches = tokens.filter((token) => summary.includes(token)).length;
  score += summaryMatches * SEARCH_SCORE.summaryToken;

  return score;
}

export type SearchSort = "relevance" | "updated" | "new";

export function isSearchSort(value: unknown): value is SearchSort {
  return value === "relevance" || value === "updated" || value === "new";
}

export type SearchInput = {
  query: string;
  category?: string | null;
  sort?: SearchSort;
  offset?: unknown;
  limit?: unknown;
};

export type SearchResult = {
  items: GwapBrowserPublication[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
};

function compareIso(a: string, b: string) {
  const left = Date.parse(a);
  const right = Date.parse(b);
  const safeLeft = Number.isNaN(left) ? 0 : left;
  const safeRight = Number.isNaN(right) ? 0 : right;
  return safeRight - safeLeft;
}

export function clampSearchLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return GWAP_BROWSER_SEARCH_DEFAULT_LIMIT;
  return Math.min(GWAP_BROWSER_SEARCH_MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

export function clampSearchOffset(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(GWAP_BROWSER_SEARCH_MAX_OFFSET, Math.max(0, Math.floor(parsed)));
}

/**
 * Deterministic discovery over Public publications only. With a query,
 * results rank by score, then most recently updated, then address. Without a
 * query, `sort` picks New Releases (publishedAt) or Recently Updated.
 */
export function searchPublications(
  publications: GwapBrowserPublication[],
  input: SearchInput,
): SearchResult {
  const query = normalizeSearchQuery(input.query);
  const category = input.category && isGwapBrowserCategory(input.category) ? input.category : null;
  const sort: SearchSort = input.sort ?? (query ? "relevance" : "updated");
  const limit = clampSearchLimit(input.limit);
  const offset = clampSearchOffset(input.offset);

  const candidates = publications.filter(
    (publication) => isDiscoverable(publication) && (!category || publication.category === category),
  );

  let ranked: Array<{ publication: GwapBrowserPublication; score: number }>;
  if (query) {
    ranked = candidates
      .map((publication) => ({ publication, score: scorePublication(publication, query) }))
      .filter((entry) => entry.score > 0);
  } else {
    ranked = candidates.map((publication) => ({ publication, score: 0 }));
  }

  ranked.sort((a, b) => {
    if (sort === "relevance" && b.score !== a.score) return b.score - a.score;
    const byDate =
      sort === "new"
        ? compareIso(a.publication.publishedAt, b.publication.publishedAt)
        : compareIso(a.publication.updatedAt, b.publication.updatedAt);
    if (byDate !== 0) return byDate;
    return a.publication.address.localeCompare(b.publication.address);
  });

  const total = ranked.length;
  const items = ranked.slice(offset, offset + limit).map((entry) => entry.publication);
  const nextOffset = offset + items.length < total ? offset + items.length : null;
  return { items, total, offset, limit, nextOffset };
}

// ---------------------------------------------------------------------------
// Public projections — the only shape that leaves the server for Browser APIs
// ---------------------------------------------------------------------------

export type GwapBrowserPublicProject = {
  id: string;
  address: string;
  slug: string;
  ownerGnsName: string;
  ownerAddress: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  visibility: GwapBrowserPublishedVisibility;
  version: number;
  deploymentHost: string;
  publishedAt: string;
  updatedAt: string;
};

/** Strips every private/internal field. Never include wallets or account IDs. */
export function toPublicProject(publication: GwapBrowserPublication): GwapBrowserPublicProject {
  return {
    id: publication.id,
    address: publication.address,
    slug: publication.slug,
    ownerGnsName: publication.ownerGnsName,
    ownerAddress: ownerAddress(publication.ownerGnsName),
    title: publication.title,
    summary: publication.summary,
    category: publication.category,
    tags: [...publication.tags],
    visibility: publication.visibility,
    version: publication.version,
    deploymentHost: deploymentHost(publication.deploymentUrl),
    publishedAt: publication.publishedAt,
    updatedAt: publication.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Feature flags (pure parsing; the server module reads process.env)
// ---------------------------------------------------------------------------

/** Flags are on only when the value is literally "true". */
export function parseFeatureFlag(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}
