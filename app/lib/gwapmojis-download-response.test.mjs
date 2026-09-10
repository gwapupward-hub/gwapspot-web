import assert from "node:assert/strict";
import test from "node:test";
import { GWAPMOJIS_CAMPAIGN } from "./gwapmojis-campaign.ts";
import { GWAPMOJIS_DOWNLOADS } from "./gwapmojis-downloads.ts";
import { respondToGwapMojisDownload } from "./gwapmojis-download-response.ts";
import { GET, HEAD } from "../api/gwapmojis/download/[asset]/route.ts";

const now = Date.parse("2026-09-08T12:00:00Z");
const request = (key, method = "GET") => new Request(`https://www.gwapspot.com/api/gwapmojis/download/${key}`, { method });
const zip = () => new Response(null, { headers: { "Content-Type": "application/zip", "Content-Length": "7261448" } });

const expected = [
  ["complete", "Complete", "complete_zip", GWAPMOJIS_CAMPAIGN.completeDownloadUrl],
  ["static", "Static 33", "static_zip", GWAPMOJIS_CAMPAIGN.staticDownloadUrl],
  ["animated", "Animated 33", "animated_zip", GWAPMOJIS_CAMPAIGN.animatedDownloadUrl],
  ["emoji", "Emoji 12", "emoji_zip", GWAPMOJIS_CAMPAIGN.emojiDownloadUrl],
];

test("all four labelled actions use the correct site endpoint and archive", async () => {
  assert.equal(GWAPMOJIS_DOWNLOADS.length, 4);
  for (const [key, label, asset, sourceUrl] of expected) {
    const download = GWAPMOJIS_DOWNLOADS.find((item) => item.key === key);
    assert.deepEqual(download, { key, label, asset, sourceUrl, href: `/api/gwapmojis/download/${key}` });
    const calls = [];
    const fetchAsset = async (url, options) => { calls.push([url, options]); return zip(); };
    const response = await respondToGwapMojisDownload(request(key), key, fetchAsset, now);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), sourceUrl);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], sourceUrl);
    assert.equal(calls[0][1].method, "HEAD", "never buffers a large ZIP");
    assert.equal(calls[0][1].redirect, "error");
    assert.equal(calls[0][1].cache, "no-store");
    assert.ok(calls[0][1].signal instanceof AbortSignal);
  }
});

test("the actual Next GET and HEAD handlers await route params", async (t) => {
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async () => zip());
  for (const [key, , , sourceUrl] of expected) {
    const response = await GET(request(key), { params: Promise.resolve({ asset: key }) });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), sourceUrl);
    const check = await HEAD(request(key, "HEAD"), { params: Promise.resolve({ asset: key }) });
    assert.equal(check.status, 200);
    assert.equal(check.headers.get("location"), null);
    assert.equal(await check.text(), "");
  }
});

test("unknown paths and URL injection never make an upstream request", async () => {
  for (const key of ["missing", "__proto__", "constructor", "../complete", "https://example.com/archive.zip"]) {
    const response = await respondToGwapMojisDownload(request(key), key, async () => assert.fail("unexpected network request"), now);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("location"), null);
  }
});

test("the download window is enforced for GET and HEAD", async () => {
  for (const method of ["GET", "HEAD"]) {
    const response = await respondToGwapMojisDownload(request("complete", method), "complete", async () => assert.fail("unexpected network request"), Date.parse(GWAPMOJIS_CAMPAIGN.expiresAt));
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("blocked, missing, redirected and invalid files fail visibly without redirecting", async () => {
  for (const [status, type, length] of [[401, "text/plain", "44"], [404, "text/html", "100"], [302, "application/zip", "100"], [200, "text/html", "100"], [200, "application/zip", "0"]]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await respondToGwapMojisDownload(request("static", method), "static", async () => new Response(null, { status, headers: { "Content-Type": type, "Content-Length": length } }), now);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("retry-after"), "60");
      const body = await response.text();
      if (method === "HEAD") assert.equal(body, "");
      else {
        assert.match(body, /Static 33 is temporarily unavailable/);
        assert.ok(body.includes(GWAPMOJIS_CAMPAIGN.telegramUrl));
        assert.doesNotMatch(body, /Untrusted File Access/);
      }
    }
  }
});

test("network timeouts and failures are retryable and recovery is not cached", async () => {
  const response = await respondToGwapMojisDownload(request("animated"), "animated", async () => { throw new DOMException("timeout", "TimeoutError"); }, now);
  assert.equal(response.status, 503);
  const recovered = await respondToGwapMojisDownload(request("animated"), "animated", async () => zip(), now);
  assert.equal(recovered.status, 307);
});
