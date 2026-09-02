import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOwnerGnsName,
  revalidatePublicationOwnership,
  verifyLiveGnsOwnership,
} from "./gwap-browser-ownership.ts";

const WALLET = "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

test("normalizes owner names from cached identity values", () => {
  assert.equal(normalizeOwnerGnsName(" Emerald.GWAP "), "emerald");
  assert.equal(normalizeOwnerGnsName("emerald"), "emerald");
  assert.equal(normalizeOwnerGnsName("-bad"), null);
  assert.equal(normalizeOwnerGnsName(null), null);
});

test("ownership passes only when the live owner equals the verified wallet", async () => {
  const resolver = async (name) => (name === "emerald" ? { found: true, owner: WALLET } : { found: false, owner: null });
  const ok = await verifyLiveGnsOwnership(resolver, { name: "Emerald.gwap", wallet: WALLET, now: "2026-09-02T10:00:00.000Z" });
  assert.deepEqual(ok, { ok: true, name: "emerald", wallet: WALLET, verifiedAt: "2026-09-02T10:00:00.000Z" });

  assert.deepEqual(await verifyLiveGnsOwnership(resolver, { name: "emerald", wallet: OTHER }), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyLiveGnsOwnership(resolver, { name: "ruby", wallet: WALLET }), { ok: false, reason: "not_found" });
  assert.deepEqual(await verifyLiveGnsOwnership(resolver, { name: null, wallet: WALLET }), { ok: false, reason: "no_name" });
  assert.deepEqual(await verifyLiveGnsOwnership(resolver, { name: "emerald", wallet: "" }), { ok: false, reason: "mismatch" });
});

test("ownership fails closed when GNS is unavailable or throws", async () => {
  assert.deepEqual(await verifyLiveGnsOwnership(async () => null, { name: "emerald", wallet: WALLET }), { ok: false, reason: "unavailable" });
  assert.deepEqual(
    await verifyLiveGnsOwnership(async () => { throw new Error("boom"); }, { name: "emerald", wallet: WALLET }),
    { ok: false, reason: "unavailable" },
  );
  assert.deepEqual(
    await verifyLiveGnsOwnership(async () => ({ found: true, owner: null }), { name: "emerald", wallet: WALLET }),
    { ok: false, reason: "not_found" },
  );
});

test("revalidation skips the network while proof is fresh", async () => {
  let calls = 0;
  const resolver = async () => { calls += 1; return { found: true, owner: WALLET }; };
  const publication = { ownerGnsName: "emerald", ownerWallet: WALLET, ownershipVerifiedAt: "2026-09-02T10:00:00.000Z" };
  const now = Date.parse("2026-09-02T10:05:00.000Z");
  assert.deepEqual(await revalidatePublicationOwnership(resolver, publication, { now }), { outcome: "fresh" });
  assert.equal(calls, 0);
});

test("revalidation after the TTL verifies, detects transfer, or reports unavailability", async () => {
  const publication = { ownerGnsName: "emerald", ownerWallet: WALLET, ownershipVerifiedAt: "2026-09-02T09:00:00.000Z" };
  const now = Date.parse("2026-09-02T10:00:00.000Z");
  assert.deepEqual(
    await revalidatePublicationOwnership(async () => ({ found: true, owner: WALLET }), publication, { now }),
    { outcome: "verified", verifiedAt: "2026-09-02T10:00:00.000Z" },
  );
  assert.deepEqual(
    await revalidatePublicationOwnership(async () => ({ found: true, owner: OTHER }), publication, { now }),
    { outcome: "moved" },
  );
  assert.deepEqual(
    await revalidatePublicationOwnership(async () => ({ found: false, owner: null }), publication, { now }),
    { outcome: "moved" },
  );
  assert.deepEqual(
    await revalidatePublicationOwnership(async () => null, publication, { now }),
    { outcome: "unavailable" },
  );
});
