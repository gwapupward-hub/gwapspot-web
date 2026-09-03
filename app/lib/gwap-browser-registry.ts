import type { WorkspaceRedis } from "./redis.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";
import { isProjectId, isWorkspaceId } from "./daily-ideas-workspace-core.ts";
import { WorkspaceLockBusyError, withWorkspaceLock } from "./workspace-lock.ts";
import {
  GWAP_BROWSER_MAX_PUBLICATIONS,
  GWAP_BROWSER_MAX_PUBLICATIONS_PER_OWNER,
  OWNER_NAME_PATTERN,
  PROJECT_SLUG_PATTERN,
  PUBLICATION_SUMMARY_MAX,
  PUBLICATION_TAG_MAX_COUNT,
  PUBLICATION_TITLE_MAX,
  deploymentHash,
  derivePublicationId,
  isExactResolvable,
  isGwapBrowserCategory,
  isGwapBrowserVisibility,
  isPublicationId,
  isPublishableVisibility,
  isReservedProjectSlug,
  normalizeTag,
  projectAddress,
  publicationSnapshotEquals,
  validateDeploymentUrl,
  validatePublicationDraftInput,
  defaultBrowserCategory,
  type DraftFieldErrors,
  type GwapBrowserOwnerRoute,
  type GwapBrowserPublication,
  type GwapBrowserPublicationDraft,
  type GwapBrowserRegistry,
  type WorkspaceDeploymentRecord,
} from "./gwap-browser-core.ts";

// ---------------------------------------------------------------------------
// Gwap Browser registry — one bounded document for V1.
//
// The existing Redis abstraction exposes GET/SET/NX/EVAL only (no sets, sorted
// sets, or search), so V1 keeps every publication and owner route in a single
// document capped at GWAP_BROWSER_MAX_PUBLICATIONS. Every read-modify-write
// runs under the distributed workspace lease. A dedicated search/database
// service replaces this document before scale approaches the cap.
//
// Private drafts live in their own per-workspace key and never enter the
// registry, so public APIs cannot leak them.
// ---------------------------------------------------------------------------

const REGISTRY_SUBJECT = "global";
const REGISTRY_LOCK_TTL_SECONDS = 15;

function registryKey() {
  return workspaceStorageKey("gwap-browser-registry", REGISTRY_SUBJECT);
}

function registryLockKey() {
  return workspaceStorageKey("gwap-browser-registry-lock", REGISTRY_SUBJECT);
}

function draftKey(workspaceId: string) {
  return workspaceStorageKey("gwap-browser-draft", workspaceId);
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSafeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

function isTagList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= PUBLICATION_TAG_MAX_COUNT &&
    value.every((tag) => typeof tag === "string" && normalizeTag(tag) === tag)
  );
}

// ---------------------------------------------------------------------------
// Strict normalizers — corrupt records are dropped, never coerced.
// ---------------------------------------------------------------------------

export function normalizePublication(value: unknown): GwapBrowserPublication | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Partial<GwapBrowserPublication>;
  if (
    !isPublicationId(c.id) ||
    !isWorkspaceId(c.workspaceId) ||
    !isProjectId(c.projectId) ||
    c.id !== derivePublicationId(c.workspaceId) ||
    typeof c.ownerAccountId !== "string" ||
    !c.ownerAccountId ||
    typeof c.ownerWallet !== "string" ||
    !c.ownerWallet ||
    typeof c.ownerGnsName !== "string" ||
    !OWNER_NAME_PATTERN.test(c.ownerGnsName) ||
    typeof c.slug !== "string" ||
    !PROJECT_SLUG_PATTERN.test(c.slug) ||
    isReservedProjectSlug(c.slug) ||
    c.address !== projectAddress(c.ownerGnsName, c.slug) ||
    !isSafeText(c.title, PUBLICATION_TITLE_MAX) ||
    !c.title.trim() ||
    !isSafeText(c.summary, PUBLICATION_SUMMARY_MAX) ||
    !isGwapBrowserCategory(c.category) ||
    !isTagList(c.tags) ||
    typeof c.deploymentUrl !== "string" ||
    typeof c.deploymentHash !== "string" ||
    !/^[a-f0-9]{16}$/.test(c.deploymentHash) ||
    !isGwapBrowserVisibility(c.visibility) ||
    !isPublishableVisibility(c.visibility) ||
    (c.status !== "published" && c.status !== "suspended") ||
    typeof c.version !== "number" ||
    !Number.isSafeInteger(c.version) ||
    c.version < 1 ||
    !isIso(c.ownershipVerifiedAt) ||
    !isIso(c.publishedAt) ||
    !isIso(c.updatedAt) ||
    c.schemaVersion !== 1
  ) {
    return null;
  }
  const url = validateDeploymentUrl(c.deploymentUrl);
  if (!url.ok || url.url !== c.deploymentUrl) return null;
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    projectId: c.projectId,
    ownerAccountId: c.ownerAccountId,
    ownerWallet: c.ownerWallet,
    ownerGnsName: c.ownerGnsName,
    slug: c.slug,
    address: c.address,
    title: c.title,
    summary: c.summary,
    category: c.category,
    tags: [...c.tags],
    deploymentUrl: c.deploymentUrl,
    deploymentHash: c.deploymentHash,
    visibility: c.visibility,
    status: c.status,
    version: c.version,
    ownershipVerifiedAt: c.ownershipVerifiedAt,
    publishedAt: c.publishedAt,
    updatedAt: c.updatedAt,
    schemaVersion: 1,
  };
}

