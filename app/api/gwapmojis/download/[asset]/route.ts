import { GWAPMOJIS_PACK_STATIC_PATH } from "../../../../lib/gwapmojis-pack.ts";

// Legacy endpoint. The pack is now a plain static file, so previously shared
// links keep working by redirecting to the one canonical archive rather than
// proxying or re-checking a third-party CDN.
const LEGACY_ASSETS = new Set(["complete", "static", "animated", "emoji"]);

type DownloadContext = { params: Promise<{ asset: string }> };

function redirect(asset: string, url: URL) {
  if (!LEGACY_ASSETS.has(asset)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(null, {
    status: 308,
    headers: {
      Location: new URL(GWAPMOJIS_PACK_STATIC_PATH, url).toString(),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(request: Request, { params }: DownloadContext) {
  const { asset } = await params;
  return redirect(asset, new URL(request.url));
}

export async function HEAD(request: Request, { params }: DownloadContext) {
  const { asset } = await params;
  return redirect(asset, new URL(request.url));
}
