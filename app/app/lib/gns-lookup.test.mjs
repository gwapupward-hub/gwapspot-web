import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { after, beforeEach, test } from "node:test";

// Exercise the real registry lookup helper and resolve route with the network,
// authentication and rate-limit boundaries replaced by local fixtures.
const fixture = { identity: { userId: "lookup-test-user", verifiedWallet: "wallet" } };
globalThis.__gnsLookupTest = fixture;
const sources = new Map([
  [new URL("../../lib/privy-server.ts", import.meta.url).href,
    "export async function getAuthenticatedWalletIdentity() { return globalThis.__gnsLookupTest.identity; }"],
  [new URL("../../lib/request-guard.ts", import.meta.url).href,
    "export function hasValidOrigin() { return true; } export async function checkRateLimit() { return { allowed: true }; }"],
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

const { resolveGnsNameDetailed, resolveGnsName } = await import("./gns.ts");
const { GET } = await import("../../api/gns/resolve/route.ts");
const { fetchGnsWithRecovery } = await import("./gns-lookup-client.ts");

const OWNER = "8dHEsm9VbLSWHzrCnQUyWXs9f7dZTfVWxU9wBo7iMYth";
beforeEach(() => {
  delete process.env.GNS_API_URL;
  fixture.identity = { userId: "lookup-test-user", verifiedWallet: "wallet" };
});
after(() => {
  hooks.deregister();
  delete globalThis.__gnsLookupTest;
});

// A fetch that never answers until its signal aborts — a sleeping instance.
const hang = (_url, init) =>
  new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
const sequence = (t, steps) => {
  let calls = 0;
  return t.mock.method(globalThis, "fetch", async (url, init) => {
    const step = steps[Math.min(calls, steps.length - 1)];
    calls += 1;
    return step(url, init);
  });
};
const quiet = (t) => t.mock.method(console, "warn", () => {});

test("returns a registered name on the first answer", async (t) => {
  const fetchMock = sequence(t, [() => Response.json({ found: true, owner: OWNER })]);
  const result = await resolveGnsNameDetailed("bdg");
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { found: true, owner: OWNER });
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(new URL(fetchMock.mock.calls[0].arguments[0]).pathname, "/api/resolve/bdg");
});

test("retries a timed-out attempt and returns the later answer", async (t) => {
  quiet(t);
  const fetchMock = sequence(t, [hang, () => Response.json({ found: true, owner: OWNER })]);
  const result = await resolveGnsNameDetailed("bdg", { attemptTimeoutMs: 50, budgetMs: 3_000 });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("retries a 503 from a booting backend", async (t) => {
  quiet(t);
  sequence(t, [
    () => new Response("booting", { status: 503 }),
    () => Response.json({ found: false, owner: null }),
  ]);
  const result = await resolveGnsNameDetailed("free-name", { attemptTimeoutMs: 500, budgetMs: 3_000 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { found: false, owner: null });
});

test("does not retry a 4xx", async (t) => {
  quiet(t);
  const fetchMock = sequence(t, [() => new Response("bad", { status: 400 })]);
  const result = await resolveGnsNameDetailed("bdg");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "upstream_4xx");
  assert.equal(result.status, 400);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("reports timeout once the budget is spent", async (t) => {
  quiet(t);
  sequence(t, [hang]);
  const result = await resolveGnsNameDetailed("bdg", { attemptTimeoutMs: 50, budgetMs: 200 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout");
  assert.equal(await resolveGnsName("bdg", { attemptTimeoutMs: 50, budgetMs: 100 }), null);
});

test("never treats an ambiguous 200 body as available", async (t) => {
  quiet(t);
  for (const body of [{}, { found: "no" }, [1], "text"]) {
    sequence(t, [() => Response.json(body)]);
    const result = await resolveGnsNameDetailed("bdg");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_payload");
    t.mock.restoreAll();
    quiet(t);
  }
});

test("diagnostics carry the failure class, never the name or wallet", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  sequence(t, [() => new Response("down", { status: 502 })]);
  await resolveGnsNameDetailed("secretname", { attemptTimeoutMs: 100, budgetMs: 1_500 });
  assert.equal(warn.mock.callCount(), 1);
  const [event, details] = warn.mock.calls[0].arguments;
  assert.equal(event, "gns_registry_lookup_failed");
  assert.equal(details.op, "resolve_name");
  assert.equal(details.reason, "upstream_5xx");
  assert.equal(details.status, 502);
  assert.ok(details.attempts >= 2);
  assert.doesNotMatch(JSON.stringify(warn.mock.calls), /secretname|onrender/);
});

const resolveRequest = (name) => new Request(`https://app.gwapspot.com/api/gns/resolve?name=${name}`);

test("route reports a registered name as taken with its owner", async (t) => {
  sequence(t, [() => Response.json({ found: true, owner: OWNER })]);
  const response = await GET(resolveRequest("bdg"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    name: "bdg", fullName: "bdg.gwap", available: false, owner: OWNER,
  });
});

test("route marks a registry outage as retryable and never as available", async (t) => {
  quiet(t);
  sequence(t, [() => new Response("bad", { status: 404 })]);
  const response = await GET(resolveRequest("bdg"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "3");
  assert.equal(response.headers.get("X-GNS-Failure"), "upstream_4xx");
  const payload = await response.json();
  assert.equal(payload.retryable, true);
  assert.equal(payload.available, undefined);
});

test("route rejects unauthenticated and invalid requests without touching GNS", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected backend access"); });
  assert.equal((await GET(resolveRequest("-x"))).status, 400);
  fixture.identity = null;
  assert.equal((await GET(resolveRequest("bdg"))).status, 401);
  assert.equal(fetchMock.mock.callCount(), 0);
});

const retryable503 = () => Response.json({ retryable: true }, { status: 503 });

test("client recovery retries a retryable 503 until the registry answers", async () => {
  const responses = [retryable503(), retryable503(), Response.json({ available: false })];
  const retries = [];
  const response = await fetchGnsWithRecovery(async () => responses.shift(), {
    onRetry: (attempt) => retries.push(attempt),
    wait: async () => {},
  });
  assert.equal(response.status, 200);
  assert.deepEqual(retries, [1, 2]);
});

test("client recovery stops on non-retryable errors, cancellation and the deadline", async () => {
  let calls = 0;
  const plain503 = await fetchGnsWithRecovery(async () => {
    calls += 1;
    return Response.json({ error: "x" }, { status: 503 });
  }, { wait: async () => {} });
  assert.equal(plain503.status, 503);
  assert.equal(calls, 1);

  calls = 0;
  await fetchGnsWithRecovery(async () => { calls += 1; return retryable503(); }, {
    isCancelled: () => calls >= 1, wait: async () => {},
  });
  assert.equal(calls, 1);

  calls = 0;
  const exhausted = await fetchGnsWithRecovery(async () => { calls += 1; return retryable503(); }, {
    delaysMs: [1, 1, 1], wait: async () => {},
  });
  assert.equal(exhausted.status, 503);
  assert.equal(calls, 4);

  calls = 0;
  await fetchGnsWithRecovery(async () => { calls += 1; return retryable503(); }, {
    delaysMs: [10_000], deadlineMs: 5_000, wait: async () => {},
  });
  assert.equal(calls, 1);
});
