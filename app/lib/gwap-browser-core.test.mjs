import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAP_BROWSER_SEARCH_MAX_LIMIT,
  RESERVED_PROJECT_SLUGS,
  classifyBrowserQuery,
  clampSearchLimit,
  clampSearchOffset,
  defaultBrowserCategory,
  deploymentHash,
  deriveDeploymentId,
  derivePublicationId,
  inferDeploymentProvider,
  isDiscoverable,
  isExactResolvable,
  isOwnershipProofFresh,
  isPublicationId,
  normalizeTags,
  parseFeatureFlag,
  parseGwapAddress,
  publicationSnapshotEquals,
  resolvePrimaryRoute,
  scorePublication,
  searchPublications,
  toPublicProject,
  validateDeploymentUrl,
  validateProjectSlug,
  validatePublicationDraftInput,
} from "./gwap-browser-core.ts";

function publication(overrides = {}) {
  return {
    id: "pub_000000000000000000000001",
    workspaceId: "wsp_000000000000000000000001",
    projectId: "project_00000000000000000001",
    ownerAccountId: "gwap_owner_account_000000001",
    ownerWallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2",
    ownerGnsName: "emerald",
    slug: "store",
    address: "store.emerald.gwap",
    title: "Emerald Store",
    summary: "A storefront for on-chain collectibles built with GWAP.",
    category: "commerce",
    tags: ["shop", "nft"],
    deploymentUrl: "https://emerald-store.vercel.app/",
    deploymentHash: "abcdef0123456789",
    visibility: "public",
    status: "published",
    version: 1,
    ownershipVerifiedAt: "2026-09-02T10:00:00.000Z",
    publishedAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

// --- Address grammar ---------------------------------------------------------

test("parses owner, profile, and project addresses with normalization", () => {
  assert.deepEqual(parseGwapAddress("  Emerald.GWAP  "), {
    ok: true,
    value: { kind: "owner", owner: "emerald", address: "emerald.gwap" },
  });
  assert.deepEqual(parseGwapAddress("profile.emerald.gwap"), {
    ok: true,
    value: { kind: "profile", owner: "emerald", address: "profile.emerald.gwap" },
  });
  assert.deepEqual(parseGwapAddress("https://Store.Emerald.gwap/"), {
    ok: true,
    value: { kind: "project", owner: "emerald", slug: "store", address: "store.emerald.gwap" },
  });
});

test("rejects nested, malformed, non-gwap, and reserved addresses", () => {
  assert.equal(parseGwapAddress("demo.store.emerald.gwap").reason, "nested");
  assert.equal(parseGwapAddress("emerald").reason, "not_gwap");
  assert.equal(parseGwapAddress("emerald.com").reason, "not_gwap");
  assert.equal(parseGwapAddress("").reason, "empty");
  assert.equal(parseGwapAddress("-emerald.gwap").reason, "invalid_owner");
  assert.equal(parseGwapAddress(`${"a".repeat(33)}.gwap`).reason, "invalid_owner");
  assert.equal(parseGwapAddress("store-.emerald.gwap").reason, "invalid_slug");
  assert.equal(parseGwapAddress("Sto re.emerald.gwap").reason, "not_gwap");
  assert.equal(parseGwapAddress("api.emerald.gwap").reason, "reserved_slug");
  assert.equal(parseGwapAddress("émeraude.gwap").reason, "invalid_owner");
  assert.equal(parseGwapAddress(42).reason, "empty");
});

test("owner names accept 1–32 chars and slugs accept 1–48 chars", () => {
  assert.equal(parseGwapAddress("a.gwap").ok, true);
  assert.equal(parseGwapAddress(`${"a".repeat(32)}.gwap`).ok, true);
  assert.equal(parseGwapAddress(`${"b".repeat(48)}.emerald.gwap`).ok, true);
  assert.equal(parseGwapAddress(`${"b".repeat(49)}.emerald.gwap`).reason, "invalid_slug");
});

test("reserved slugs are blocked and kept in one core set", () => {
  for (const slug of ["profile", "www", "app", "api", "admin", "browser", "dashboard", "settings", "support", "gwap", "gns"]) {
    assert.equal(RESERVED_PROJECT_SLUGS.has(slug), true, slug);
    assert.deepEqual(validateProjectSlug(slug), { ok: false, reason: "reserved" });
  }
  assert.deepEqual(validateProjectSlug(" Store "), { ok: true, slug: "store" });
  assert.deepEqual(validateProjectSlug("store_1"), { ok: false, reason: "invalid" });
  assert.deepEqual(validateProjectSlug(""), { ok: false, reason: "invalid" });
});

// --- Query classification ----------------------------------------------------

test("classifies exact addresses, keyword searches, and invalid addresses", () => {
  assert.equal(classifyBrowserQuery("store.emerald.gwap").type, "address");
  assert.equal(classifyBrowserQuery("  AI trading tool ").type, "search");
  assert.equal(classifyBrowserQuery("  AI trading tool ").query, "AI trading tool");
  assert.equal(classifyBrowserQuery("emerald").type, "search");
  assert.equal(classifyBrowserQuery("").type, "empty");
  const nested = classifyBrowserQuery("a.b.c.gwap");
  assert.equal(nested.type, "invalid_address");
  assert.equal(nested.reason, "nested");
});

test("keyword queries are bounded and whitespace-normalized", () => {
  const long = classifyBrowserQuery(`${"x".repeat(200)}   y`);
  assert.equal(long.type, "search");
  assert.equal(long.query.length, 120);
  assert.equal(classifyBrowserQuery("a\u0001b").query, "a b");
});

// --- Deployment URL policy ---------------------------------------------------

test("accepts canonical https URLs and strips fragments", () => {
  assert.deepEqual(validateDeploymentUrl(" https://My-App.vercel.app/path?x=1#frag "), {
    ok: true,
    url: "https://my-app.vercel.app/path?x=1",
    host: "my-app.vercel.app",
  });
});

test("rejects unsafe schemes, credentials, private hosts, and control characters", () => {
  assert.equal(validateDeploymentUrl("http://example.com").reason, "scheme");
  assert.equal(validateDeploymentUrl("javascript:alert(1)").reason, "scheme");
  assert.equal(validateDeploymentUrl("data:text/html,hi").reason, "scheme");
  assert.equal(validateDeploymentUrl("file:///etc/passwd").reason, "scheme");
  assert.equal(validateDeploymentUrl("blob:https://example.com/x").reason, "scheme");
  assert.equal(validateDeploymentUrl("//example.com/app").reason, "scheme");
  assert.equal(validateDeploymentUrl("https://user:pass@example.com").reason, "credentials");
  assert.equal(validateDeploymentUrl("https://user@example.com").reason, "credentials");
  assert.equal(validateDeploymentUrl("https://10.0.0.1/app").reason, "private_network");
  assert.equal(validateDeploymentUrl("https://[::1]/app").reason, "private_network");
  assert.equal(validateDeploymentUrl("https://localhost:3000").reason, "private_network");
  assert.equal(validateDeploymentUrl("https://router.local").reason, "private_network");
  assert.equal(validateDeploymentUrl("https://intranet").reason, "hostname");
  assert.equal(validateDeploymentUrl("https://exa mple.com").reason, "unparseable");
  assert.equal(validateDeploymentUrl("https://example.com/\u0001").reason, "control_characters");
  assert.equal(validateDeploymentUrl(`https://example.com/${"a".repeat(2100)}`).reason, "too_long");
  assert.equal(validateDeploymentUrl("").reason, "empty");
  assert.equal(validateDeploymentUrl(null).reason, "empty");
});

test("infers providers deterministically from hostnames", () => {
  assert.equal(inferDeploymentProvider("my-app.vercel.app"), "vercel");
  assert.equal(inferDeploymentProvider("site.pages.dev"), "cloudflare");
  assert.equal(inferDeploymentProvider("api.workers.dev"), "cloudflare");
  assert.equal(inferDeploymentProvider("thing.netlify.app"), "netlify");
  assert.equal(inferDeploymentProvider("example.com"), "other");
  assert.equal(inferDeploymentProvider("notvercel.app"), "other");
});

// --- Identifiers -------------------------------------------------------------

test("identifiers and deployment hashes are stable", () => {
  const dep = deriveDeploymentId("wsp_000000000000000000000001");
  assert.match(dep, /^dep_[a-f0-9]{24}$/);
  assert.equal(dep, deriveDeploymentId("wsp_000000000000000000000001"));
  const pub = derivePublicationId("wsp_000000000000000000000001");
  assert.match(pub, /^pub_[a-f0-9]{24}$/);
  assert.equal(isPublicationId(pub), true);
  assert.equal(isPublicationId("pub_short"), false);
  assert.notEqual(dep.slice(4), pub.slice(4));
  assert.equal(
    deploymentHash("vercel", "https://a.vercel.app/"),
    deploymentHash("vercel", "https://a.vercel.app/"),
  );
  assert.notEqual(
    deploymentHash("vercel", "https://a.vercel.app/"),
    deploymentHash("other", "https://a.vercel.app/"),
  );
});

// --- Draft validation --------------------------------------------------------

test("validates publication drafts with bounded fields", () => {
  const result = validatePublicationDraftInput({
    slug: " Store ",
    title: "  Emerald   Store ",
    summary: "A storefront for on-chain collectibles.",
    category: "Commerce",
    tags: "Shop, NFT , shop",
    visibility: "public",
    attestedDeploymentControl: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    slug: "store",
    title: "Emerald Store",
    summary: "A storefront for on-chain collectibles.",
    category: "commerce",
    tags: ["shop", "nft"],
    visibility: "public",
    attestedDeploymentControl: true,
  });
});

test("reports every invalid draft field", () => {
  const result = validatePublicationDraftInput({
    slug: "api",
    title: "ab",
    summary: "short",
    category: "space",
    tags: ["ok", "bad tag!"],
    visibility: "secret",
    attestedDeploymentControl: "yes",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), [
    "category",
    "slug",
    "summary",
    "tags",
    "title",
    "visibility",
  ]);
  const tooLong = validatePublicationDraftInput({
    slug: "store",
    title: "x".repeat(81),
    summary: "y".repeat(281),
    category: "ai",
    tags: Array.from({ length: 9 }, (_, index) => `tag${index}`),
    visibility: "public",
  });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.title, /under 80/);
  assert.match(tooLong.errors.summary, /under 280/);
  assert.match(tooLong.errors.tags, /at most 8/);
});

test("tags normalize from arrays or comma strings and reject junk", () => {
  assert.deepEqual(normalizeTags(undefined), { ok: true, tags: [] });
  assert.deepEqual(normalizeTags(["AI", "ai", "Trading Tool"]), { ok: true, tags: ["ai", "trading-tool"] });
  assert.equal(normalizeTags([1]).ok, false);
  assert.equal(normalizeTags({}).ok, false);
  assert.equal(normalizeTags(["x".repeat(25)]).ok, false);
});

test("workspace categories map onto Browser categories", () => {
  assert.equal(defaultBrowserCategory("ai"), "ai");
  assert.equal(defaultBrowserCategory("Web3"), "web3");
  assert.equal(defaultBrowserCategory("general"), "other");
});

// --- Visibility + snapshots --------------------------------------------------

test("visibility rules: public discoverable, unlisted exact-only, suspended never", () => {
  assert.equal(isDiscoverable(publication()), true);
  assert.equal(isExactResolvable(publication()), true);
  assert.equal(isDiscoverable(publication({ visibility: "unlisted" })), false);
  assert.equal(isExactResolvable(publication({ visibility: "unlisted" })), true);
  assert.equal(isDiscoverable(publication({ status: "suspended" })), false);
  assert.equal(isExactResolvable(publication({ status: "suspended" })), false);
});

test("snapshot equality drives version bumps", () => {
  const base = publication();
  assert.equal(publicationSnapshotEquals(base, { ...base, tags: ["shop", "nft"] }), true);
  assert.equal(publicationSnapshotEquals(base, { ...base, tags: ["nft", "shop"] }), false);
  assert.equal(publicationSnapshotEquals(base, { ...base, title: "Other" }), false);
  assert.equal(publicationSnapshotEquals(base, { ...base, deploymentHash: "zzz" }), false);
});

test("ownership proof freshness respects the TTL", () => {
  const now = Date.parse("2026-09-02T10:10:00.000Z");
  assert.equal(isOwnershipProofFresh(publication(), now), true);
  assert.equal(isOwnershipProofFresh(publication({ ownershipVerifiedAt: "2026-09-02T09:40:00.000Z" }), now), false);
  assert.equal(isOwnershipProofFresh(publication({ ownershipVerifiedAt: "garbage" }), now), false);
  assert.equal(isOwnershipProofFresh(publication({ ownershipVerifiedAt: "2026-09-02T11:00:00.000Z" }), now), false);
});

// --- Primary route -----------------------------------------------------------

test("primary route defaults to profile and falls back on invalid projects", () => {
  const store = publication();
  assert.deepEqual(resolvePrimaryRoute("emerald", null, [store]), { mode: "profile", reason: "default" });
  const route = {
    ownerGnsName: "emerald",
    ownerAccountId: store.ownerAccountId,
    mode: "project",
    primaryPublicationId: store.id,
    updatedAt: "2026-09-02T10:00:00.000Z",
    schemaVersion: 1,
  };
  assert.deepEqual(resolvePrimaryRoute("emerald", route, [store]), { mode: "project", publication: store });
  assert.equal(resolvePrimaryRoute("emerald", { ...route, mode: "profile" }, [store]).reason, "explicit");
  assert.equal(resolvePrimaryRoute("emerald", route, []).reason, "invalid_project");
  assert.equal(resolvePrimaryRoute("emerald", route, [publication({ status: "suspended" })]).reason, "invalid_project");
  assert.equal(resolvePrimaryRoute("emerald", route, [publication({ ownerGnsName: "ruby" })]).reason, "invalid_project");
  assert.equal(
    resolvePrimaryRoute("emerald", route, [publication({ ownerAccountId: "gwap_someone_else_000000000" })]).reason,
    "invalid_project",
  );
  assert.equal(resolvePrimaryRoute("ruby", route, [store]).reason, "default");
});

// --- Search ------------------------------------------------------------------

test("search scoring is deterministic and ordered by specificity", () => {
  const exact = publication();
  const prefix = publication({ id: "pub_000000000000000000000002", address: "storefront.emerald.gwap", slug: "storefront", title: "Storefront Kit" });
  const titleMatch = publication({ id: "pub_000000000000000000000003", address: "shop.ruby.gwap", slug: "shop", ownerGnsName: "ruby", title: "Ruby Store Builder" });
  const summaryOnly = publication({ id: "pub_000000000000000000000004", address: "notes.ruby.gwap", slug: "notes", ownerGnsName: "ruby", title: "Notes", summary: "Keep store inventory notes.", tags: [] });
  const none = publication({ id: "pub_000000000000000000000005", address: "games.ruby.gwap", slug: "games", ownerGnsName: "ruby", title: "Arcade", summary: "Play.", tags: [] });

  assert.ok(scorePublication(exact, "store.emerald.gwap") > scorePublication(prefix, "store.emerald.gwap"));
  assert.ok(scorePublication(prefix, "store") >= scorePublication(titleMatch, "store"));
  assert.ok(scorePublication(titleMatch, "store") > scorePublication(summaryOnly, "store"));
  assert.ok(scorePublication(summaryOnly, "store") > 0);
  assert.equal(scorePublication(none, "store"), 0);
  assert.equal(scorePublication(exact, ""), 0);
  assert.equal(scorePublication(exact, "store"), scorePublication(exact, "store"));
});

test("searchPublications only returns Public + published records with ties broken by date then address", () => {
  const newest = publication({ id: "pub_000000000000000000000011", address: "a.zed.gwap", slug: "a", ownerGnsName: "zed", title: "Alpha Tool", updatedAt: "2026-09-03T00:00:00.000Z" });
  const older = publication({ id: "pub_000000000000000000000012", address: "b.zed.gwap", slug: "b", ownerGnsName: "zed", title: "Alpha Tool", updatedAt: "2026-09-01T00:00:00.000Z" });
  const sameDateA = publication({ id: "pub_000000000000000000000013", address: "c.zed.gwap", slug: "c", ownerGnsName: "zed", title: "Alpha Tool", updatedAt: "2026-09-02T00:00:00.000Z" });
  const sameDateB = publication({ id: "pub_000000000000000000000014", address: "d.zed.gwap", slug: "d", ownerGnsName: "zed", title: "Alpha Tool", updatedAt: "2026-09-02T00:00:00.000Z" });
  const unlisted = publication({ id: "pub_000000000000000000000015", address: "e.zed.gwap", slug: "e", ownerGnsName: "zed", title: "Alpha Tool", visibility: "unlisted" });
  const suspended = publication({ id: "pub_000000000000000000000016", address: "f.zed.gwap", slug: "f", ownerGnsName: "zed", title: "Alpha Tool", status: "suspended" });

  const all = [suspended, sameDateB, older, unlisted, newest, sameDateA];
  const result = searchPublications(all, { query: "alpha tool" });
  assert.deepEqual(result.items.map((item) => item.address), ["a.zed.gwap", "c.zed.gwap", "d.zed.gwap", "b.zed.gwap"]);
  assert.equal(result.total, 4);
  assert.equal(result.nextOffset, null);

  const again = searchPublications([...all].reverse(), { query: "alpha tool" });
  assert.deepEqual(again.items.map((item) => item.address), result.items.map((item) => item.address));
});

test("searchPublications supports discovery sections, category filters, and paging", () => {
  const ai = publication({ id: "pub_000000000000000000000021", address: "bot.zed.gwap", slug: "bot", category: "ai", publishedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" });
  const commerce = publication({ id: "pub_000000000000000000000022", address: "shop.zed.gwap", slug: "shop", category: "commerce", publishedAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" });

  assert.deepEqual(searchPublications([ai, commerce], { query: "", sort: "new" }).items.map((i) => i.slug), ["shop", "bot"]);
  assert.deepEqual(searchPublications([ai, commerce], { query: "", sort: "updated" }).items.map((i) => i.slug), ["bot", "shop"]);
  assert.deepEqual(searchPublications([ai, commerce], { query: "", category: "ai" }).items.map((i) => i.slug), ["bot"]);
  assert.deepEqual(searchPublications([ai, commerce], { query: "", category: "nonsense" }).total, 2);

  const paged = searchPublications([ai, commerce], { query: "", limit: 1, offset: 0 });
  assert.equal(paged.items.length, 1);
  assert.equal(paged.nextOffset, 1);
  assert.equal(clampSearchLimit(999), GWAP_BROWSER_SEARCH_MAX_LIMIT);
  assert.equal(clampSearchLimit("abc"), 20);
  assert.equal(clampSearchOffset(-5), 0);
});

// --- Public projection -------------------------------------------------------

test("public projection never leaks private fields", () => {
  const view = toPublicProject(publication());
  assert.deepEqual(Object.keys(view).sort(), [
    "address",
    "category",
    "deploymentHost",
    "id",
    "ownerAddress",
    "ownerGnsName",
    "publishedAt",
    "slug",
    "summary",
    "tags",
    "title",
    "updatedAt",
    "version",
    "visibility",
  ]);
  assert.equal(view.deploymentHost, "emerald-store.vercel.app");
  assert.equal(view.ownerAddress, "emerald.gwap");
  assert.equal("ownerWallet" in view, false);
  assert.equal("ownerAccountId" in view, false);
  assert.equal("workspaceId" in view, false);
  assert.equal("deploymentUrl" in view, false);
});

test("feature flags are on only when literally true", () => {
  assert.equal(parseFeatureFlag("true"), true);
  assert.equal(parseFeatureFlag(" TRUE "), true);
  assert.equal(parseFeatureFlag("1"), false);
  assert.equal(parseFeatureFlag("yes"), false);
  assert.equal(parseFeatureFlag(undefined), false);
});
