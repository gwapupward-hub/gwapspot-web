import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_LOOP_LIMIT,
  isAuthLoopDetected,
  parseAuthLoopBounceCount,
} from "./auth-loop-guard.ts";

test("treats a missing cookie as zero bounces", () => {
  assert.equal(parseAuthLoopBounceCount(undefined), 0);
  assert.equal(parseAuthLoopBounceCount(null), 0);
  assert.equal(parseAuthLoopBounceCount(""), 0);
});

test("rejects non-numeric or negative cookie values instead of trusting them", () => {
  assert.equal(parseAuthLoopBounceCount("not-a-number"), 0);
  assert.equal(parseAuthLoopBounceCount("-3"), 0);
  assert.equal(parseAuthLoopBounceCount("1.5"), 0);
  assert.equal(parseAuthLoopBounceCount("NaN"), 0);
});

test("parses a valid positive bounce count", () => {
  assert.equal(parseAuthLoopBounceCount("1"), 1);
  assert.equal(parseAuthLoopBounceCount("2"), 2);
});

test("does not flag the first arrival as a loop", () => {
  assert.equal(isAuthLoopDetected(0), false);
});

test("flags a second arrival within the window as a loop", () => {
  assert.equal(isAuthLoopDetected(AUTH_LOOP_LIMIT), true);
  assert.equal(isAuthLoopDetected(AUTH_LOOP_LIMIT + 1), true);
});