export function normalizeOwnerRoute(value: unknown): GwapBrowserOwnerRoute | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Partial<GwapBrowserOwnerRoute>;
  if (
    typeof c.ownerGnsName !== "string" ||
    !OWNER_NAME_PATTERN.test(c.ownerGnsName) ||
    typeof c.ownerAccountId !== "string" ||
    !c.ownerAccountId ||
    (c.mode !== "profile" && c.mode !== "project") ||
    !(c.primaryPublicationId === null || isPublicationId(c.primaryPublicationId)) ||
    !isIso(c.updatedAt) ||
    c.schemaVersion !== 1
  ) {
    return null;
  }
  return {
    ownerGnsName: c.ownerGnsName,
    ownerAccountId: c.ownerAccountId,
    mode: c.mode,
    primaryPublicationId: c.mode === "project" ? c.primaryPublicationId : null,
    updatedAt: c.updatedAt,
    schemaVersion: 1,
  };
}

export type NormalizedRegistry = { registry: GwapBrowserRegistry; dropped: number };

export function emptyRegistry(now = new Date(0).toISOString()): GwapBrowserRegistry {
  return { publications: [], ownerRoutes: [], updatedAt: now, schemaVersion: 1 };
}

export function normalizeRegistry(value: unknown): NormalizedRegistry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { registry: emptyRegistry(), dropped: value === null || value === undefined ? 0 : 1 };
  }
  const c = value as Partial<GwapBrowserRegistry>;
  let dropped = 0;
  const publications: GwapBrowserPublication[] = [];
  const seenWorkspaces = new Set<string>();
  for (const entry of Array.isArray(c.publications) ? c.publications : []) {
    const publication = normalizePublication(entry);
    if (!publication || seenWorkspaces.has(publication.workspaceId)) {
      dropped += 1;
      continue;
    }
    seenWorkspaces.add(publication.workspaceId);
    publications.push(publication);
  }
  const ownerRoutes: GwapBrowserOwnerRoute[] = [];
  const seenOwners = new Set<string>();
  for (const entry of Array.isArray(c.ownerRoutes) ? c.ownerRoutes : []) {
    const route = normalizeOwnerRoute(entry);
    if (!route || seenOwners.has(route.ownerGnsName)) {
      dropped += 1;
      continue;
    }
    seenOwners.add(route.ownerGnsName);
    ownerRoutes.push(route);
  }
  return {
    registry: {
      publications,
      ownerRoutes,
      updatedAt: isIso(c.updatedAt) ? c.updatedAt : new Date(0).toISOString(),
      schemaVersion: 1,
    },
    dropped,
  };
}

