import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPublicLookupResult,
  isMeaningfulPublicLookupOutcome,
  PUBLIC_LOOKUP_EVENT,
} from "./public-first-value.ts";

test("registry results count only when an actual name lookup returned a result", () => {
  assert.equal(classifyPublicLookupResult({ kind: "name", available: true }), "name_available");
  assert.equal(classifyPublicLookupResult({ kind: "name", available: false }), "name_registered");
  assert.equal(isMeaningfulPublicLookupOutcome("name_available"), true);
  assert.equal(isMeaningfulPublicLookupOutcome("name_registered"), true);
});

test("wallet lookup distinguishes an identity, a verified absence and a partial score", () => {
  const wallet = (status, scoreStatus) => ({
    kind: "wallet",
    identity: { status, scoreStatus },
  });
  assert.equal(classifyPublicLookupResult(wallet("found", "scored")), "identity_found");
  assert.equal(classifyPublicLookupResult(wallet("none", "unavailable")), "wallet_no_identity");
  assert.equal(classifyPublicLookupResult(wallet("unavailable", "unscored")), "wallet_score_only");
  assert.equal(classifyPublicLookupResult(wallet("unavailable", "scored")), "wallet_score_only");
});

test("no false first-value conversion from missing evidence or errors", () => {
  const unavailable = {
    kind: "wallet",
    identity: { status: "unavailable", scoreStatus: "unavailable" },
  };
  assert.equal(classifyPublicLookupResult(unavailable), "source_unavailable");
  for (const outcome of ["source_unavailable", "invalid_input", "lookup_error"]) {
    assert.equal(isMeaningfulPublicLookupOutcome(outcome), false, outcome);
  }
  for (const outcome of ["identity_found", "wallet_no_identity", "wallet_score_only"]) {
    assert.equal(isMeaningfulPublicLookupOutcome(outcome), true, outcome);
  }
});

test("lookup reporting uses a dedicated event with no wallet/name fields", () => {
  assert.equal(PUBLIC_LOOKUP_EVENT, "gwap:public-lookup");
});
