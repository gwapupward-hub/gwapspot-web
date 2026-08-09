export type PublicShareMode = "wallet" | "name";

export type PublicLookupDeepLink = {
  mode: PublicShareMode;
  query: string;
};

export function buildPublicLookupShareUrl(
  origin: string,
  mode: PublicShareMode,
  query: string,
) {
  const url = new URL("/", origin);
  url.searchParams.set("lookup", mode);
  url.searchParams.set("q", query.trim());
  url.hash = "top";
  return url.toString();
}

export function readPublicLookupDeepLink(
  input: string | URL,
): PublicLookupDeepLink | null {
  const url = typeof input === "string" ? new URL(input) : input;
  const mode = url.searchParams.get("lookup");
  const query = url.searchParams.get("q")?.trim() || "";

  if ((mode !== "wallet" && mode !== "name") || !query) return null;
  return { mode, query };
}
