import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { after, beforeEach, test } from "node:test";
import {
  CANONICAL_GNS_PROGRAM_ID,
  CANONICAL_GNS_TREASURY,
  encodeGnsSignature,
} from "./gns-registration.ts";

// Exercise the real service, HTTP handler and receipt reconciler with network,
// authentication and persistence boundaries replaced by local fixtures.
const fixture = {
  identity: { userId: "devnet-test-user", verifiedWallet: CANONICAL_GNS_TREASURY },
  records: new Map(),
  activations: [],
};
globalThis.__gnsNetworkTest = fixture;
const accountId = "gwap_12345678901234567890";
const sources = new Map([
  [new URL("../../lib/auth-config.ts", import.meta.url).href,
    "export function getWalletAuthConfigurationStatus() { return { authenticationConfigured: false, storageConfigured: false, configured: false, reason: 'test-fixture' }; }"],
  [new URL("../../lib/privy-server.ts", import.meta.url).href,
    "export async function getAuthenticatedWalletIdentity() { return globalThis.__gnsNetworkTest.identity; }"],
  [new URL("../../lib/request-guard.ts", import.meta.url).href,
    "export function auditAuthEvent() {} export function hasValidOrigin() { return true; } export async function checkRateLimit() { return { allowed: true }; }"],
  [new URL("../../lib/gwap-account.ts", import.meta.url).href,
    `export async function getOrCreateGwapAccount() { return { id: ${JSON.stringify(accountId)} }; }
     export async function updateGwapAccountGnsIdentity(id, name) { globalThis.__gnsNetworkTest.activations.push({ id, name }); }`],
  [new URL("../../lib/redis.ts", import.meta.url).href,
    `export function getPrivateStorageKey(namespace, id) { return namespace + ':' + id; }
     export function getWorkspaceRedis() { return {
       get: async (key) => globalThis.__gnsNetworkTest.records.get(key) ?? null,
       set: async (key, value) => globalThis.__gnsNetworkTest.records.set(key, value),
       del: async (key) => Number(globalThis.__gnsNetworkTest.records.delete(key)),
     }; }`],
]);
const gnsServerUrl = new URL("./gns.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(new URL("../../../", import.meta.url).href) &&
      !context.parentURL.includes("/node_modules/")
    ) {
      let url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname)) url = new URL(url.href + ".ts");
      if (sources.has(url.href)) {
        return { url: "data:text/javascript," + encodeURIComponent(sources.get(url.href)), shortCircuit: true };
      }
      if (existsSync(url)) return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === gnsServerUrl) {
      return {
        format: "module",
        source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), { mode: "transform" }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { getGnsRegistrationConfig, registerGnsIdentity, GnsRegistrationConfigError } = await import("./gns.ts");
const { GET, POST } = await import("../../api/gns/register/route.ts");
const { GET: getHealth } = await import("../../api/health/route.ts");
const { getGnsRegistrationSync, trackGnsRegistrationSync, reconcileGnsRegistrationSync } =
  await import("../../lib/gns-registration-sync.ts");

const envKeys = ["GNS_EXPECTED_NETWORK", "GNS_EXPECTED_PROGRAM_ID", "GNS_EXPECTED_TREASURY_PUBKEY", "GNS_API_URL"];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  fixture.records.clear();
  fixture.activations.length = 0;
  fixture.identity = { userId: "devnet-test-user", verifiedWallet: CANONICAL_GNS_TREASURY };
});
after(() => {
  hooks.deregister();
  delete globalThis.__gnsNetworkTest;
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const backendConfig = {
  program_id: CANONICAL_GNS_PROGRAM_ID,
  treasury: CANONICAL_GNS_TREASURY,
  network: "devnet",
  fee_lamports: 10_000_000,
  on_chain_mode: true,
};
const txSignature = encodeGnsSignature(Uint8Array.from({ length: 64 }, (_, index) => index + 1));
const receipt = { name: "builder", owner: CANONICAL_GNS_TREASURY, txSignature };
const request = () => new Request("https://app.gwapspot.com/api/gns/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: receipt.name, txSignature }),
});

test("serves explicit devnet config on the production app host", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json(backendConfig));
  const response = await GET(new Request("https://app.gwapspot.com/api/gns/register"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-GNS-Network"), "devnet");
  assert.equal(response.headers.get("X-GNS-Mainnet-Writes"), "disabled");
  assert.equal((await response.json()).network, "devnet");
});

test("a non-devnet environment override cannot authorize registration or backend writes", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected backend access"); });
  for (const network of ["mainnet-beta", "mainnet", "testnet", "invalid"]) {
    process.env.GNS_EXPECTED_NETWORK = network;
    await assert.rejects(() => getGnsRegistrationConfig(), /only on Solana devnet/);
    await assert.rejects(() => registerGnsIdentity(receipt), GnsRegistrationConfigError);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("health exposes the GNS release policy and flags a conflicting override without probing the backend", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected backend access"); });
  const policy = (await (await getHealth()).json()).gnsRegistration;
  assert.deepEqual(policy, {
    allowedNetwork: "devnet", mainnetWritesEnabled: false,
    expectedNetworkMatchesPolicy: true, rpcVerification: "genesis-before-signing",
  });
  process.env.GNS_EXPECTED_NETWORK = "mainnet-beta";
  assert.equal((await (await getHealth()).json()).gnsRegistration.expectedNetworkMatchesPolicy, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("rejects upstream network, program, treasury and fee drift", async (t) => {
  let payload = backendConfig;
  t.mock.method(globalThis, "fetch", async () => Response.json(payload));
  for (const patch of [
    { network: "mainnet-beta" }, { network: "testnet" },
    { program_id: CANONICAL_GNS_TREASURY }, { treasury: CANONICAL_GNS_PROGRAM_ID },
    { fee_lamports: 0 }, { fee_lamports: -1 }, { fee_lamports: 1.5 },
    { fee_lamports: 1_000_000_001 }, { on_chain_mode: false },
  ]) {
    payload = { ...backendConfig, ...patch };
    await assert.rejects(() => getGnsRegistrationConfig(), /failed validation/);
  }
});

test("revalidates deployment before submitting a receipt and preserves the verified owner", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(String(url).endsWith("/config") ? backendConfig : { registered: true });
  });
  assert.deepEqual(await registerGnsIdentity(receipt), { registered: true });
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), ["/api/config", "/api/register"]);
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    name: "builder", owner: CANONICAL_GNS_TREASURY, tx_signature: txSignature, referrer: null,
  });
});

