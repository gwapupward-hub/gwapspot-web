import { isAllowedGwapAppPath, isGwapAppHostname } from "./app-domain-routing.ts";
import { isAuthLoopDetected } from "./auth-loop-guard.ts";

// Pure resolver for the edge proxy. Extracting the decision here keeps the
// hostname isolation, app-route allowlist, and the /app session gate fully
// unit-testable (including redirect-loop prevention) independent of the
// NextRequest/NextResponse runtime.
//
// The routing table alone cannot prevent every redirect loop: it only proves
// no infinite cycle exists among the fixed destinations (/os-sign-in,
// /refresh, ...) it can reach. It cannot see the dynamic case where the
// server layout rejects a token this resolver considered good enough to
// pass through - the token verifies against a cookie's mere presence here,
// but the layout re-verifies it authoritatively and can still say no. When
// it does, the browser bounces app -> sign-in -> os-sign-in -> app in a
// cycle this resolver would happily repeat forever, since each individual
// hop looks correct in isolation. authLoopBounceCount closes that gap: a
// short-lived cookie counts consecutive bounces across requests, and after
// one is tolerated, the next stops forwarding automatically and routes to
// sign-in with sessionIssue instead - which the sign-in UI uses to require
// an explicit reconnect rather than replay whatever state just failed.

export type ProxyAction =
  | { kind: "next" }
  | { kind: "rewrite"; pathname: string }
  | {
      kind: "redirect";
      pathname: string;
      // When set, `redirect_url` is added and any inbound query is dropped.
      redirectParam?: string;
      // When true, the inbound search string is preserved on the redirect.
      preserveSearch?: boolean;
      // When true, the sign-in UI should require an explicit reconnect
      // instead of silently retrying (a redirect loop was detected).
      sessionIssue?: boolean;
      // How to update the auth-loop bounce cookie in the response. Absent
      // means: don't touch it. A privy-token passthrough deliberately
      // never sets this - see the comment at that branch below.
      authLoopCookie?: { action: "set"; value: string } | { action: "clear" };
    };

export type ProxyRoutingInput = {
  host: string | null;
  pathname: string;
  // Inbound search string including the leading "?" (or "").
  search: string;
  walletAuthConfigured: boolean;
  hasPrivyToken: boolean;
  hasPrivySession: boolean;
  // Already parsed from the auth-loop cookie via parseAuthLoopBounceCount.
  authLoopBounceCount: number;
};

function bounceCookieAction(
  bounceCount: number,
  loopDetected: boolean,
): { action: "set"; value: string } | { action: "clear" } {
  return loopDetected
    ? { action: "clear" }
    : { action: "set", value: String(bounceCount + 1) };
}

export function resolveProxyAction(input: ProxyRoutingInput): ProxyAction {
  const { host, pathname, search } = input;
  const isAppDomain = isGwapAppHostname(host);

  if (isAppDomain) {
    // The bare app host lands on the wallet-native splash without changing the
    // visible URL.
    if (pathname === "/") {
      return { kind: "rewrite", pathname: "/os-entry" };
    }

    // The public sign-in path is normalized to the app identity gateway.
    if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) {
      const loopDetected = isAuthLoopDetected(input.authLoopBounceCount);
      return {
        kind: "redirect",
        pathname: "/os-sign-in",
        preserveSearch: true,
        sessionIssue: loopDetected,
        authLoopCookie: bounceCookieAction(input.authLoopBounceCount, loopDetected),
      };
    }

    // Any marketing/unknown route is sent back to the splash.
    if (!isAllowedGwapAppPath(pathname)) {
      return { kind: "redirect", pathname: "/" };
    }
  }

  // Only /app* is session-gated; everything else passes through.
  if (!pathname.startsWith("/app")) {
    return { kind: "next" };
  }

  // Without configured auth there is nothing to gate against.
  if (!input.walletAuthConfigured) {
    return { kind: "next" };
  }

  // A privy-token cookie only proves a token was issued at some point, not
  // that the server layout can still verify it - that's exactly the gap the
  // loop guard below exists for. Clearing the bounce counter here just
  // because the cookie exists would erase it right before the request that
  // might fail again, so the counter never has a chance to accumulate.
  // Leave it alone; it decays on its own via its short TTL.
  if (input.hasPrivyToken) {
    return { kind: "next" };
  }

  const redirectParam = `${pathname}${search}`;
  const loopDetected = isAuthLoopDetected(input.authLoopBounceCount);

  // A refreshable session tries a silent refresh first; otherwise route to
  // the host-appropriate sign-in surface. Once the loop is confirmed, that
  // overrides the refresh attempt too - retrying /refresh is itself part of
  // what could be looping.
  const target = loopDetected
    ? isAppDomain
      ? "/os-sign-in"
      : "/sign-in"
    : input.hasPrivySession
      ? "/refresh"
      : isAppDomain
        ? "/os-sign-in"
        : "/sign-in";

  return {
    kind: "redirect",
    pathname: target,
    redirectParam,
    sessionIssue: loopDetected,
    authLoopCookie: bounceCookieAction(input.authLoopBounceCount, loopDetected),
  };
}
