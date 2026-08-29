import { isAllowedGwapAppPath, isGwapAppHostname } from "./app-domain-routing.ts";

// Pure resolver for the edge proxy. Extracting the decision here keeps the
// hostname isolation, app-route allowlist, and the /app session gate fully
// unit-testable (including redirect-loop prevention) independent of the
// NextRequest/NextResponse runtime.

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
    };

export type ProxyRoutingInput = {
  host: string | null;
  pathname: string;
  // Inbound search string including the leading "?" (or "").
  search: string;
  walletAuthConfigured: boolean;
  hasPrivyToken: boolean;
  hasPrivySession: boolean;
};

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
      return {
        kind: "redirect",
        pathname: "/os-sign-in",
        preserveSearch: true,
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

  // A present access token is allowed through; the server layout still verifies
  // it authoritatively, so a stale token cannot loop here.
  if (input.hasPrivyToken) {
    return { kind: "next" };
  }

  const redirectParam = `${pathname}${search}`;

  // A refreshable session tries a silent refresh first; otherwise route to the
  // host-appropriate sign-in surface.
  const target = input.hasPrivySession
    ? "/refresh"
    : isAppDomain
      ? "/os-sign-in"
      : "/sign-in";

  return { kind: "redirect", pathname: target, redirectParam };
}
