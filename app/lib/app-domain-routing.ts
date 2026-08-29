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
