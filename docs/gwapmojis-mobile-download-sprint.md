# GwapMojis Direct Mobile Download + Distribution Sprint

Tracking: #177

## Goal

`33 GwapMojis. Free. Download straight from Tha GwapSpot.` — a visitor reaches
GwapMojis from the homepage or GwapOS, opens `/gwapmojis`, taps
**Download Free Pack** once, and gets the real ZIP on their phone. No wallet,
no account, no email, no payment.

## What was wrong (September 2026)

The pack was never served by GwapSpot. The campaign pointed at four
Cloudinary archives, and all four returned **HTTP 401 `x-cld-error: Untrusted
File Access`** — ZIP delivery is disabled for that product environment, which
no amount of link renaming or `download` attributes can work around.

On top of a file that could not be fetched, three layers stood between a tap
and a download:

1. The promotion was a floating button that opened a portalled modal. Only
   inside that modal were there any download links.
2. Each download link called `event.preventDefault()`, then awaited a `HEAD`
   check before calling `window.location.assign()`. Since the upstream check
   always failed, the visitor got "temporarily unavailable" instead of a file —
   and even with a healthy upstream, a navigation started after an `await` has
   left the user-gesture window that iOS Safari requires.
3. On a cold visit the intro splash veil covers the page and locks body
   scrolling until the visitor taps *Enter Tha GwapSpot*, so a shared campaign
   link spent its first tap dismissing an overlay.

The downloads were also gated on an expiry date, so the free pack would have
stopped working entirely after October 12.

## Architecture now

```
Homepage promo  ─┐
                 ├─→ /gwapmojis ─→ /downloads/GwapMojis-GwapMode-33.zip
GwapOS promo    ─┘                  (static file in public/, HTTP 200)
```

One module (`app/components/gwapmojis-promo.tsx`) renders on both surfaces and
links to the one canonical route. One constant
(`GWAPMOJIS_PACK_STATIC_PATH`) names the one archive.

- **The pack is a committed static file.** `public/downloads/GwapMojis-GwapMode-33.zip`
  is the canonical distribution pack, byte for byte
  (`sha256 2ec2f44e…28ec03`, 2,486,052 bytes, 33 WEBP stickers). It is never
  assembled in the browser: no Blob, no object URL, no client-side archiver.
- **The CTA is a plain anchor** — `<a href download>` with no `preventDefault`,
  no router navigation and no async work in front of it. The confirmation
  panel, analytics and the health probe all run *after* the browser already
  owns the download, so none of them can delay or cancel it.
- **The gallery** renders the same 33 stickers from
  `public/gwapmojis/stickers/` through `next/image`, lazily below the fold.
  Each tile can open the full-resolution WEBP (native save/share takes over) or
  save it directly.
- **`GWAPMOJIS_PACK_URL` is not needed.** `NEXT_PUBLIC_GWAPMOJIS_PACK_URL`
  exists as an escape hatch for a deployment that cannot serve the archive
  itself; unset, empty or malformed, it falls back to the static path.
- **Telegram is optional.** `NEXT_PUBLIC_GWAPMOJIS_TELEGRAM_URL` defaults to the
  verified pack URL already in the repository. Anything that is not an
  `https://t.me/addstickers/…` URL hides the CTA rather than rendering a broken
  one.
- **The intro splash is skipped on `/gwapmojis`** so a shared link's first tap
  reaches the CTA, matching how `/telegram` and the GwapOS routes already opt
  out. Route transitions are unaffected, and `download` anchors were already
  exempt from the transition overlay.
- **`/api/gwapmojis/download/{complete,static,animated,emoji}`** now 308s to the
  static archive so previously shared links keep working. Unknown assets 404.

## HTTP validation

`GET /downloads/GwapMojis-GwapMode-33.zip` on a production build returns
`200`, `Content-Type: application/zip`,
`Content-Disposition: attachment; filename="GwapMojis-GwapMode-33.zip"`,
`Content-Length: 2486052`, and bytes identical to the canonical pack. Nothing
rewrites the request into the application shell.

## Mobile behaviour

