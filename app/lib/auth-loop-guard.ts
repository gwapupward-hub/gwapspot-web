// Detects an /app <-> sign-in redirect loop: a session that keeps getting
// bounced back to sign-in (bad token, or a transient backend/cookie hiccup)
// without ever reaching a stable state. The proxy tracks consecutive bounces
// in a short-lived cookie; once the count reaches the limit within the
// window, it stops forwarding automatically and routes to a page that
// requires an explicit user action instead of retrying silently forever.

export const AUTH_LOOP_COOKIE = "gwap_auth_loop";
// One bounce through a sign-in redirect is tolerated silently (a stale
// token, a one-off hiccup). Arriving back at the same redirect a second
// time within the window is the loop signature - break there rather than
// waiting for a third.
export const AUTH_LOOP_LIMIT = 1;
export const AUTH_LOOP_WINDOW_SECONDS = 20;

export function parseAuthLoopBounceCount(rawCookieValue: string | undefined | null) {
  // A cookie is client-controlled input. Only accept a clean non-negative
  // integer string - reject "1.5", "-3", "1e3", etc. rather than letting
  // Number.parseInt silently truncate or coerce them into a count.
  if (!rawCookieValue || !/^[0-9]+$/.test(rawCookieValue)) return 0;
  return Number.parseInt(rawCookieValue, 10);
}

export function isAuthLoopDetected(bounceCount: number) {
  return bounceCount >= AUTH_LOOP_LIMIT;
}
