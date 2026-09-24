import { renderBuildLogRss } from "../../lib/changelog";
import { getBuildLogSnapshot } from "../../lib/changelog-live.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getBuildLogSnapshot();
  return new Response(renderBuildLogRss(snapshot.entries), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
