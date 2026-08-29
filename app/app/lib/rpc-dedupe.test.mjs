import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createInflightDeduper,
  fetchSolBalanceLamports,
  isAbortError,
  lamportsToSol,
  withBoundedRetry,
} from "./rpc-dedupe.ts";

const noSleep = async () => {};

test("deduplicates concurrent calls that share a key", async () => {
  const dedupe = createInflightDeduper();
  let calls = 0;
  let resolveInner;
  const factory = () => {
    calls += 1;
    return new Promise((resolve) => {
      resolveInner = resolve;
    });
  };

  const a = dedupe("k", factory);
  const b = dedupe("k", factory);
  assert.equal(calls, 1, "second concurrent call must reuse the in-flight promise");
  resolveInner("value");
  assert.equal(await a, "value");
  assert.equal(await b, "value");
});

test("issues a fresh call once the previous one settled", async () => {
  const dedupe = createInflightDeduper();
  let calls = 0;
  const factory = () => {
    calls += 1;
    return Promise.resolve(calls);
  };
  assert.equal(await dedupe("k", factory), 1);
  assert.equal(await dedupe("k", factory), 2);
});

test("bounded retry stops after the configured attempts", async () => {
  let attempts = 0;
  await assert.rejects(
    withBoundedRetry(
      async () => {
        attempts += 1;
        throw new Error("boom");
      },
      { retries: 2, sleep: noSleep },
    ),
  );
  assert.equal(attempts, 3, "1 initial + 2 retries");
});

test("bounded retry returns on first success without extra attempts", async () => {
  let attempts = 0;
  const result = await withBoundedRetry(
    async (attempt) => {
      attempts += 1;
      if (attempt < 1) throw new Error("transient");
      return "ok";
    },
    { retries: 3, sleep: noSleep },
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("aborts are never retried", async () => {
  let attempts = 0;
  const abort = new Error("aborted");
  abort.name = "AbortError";
  await assert.rejects(
    withBoundedRetry(
      async () => {
        attempts += 1;
        throw abort;
      },
      { retries: 5, sleep: noSleep },
    ),
  );
  assert.equal(attempts, 1);
  assert.equal(isAbortError(abort), true);
});

test("shouldRetry can veto retries", async () => {
  let attempts = 0;
  await assert.rejects(
    withBoundedRetry(
      async () => {
        attempts += 1;
        throw new Error("fatal");
      },
      { retries: 5, sleep: noSleep, shouldRetry: () => false },
    ),
  );
  assert.equal(attempts, 1);
});

test("fetchSolBalanceLamports parses a numeric balance", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ result: { value: 1_500_000_000 } }),
  });
  const lamports = await fetchSolBalanceLamports("https://rpc.test", "Wallet1111", {
    fetchImpl,
    sleep: noSleep,
  });
  assert.equal(lamports, 1_500_000_000);
  assert.equal(lamportsToSol(lamports).toFixed(2), "1.50");
});

test("fetchSolBalanceLamports retries once on a failed response then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ result: { value: 42 } }) };
  };
  const lamports = await fetchSolBalanceLamports("https://rpc.test", "Wallet2222", {
    fetchImpl,
    sleep: noSleep,
  });
  assert.equal(lamports, 42);
  assert.equal(calls, 2);
});

test("fetchSolBalanceLamports returns null when no numeric balance is present", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ result: {} }) });
  const lamports = await fetchSolBalanceLamports("https://rpc.test", "Wallet3333", {
    fetchImpl,
    sleep: noSleep,
    retries: 0,
  });
  assert.equal(lamports, null);
});

test("the OS shell routes its balance read through the deduped helper", () => {
  const shell = readFileSync(
    new URL("../components/os-shell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(shell, /fetchSolBalanceLamports/);
  // The raw inline getBalance fetch must be gone from the shell.
  assert.doesNotMatch(shell, /method: "getBalance"/);
});
