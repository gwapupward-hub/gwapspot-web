import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVELOPER_API_KEY_PREFIX,
  createDeveloperApiKeyMaterial,
  getDeveloperPlanLimits,
  getDeveloperUsageWindow,
  hashDeveloperApiKey,
  isDeveloperApiKeyFormat,
} from "./developer-api-core.ts";

test("creates opaque GWAP API keys and never needs plaintext storage", () => {
  const material = createDeveloperApiKeyMaterial();
  assert.ok(material.apiKey.startsWith(DEVELOPER_API_KEY_PREFIX));
  assert.equal(isDeveloperApiKeyFormat(material.apiKey), true);
  assert.equal(material.hash, hashDeveloperApiKey(material.apiKey));
  assert.equal(material.id, material.hash.slice(0, 16));
  assert.ok(material.preview.includes("…"));
  assert.notEqual(material.hash, material.apiKey);
});

test("rejects malformed developer API keys", () => {
  assert.equal(isDeveloperApiKeyFormat(""), false);
  assert.equal(isDeveloperApiKeyFormat("gwap_live_short"), false);
  assert.equal(isDeveloperApiKeyFormat("other_live_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"), false);
});

test("developer plans have increasing quotas", () => {
  const developer = getDeveloperPlanLimits("developer");
  const growth = getDeveloperPlanLimits("growth");
  const scale = getDeveloperPlanLimits("scale");
  assert.ok(developer.requestsPerMonth < growth.requestsPerMonth);
  assert.ok(growth.requestsPerMonth < scale.requestsPerMonth);
  assert.ok(developer.requestsPerMinute < scale.requestsPerMinute);
});

test("usage windows reset at the next UTC month", () => {
  const window = getDeveloperUsageWindow(new Date("2026-08-10T04:00:00.000Z"));
  assert.equal(window.id, "2026-08");
  assert.equal(window.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(window.reset.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.ok(window.ttlSeconds > 0);
});
