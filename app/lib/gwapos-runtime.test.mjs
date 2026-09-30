import assert from "node:assert/strict";
import test from "node:test";
import { resolveGwapOsRuntime } from "./gwapos-runtime.ts";

test("production app host always resolves to mainnet production mode", () => {
  assert.deepEqual(
    resolveGwapOsRuntime({
      host: "app.gwapspot.com",
      override: "devnet",
    }),
    {
      mode: "production",
      hostname: "app.gwapspot.com",
      solanaCluster: "mainnet-beta",
      realValueWritesEnabled: true,
    },
  );
});

test("dev app host always resolves to devnet with real-value writes disabled", () => {
  assert.deepEqual(resolveGwapOsRuntime({ host: "dev.gwapspot.com" }), {
    mode: "devnet",
    hostname: "dev.gwapspot.com",
    solanaCluster: "devnet",
    realValueWritesEnabled: false,
  });
});

test("non-production development hosts may opt into devnet mode", () => {
  assert.equal(
    resolveGwapOsRuntime({ host: "localhost:3000", override: "devnet" }).mode,
    "devnet",
  );
  assert.equal(
    resolveGwapOsRuntime({ host: "preview.vercel.app", override: "production" }).mode,
    "production",
  );
});
