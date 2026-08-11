import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkspaceLockBusyError,
  withWorkspaceLock,
} from "./workspace-lock.ts";

function createLeaseStore() {
  const values = new Map();
  return {
    values,
    async setIfAbsent(key, value) {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    async deleteIfValue(key, value) {
      if (values.get(key) !== value) return false;
      values.delete(key);
      return true;
    },
  };
}

test("workspace locks reject overlapping work for the same key", async () => {
  const store = createLeaseStore();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const first = withWorkspaceLock(
    store,
    "owner-lock",
    async () => {
      await gate;
      return "done";
    },
    { token: "first" },
  );

  await assert.rejects(
    withWorkspaceLock(store, "owner-lock", async () => "overlap", {
      token: "second",
    }),
    WorkspaceLockBusyError,
  );

  release();
  assert.equal(await first, "done");
  assert.equal(store.values.has("owner-lock"), false);
});

test("workspace locks release after an operation fails", async () => {
  const store = createLeaseStore();
  await assert.rejects(
    withWorkspaceLock(
      store,
      "owner-lock",
      async () => {
        throw new Error("write failed");
      },
      { token: "failed" },
    ),
    /write failed/,
  );

  assert.equal(
    await withWorkspaceLock(store, "owner-lock", async () => "retried", {
      token: "retry",
    }),
    "retried",
  );
});
