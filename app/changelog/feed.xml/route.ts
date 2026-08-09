import { renderBuildLogRss } from "../../lib/changelog";

export function GET() {
  return new Response(renderBuildLogRss(), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