test("the receipt route cannot recover ownership around invalid deployment configuration", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    return Response.json({ ...backendConfig, network: "mainnet-beta" });
  });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.deepEqual(calls.map((url) => new URL(url).pathname), ["/api/config"]);
});

test("preserves genuine devnet receipt recovery after a temporary indexing error", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/config")) return Response.json(backendConfig);
    if (String(url).endsWith("/register")) return Response.json({}, { status: 502 });
    return Response.json({ found: true, owner: CANONICAL_GNS_TREASURY });
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).recovered, true);
});

test("keeps the config and registration endpoints authenticated", async (t) => {
  fixture.identity = null;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected backend access"); });
  assert.equal((await GET(new Request("https://app.gwapspot.com/api/gns/register"))).status, 401);
  assert.equal((await POST(request())).status, 401);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("rejects cross-cluster receipt tracking without replacing pending devnet data", async () => {
  const pending = await trackGnsRegistrationSync({ accountId, ...receipt, network: "devnet" });
  assert.equal(pending.status, "submitted");
  assert.equal(await trackGnsRegistrationSync({ accountId, ...receipt, network: "mainnet-beta" }), null);
  assert.equal((await getGnsRegistrationSync(accountId)).network, "devnet");
});

test("reconciliation cannot promote cached ownership when deployment validation fails", async (t) => {
  await trackGnsRegistrationSync({ accountId, ...receipt, network: "devnet" });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    return Response.json({ ...backendConfig, network: "mainnet-beta" });
  });
  const result = await reconcileGnsRegistrationSync(accountId);
  assert.equal(result.status, "indexing");
  assert.match(result.error, /devnet configuration/);
  assert.deepEqual(fixture.activations, []);
  assert.deepEqual(calls.map((url) => new URL(url).pathname), ["/api/config"]);
});

test("preserves historical cross-cluster receipts without presenting them as active identities", async (t) => {
  const pending = await trackGnsRegistrationSync({ accountId, ...receipt, network: "devnet" });
  fixture.records.set(`gns-registration-sync:${accountId}`, { ...pending, network: "mainnet-beta", status: "active" });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected backend access"); });
  assert.equal((await getGnsRegistrationSync(accountId)).status, "failed");
  const result = await reconcileGnsRegistrationSync(accountId);
  assert.equal(result.network, "mainnet-beta");
  assert.equal(result.txSignature, txSignature);
  assert.equal(result.status, "failed");
  assert.deepEqual(fixture.activations, []);
  assert.equal(fetchMock.mock.callCount(), 0);
});
