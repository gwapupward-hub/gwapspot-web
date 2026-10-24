import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAPSPOT_APP_PROJECT_ID,
  GWAPSPOT_DEV_PROJECT_ID,
  GWAPSPOT_WEB_PROJECT_ID,
  LIL_GWAPZ_PREVIEW_BRANCH,
  shouldIgnoreVercelBuild,
} from "../../scripts/vercel-build-policy.mjs";

test("production behavior remains unchanged", () => {
  for (const projectId of [
    GWAPSPOT_APP_PROJECT_ID,
    GWAPSPOT_DEV_PROJECT_ID,
    GWAPSPOT_WEB_PROJECT_ID,
  ]) {
    assert.equal(
      shouldIgnoreVercelBuild({
        projectId,
        environment: "production",
        branch: LIL_GWAPZ_PREVIEW_BRANCH,
      }),
      false,
    );
  }
});

test("existing preview policy remains unchanged outside Lil Gwapz", () => {
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_APP_PROJECT_ID,
      environment: "preview",
      branch: "feature/other-work",
    }),
    false,
  );
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_WEB_PROJECT_ID,
      environment: "preview",
      branch: "feature/other-work",
    }),
    true,
  );
});

test("Lil Gwapz preview builds only on gwapspot-web", () => {
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_WEB_PROJECT_ID,
      environment: "preview",
      branch: LIL_GWAPZ_PREVIEW_BRANCH,
    }),
    false,
  );
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_APP_PROJECT_ID,
      environment: "preview",
      branch: LIL_GWAPZ_PREVIEW_BRANCH,
    }),
    true,
  );
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: GWAPSPOT_DEV_PROJECT_ID,
      environment: "preview",
      branch: LIL_GWAPZ_PREVIEW_BRANCH,
    }),
    true,
  );
});

test("unknown project ids fail open and build", () => {
  assert.equal(
    shouldIgnoreVercelBuild({
      projectId: "",
      environment: "preview",
      branch: LIL_GWAPZ_PREVIEW_BRANCH,
    }),
    false,
  );
});