export function normalizePublicationDraft(value: unknown): GwapBrowserPublicationDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Partial<GwapBrowserPublicationDraft>;
  if (
    !isWorkspaceId(c.workspaceId) ||
    !isProjectId(c.projectId) ||
    typeof c.slug !== "string" ||
    typeof c.title !== "string" ||
    typeof c.summary !== "string" ||
    typeof c.category !== "string" ||
    !Array.isArray(c.tags) ||
    !isGwapBrowserVisibility(c.visibility) ||
    typeof c.attestedDeploymentControl !== "boolean" ||
    typeof c.updatedBy !== "string" ||
    !isIso(c.updatedAt) ||
    c.schemaVersion !== 1
  ) {
    return null;
  }
  // Drafts are user-editable, so a stale/invalid field is kept as-is for the
  // owner to fix; publishing re-validates everything strictly.
  return {
    workspaceId: c.workspaceId,
    projectId: c.projectId,
    slug: c.slug.slice(0, 64),
    title: c.title.slice(0, PUBLICATION_TITLE_MAX * 2),
    summary: c.summary.slice(0, PUBLICATION_SUMMARY_MAX * 2),
    category: c.category.slice(0, 40),
    tags: c.tags.filter((tag): tag is string => typeof tag === "string").slice(0, PUBLICATION_TAG_MAX_COUNT),
    visibility: c.visibility,
    attestedDeploymentControl: c.attestedDeploymentControl,
    updatedBy: c.updatedBy,
    updatedAt: c.updatedAt,
    schemaVersion: 1,
  };
}

// ---------------------------------------------------------------------------
// Registry I/O
// ---------------------------------------------------------------------------

export async function readRegistry(redis: WorkspaceRedis) {
  return normalizeRegistry(await redis.get<GwapBrowserRegistry>(registryKey())).registry;
}

type MutationOutcome<T> =
  | { commit: true; registry: GwapBrowserRegistry; result: T }
  | { commit: false; result: T };

/**
 * Runs a registry read-modify-write under the distributed lease. The document
 * is only written when the mutation commits; a thrown error or a non-commit
 * outcome leaves the last valid registry untouched.
 */
async function mutateRegistry<T>(
  redis: WorkspaceRedis,
  now: string,
  mutation: (registry: GwapBrowserRegistry) => MutationOutcome<T>,
): Promise<{ ok: true; result: T } | { ok: false; reason: "lock_busy" }> {
  try {
    const result = await withWorkspaceLock(
      redis,
      registryLockKey(),
      async () => {
        const current = await readRegistry(redis);
        const outcome = mutation(current);
        if (outcome.commit) {
          await redis.set(registryKey(), { ...outcome.registry, updatedAt: now, schemaVersion: 1 });
        }
        return outcome.result;
      },
      { ttlSeconds: REGISTRY_LOCK_TTL_SECONDS },
    );
    return { ok: true, result };
  } catch (error) {
    if (error instanceof WorkspaceLockBusyError) return { ok: false, reason: "lock_busy" };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Lookups (pure over a registry snapshot)
// ---------------------------------------------------------------------------

export function findPublicationByWorkspace(registry: GwapBrowserRegistry, workspaceId: string) {
  return registry.publications.find((entry) => entry.workspaceId === workspaceId) ?? null;
}

export function findPublicationById(registry: GwapBrowserRegistry, publicationId: string) {
  return registry.publications.find((entry) => entry.id === publicationId) ?? null;
}

/** Exact address lookup. Prefers a published record when duplicates exist. */
export function findPublicationByAddress(registry: GwapBrowserRegistry, owner: string, slug: string) {
  const matches = registry.publications.filter(
    (entry) => entry.ownerGnsName === owner && entry.slug === slug,
  );
  return matches.find((entry) => entry.status === "published") ?? matches[0] ?? null;
}

export function findOwnerRoute(registry: GwapBrowserRegistry, owner: string) {
  return registry.ownerRoutes.find((entry) => entry.ownerGnsName === owner) ?? null;
}

export function listOwnerPublications(registry: GwapBrowserRegistry, ownerAccountId: string) {
  return registry.publications.filter((entry) => entry.ownerAccountId === ownerAccountId);
}

// ---------------------------------------------------------------------------
// Drafts (private, per workspace)
// ---------------------------------------------------------------------------

export async function getPublicationDraft(redis: WorkspaceRedis, workspaceId: string) {
  if (!isWorkspaceId(workspaceId)) return null;
  return normalizePublicationDraft(await redis.get<GwapBrowserPublicationDraft>(draftKey(workspaceId)));
}

function slugFromTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!slug || !PROJECT_SLUG_PATTERN.test(slug) || isReservedProjectSlug(slug)) return "project";
  return slug;
}

