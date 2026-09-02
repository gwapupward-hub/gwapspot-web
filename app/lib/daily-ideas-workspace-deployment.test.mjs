import assert from "node:assert/strict";
import test from "node:test";
import {
  currentDeploymentHash,
  getWorkspaceDeployment,
  normalizeDeploymentRecord,
  removeWorkspaceDeployment,
  toDeploymentView,
  upsertWorkspaceDeployment,
} from "./daily-ideas-workspace-deployment.ts";
import { deriveDeploymentId } from "./gwap-browser-core.ts";

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

const workspaceId = "wsp_0123456789abcdef01234567";
const projectId = "project_0123456789abcdef0123";

test("connects a deployment with inferred provider and canonical URL", async () => {
  const redis = createMemoryRedis();
  const result = await upsertWorkspaceDeployment(redis, {
    workspaceId,
    projectId,
    actorId: "gwap_owner_000000000000000001",
    url: "https://My-App.vercel.app/#top",
    now: "2026-09-02T10:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.changed, true);
  assert.equal(result.deployment.id, deriveDeploymentId(workspaceId));
  assert.equal(result.deployment.provider, "vercel");
  assert.equal(result.deployment.url, "https://my-app.vercel.app/");
  assert.equal(result.deployment.status, "configured");

  const stored = await getWorkspaceDeployment(redis, workspaceId);
  assert.deepEqual(stored, result.deployment);
  assert.equal(toDeploymentView(stored).host, "my-app.vercel.app");
  assert.equal("createdBy" in toDeploymentView(stored), false);
});

test("updates keep createdAt/createdBy and report whether the target changed", async () => {
  const redis = createMemoryRedis();
  await upsertWorkspaceDeployment(redis, {
    workspaceId,
    projectId,
    actorId: "gwap_owner_000000000000000001",
    url: "https://a.netlify.app",
    now: "2026-09-02T10:00:00.000Z",
  });
  const same = await upsertWorkspaceDeployment(redis, {
    workspaceId,
    projectId,
    actorId: "gwap_dev_00000000000000000001",
    url: "https://a.netlify.app/",
    provider: "netlify",
    now: "2026-09-02T11:00:00.000Z",
  });
  assert.equal(same.ok, true);
  assert.equal(same.created, false);
  assert.equal(same.changed, false);
  assert.equal(same.deployment.createdBy, "gwap_owner_000000000000000001");
  assert.equal(same.deployment.updatedBy, "gwap_dev_00000000000000000001");

  const changed = await upsertWorkspaceDeployment(redis, {
    workspaceId,
    projectId,
    actorId: "gwap_dev_00000000000000000001",
    url: "https://a.netlify.app/",
    provider: "other",
  });
  assert.equal(changed.ok, true);
  assert.equal(changed.changed, true);
  assert.notEqual(currentDeploymentHash(changed.deployment), currentDeploymentHash(same.deployment));
});

test("rejects unsafe URLs, unknown providers, and invalid workspace ids", async () => {
  const redis = createMemoryRedis();
  assert.deepEqual(
    await upsertWorkspaceDeployment(redis, { workspaceId, projectId, actorId: "a", url: "http://a.com" }),
    { ok: false, reason: "scheme" },
  );
  assert.deepEqual(
    await upsertWorkspaceDeployment(redis, { workspaceId, projectId, actorId: "a", url: "https://a.com", provider: "heroku" }),
    { ok: false, reason: "invalid_provider" },
  );
  assert.deepEqual(
    await upsertWorkspaceDeployment(redis, { workspaceId: "nope", projectId, actorId: "a", url: "https://a.com" }),
    { ok: false, reason: "invalid_workspace" },
  );
  assert.equal(redis.store.size, 0);
});

test("removal deletes the record and is idempotent", async () => {
  const redis = createMemoryRedis();
  assert.equal(await removeWorkspaceDeployment(redis, workspaceId), false);
  await upsertWorkspaceDeployment(redis, { workspaceId, projectId, actorId: "a", url: "https://a.com" });
  assert.equal(await removeWorkspaceDeployment(redis, workspaceId), true);
  assert.equal(await getWorkspaceDeployment(redis, workspaceId), null);
  assert.equal(await removeWorkspaceDeployment(redis, workspaceId), false);
});

test("corrupt stored records are rejected rather than coerced", () => {
  const valid = {
    id: deriveDeploymentId(workspaceId),
    workspaceId,
    projectId,
    provider: "vercel",
    url: "https://a.vercel.app/",
    status: "configured",
    createdBy: "a",
    createdAt: "2026-09-02T10:00:00.000Z",
    updatedBy: "a",
    updatedAt: "2026-09-02T10:00:00.000Z",
    schemaVersion: 1,
  };
  assert.deepEqual(normalizeDeploymentRecord(valid), valid);
  assert.equal(normalizeDeploymentRecord({ ...valid, url: "http://a.vercel.app/" }), null);
  assert.equal(normalizeDeploymentRecord({ ...valid, url: "https://A.vercel.app/#x" }), null);
  assert.equal(normalizeDeploymentRecord({ ...valid, id: "dep_000000000000000000000000" }), null);
  assert.equal(normalizeDeploymentRecord({ ...valid, provider: "heroku" }), null);
  assert.equal(normalizeDeploymentRecord({ ...valid, status: "verified" }), null);
  assert.equal(normalizeDeploymentRecord({ ...valid, schemaVersion: 2 }), null);
  assert.equal(normalizeDeploymentRecord("junk"), null);
  assert.equal(normalizeDeploymentRecord(null), null);
});
