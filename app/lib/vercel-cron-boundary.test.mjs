import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAPSPOT_APP_VERCEL_PROJECT_ID,
  shouldRunScheduledWorker,
} from "./vercel-cron-boundary.ts";

test("Vercel cron workers run only on the app project", () => {
  assert.equal(
    shouldRunScheduledWorker({
      isVercelCron: true,
      projectId: GWAPSPOT_APP_VERCEL_PROJECT_ID,
    }),
    true,
  );
  assert.equal(
    shouldRunScheduledWorker({
      isVercelCron: true,
      projectId: "prj_other",
    }),
    false,
  );
  assert.equal(
    shouldRunScheduledWorker({
      isVercelCron: true,
      projectId: undefined,
    }),
    false,
  );
});

test("manual/internal worker calls remain available on either project", () => {
  assert.equal(
    shouldRunScheduledWorker({
      isVercelCron: false,
      projectId: "prj_other",
    }),
    true,
  );
});
