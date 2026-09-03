import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ABSOLUTE_PLAYBACK_DEADLINE_MS,
  RESUME_RECOVERY_DEADLINE_MS,
  STARTUP_PROGRESS_DEADLINE_MS,
  shouldAttemptResumeRecovery,
  shouldRevealOnAbsoluteDeadline,
  shouldRevealOnStartup,
  shouldShowEnterOnProgress,
} from "./splash-fallback.ts";

const playing = { currentTime: 3, duration: 10, paused: false, ended: false };

test("startup watchdog reveals when playback never progressed", () => {
  assert.equal(
    shouldRevealOnStartup({ currentTime: 0, duration: 10, paused: false, ended: false }),
    true,
  );
  assert.equal(
    shouldRevealOnStartup({ currentTime: 3, duration: 10, paused: true, ended: false }),
    true,
  );
  assert.equal(shouldRevealOnStartup(playing), false);
});

test("absolute watchdog reveals only when not ended and not near the end", () => {
  assert.equal(shouldRevealOnAbsoluteDeadline(playing), true);
  assert.equal(
    shouldRevealOnAbsoluteDeadline({ ...playing, ended: true }),
    false,
  );
  assert.equal(
    shouldRevealOnAbsoluteDeadline({ currentTime: 9.5, duration: 10, paused: false, ended: false }),
    false,
  );
  // A missing duration means the video never became ready — reveal.
  assert.equal(
    shouldRevealOnAbsoluteDeadline({ currentTime: 0, duration: 0, paused: false, ended: false }),
    true,
  );
});

test("enter appears near the end even without a reliable ended event", () => {
  assert.equal(shouldShowEnterOnProgress({ currentTime: 9.2, duration: 10, paused: false, ended: false }), true);
  assert.equal(shouldShowEnterOnProgress({ currentTime: 4, duration: 10, paused: false, ended: false }), false);
  assert.equal(shouldShowEnterOnProgress({ currentTime: 0, duration: 0, paused: true, ended: false }), false);
});

test("resume recovery is attempted only for a frozen, not-yet-entered splash", () => {
  // Frozen (paused, not ended), enter not shown, not already failed → recover.
  assert.equal(
    shouldAttemptResumeRecovery({
      enterVisible: false,
      playbackFailed: false,
      video: { currentTime: 2, duration: 10, paused: true, ended: false },
    }),
    true,
  );
  // Already interactive → do nothing.
  assert.equal(
    shouldAttemptResumeRecovery({
      enterVisible: true,
      playbackFailed: false,
      video: { currentTime: 2, duration: 10, paused: true, ended: false },
    }),
    false,
  );
  // Already fell back to the final frame → do nothing.
  assert.equal(
    shouldAttemptResumeRecovery({
      enterVisible: false,
      playbackFailed: true,
      video: { currentTime: 2, duration: 10, paused: true, ended: false },
    }),
    false,
  );
  // Still playing → nothing to recover.
  assert.equal(
    shouldAttemptResumeRecovery({
      enterVisible: false,
      playbackFailed: false,
      video: playing,
    }),
    false,
  );
});

test("deadlines are ordered so entry is always reachable", () => {
  assert.ok(STARTUP_PROGRESS_DEADLINE_MS < ABSOLUTE_PLAYBACK_DEADLINE_MS);
  assert.ok(RESUME_RECOVERY_DEADLINE_MS > 0);
});

test("the splash component wires WebView foreground recovery", () => {
  const splash = readFileSync(new URL("./splash.tsx", import.meta.url), "utf8");
  assert.match(splash, /visibilitychange/);
  assert.match(splash, /pageshow/);
  assert.match(splash, /shouldAttemptResumeRecovery/);
  // The reliability contract strings the navigation suite depends on remain.
  assert.match(splash, /STARTUP_PROGRESS_DEADLINE_MS/);
  assert.match(splash, /ABSOLUTE_PLAYBACK_DEADLINE_MS/);
  assert.match(splash, /onStalled=\{handleStalledPlayback\}/);
  assert.match(splash, /prefers-reduced-motion: reduce/);
  assert.match(splash, /revealFinalFrame/);
});