/** Seed draft derived from existing workspace data; never persisted implicitly. */
export function buildDefaultDraft(workspace: {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  category: string;
}): GwapBrowserPublicationDraft {
  return {
    workspaceId: workspace.id,
    projectId: workspace.projectId,
    slug: slugFromTitle(workspace.title),
    title: workspace.title.slice(0, PUBLICATION_TITLE_MAX),
    summary: workspace.summary.slice(0, PUBLICATION_SUMMARY_MAX),
    category: defaultBrowserCategory(workspace.category),
    tags: [],
    visibility: "private",
    attestedDeploymentControl: false,
    updatedBy: "",
    updatedAt: new Date(0).toISOString(),
    schemaVersion: 1,
  };
}

export type SaveDraftResult =
  | { ok: true; draft: GwapBrowserPublicationDraft }
  | { ok: false; errors: DraftFieldErrors };

export async function savePublicationDraft(
  redis: WorkspaceRedis,
  input: {
    workspaceId: string;
    projectId: string;
    actorId: string;
    fields: Record<string, unknown>;
    now?: string;
  },
): Promise<SaveDraftResult> {
  const validation = validatePublicationDraftInput(input.fields);
  if (!validation.ok) return validation;
  const draft: GwapBrowserPublicationDraft = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    ...validation.value,
    updatedBy: input.actorId,
    updatedAt: input.now ?? new Date().toISOString(),
    schemaVersion: 1,
  };
  await redis.set(draftKey(input.workspaceId), draft);
  return { ok: true, draft };
}

// ---------------------------------------------------------------------------
// Publish / unpublish / suspend / refresh
// ---------------------------------------------------------------------------

export type PublishInput = {
  workspace: { id: string; projectId: string; ownerAccountId: string };
  draft: GwapBrowserPublicationDraft;
  deployment: WorkspaceDeploymentRecord;
  owner: { accountId: string; wallet: string; gnsName: string };
  ownershipVerifiedAt: string;
  now?: string;
};

export type PublishFailure =
  | "lock_busy"
  | "invalid_draft"
  | "visibility_private"
  | "not_attested"
  | "not_owner"
  | "slug_taken"
  | "registry_full"
  | "owner_limit";

export type PublishResult =
  | { ok: true; publication: GwapBrowserPublication; created: boolean; changed: boolean }
  | { ok: false; reason: PublishFailure; errors?: DraftFieldErrors };

/**
 * Publishes (or updates) the workspace's single publication. Snapshots the
 * current deployment target, bumps `version` only when public data or the
 * target changed, and is idempotent otherwise. Ownership must already be
 * verified live by the caller — this function records the proof, it does not
 * produce it.
 */
export async function publishWorkspaceProject(
  redis: WorkspaceRedis,
  input: PublishInput,
): Promise<PublishResult> {
  if (input.workspace.ownerAccountId !== input.owner.accountId) return { ok: false, reason: "not_owner" };
  const validation = validatePublicationDraftInput(input.draft);
  if (!validation.ok) return { ok: false, reason: "invalid_draft", errors: validation.errors };
  const fields = validation.value;
  if (!isPublishableVisibility(fields.visibility)) return { ok: false, reason: "visibility_private" };
  if (!fields.attestedDeploymentControl) return { ok: false, reason: "not_attested" };
  if (!OWNER_NAME_PATTERN.test(input.owner.gnsName)) return { ok: false, reason: "not_owner" };

  const now = input.now ?? new Date().toISOString();
  const id = derivePublicationId(input.workspace.id);
  const visibility = fields.visibility;
  const targetHash = deploymentHash(input.deployment.provider, input.deployment.url);

  const outcome = await mutateRegistry<PublishResult>(redis, now, (registry) => {
    const existing = findPublicationByWorkspace(registry, input.workspace.id);
    const collision = registry.publications.find(
      (entry) =>
        entry.workspaceId !== input.workspace.id &&
        entry.status === "published" &&
        entry.ownerGnsName === input.owner.gnsName &&
        entry.slug === fields.slug,
    );
    if (collision) return { commit: false, result: { ok: false, reason: "slug_taken" } };

    if (!existing) {
      if (registry.publications.length >= GWAP_BROWSER_MAX_PUBLICATIONS) {
        return { commit: false, result: { ok: false, reason: "registry_full" } };
      }
      const active = registry.publications.filter(
        (entry) => entry.ownerAccountId === input.owner.accountId && entry.status === "published",
      ).length;
      if (active >= GWAP_BROWSER_MAX_PUBLICATIONS_PER_OWNER) {
        return { commit: false, result: { ok: false, reason: "owner_limit" } };
      }
    }

    const snapshot = {
      slug: fields.slug,
      title: fields.title,
      summary: fields.summary,
      category: fields.category,
      tags: fields.tags,
      visibility,
      deploymentUrl: input.deployment.url,
      deploymentHash: targetHash,
    };
    const changed = !existing || !publicationSnapshotEquals(existing, snapshot);
    const reactivated = Boolean(existing && existing.status !== "published");
    const ownerChanged =
      Boolean(existing) &&
      (existing!.ownerGnsName !== input.owner.gnsName || existing!.ownerWallet !== input.owner.wallet);

    const publication: GwapBrowserPublication = {
      id,
      workspaceId: input.workspace.id,
      projectId: input.workspace.projectId,
      ownerAccountId: input.owner.accountId,
      ownerWallet: input.owner.wallet,
      ownerGnsName: input.owner.gnsName,
      slug: fields.slug,
      address: projectAddress(input.owner.gnsName, fields.slug),
      title: fields.title,
      summary: fields.summary,
      category: fields.category,
      tags: fields.tags,
      deploymentUrl: input.deployment.url,
      deploymentHash: targetHash,
      visibility,
      status: "published",
      version: existing ? (changed ? existing.version + 1 : existing.version) : 1,
      ownershipVerifiedAt: input.ownershipVerifiedAt,
      publishedAt: existing?.publishedAt ?? now,
      updatedAt: changed || reactivated || ownerChanged || !existing ? now : existing.updatedAt,
      schemaVersion: 1,
    };

    const publications = [
      ...registry.publications.filter((entry) => entry.workspaceId !== input.workspace.id),
      publication,
    ];
    return {
      commit: true,
      registry: { ...registry, publications },
      result: { ok: true, publication, created: !existing, changed },
    };
  });

  if (!outcome.ok) return { ok: false, reason: "lock_busy" };
  return outcome.result;
}

