import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSeedTasks,
  buildWorkspaceScaffold,
  can,
  clampTerminalTimeout,
  deriveWorkspaceId,
  fileWriteCapabilityFor,
  hashInviteToken,
  isAssignableInviteRole,
  isInviteRedeemable,
  isProjectDocPath,
  isValidInviteToken,
  looksBinary,
  normalizeWorkspacePath,
  truncateOutput,
  validateTerminalCommand,
  WORKSPACE_ROOT,
} from "./daily-ideas-workspace-core.ts";

// --- Role / capability matrix ---------------------------------------------

test("permission matrix enforces role capabilities", () => {
  // Owner has everything.
  assert.equal(can("owner", "workspace:destroy"), true);
  assert.equal(can("owner", "members:manage"), true);
  assert.equal(can("owner", "terminal:execute"), true);

  // Developer can build but not manage members or destroy.
  assert.equal(can("developer", "files:write"), true);
  assert.equal(can("developer", "terminal:execute"), true);
  assert.equal(can("developer", "tasks:write"), true);
  assert.equal(can("developer", "members:manage"), false);
  assert.equal(can("developer", "workspace:destroy"), false);

  // Contributor edits docs + tasks but cannot run terminal or write code.
  assert.equal(can("contributor", "docs:write"), true);
  assert.equal(can("contributor", "tasks:write"), true);
  assert.equal(can("contributor", "files:write"), false);
  assert.equal(can("contributor", "terminal:execute"), false);
  assert.equal(can("contributor", "members:manage"), false);

  // Viewer is read-only.
  assert.equal(can("viewer", "workspace:read"), true);
  assert.equal(can("viewer", "files:read"), true);
  assert.equal(can("viewer", "tasks:write"), false);
  assert.equal(can("viewer", "docs:write"), false);
  assert.equal(can("viewer", "terminal:execute"), false);
});

test("doc paths require only docs:write; code paths require files:write", () => {
  assert.equal(isProjectDocPath("README.md"), true);
  assert.equal(isProjectDocPath("PRODUCT_SPEC.md"), true);
  assert.equal(isProjectDocPath("src/app.ts"), false);
  assert.equal(isProjectDocPath("docs/guide.md"), false);
  assert.equal(fileWriteCapabilityFor("README.md"), "docs:write");
  assert.equal(fileWriteCapabilityFor("src/app.ts"), "files:write");
});

test("only non-owner roles are assignable via invitation", () => {
  assert.equal(isAssignableInviteRole("developer"), true);
  assert.equal(isAssignableInviteRole("contributor"), true);
  assert.equal(isAssignableInviteRole("viewer"), true);
  assert.equal(isAssignableInviteRole("owner"), false);
  assert.equal(isAssignableInviteRole("nonsense"), false);
});

// --- Path security ---------------------------------------------------------

test("normalizeWorkspacePath accepts safe workspace-relative paths", () => {
  assert.equal(normalizeWorkspacePath("foo.ts"), "foo.ts");
  assert.equal(normalizeWorkspacePath("src/app.ts"), "src/app.ts");
  assert.equal(normalizeWorkspacePath("/foo.ts"), "foo.ts");
  assert.equal(normalizeWorkspacePath(`${WORKSPACE_ROOT}/src/app.ts`), "src/app.ts");
  assert.equal(normalizeWorkspacePath("./src/./app.ts"), "src/app.ts");
  assert.equal(normalizeWorkspacePath(WORKSPACE_ROOT), "");
});

test("normalizeWorkspacePath rejects traversal and unsafe input", () => {
  assert.equal(normalizeWorkspacePath("../etc/passwd"), null);
  assert.equal(normalizeWorkspacePath("src/../../etc/passwd"), null);
  assert.equal(normalizeWorkspacePath("%2e%2e/etc/passwd"), null);
  assert.equal(normalizeWorkspacePath("%252e%252e/secret"), null);
  assert.equal(normalizeWorkspacePath("src\\..\\..\\host"), null);
  assert.equal(normalizeWorkspacePath("foo\0.ts"), null);
  assert.equal(normalizeWorkspacePath("a".repeat(2000)), null);
  assert.equal(normalizeWorkspacePath(42), null);
});

test("absolute host paths resolve within the workspace, never escaping root", () => {
  // "/etc/passwd" is treated as a file named etc/passwd *inside* the workspace,
  // which is safe — it cannot reach the real host filesystem.
  assert.equal(normalizeWorkspacePath("/etc/passwd"), "etc/passwd");
});

// --- Invite tokens ---------------------------------------------------------

test("invite token validation + hashing", () => {
  const token = "A".repeat(43);
  assert.equal(isValidInviteToken(token), true);
  assert.equal(isValidInviteToken("short"), false);
  assert.equal(isValidInviteToken(123), false);
  const hash = hashInviteToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
});

