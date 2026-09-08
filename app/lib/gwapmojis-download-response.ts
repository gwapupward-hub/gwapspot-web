import { GWAPMOJIS_CAMPAIGN, getGwapMojisCountdown } from "./gwapmojis-campaign.ts";
import { GWAPMOJIS_DOWNLOADS } from "./gwapmojis-downloads.ts";

function unavailable(request: Request, status: number, message: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GwapMojis download unavailable</title>
<style>body{margin:0;padding:3rem 1.5rem;background:#050706;color:white;font:1rem/1.6 system-ui}main{max-width:36rem;margin:auto}h1{line-height:1.2}a{color:#13dd13;display:inline-block;padding:.75rem 0;margin-right:1.5rem}</style>
</head><body><main><h1>GwapMojis download unavailable</h1><p>${message}</p>
<p>Please return to GwapSpot to retry, or add the pack through Telegram.</p>
<a href="/">Return to GwapSpot</a><a href="${GWAPMOJIS_CAMPAIGN.telegramUrl}">Get the pack on Telegram</a>
</main></body></html>`;
  return new Response(request.method === "HEAD" ? null : html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      ...(status === 503 ? { "Retry-After": "60" } : {}),
    },
  });
}

export async function respondToGwapMojisDownload(
  request: Request,
  key: string,
  fetchAsset: typeof fetch = fetch,
  now = Date.now(),
) {
  // An explicit registry prevents arbitrary URLs, path traversal and open redirects.
  const download = GWAPMOJIS_DOWNLOADS.find((item) => item.key === key);
  if (!download) return unavailable(request, 404, "This download could not be found.");
  if (getGwapMojisCountdown(now).expired) {
    return unavailable(request, 410, "The limited-time direct download window has ended.");
  }

  try {
    const upstream = await fetchAsset(download.sourceUrl, {
      method: "HEAD",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
    });
    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (
      upstream.status !== 200 ||
      !["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(contentType ?? "") ||
      upstream.headers.get("content-length") === "0"
    ) {
      return unavailable(request, 503, `${download.label} is temporarily unavailable.`);
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" },
      });
    }

    // Let the CDN deliver the archive without buffering or proxying ZIP bytes
    // through the app server or a browser Blob.
    return new Response(null, {
      status: 307,
      headers: { Location: download.sourceUrl, "Cache-Control": "no-store" },
    });
  } catch {
    return unavailable(request, 503, `${download.label} is temporarily unavailable.`);
  }
}
