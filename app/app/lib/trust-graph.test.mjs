import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultGwapOsState } from "./os-state.ts";
import { deriveTrustGraph } from "./trust-graph.ts";

const identity = {
  status: "found",
  name: "builder",
  fullName: "builder.gwap",
  avatar: null,
  bio: null,
  score: 742,
  scoreTier: null,
  scoreStatus: "scored",
  scoreMessage: "Reputation active",
  verified: true,
  isGenesis: false,
  tier: "free",
  profileUrl: null,
  updatedAt: null,
};

function completeState() {
  const state = createDefaultGwapOsState();
  state.profile = {
    ...state.profile,
    bio: "Builder",
    primaryWallet: "wallet",
    website: "https://example.com",
    location: "Atlanta",
  };
  return state;
}

test("trust graph counts only live measurable signals", () => {
  const graph = deriveTrustGraph({
    gnsIdentity: identity,
    state: completeState(),
    telegramLinked: true,
    walletVerified: true,
  });

  assert.equal(graph.coverage, 100);
  assert.equal(graph.signals.find((signal) => signal.id === "social")?.state, "planned");
  assert.equal(graph.signals.find((signal) => signal.id === "proofs")?.weight, 0);
});

test("active social verification becomes a measurable incomplete trust signal", () => {
  const graph = deriveTrustGraph({
    gnsIdentity: identity,
    state: completeState(),
    telegramLinked: true,
    walletVerified: true,
    socialVerification: { enabled: true, verifiedCount: 0 },
  });

  const social = graph.signals.find((signal) => signal.id === "social");
  assert.equal(social?.state, "incomplete");
  assert.equal(social?.weight, 10);
  assert.ok(graph.coverage < 100);
});

test("verified social Proof-of-Control increases verified trust coverage", () => {
  const graph = deriveTrustGraph({
    gnsIdentity: identity,
    state: completeState(),
    telegramLinked: true,
    walletVerified: true,
    socialVerification: { enabled: true, verifiedCount: 1 },
  });

  const social = graph.signals.find((signal) => signal.id === "social");
  assert.equal(social?.state, "verified");
  assert.equal(graph.coverage, 100);
});

test("disabled verifier remains planned and contributes zero trust weight", () => {
  const graph = deriveTrustGraph({
    gnsIdentity: identity,
    state: completeState(),
    telegramLinked: true,
    walletVerified: true,
    socialVerification: { enabled: false, verifiedCount: 0 },
  });

  const social = graph.signals.find((signal) => signal.id === "social");
  assert.equal(social?.state, "planned");
  assert.equal(social?.weight, 0);
  assert.equal(graph.coverage, 100);
});

test("trust graph recommends the first incomplete live signal", () => {
  const state = createDefaultGwapOsState();
  const graph = deriveTrustGraph({
    gnsIdentity: { ...identity, status: "none", name: null, fullName: null },
    state,
    telegramLinked: false,
    walletVerified: true,
  });

  assert.equal(graph.nextAction?.id, "gns");
  assert.ok(graph.coverage < 100);
});