test("invite redeemability checks used + expiry", () => {
  const base = {
    tokenHash: "x",
    workspaceId: "wsp_" + "a".repeat(24),
    role: "developer",
    createdBy: "gwap_owner",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    used: false,
    usedBy: null,
    usedAt: null,
  };
  assert.equal(isInviteRedeemable(base), true);
  assert.equal(isInviteRedeemable({ ...base, used: true }), false);
  assert.equal(
    isInviteRedeemable({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() }),
    false,
  );
});

// --- Terminal guardrails ---------------------------------------------------

test("terminal command validation enforces caps", () => {
  assert.deepEqual(validateTerminalCommand("ls -la"), { ok: true, command: "ls -la" });
  assert.deepEqual(validateTerminalCommand("   "), { ok: false, reason: "empty" });
  assert.deepEqual(validateTerminalCommand(42), { ok: false, reason: "invalid" });
  assert.deepEqual(validateTerminalCommand("x".repeat(5000)), { ok: false, reason: "too_long" });
});

test("terminal timeout is clamped to the hard ceiling", () => {
  assert.equal(clampTerminalTimeout(60_000), 60_000);
  assert.equal(clampTerminalTimeout(999_999), 120_000);
  assert.equal(clampTerminalTimeout(0), 1_000);
  assert.equal(clampTerminalTimeout("bad"), 60_000);
});

test("output truncation caps bytes and preserves UTF-8", () => {
  const small = truncateOutput("hello");
  assert.equal(small.truncated, false);
  assert.equal(small.output, "hello");

  const big = truncateOutput("x".repeat(200_000), 100_000);
  assert.equal(big.truncated, true);
  assert.equal(Buffer.byteLength(big.output, "utf8") <= 100_000, true);

  // Multi-byte safety: no partial code point at the boundary.
  const multibyte = truncateOutput("😀".repeat(100), 10);
  assert.equal(multibyte.truncated, true);
  assert.doesNotThrow(() => JSON.stringify(multibyte.output));
});

test("binary detection flags NUL content", () => {
  assert.equal(looksBinary("plain text"), false);
  assert.equal(looksBinary("bin\0ary"), true);
});

// --- Scaffold + seed tasks -------------------------------------------------

const sampleProject = {
  title: "Local Farmers Marketplace",
  summary: "Connect local farms with nearby buyers.",
  category: "commerce",
  problemDefinition: "Small farms lack a low-cost channel to reach nearby buyers.",
  targetCustomer: "Small farms and local grocers",
  marketHypothesis: "Buyers will pay a premium for verified-local produce.",
  businessModel: "Transaction fee on each order.",
  validationPlan: ["Interview 10 farms", "Run a pre-order landing page"],
  mvpFeatures: ["Farm listings", "Order checkout"],
  technicalArchitecture: "Next.js + Postgres + Stripe.",
  estimatedCost: "$2k for MVP infra",
  buildRoadmap: ["Build listings", "Add checkout", "Pilot with 3 farms"],
  goToMarket: "Partner with a local farmers market.",
  risks: ["Chicken-and-egg supply/demand"],
  firstAction: "Interview 3 local farms this week.",
};

test("scaffold builds expected files purely from project data", () => {
  const files = buildWorkspaceScaffold(sampleProject);
  const paths = files.map((file) => file.path).sort();
  assert.deepEqual(paths, [
    "ARCHITECTURE.md",
    "PRODUCT_SPEC.md",
    "README.md",
    "ROADMAP.md",
    "TASKS.md",
    "VALIDATION.md",
    "src/README.md",
  ]);
  const readme = files.find((file) => file.path === "README.md");
  assert.match(readme.content, /Local Farmers Marketplace/);
  const spec = files.find((file) => file.path === "PRODUCT_SPEC.md");
  assert.match(spec.content, /Small farms lack a low-cost channel/);
  const roadmap = files.find((file) => file.path === "ROADMAP.md");
  assert.match(roadmap.content, /1\. Build listings/);
});

test("seed tasks derive from roadmap + first action without duplication", () => {
  let counter = 0;
  const tasks = buildSeedTasks({
    workspaceId: "wsp_" + "a".repeat(24),
    createdBy: "gwap_owner",
    buildRoadmap: sampleProject.buildRoadmap,
    firstAction: sampleProject.firstAction,
    now: "2026-01-01T00:00:00.000Z",
    makeId: () => `task_seed${(counter += 1)}`,
  });
  const titles = tasks.map((task) => task.title);
  assert.equal(titles[0], "Interview 3 local farms this week.");
  assert.equal(tasks[0].priority, "high");
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(titles.includes("Build listings"));
});

test("deriveWorkspaceId is stable + owner-scoped", () => {
  const a = deriveWorkspaceId("gwap_ownerA", "project_" + "a".repeat(20));
  const b = deriveWorkspaceId("gwap_ownerA", "project_" + "a".repeat(20));
  const c = deriveWorkspaceId("gwap_ownerB", "project_" + "a".repeat(20));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^wsp_[a-f0-9]{24}$/);
});
