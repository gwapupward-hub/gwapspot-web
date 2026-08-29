export const GWAP_APP_HOSTNAME = "app.gwapspot.com";

export function normalizeHostname(value: string | null | undefined) {
  const candidate = (value ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (!candidate) return "";

  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");
    return closingBracket >= 0
      ? candidate.slice(1, closingBracket)
      : candidate.slice(1);
  }

  return candidate.replace(/:\d+$/, "");
}

export function isGwapAppHostname(value: string | null | undefined) {
  return normalizeHostname(value) === GWAP_APP_HOSTNAME;
}

export function isAllowedGwapAppPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/refresh" ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/os-entry" ||
    pathname.startsWith("/os-entry/") ||
    pathname === "/os-sign-in" ||
    pathname.startsWith("/os-sign-in/") ||
    pathname === "/app" ||
    pathname.startsWith("/app/")
  );
}

/**
 * Where an unauthenticated request should be sent to sign in. The wallet
 * client has its own gateway, so app-host traffic never detours through the
 * public website's sign-in page.
 */
export function walletSignInPathForHost(host: string | null | undefined) {
  return isGwapAppHostname(host) ? "/os-sign-in" : "/sign-in";
}

/**
 * Which wallet-authentication client a host should mount. The wallet client
 * never carries the public website's email onboarding configuration.
 */
export function walletAuthVariantForHost(host: string | null | undefined) {
  return isGwapAppHostname(host) ? ("app" as const) : ("public" as const);
}
