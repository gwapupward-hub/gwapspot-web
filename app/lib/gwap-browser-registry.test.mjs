import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDefaultDraft,
  findOwnerRoute,
  findPublicationByAddress,
  findPublicationByWorkspace,
  getPublicationDraft,
  normalizeRegistry,
  publishWorkspaceProject,
  readRegistry,
  refreshOwnershipProof,
  savePublicationDraft,
  setOwnerRoute,
  suspendPublication,
  toMemberPublicationView,
  unpublishWorkspaceProject,
} from "./gwap-browser-registry.ts";
import {
  GWAP_BROWSER_MAX_PUBLICATIONS_PER_OWNER,
  derivePublicationId,
  isDiscoverable,
  resolvePrimaryRoute,
  searchPublications,
} from "./gwap-browser-core.ts";
import { workspaceStorageKey } from "./daily-ideas-workspace-keys.ts";

function createMemoryRedis() {
  const store = new Map();
  return {
    store,
    async get(key) {
      const raw = store.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    async set(key, value) {
      store.set(key, JSON.stringify(value));
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async setIfAbsent(key, value) {
      if (store.has(key)) return false;
      store.set(key, JSON.stringify(value));
      return true;
    },
    async deleteIfValue(key, value) {
      if (store.get(key) !== JSON.stringify(value)) return false;
      store.delete(key);
      return true;
    },
    async incr() {
      return 1;
    },
    async expire() {
      return 1;
    },
    async ping() {
      return true;
    },
  };
}

const WALLET = "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2";
const OTHER_WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const WS_A = "wsp_aaaaaaaaaaaaaaaaaaaaaaaa";
const WS_B = "wsp_bbbbbbbbbbbbbbbbbbbbbbbb";
const WS_C = "wsp_cccccccccccccccccccccccc";
const PROJECT_A = "project_aaaaaaaaaaaaaaaaaaaa";
const PROJECT_B = "project_bbbbbbbbbbbbbbbbbbbb";
const PROJECT_C = "project_cccccccccccccccccccc";
const EMERALD = { accountId: "gwap_emerald_00000000000000", wallet: WALLET, gnsName: "emerald" };
const RUBY = { accountId: "gwap_ruby_0000000000000000000", wallet: OTHER_WALLET, gnsName: "ruby" };

function draft(workspaceId, projectId, overrides = {}) {
  return {
    workspaceId,
    projectId,
    slug: "store",
    title: "Emerald Store",
    summary: "A storefront for on-chain collectibles.",
    category: "commerce",
    tags: ["shop"],
    visibility: "public",
    attestedDeploymentControl: true,
    updatedBy: "x",
    updatedAt: "2026-09-02T09:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

function deployment(workspaceId, projectId, url = "https://emerald-store.vercel.app/") {
  return {
    id: "dep_000000000000000000000000",
    workspaceId,
    projectId,
    provider: "vercel",
    url,
    status: "configured",
    createdBy: "x",
    createdAt: "2026-09-02T08:00:00.000Z",
    updatedBy: "x",
    updatedAt: "2026-09-02T08:00:00.000Z",
    schemaVersion: 1,
  };
}

function publishInput(workspaceId, projectId, owner, overrides = {}) {
  return {
    workspace: { id: workspaceId, projectId, ownerAccountId: owner.accountId },
    draft: draft(workspaceId, projectId, overrides.draft ?? {}),
    deployment: deployment(workspaceId, projectId, overrides.url),
    owner,
    ownershipVerifiedAt: overrides.verifiedAt ?? "2026-09-02T10:00:00.000Z",
    now: overrides.now ?? "2026-09-02T10:00:00.000Z",
  };
}

// --- Drafts ----------------------------------------------------------------

test("drafts are validated, stored per workspace, and default from the workspace", async () => {
  const redis = createMemoryRedis();
  const seed = buildDefaultDraft({ id: WS_A, projectId: PROJECT_A, title: "Emerald Store!!", summary: "s", category: "general" });
  assert.equal(seed.slug, "emerald-store");
  assert.equal(seed.category, "other");
  assert.equal(seed.visibility, "private");
  assert.equal(buildDefaultDraft({ id: WS_A, projectId: PROJECT_A, title: "API", summary: "", category: "ai" }).slug, "project");

  const invalid = await savePublicationDraft(redis, { workspaceId: WS_A, projectId: PROJECT_A, actorId: "a", fields: { slug: "api" } });
  assert.equal(invalid.ok, false);
  assert.equal(await getPublicationDraft(redis, WS_A), null);

  const saved = await savePublicationDraft(redis, {
    workspaceId: WS_A,
    projectId: PROJECT_A,
    actorId: EMERALD.accountId,
    fields: { slug: "store", title: "Emerald Store", summary: "A storefront for collectibles.", category: "commerce", tags: "shop", visibility: "private" },
    now: "2026-09-02T09:00:00.000Z",
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(await getPublicationDraft(redis, WS_A), saved.draft);
  // Drafts never enter the registry document.
  assert.equal((await readRegistry(redis)).publications.length, 0);
});

// --- Publish -----------------------------------------------------------------

test("publishes one record per workspace and exact-resolves it", async () => {
  const redis = createMemoryRedis();
  const result = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.publication.id, derivePublicationId(WS_A));
  assert.equal(result.publication.address, "store.emerald.gwap");
  assert.equal(result.publication.version, 1);
  assert.equal(result.publication.status, "published");
  assert.equal(result.publication.ownershipVerifiedAt, "2026-09-02T10:00:00.000Z");

  const registry = await readRegistry(redis);
  assert.equal(registry.publications.length, 1);
  assert.equal(findPublicationByWorkspace(registry, WS_A).id, result.publication.id);
  assert.equal(findPublicationByAddress(registry, "emerald", "store").id, result.publication.id);
  assert.equal(isDiscoverable(result.publication), true);
  assert.equal(searchPublications(registry.publications, { query: "store" }).total, 1);
});

test("private drafts, missing attestation, and non-owners cannot publish", async () => {
  const redis = createMemoryRedis();
  assert.deepEqual(
    await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { draft: { visibility: "private" } })),
    { ok: false, reason: "visibility_private" },
  );
  assert.deepEqual(
    await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { draft: { attestedDeploymentControl: false } })),
    { ok: false, reason: "not_attested" },
  );
  const wrongOwner = publishInput(WS_A, PROJECT_A, EMERALD);
  wrongOwner.workspace.ownerAccountId = RUBY.accountId;
  assert.deepEqual(await publishWorkspaceProject(redis, wrongOwner), { ok: false, reason: "not_owner" });
  const badDraft = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { draft: { slug: "api" } }));
  assert.equal(badDraft.ok, false);
  assert.equal(badDraft.reason, "invalid_draft");
  assert.equal((await readRegistry(redis)).publications.length, 0);
});