function resetRoutesPointingAt(
  routes: GwapBrowserOwnerRoute[],
  publicationId: string,
  now: string,
): { routes: GwapBrowserOwnerRoute[]; reset: boolean } {
  let reset = false;
  const next = routes.map((route) => {
    if (route.primaryPublicationId !== publicationId) return route;
    reset = true;
    return { ...route, mode: "profile" as const, primaryPublicationId: null, updatedAt: now };
  });
  return { routes: next, reset };
}

export type UnpublishResult =
  | { ok: true; removed: boolean; publication: GwapBrowserPublication | null; routeReset: boolean }
  | { ok: false; reason: "lock_busy" };

/**
 * Removes public resolution + discovery for the workspace's publication and
 * atomically returns any primary owner route to Profile. The private draft is
 * preserved. Idempotent.
 */
export async function unpublishWorkspaceProject(
  redis: WorkspaceRedis,
  input: { workspaceId: string; now?: string },
): Promise<UnpublishResult> {
  const now = input.now ?? new Date().toISOString();
  const outcome = await mutateRegistry<UnpublishResult>(redis, now, (registry) => {
    const existing = findPublicationByWorkspace(registry, input.workspaceId);
    if (!existing) {
      return { commit: false, result: { ok: true, removed: false, publication: null, routeReset: false } };
    }
    const { routes, reset } = resetRoutesPointingAt(registry.ownerRoutes, existing.id, now);
    return {
      commit: true,
      registry: {
        ...registry,
        publications: registry.publications.filter((entry) => entry.workspaceId !== input.workspaceId),
        ownerRoutes: routes,
      },
      result: { ok: true, removed: true, publication: existing, routeReset: reset },
    };
  });
  if (!outcome.ok) return { ok: false, reason: "lock_busy" };
  return outcome.result;
}

export type SuspendResult =
  | { ok: true; suspended: boolean; publication: GwapBrowserPublication | null; routeReset: boolean }
  | { ok: false; reason: "lock_busy" };

/**
 * Suspends a publication whose GNS ownership no longer matches its recorded
 * owner. Suspended records never resolve or appear in discovery, and any
 * primary route pointing at them returns to Profile. The record is kept so the
 * rightful owner can republish after re-verifying.
 */
