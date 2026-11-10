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
  assert.doesNotMatch(telemetry, /safeTrack\("first_value_reached", \{[\s\S]{0,250}(wallet|query):/);
});

test("lookup retains public API access and authenticated claim handoff", () => {
  const utility = read("../components/home-utility.tsx");
  assert.match(utility, /\/api\/public\/lookup\?type=/);
  assert.match(utility, /href=\{`\/app\/identity\?name=/);
});

test("homepage first visit has no mandatory intro or timed promo", () => {
  const layers = read("../components/public-experience-layers.tsx");
  assert.match(layers, /skipIntro=\{isCampaignLanding \|\| pathname === "\/"\}/);
  assert.doesNotMatch(layers, /<LilGwapzPromoGate \/>/);
});
