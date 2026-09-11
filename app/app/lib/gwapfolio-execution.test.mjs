import assert from "node:assert/strict";
import { test } from "node:test";
import {
  markLegBroadcast,
  markLegConfirmed,
  markLegRejected,
  markLegSignatureRequested,
  markLegSimulated,
  markLegUncertain,
  nextExecutableLeg,
  validateExecutionPlan,
} from "./gwapfolio-execution.ts";

const FUTURE = "2026-09-11T15:30:00.000Z";
const NOW = Date.parse("2026-09-11T14:30:00.000Z");

function plan() {
  return {
    id: "plan-1",
    wallet: "Wallet111",
    createdAt: "2026-09-11T14:29:00.000Z",
    status: "review",
    legs: [
      {
        id: "nvda",
        symbol: "NVDA",
        inputMint: "USDC",
        outputMint: "NVDAx",
        inputAmount: "150000000",
        minimumOutputAmount: "800000",
        quoteId: "q1",
        quoteExpiresAt: FUTURE,
        status: "planned",
      },
      {
        id: "msft",
        symbol: "MSFT",
        inputMint: "USDC",
        outputMint: "MSFTx",
        inputAmount: "125000000",
        minimumOutputAmount: "240000",
        quoteId: "q2",
        quoteExpiresAt: FUTURE,
        status: "planned",
      },
    ],
  };
}

test("rejects an expired quote before execution", () => {
  const expired = plan();
  expired.legs[0].quoteExpiresAt = "2026-09-11T14:00:00.000Z";
  assert.throws(() => validateExecutionPlan(expired, NOW), /quote expired for NVDA/);
});

test("all legs must be simulated before the plan becomes ready", () => {
  let current = plan();
  current = markLegSimulated(current, "nvda");
  assert.equal(current.status, "review");
  current = markLegSimulated(current, "msft");
  assert.equal(current.status, "ready");
  assert.equal(nextExecutableLeg(current)?.id, "nvda");
});

test("execution is sequential and a later leg cannot auto-run before the prior leg confirms", () => {
  let current = plan();
  current = markLegSimulated(current, "nvda");
  current = markLegSimulated(current, "msft");
  current = markLegSignatureRequested(current, "nvda");
  assert.equal(nextExecutableLeg(current), null);
  current = markLegBroadcast(current, "nvda", "sig-1");
  assert.equal(nextExecutableLeg(current), null);
  current = markLegConfirmed(current, "nvda");
  assert.equal(nextExecutableLeg(current)?.id, "msft");
});

test("user rejection stops the whole plan without touching later legs", () => {
  let current = plan();
  current = markLegSimulated(current, "nvda");
  current = markLegSimulated(current, "msft");
  current = markLegSignatureRequested(current, "nvda");
  current = markLegRejected(current, "nvda");
  assert.equal(current.status, "stopped");
  assert.equal(current.legs[1].status, "simulated");
  assert.equal(nextExecutableLeg(current), null);
});

test("unknown confirmation after broadcast produces an uncertain stop state", () => {
  let current = plan();
  current = markLegSimulated(current, "nvda");
  current = markLegSimulated(current, "msft");
  current = markLegSignatureRequested(current, "nvda");
  current = markLegBroadcast(current, "nvda", "sig-1");
  current = markLegUncertain(current, "rpc_timeout");
  assert.equal(current.status, "uncertain");
  assert.equal(current.legs[0].signature, "sig-1");
  assert.equal(nextExecutableLeg(current), null);
});