test("same slug is allowed across owners but blocked within one owner namespace", async () => {
  const redis = createMemoryRedis();
  assert.equal((await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD))).ok, true);
  assert.equal((await publishWorkspaceProject(redis, publishInput(WS_B, PROJECT_B, RUBY))).ok, true);
  const collision = await publishWorkspaceProject(redis, publishInput(WS_C, PROJECT_C, EMERALD));
  assert.deepEqual(collision, { ok: false, reason: "slug_taken" });
  const registry = await readRegistry(redis);
  assert.equal(registry.publications.length, 2);
  assert.equal(findPublicationByAddress(registry, "emerald", "store").workspaceId, WS_A);
  assert.equal(findPublicationByAddress(registry, "ruby", "store").workspaceId, WS_B);
});

test("republishing is idempotent and bumps the version only when public data or target changed", async () => {
  const redis = createMemoryRedis();
  const first = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  const same = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { now: "2026-09-02T11:00:00.000Z", verifiedAt: "2026-09-02T11:00:00.000Z" }));
  assert.equal(same.ok, true);
  assert.equal(same.created, false);
  assert.equal(same.changed, false);
  assert.equal(same.publication.version, 1);
  assert.equal(same.publication.updatedAt, first.publication.updatedAt);
  assert.equal(same.publication.ownershipVerifiedAt, "2026-09-02T11:00:00.000Z");

  const retitled = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { draft: { title: "Emerald Store v2" }, now: "2026-09-02T12:00:00.000Z" }));
  assert.equal(retitled.changed, true);
  assert.equal(retitled.publication.version, 2);
  assert.equal(retitled.publication.updatedAt, "2026-09-02T12:00:00.000Z");
  assert.equal(retitled.publication.publishedAt, first.publication.publishedAt);

  const retargeted = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { draft: { title: "Emerald Store v2" }, url: "https://emerald-store-2.vercel.app/", now: "2026-09-02T13:00:00.000Z" }));
  assert.equal(retargeted.publication.version, 3);
  assert.equal(retargeted.publication.deploymentUrl, "https://emerald-store-2.vercel.app/");

  const unlisted = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { draft: { title: "Emerald Store v2", visibility: "unlisted" }, url: "https://emerald-store-2.vercel.app/" }));
  assert.equal(unlisted.publication.version, 4);
  assert.equal(unlisted.publication.visibility, "unlisted");
  assert.equal((await readRegistry(redis)).publications.length, 1);
});

