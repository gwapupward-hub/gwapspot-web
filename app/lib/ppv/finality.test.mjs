import assert from "node:assert/strict";
import test from "node:test";
import { classifyPpvSignatureFinality } from "./finality.ts";

test("only finalized successful signatures may enter the PPV receipt pipeline", () => {
  assert.equal(classifyPpvSignatureFinality(null), "pending");
  assert.equal(
    classifyPpvSignatureFinality({ confirmationStatus: "processed", err: null }),
    "pending",
  );
  assert.equal(
    classifyPpvSignatureFinality({ confirmationStatus: "confirmed", err: null }),
    "pending",
  );
  assert.equal(
    classifyPpvSignatureFinality({ confirmationStatus: "finalized", err: null }),
    "finalized",
  );
  assert.equal(
    classifyPpvSignatureFinality({
      confirmationStatus: "finalized",
      err: { InstructionError: [0, "Custom"] },
    }),
    "failed",
  );
});
