import { getWorkspaceRedis } from "../../../lib/redis";
import {
  GWAP_BROWSER_CATEGORIES,
  isGwapBrowserCategory,
  isSearchSort,
  normalizeSearchQuery,
  searchPublications,
  toPublicProject,
} from "../../../lib/gwap-browser-core.ts";
import { readRegistry } from "../../../lib/gwap-browser-registry.ts";
import {
  browserDisabledResponse,
  browserJson,
  checkPublicBrowserRateLimit,
  gwapBrowserFlags,
} from "../../../lib/gwap-browser-server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gwap-browser/search?q=ai+trading&category=ai&sort=relevance|updated|new&offset=0&limit=20
 *
 * Deterministic discovery over Public publications only. Unlisted, Private,
 * Suspended, and Unpublished records never appear. Raw query text is never
 * logged.
 */
export async function GET(request: Request) {
  if (!gwapBrowserFlags().enabled) return browserDisabledResponse();

  const limited = await checkPublicBrowserRateLimit(request, "search", 60);
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const query = normalizeSearchQuery(params.get("q") ?? "");
  const categoryParam = params.get("category");
  const category = isGwapBrowserCategory(categoryParam) ? categoryParam : null;
  const sortParam = params.get("sort");
  const sort = isSearchSort(sortParam) ? sortParam : undefined;

  try {
    const registry = await readRegistry(getWorkspaceRedis());
    const result = searchPublications(registry.publications, {
      query,
      category,
      sort,
      offset: params.get("offset"),
      limit: params.get("limit"),
    });
    return browserJson({
      items: result.items.map(toPublicProject),
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      nextOffset: result.nextOffset,
      category,
      sort: sort ?? (query ? "relevance" : "updated"),
      categories: GWAP_BROWSER_CATEGORIES,
    });
  } catch {
    return browserJson({ error: "Gwap Browser is temporarily unavailable.", code: "temporarily_unavailable" }, 503);
  }
}
