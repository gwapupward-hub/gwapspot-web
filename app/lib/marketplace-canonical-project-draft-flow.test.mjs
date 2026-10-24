import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const marketplace = fs.readFileSync(
  path.join(process.cwd(), "app/app/marketplace/page.tsx"),
  "utf8",
);
const provider = fs.readFileSync(
  path.join(process.cwd(), "app/app/components/os-provider.tsx"),
  "utf8",
);
const osState = fs.readFileSync(
  path.join(process.cwd(), "app/app/lib/os-state.ts"),
  "utf8",
);
const trustReadiness = fs.readFileSync(
  path.join(process.cwd(), "app/lib/trust-home-opportunity-readiness.ts"),
  "utf8",
);

test("Marketplace reads canonical Daily Ideas projects through the authenticated workspace", () => {
  assert.match(marketplace, /authenticatedFetch\("\/api\/daily-ideas\/workspace", \{ cache: "no-store" \}\)/);
  assert.match(marketplace, /credentials: "same-origin"/);
  assert.match(marketplace, /item\.status !== "archived"/);
  assert.match(marketplace, /\/\^project_\[a-f0-9\]\{20\}\$\//);
});

test("account switches mask prior project-picker state until the new authenticated fetch resolves", () => {
  assert.match(marketplace, /workspaceOwnerWallet === account\.verifiedWallet/);
  assert.match(marketplace, /projectPickerCurrent \? workspaceProjects : \[\]/);
  assert.match(marketplace, /projectPickerCurrent \? projectLoadState : "loading"/);
  assert.match(marketplace, /const walletAtRequest = account\.verifiedWallet/);
  assert.match(marketplace, /setWorkspaceOwnerWallet\(walletAtRequest\)/);
  assert.match(marketplace, /setDraftRole\(""\)/);
  assert.match(marketplace, /\[account\.verifiedWallet, authenticatedFetch\]/);
});

test("creating a canonical Marketplace brief is an explicit Draft-only action", () => {
  assert.match(marketplace, /<option value="">Choose capability<\/option>/);
  assert.match(marketplace, /disabled=\{!draftProjectId \|\| !draftRole\}/);
  assert.match(marketplace, /Prepare private Draft/);
  assert.match(marketplace, /if \(migrationAvailable \|\| !projectPickerCurrent \|\| !draftProjectId \|\| !draftRole\) return;/);
  assert.match(provider, /status:"Draft"/);
  assert.match(marketplace, /This action never publishes or matches anything/);
});

test("an existing same-project capability brief reopens unchanged with truthful UI", () => {
  assert.match(marketplace, /existingBriefForSelection/);
  assert.match(marketplace, /Open existing brief/);
  assert.match(marketplace, /Existing \$\{existingBriefForSelection\.status\} brief will reopen unchanged/);
  assert.match(provider, /if\(existing\)\{if\(c\.marketplaceIntents\[0\]\?\.id!==existing\.id\)commit\(\{\.\.\.c,marketplaceIntents:\[existing,\.\.\.c\.marketplaceIntents\.filter\(intent=>intent\.id!==existing\.id\)\]\}\);return existing\.id\}/);
});

test("the canonical bridge rejects synthetic IDs, archived projects, and unknown roles", () => {
  assert.match(provider, /const CANONICAL_PROJECT_ID=\/\^project_\[a-f0-9\]\{20\}\$\//);
  assert.match(provider, /const MARKETPLACE_ROLES=new Set<MarketplaceRole>/);
  assert.match(provider, /project\.status==="archived"/);
  assert.match(provider, /!MARKETPLACE_ROLES\.has\(role\)/);
});

test("the bridge snapshots project context without creating a duplicate legacy project", () => {
  assert.match(provider, /createMarketplaceIntentFromProject/);
  assert.match(provider, /projectTitle/);
  assert.match(provider, /problemDefinition/);
  assert.match(provider, /targetCustomer/);
  assert.match(provider, /technicalArchitecture/);
  assert.match(provider, /estimatedCost/);
  assert.match(provider, /const existing=c\.marketplaceIntents\.find\(intent=>intent\.projectId===projectId&&intent\.role===role\)/);
  const bridge = provider.match(/const createMarketplaceIntentFromProject=.*?\n const updateMarketplaceIntent/s)?.[0] ?? "";
  assert.ok(bridge);
  assert.doesNotMatch(bridge, /ideaProjects:/);
});

test("project-title snapshots remain bounded and flow into disclosure and Trust Home", () => {
  assert.match(osState, /projectTitle: string/);
  assert.match(osState, /projectTitle: safeText\(intent\.projectTitle, "", 120\)/);
  assert.match(marketplace, /projectTitle: selected\.projectTitle \|\| project\?\.title/);
  assert.match(trustReadiness, /projectTitle \|\| projectTitles\.get\(projectId\) \|\| "Project collaboration"/);
});

test("canonical draft handoff adds no publishing, matching, payment, or analytics capability", () => {
  assert.doesNotMatch(marketplace, /publishMarketplace|matchProvider|createListing|fundEscrow|safeTrack|track\s*\(/);
  assert.doesNotMatch(provider, /publishMarketplace|matchProvider|createListing|fundEscrow/);
});
