import "server-only";

export type XPublicProofDiagnostic =
  | "x_auth_failed"
  | "x_api_access_denied"
  | "x_rate_limited"
  | "post_not_found"
  | "post_unavailable"
  | "author_expansion_missing"
  | "x_api_error";

type XLookupPayload = {
  data?: { id?: string; author_id?: string };
  includes?: { users?: Array<{ id?: string; username?: string }> };
};

export function extractDiagnosticXPostId(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    return url.pathname.match(/\/status\/(\d+)/)?.[1] || null;
  } catch {
    return null;
  }
}

export function classifyXLookupStatus(status: number): XPublicProofDiagnostic {
  if (status === 401) return "x_auth_failed";
  if (status === 402 || status === 403) return "x_api_access_denied";
  if (status === 404) return "post_not_found";
  if (status === 429) return "x_rate_limited";
  if (status >= 500) return "x_api_error";
  return "post_unavailable";
}

export async function diagnoseXPublicProofLookup(
  postUrl: string,
): Promise<XPublicProofDiagnostic> {
  const postId = extractDiagnosticXPostId(postUrl);
  if (!postId) return "post_unavailable";

  const bearer = process.env.GWAPSCORE_X_BEARER_TOKEN?.trim();
  if (!bearer) return "x_auth_failed";

  const url = new URL(`https://api.x.com/2/tweets/${postId}`);
  url.searchParams.set("tweet.fields", "author_id");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return classifyXLookupStatus(response.status);

    const payload = (await response.json().catch(() => null)) as XLookupPayload | null;
    const authorId = payload?.data?.author_id?.trim() || "";
    const author = payload?.includes?.users?.find((user) => user.id === authorId);
    if (!payload?.data?.id) return "post_unavailable";
    if (!authorId || !author?.username) return "author_expansion_missing";
    return "post_unavailable";
  } catch {
    return "x_api_error";
  }
}
