import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAPSPOT_APP_PROJECT_ID,
  GWAPSPOT_WEB_PROJECT_ID,
  shouldIgnoreVercelBuild,
} from "../../scripts/vercel-build-policy.mjs";

test("production always builds both split-domain projects", () => {
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_APP_PROJECT_ID,
      environment: "production",
    }),
    false,
  );
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_WEB_PROJECT_ID,
      environment: "production",
    }),
    false,
  );
});

test("only gwapspot-app gets automatic preview builds", () => {
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_APP_PROJECT_ID,
      environment: "preview",
    }),
    false,
  );
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_WEB_PROJECT_ID,
      environment: "preview",
    }),
    true,
  );
});

test("unknown project ids fail open and build", () => {
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: "",
      environment: "preview",
    }),
    false,
  );
});