test("unlisted exact-resolves but is excluded from discovery", async () => {
  const redis = createMemoryRedis();
  await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { draft: { visibility: "unlisted" } }));
  const registry = await readRegistry(redis);
  const publication = findPublicationByAddress(registry, "emerald", "store");
  assert.equal(publication.visibility, "unlisted");
  assert.equal(searchPublications(registry.publications, { query: "store" }).total, 0);
  assert.equal(searchPublications(registry.publications, { query: "" }).total, 0);
});

// --- Unpublish -----------------------------------------------------------------

test("unpublish removes resolution and discovery, preserves the draft, and resets the primary route", async () => {
  const redis = createMemoryRedis();
  await savePublicationDraft(redis, {
    workspaceId: WS_A,
    projectId: PROJECT_A,
    actorId: EMERALD.accountId,
    fields: draft(WS_A, PROJECT_A),
  });
  const published = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  const route = await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "project", publicationId: published.publication.id });
  assert.equal(route.ok, true);
  assert.equal(findOwnerRoute(await readRegistry(redis), "emerald").mode, "project");

  const result = await unpublishWorkspaceProject(redis, { workspaceId: WS_A, now: "2026-09-02T12:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.equal(result.routeReset, true);
  const registry = await readRegistry(redis);
  assert.equal(registry.publications.length, 0);
  assert.equal(findPublicationByAddress(registry, "emerald", "store"), null);
  assert.deepEqual(findOwnerRoute(registry, "emerald"), {
    ownerGnsName: "emerald",
    ownerAccountId: EMERALD.accountId,
    mode: "profile",
    primaryPublicationId: null,
    updatedAt: "2026-09-02T12:00:00.000Z",
    schemaVersion: 1,
  });
  assert.notEqual(await getPublicationDraft(redis, WS_A), null);

  const again = await unpublishWorkspaceProject(redis, { workspaceId: WS_A });
  assert.deepEqual(again, { ok: true, removed: false, publication: null, routeReset: false });
});

// --- Suspension + ownership proof ----------------------------------------------

test("suspended records never resolve, drop out of discovery, and reset the primary route", async () => {
  const redis = createMemoryRedis();
  const published = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "project", publicationId: published.publication.id });

  const result = await suspendPublication(redis, { publicationId: published.publication.id, now: "2026-09-02T12:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.suspended, true);
  assert.equal(result.routeReset, true);
  const registry = await readRegistry(redis);
  const record = findPublicationByAddress(registry, "emerald", "store");
  assert.equal(record.status, "suspended");
  assert.equal(isDiscoverable(record), false);
  assert.equal(searchPublications(registry.publications, { query: "store" }).total, 0);
  assert.equal(resolvePrimaryRoute("emerald", findOwnerRoute(registry, "emerald"), registry.publications).mode, "profile");

  const repeat = await suspendPublication(redis, { publicationId: published.publication.id });
  assert.equal(repeat.suspended, false);
  assert.equal(await refreshOwnershipProof(redis, { publicationId: published.publication.id, verifiedAt: "2026-09-02T13:00:00.000Z" }), false);

  // Re-publishing after a fresh live check reactivates the same record.
  const republished = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD, { now: "2026-09-02T14:00:00.000Z", verifiedAt: "2026-09-02T14:00:00.000Z" }));
  assert.equal(republished.publication.status, "published");
  assert.equal(republished.publication.version, 1);
  assert.equal((await readRegistry(redis)).publications.length, 1);
});

