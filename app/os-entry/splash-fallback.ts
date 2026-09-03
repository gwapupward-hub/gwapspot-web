// Pure decision helpers for the GWAP OS entry splash.
//
// The splash must ALWAYS reach an interactive "Enter Tha GwapSpot" state, even
// when video playback never starts, stalls, errors, or is frozen while the
// wallet WebView is backgrounded. Keeping these predicates pure makes every
// failure path unit-testable without a DOM or real media element.

export const STARTUP_PROGRESS_DEADLINE_MS = 2_500;
export const STALL_RECOVERY_DEADLINE_MS = 2_500;
export const ABSOLUTE_PLAYBACK_DEADLINE_MS = 15_000;
// After returning to the foreground, give playback a brief moment to resume
// before falling back to the held final frame.
export const RESUME_RECOVERY_DEADLINE_MS = 1_500;
// Treat playback as "effectively complete" within this many seconds of the end.
export const NEAR_END_SECONDS = 1.15;
// Minimum progress that proves playback actually started.
export const STARTUP_MIN_PROGRESS_SECONDS = 0.15;

export type VideoProgress = {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
};

// Startup watchdog: if the video has not made real progress (or is paused) by
// the deadline, reveal the final frame instead of waiting on a video that will
// never play.
export function shouldRevealOnStartup(video: VideoProgress): boolean {
  return video.currentTime < STARTUP_MIN_PROGRESS_SECONDS || video.paused;
}

// Absolute watchdog: if playback has neither ended nor reached the final
// moments by the hard deadline, reveal the final frame.
export function shouldRevealOnAbsoluteDeadline(video: VideoProgress): boolean {
  if (video.ended) return false;
  if (!video.duration) return true;
  return video.currentTime < video.duration - NEAR_END_SECONDS;
}

// Reveal the Enter control once playback reaches the final moments, covering
// wallets/browsers that never emit a reliable `ended` event.
export function shouldShowEnterOnProgress(video: VideoProgress): boolean {
  return Boolean(video.duration) && video.duration - video.currentTime <= NEAR_END_SECONDS;
}

// On foreground/resume: if the Enter control is already available, nothing is
// needed. Otherwise, if playback is frozen (paused and not ended) attempt
// recovery; a stuck WebView video should fall back to the final frame.
export function shouldAttemptResumeRecovery(input: {
  enterVisible: boolean;
  playbackFailed: boolean;
  video: VideoProgress;
}): boolean {
  if (input.enterVisible || input.playbackFailed) return false;
  return input.video.paused && !input.video.ended;
}
