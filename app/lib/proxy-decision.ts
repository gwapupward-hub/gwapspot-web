// The pure routing/redirect logic behind proxy.ts (the app-domain
// middleware), decoupled from next/server's request/response types.
//
// proxy.ts itself can't be exercised by a plain `node --test` run: it
// imports the bare specifier "next/server", and Node's ESM resolver -
// unlike Next's own bundler - requires an explicit extension for that
// package (it has no "exports" map), so the import fails outside Next's
// build. Rather than work around that with test-only module-resolution
// tooling, the actual decision-making lives here as a plain function of
// plain data, and proxy.ts becomes a thin adapter: read facts off the
// real request, call this, translate the result into a real response.
// That adapter is intentionally too thin to need its own tests - the
// judgment calls (which host counts as the app domain, when a redirect
// loop is detected, what a bounce should do to the counter) all happen
// here, where they're fully testable.

import { isAllowedGwapAppPath, isGwapAppHostname } from "./app-domain-routing.ts";
import { isAuthLoopDetected } from "./auth-loop-guard.ts";

export type ProxyRequestFacts = {
  // The resolved host to classify (x-forwarded-host, falling back to the
  // Host header) - same precedence proxy.ts itself uses.
  host: string | null;
  pathname: string;
  // The request's raw query string, e.g. "" or "?redirect_url=%2Fapp".
  search: string;
  hasPrivyToken: boolean;
  hasPrivySession: boolean;
  walletAuthConfigured: boolean;
  // Already parsed from the auth-loop cookie via parseAuthLoopBounceCount.
  authLoopBounceCount: number;
};

export type ProxyRedirectQuery =
  // Keep the request's existing query string and add these keys on top.
  | { mode: "preserve"; add: Record<string, string> }
  // Discard the request's query string entirely and set exactly these.
  | { mode: "replace"; params: Record<string, string> };

export type ProxyAuthLoopCookieAction =
  | { action: "set"; value: string }
  | { action: "clear" };

export type ProxyDecision =
  // Passthrough. Never touches the auth-loop cookie - see the "already
  // authenticated" branch in decideProxyAction for why.
  | { kind: "next" }
  | { kind: "rewrite"; pathname: string }
  | {
      kind: "redirect";
      pathname: string;
      query: ProxyRedirectQuery;
      // null means: don't touch this cookie in the response at all
      // (distinct from "clear", which actively deletes it).
      authLoopCookie: ProxyAuthLoopCookieAction | null;
    };

function bounceCookieAction(bounceCount: number, loopDetected: boolean): ProxyAuthLoopCookieAction {
  return loopDetected
    ? { action: "clear" }
    : { action: "set", value: String(bounceCount + 1) };
}

export function decideProxyAction(facts: ProxyRequestFacts): ProxyDecision {
  const isAppDomain = isGwapAppHostname(facts.host);
  const { pathname } = facts;

  if (isAppDomain) {
    if (pathname === "/") {
      return { kind: "rewrite", pathname: "/os-entry" };
    }

    if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) {
      const loopDetected = isAuthLoopDetected(facts.authLoopBounceCount);
      return {
        kind: "redirect",
        pathname: "/os-sign-in",
        query: {
          mode: "preserve",
          add: loopDetected ? { session_issue: "1" } : {},
        },
        authLoopCookie: bounceCookieAction(facts.authLoopBounceCount, loopDetected),
      };
    }

    if (!isAllowedGwapAppPath(pathname)) {
      return {
        kind: "redirect",
        pathname: "/",
        query: { mode: "replace", params: {} },
        authLoopCookie: null,
      };
    }
  }

  if (!pathname.startsWith("/app")) {
    return { kind: "next" };
  }

  if (!facts.walletAuthConfigured) return { kind: "next" };

  // A privy-token cookie only proves a token was issued at some point, not
  // that the layout can still verify it - the loop guard below exists for
  // exactly that gap. Clearing the bounce counter here just because the
  // cookie exists would erase it right before the request that might fail
  // again, so the counter never has a chance to accumulate. Leave it
  // alone; it decays on its own via its short TTL.
  if (facts.hasPrivyToken) return { kind: "next" };

  const redirectPath = `${pathname}${facts.search}`;
  const loopDetected = isAuthLoopDetected(facts.authLoopBounceCount);
  const targetPathname = loopDetected
    ? isAppDomain
      ? "/os-sign-in"
      : "/sign-in"
    : facts.hasPrivySession
      ? "/refresh"
      : isAppDomain
        ? "/os-sign-in"
        : "/sign-in";

  const params: Record<string, string> = { redirect_url: redirectPath };
  if (loopDetected) params.session_issue = "1";

  return {
    kind: "redirect",
    pathname: targetPathname,
    query: { mode: "replace", params },
    authLoopCookie: bounceCookieAction(facts.authLoopBounceCount, loopDetected),
  };
}