test("refreshOwnershipProof only touches the timestamp", async () => {
  const redis = createMemoryRedis();
  const published = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  assert.equal(await refreshOwnershipProof(redis, { publicationId: published.publication.id, verifiedAt: "2026-09-02T13:00:00.000Z" }), true);
  const record = findPublicationByWorkspace(await readRegistry(redis), WS_A);
  assert.equal(record.ownershipVerifiedAt, "2026-09-02T13:00:00.000Z");
  assert.equal(record.updatedAt, published.publication.updatedAt);
  assert.equal(record.version, 1);
  assert.equal(await refreshOwnershipProof(redis, { publicationId: "pub_000000000000000000000000", verifiedAt: "2026-09-02T13:00:00.000Z" }), false);
});

// --- Primary route -------------------------------------------------------------

test("primary route defaults to Profile and only accepts the owner's own live publication", async () => {
  const redis = createMemoryRedis();
  const mine = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  const theirs = await publishWorkspaceProject(redis, publishInput(WS_B, PROJECT_B, RUBY));
  assert.equal(resolvePrimaryRoute("emerald", null, (await readRegistry(redis)).publications).mode, "profile");

  assert.deepEqual(
    await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "project", publicationId: theirs.publication.id }),
    { ok: false, reason: "invalid_publication" },
  );
  assert.deepEqual(
    await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "project", publicationId: null }),
    { ok: false, reason: "invalid_publication" },
  );
  assert.deepEqual(
    await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "project", publicationId: "pub_000000000000000000000000" }),
    { ok: false, reason: "invalid_publication" },
  );
  const ok = await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "project", publicationId: mine.publication.id });
  assert.equal(ok.ok, true);
  let registry = await readRegistry(redis);
  assert.equal(resolvePrimaryRoute("emerald", findOwnerRoute(registry, "emerald"), registry.publications).mode, "project");

  const back = await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "profile", publicationId: mine.publication.id });
  assert.equal(back.ok, true);
  assert.equal(back.route.primaryPublicationId, null);
  registry = await readRegistry(redis);
  assert.equal(registry.ownerRoutes.length, 1);
  assert.equal(resolvePrimaryRoute("emerald", findOwnerRoute(registry, "emerald"), registry.publications).reason, "explicit");
});

// --- Locking, caps, corruption -------------------------------------------------

test("lock contention returns a retryable outcome without touching the registry", async () => {
  const redis = createMemoryRedis();
  await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  const before = redis.store.get(workspaceStorageKey("gwap-browser-registry", "global"));
  await redis.setIfAbsent(workspaceStorageKey("gwap-browser-registry-lock", "global"), "held", 30);

  assert.deepEqual(await publishWorkspaceProject(redis, publishInput(WS_B, PROJECT_B, RUBY)), { ok: false, reason: "lock_busy" });
  assert.deepEqual(await unpublishWorkspaceProject(redis, { workspaceId: WS_A }), { ok: false, reason: "lock_busy" });
  assert.deepEqual(await suspendPublication(redis, { publicationId: derivePublicationId(WS_A) }), { ok: false, reason: "lock_busy" });
  assert.deepEqual(
    await setOwnerRoute(redis, { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "profile", publicationId: null }),
    { ok: false, reason: "lock_busy" },
  );
  assert.equal(await refreshOwnershipProof(redis, { publicationId: derivePublicationId(WS_A), verifiedAt: "2026-09-02T13:00:00.000Z" }), false);
  assert.equal(redis.store.get(workspaceStorageKey("gwap-browser-registry", "global")), before);
});

