// Browsers strip ASCII tab (U+0009), LF (U+000A), and CR (U+000D) from URLs
// before resolving them. A value like "/\t/evil.com" therefore survives a naive
// "//" check but navigates to //evil.com — a protocol-relative URL — once the
// tab is removed. Reject the whole C0/DEL range rather than guessing which
// characters a given parser drops.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function getSafeRedirectPath(value: unknown, fallback = "/app") {
  if (typeof value !== "string") return fallback;

  const path = value.trim();
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    // Non-conformant parsers treat a backslash as a path separator, so
    // "/\evil.com" is the same authority-relative hazard as "//evil.com".
    path.includes("\\") ||
    CONTROL_CHARACTERS.test(path)
  ) {
    return fallback;
  }

  return path;
}