export async function suspendPublication(
  redis: WorkspaceRedis,
  input: { publicationId: string; now?: string },
): Promise<SuspendResult> {
  const now = input.now ?? new Date().toISOString();
  const outcome = await mutateRegistry<SuspendResult>(redis, now, (registry) => {
    const existing = findPublicationById(registry, input.publicationId);
    if (!existing) {
      return { commit: false, result: { ok: true, suspended: false, publication: null, routeReset: false } };
    }
    if (existing.status === "suspended") {
      return { commit: false, result: { ok: true, suspended: false, publication: existing, routeReset: false } };
    }
    const suspended: GwapBrowserPublication = { ...existing, status: "suspended", updatedAt: now };
    const { routes, reset } = resetRoutesPointingAt(registry.ownerRoutes, existing.id, now);
    return {
      commit: true,
      registry: {
        ...registry,
        publications: registry.publications.map((entry) => (entry.id === existing.id ? suspended : entry)),
        ownerRoutes: routes,
      },
      result: { ok: true, suspended: true, publication: suspended, routeReset: reset },
    };
  });
  if (!outcome.ok) return { ok: false, reason: "lock_busy" };
  return outcome.result;
}

/** Records a fresh live ownership check without touching public metadata. */
export async function refreshOwnershipProof(
  redis: WorkspaceRedis,
  input: { publicationId: string; verifiedAt: string },
) {
  const outcome = await mutateRegistry<boolean>(redis, input.verifiedAt, (registry) => {
    const existing = findPublicationById(registry, input.publicationId);
    if (!existing || existing.status !== "published") return { commit: false, result: false };
    const next = { ...existing, ownershipVerifiedAt: input.verifiedAt };
    return {
      commit: true,
      registry: {
        ...registry,
        publications: registry.publications.map((entry) => (entry.id === existing.id ? next : entry)),
      },
      result: true,
    };
  });
  return outcome.ok ? outcome.result : false;
}

// ---------------------------------------------------------------------------
// Owner primary route
// ---------------------------------------------------------------------------

export type SetOwnerRouteResult =
  | { ok: true; route: GwapBrowserOwnerRoute }
  | { ok: false; reason: "lock_busy" | "invalid_publication" };

/**
 * Points `owner.gwap` at Profile (default) or at one of the owner's own
 * published projects. The caller must already have verified live GNS
 * ownership of `ownerGnsName` for `ownerAccountId`.
 */
export async function setOwnerRoute(
  redis: WorkspaceRedis,
  input: {
    ownerGnsName: string;
    ownerAccountId: string;
    mode: "profile" | "project";
    publicationId: string | null;
    now?: string;
  },
): Promise<SetOwnerRouteResult> {
  const now = input.now ?? new Date().toISOString();
  const outcome = await mutateRegistry<SetOwnerRouteResult>(redis, now, (registry) => {
    let primaryPublicationId: string | null = null;
    if (input.mode === "project") {
      const publication = input.publicationId ? findPublicationById(registry, input.publicationId) : null;
      if (
        !publication ||
        publication.ownerAccountId !== input.ownerAccountId ||
        publication.ownerGnsName !== input.ownerGnsName ||
        !isExactResolvable(publication)
      ) {
        return { commit: false, result: { ok: false, reason: "invalid_publication" } };
      }
      primaryPublicationId = publication.id;
    }
    const route: GwapBrowserOwnerRoute = {
      ownerGnsName: input.ownerGnsName,
      ownerAccountId: input.ownerAccountId,
      mode: input.mode,
      primaryPublicationId,
      updatedAt: now,
      schemaVersion: 1,
    };
    return {
      commit: true,
      registry: {
        ...registry,
        ownerRoutes: [
          ...registry.ownerRoutes.filter((entry) => entry.ownerGnsName !== input.ownerGnsName),
          route,
        ],
      },
      result: { ok: true, route },
    };
  });
  if (!outcome.ok) return { ok: false, reason: "lock_busy" };
  return outcome.result;
}

// ---------------------------------------------------------------------------
// Member-facing projection (private workspace API — never the public API)
// ---------------------------------------------------------------------------

export function toMemberPublicationView(publication: GwapBrowserPublication) {
  return {
    id: publication.id,
    address: publication.address,
    ownerAddress: `${publication.ownerGnsName}.gwap`,
    slug: publication.slug,
    title: publication.title,
    summary: publication.summary,
    category: publication.category,
    tags: [...publication.tags],
    visibility: publication.visibility,
    status: publication.status,
    version: publication.version,
    deploymentUrl: publication.deploymentUrl,
    deploymentHash: publication.deploymentHash,
    ownershipVerifiedAt: publication.ownershipVerifiedAt,
    publishedAt: publication.publishedAt,
    updatedAt: publication.updatedAt,
  };
}