test("caps are enforced per owner and globally", async () => {
  const redis = createMemoryRedis();
  const registryKey = workspaceStorageKey("gwap-browser-registry", "global");
  const seedPublications = [];
  for (let index = 0; index < GWAP_BROWSER_MAX_PUBLICATIONS_PER_OWNER; index += 1) {
    const workspaceId = `wsp_${index.toString(16).padStart(24, "0")}`;
    seedPublications.push({
      id: derivePublicationId(workspaceId),
      workspaceId,
      projectId: `project_${index.toString(16).padStart(20, "0")}`,
      ownerAccountId: EMERALD.accountId,
      ownerWallet: WALLET,
      ownerGnsName: "emerald",
      slug: `p${index}`,
      address: `p${index}.emerald.gwap`,
      title: `Project ${index}`,
      summary: "Seeded publication for cap testing.",
      category: "tools",
      tags: [],
      deploymentUrl: "https://example.com/",
      deploymentHash: "0123456789abcdef",
      visibility: "public",
      status: "published",
      version: 1,
      ownershipVerifiedAt: "2026-09-02T10:00:00.000Z",
      publishedAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
      schemaVersion: 1,
    });
  }
  await redis.set(registryKey, { publications: seedPublications, ownerRoutes: [], updatedAt: "2026-09-02T10:00:00.000Z", schemaVersion: 1 });
  assert.deepEqual(await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD)), { ok: false, reason: "owner_limit" });
  // A different owner is still within the global cap.
  assert.equal((await publishWorkspaceProject(redis, publishInput(WS_B, PROJECT_B, RUBY))).ok, true);
});

test("corrupt registry entries are rejected, never coerced into listings", async () => {
  const redis = createMemoryRedis();
  const good = (await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD))).publication;
  const registryKey = workspaceStorageKey("gwap-browser-registry", "global");
  await redis.set(registryKey, {
    publications: [
      good,
      { ...good, workspaceId: WS_B, id: good.id },                        // id/workspace mismatch
      { ...good, workspaceId: WS_C, id: derivePublicationId(WS_C), deploymentUrl: "http://plain.example.com/" },
      { ...good, workspaceId: WS_C, id: derivePublicationId(WS_C), visibility: "private" },
      { ...good, workspaceId: WS_C, id: derivePublicationId(WS_C), title: "<b>Bold</b> " },
      { ...good, workspaceId: WS_C, id: derivePublicationId(WS_C), address: "wrong.emerald.gwap" },
      "junk",
      null,
    ],
    ownerRoutes: [
      { ownerGnsName: "emerald", ownerAccountId: EMERALD.accountId, mode: "project", primaryPublicationId: "not-an-id", updatedAt: "2026-09-02T10:00:00.000Z", schemaVersion: 1 },
      { ownerGnsName: "ruby", ownerAccountId: RUBY.accountId, mode: "profile", primaryPublicationId: null, updatedAt: "2026-09-02T10:00:00.000Z", schemaVersion: 1 },
    ],
    updatedAt: "2026-09-02T10:00:00.000Z",
    schemaVersion: 1,
  });
  const normalized = normalizeRegistry(await redis.get(registryKey));
  assert.equal(normalized.registry.publications.length, 1);
  assert.equal(normalized.registry.ownerRoutes.length, 1);
  assert.equal(normalized.registry.ownerRoutes[0].ownerGnsName, "ruby");
  assert.equal(normalized.dropped, 8);
  assert.deepEqual(normalizeRegistry("junk").registry.publications, []);
  assert.deepEqual(normalizeRegistry(null).dropped, 0);
});

test("member view exposes workspace-safe fields without wallet or account ids", async () => {
  const redis = createMemoryRedis();
  const published = await publishWorkspaceProject(redis, publishInput(WS_A, PROJECT_A, EMERALD));
  const view = toMemberPublicationView(published.publication);
  assert.equal(view.address, "store.emerald.gwap");
  assert.equal(view.ownerAddress, "emerald.gwap");
  assert.equal("ownerWallet" in view, false);
  assert.equal("ownerAccountId" in view, false);
  assert.equal("workspaceId" in view, false);
});
