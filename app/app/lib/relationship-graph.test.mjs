import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveRelationshipGraph } from "./relationship-graph.ts";

const gnsFound = {
  status: "found",
  name: "emerald",
  fullName: "emerald.gwap",
  avatar: null,
  bio: null,
  score: 700,
  scoreTier: "Strong",
  scoreStatus: "scored",
  scoreMessage: "",
  verified: true,
  isGenesis: false,
  tier: "free",
  profileUrl: null,
  updatedAt: null,
};

const account = {
  id: "gwap_abc",
  linkedAccounts: { privy: true, telegram: { userId: "12345" } },
  wallets: [{ address: "Wallet111111111111111111111111111111111", kind: "external", primary: true }],
  primaryWallet: "Wallet111111111111111111111111111111111",
  primaryGnsIdentity: "emerald",
};

test("derives authenticated wallet, resolved GNS, and linked Telegram edges", () => {
  const graph = deriveRelationshipGraph(account, gnsFound);

  assert.equal(graph.edges.find((edge) => edge.label === "anchors account")?.provenance, "authenticated");
  assert.equal(graph.edges.find((edge) => edge.label === "resolves to")?.provenance, "resolved");
  assert.equal(graph.edges.find((edge) => edge.label === "linked account")?.provenance, "account-link");
  assert.equal(graph.verifiedEdges, 3);
});

test("verified social account enters graph only through Proof-of-Control provenance", () => {
  const graph = deriveRelationshipGraph(account, gnsFound, {
    enabled: true,
    records: [
      {
        platform: "x",
        socialHandle: "builder",
        status: "verified",
        verifiedAt: "2026-08-21T00:00:00.000Z",
      },
    ],
  });

  const socialEdge = graph.edges.find((edge) => edge.provenance === "proof-of-control");
  assert.equal(socialEdge?.verified, true);
  assert.equal(socialEdge?.label, "controls account");
  assert.equal(graph.nodes.find((node) => node.id === "social:x:builder")?.state, "verified");
  assert.equal(graph.verifiedEdges, 4);
});

test("enabled verifier with no completed public challenge does not create a verified social edge", () => {
  const graph = deriveRelationshipGraph(account, gnsFound, {
    enabled: true,
    records: [{ platform: "x", socialHandle: "builder", status: "awaiting-post" }],
  });

  assert.equal(graph.edges.some((edge) => edge.provenance === "proof-of-control"), false);
  assert.equal(graph.nodes.find((node) => node.id === "social:available")?.state, "available");
});

test("planned social and counterparty relationships never count as verified", () => {
  const graph = deriveRelationshipGraph(
    {
      ...account,
      linkedAccounts: { privy: true, telegram: null },
      primaryGnsIdentity: null,
    },
    { ...gnsFound, status: "none", name: null, fullName: null },
  );

  const planned = graph.edges.filter((edge) => edge.provenance === "planned");
  assert.equal(planned.length, 2);
  assert.ok(planned.every((edge) => edge.verified === false));
});

test("GNS outage creates no falsely verified relationship edge", () => {
  const graph = deriveRelationshipGraph(
    { ...account, linkedAccounts: { privy: true, telegram: null } },
    { ...gnsFound, status: "unavailable", name: null, fullName: null },
  );

  assert.equal(graph.edges.some((edge) => edge.provenance === "resolved"), false);
  assert.equal(graph.nodes.find((node) => node.id === "gns:unavailable")?.state, "unavailable");
});