| Surface | Behaviour |
| --- | --- |
| iPhone Safari | Native download; the panel says to look in Files → Downloads. |
| Android Chrome | Native download; the panel says to look in Downloads. |
| Desktop | Native download; the panel points at browser downloads. |

Nothing is written into Photos, Telegram, Messages, WhatsApp or Files by the
site — only browser-native download behaviour is used.

## Failure handling

The post-download health probe runs exactly once per activation. If the archive
does not respond, or an HTML shell is returned in its place, the panel switches
to a recovery state offering **Download Again**, a direct link to the file and a
route back to the gallery. There is no modal, no focus trap and no retry loop.

## Verification

- `npm run lint`, `npm run typecheck`, `npm test` (343 tests), `npm run build`.
- `app/lib/gwapmojis-pack.test.mjs` reads the committed archive and every
  sticker on disk: checksum, size, ZIP validity and the 33 declared entries.
- `app/lib/gwapmojis-distribution.test.mjs` guards the wiring — a real anchor at
  the canonical file, no `preventDefault`/Blob/client ZIP, no wallet or auth
  imports, homepage and GwapOS on the one route, splash bypass, legacy
  redirects and the response headers.
- Browser runs against a production build on emulated iPhone Safari, Android
  Chrome and desktop Chrome, plus a 320px viewport: first-tap download from a
  cold direct visit and from the homepage promo, retry, individual sticker
  save, keyboard activation, a forced 503 on the probe, broken `fetch`
  /`sendBeacon`, no horizontal overflow, and no console or network errors.

Emulated Safari is not a physical iPhone. Verify the download and Files →
Downloads flow on a real device before announcing the campaign.

---

## How to Use / messaging integration (follow-up sprint)

The download sprint above is unchanged: homepage/GwapOS -> `/gwapmojis` -> the
static ZIP, first tap, no splash in the way. This sits on top of it.

### HOW TO USE GWAPMOJIS

`/gwapmojis` now carries a three-card accordion — iPhone/iMessage,
Android/Google Messages, Telegram — with one card open at a time. The detected
device only reorders the cards and picks the download-success shortcut; every
guide renders on every device and none is gated. Content lives in
`app/lib/gwapmojis-howto.ts` as data, so the copy is testable.

Nothing claims the site installs a sticker into an OS or a messaging app,
because it cannot. Conditional platform features say so: Apple's Add Sticker
"appears only when iOS can lift the subject", Photomoji is "on supported
versions of Google Messages", and Telegram Premium is Telegram's call.

### Telegram

`GWAPMOJIS_TELEGRAM_PACK_URL` in `gwapmojis-campaign.ts` is the single source
for `https://t.me/addstickers/GwapMode33`; no component hard-codes it. Every
Telegram CTA is a plain anchor, so iOS/Android hand it to the app natively and
the web page is the fallback — no deep-link interception, no JavaScript
requirement. The Telegram card leads with the official pack; rebuilding a set
by hand with @Stickers is the noted alternative, not the recommendation.

Premium context sits next to the Telegram CTAs, never on the ZIP CTA, which
stays free with no account, wallet or payment.

### PNG share copies

`public/gwapmojis/share/*.png` holds lossless PNG copies of the same 33
stickers. The gallery still renders the optimized WebP; only the per-sticker
Save action serves PNG.

Why: the pack ships canonical Telegram-format WebP, and iOS Photos does not
import WebP — which breaks the documented Files -> Photos -> Add Sticker path
at the first step. PNG is the format Photos and Android gallery apps accept.

The artwork is unchanged. Each PNG was decoded from its WebP source to raw
RGBA and re-encoded with no quantisation; every one verified byte-identical on
re-decode, 512x512, 8-bit RGBA (colour type 6), no palette, no metadata.
`gwapmojis-pack.test.mjs` re-checks dimensions, depth, colour type and size
from the committed files on every run.

### Analytics

Added `gwapmojis_howto_opened` (platform, and `via` for the success shortcut).
`gwapmojis_individual_download` became `gwapmojis_sticker_save_started` when
Save started serving PNG — one event per click rather than two names for the
same interaction.

