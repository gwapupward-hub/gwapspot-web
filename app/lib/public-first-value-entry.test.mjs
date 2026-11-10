import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("homepage exposes a public lookup before the identity sign-in step", () => {
  const homepage = read("../components/cinematic-home.tsx");
  assert.match(homepage, /<GlassButton href="#lookup" primary>/);
  assert.match(homepage, /<HomeUtility \/>/);
  assert.match(homepage, /<Link href="#lookup" className="overview-foundation-card" data-gwap-intent="identity">/);
  assert.match(homepage, /A name, proof, or GwapScore is not a security audit/);
});

test("five starting paths and first-value timing are measurable without identity data", () => {
  const homepage = read("../components/cinematic-home.tsx");
  const telemetry = read("../components/conversion-telemetry.tsx");
  for (const intent of ["build_project", "validate_idea", "identity", "reputation", "proof"]) {
    assert.match(homepage, new RegExp(`data-gwap-intent="${intent}"`));
  }
  assert.match(telemetry, /first_value_reached/);
  assert.match(telemetry, /elapsed_bucket: firstValueTimeBucket/);
  assert.match(telemetry, /if \(href === "#lookup"\)/);
  assert.match(telemetry, /isMeaningfulPublicLookupOutcome/);
  assert.match(telemetry, /window\.addEventListener\(PUBLIC_LOOKUP_EVENT, handleLookup\)/);
  assert.doesNotMatch(telemetry, /MutationObserver/);
  assert.doesNotMatch(telemetry, /safeTrack\("first_value_reached", \{[\s\S]{0,250}(wallet|query):/);
});

test("lookup retains public API access and authenticated claim handoff", () => {
  const utility = read("../components/home-utility.tsx");
  assert.match(utility, /\/api\/public\/lookup\?type=/);
  assert.match(utility, /href=\{`\/app\/identity\?name=/);
  assert.match(utility, /reportLookup\(\{ phase: "completed"/);
  assert.match(utility, /classifyPublicLookupResult\(payload\)/);
});

test("public identity goal and result CTA retain the correct intent without redirecting the lookup", () => {
  const bridge = read("../components/entry-intent-bridge.tsx");
  assert.match(bridge, /getGwapEntryIntentForPublicGoal\(anchor\.dataset\.gwapIntent\)/);
  assert.match(bridge, /inLookupActions && destination\.pathname !== "\/app\/identity"/);
  assert.match(bridge, /inGoalCards && destination\.pathname\.startsWith\("\/app"\)/);
});

test("available public name is suggested after sign-in but never auto-claimed", () => {
  const page = read("../app/identity/page.tsx");
  const walletView = read("../app/components/identity-wallet-view.tsx");
  const identityView = read("../app/components/identity-view.tsx");
  assert.match(page, /normalizePublicLookup\("name", rawName\)/);
  assert.match(page, /IdentityWalletView suggestedName=\{suggestedName\}/);
  assert.match(walletView, /IdentityView suggestedName=\{suggestedName\}/);
  assert.match(identityView, /Recheck availability before signing/);
});

test("homepage first visit has no mandatory intro or timed promo", () => {
  const layers = read("../components/public-experience-layers.tsx");
  assert.match(layers, /skipIntro=\{isCampaignLanding \|\| pathname === "\/"\}/);
  assert.doesNotMatch(layers, /<LilGwapzPromoGate \/>/);
});
