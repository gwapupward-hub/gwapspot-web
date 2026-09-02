import { getWorkspaceRedis } from "../../../lib/redis";
import {
  classifyBrowserQuery,
  describeAddressFailure,
} from "../../../lib/gwap-browser-core.ts";
import {
  browserDisabledResponse,
  browserJson,
  checkPublicBrowserRateLimit,
  gwapBrowserFlags,
  resolveBrowserAddress,
} from "../../../lib/gwap-browser-server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gwap-browser/resolve?q=store.emerald.gwap
 *
 * Public-safe exact resolution. Returns only intentional public metadata and
 * the HTTPS target for a deliberate, user-initiated open. Never redirects.
 * Response kinds: profile · project · not_found · temporarily_unavailable.
 */
export async function GET(request: Request) {
  if (!gwapBrowserFlags().enabled) return browserDisabledResponse();

  const url = new URL(request.url);
  const query = classifyBrowserQuery(url.searchParams.get("q") ?? "");
  if (query.type === "empty") {
    return browserJson({ error: describeAddressFailure("empty"), code: "empty" }, 400);
  }
  if (query.type === "search") {
    return browserJson({ error: describeAddressFailure("not_gwap"), code: "not_gwap" }, 400);
  }
  if (query.type === "invalid_address") {
    return browserJson({ error: describeAddressFailure(query.reason), code: query.reason }, 400);
  }

  const limited = await checkPublicBrowserRateLimit(request, "resolve", 60);
  if (limited) return limited;

  try {
    const resolution = await resolveBrowserAddress(getWorkspaceRedis(), query.address);
    if (resolution.kind === "temporarily_unavailable") return browserJson(resolution, 503);
    if (resolution.kind === "not_found") return browserJson(resolution, 404);
    return browserJson(resolution);
  } catch {
    return browserJson({ kind: "temporarily_unavailable", address: query.address.address }, 503);
  }
}
