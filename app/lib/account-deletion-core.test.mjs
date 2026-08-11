import assert from "node:assert/strict";
import test from "node:test";
import { deleteAccountInRecoverableOrder } from "./account-deletion-core.ts";

test("account deletion purges application data before deleting the identity", async () => {
  const calls = [];
  await deleteAccountInRecoverableOrder({
    purgeApplicationData: async () => {
      calls.push("purge");
    },
    deleteIdentity: async () => {
      calls.push("identity");
    },
  });

  assert.deepEqual(calls, ["purge", "identity"]);
});

test("account deletion keeps the identity when application cleanup fails", async () => {
  let identityDeleted = false;
  await assert.rejects(
    deleteAccountInRecoverableOrder({
      purgeApplicationData: async () => {
        throw new Error("storage unavailable");
      },
      deleteIdentity: async () => {
        identityDeleted = true;
      },
    }),
    /storage unavailable/,
  );

  assert.equal(identityDeleted, false);
});
