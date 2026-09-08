# GwapMojis Mobile + Download Reliability Sprint

Tracking: #177

## P0 acceptance

- First physical tap opens the GwapMojis campaign on iOS Safari.
- Desktop click and keyboard activation remain intact.
- One user interaction emits one campaign-open analytics event.
- Get Free Pack opens Telegram normally.
- Complete, Static 33, Animated 33, and Emoji 12 downloads resolve reliably.
- Broken/unavailable assets fail visibly rather than as dead links.
- Regression tests cover mobile-open behavior and download routing.
- Real-device iPhone Safari verification is required before release.

## Diagnosis (September 8, 2026)

All four configured Cloudinary ZIP URLs return HTTP 401 with
`x-cld-error: Untrusted File Access`. The connected asset inventory confirms that
all four files exist, are active, and have public access mode with no per-asset
access control. Renaming a link or adding the HTML `download` attribute cannot
remove this delivery restriction.

The launcher previously used only `onClick` with unconditional hover effects.
The new touch/pen release path removes reliance on Safari's synthesized click.
Real-device reproduction and verification remain necessary; desktop Chromium
does not prove iOS Safari behavior.

## Changes

- Activate once on a short primary touch/pen release; ignore movement, long press,
  cancellation and the following compatibility click. Keep mouse and keyboard
  activation. Restrict hover effects to a fine hover pointer.
- Render the sheet through a body portal so its overlay is above background
  controls, including the Top button. Restore focus without scrolling.
- Route Complete, Static 33, Animated 33 and Emoji 12 through
  `/api/gwapmojis/download/{complete,static,animated,emoji}` on either site host.
- Check the fixed upstream archive with a bounded HEAD request. Redirect a valid
  download to its permanent CDN URL without buffering ZIPs in the browser/server.
- Keep visitors in the panel with an accessible retry message when a download
  is unavailable. Direct endpoint visits also get a readable error page with a
  Telegram fallback. Failed checks do not increment the claim counter.
- Do not cache failures or redirects. Enforce the existing free-drop deadline
  at the endpoint. Do not accept arbitrary source URLs or follow upstream redirects.

## Release blockers

1. In Cloudinary product environment `dg1u1wpdu`, enable **Allow delivery of PDF
   and ZIP files** in **Settings → Security**. This account setting is not exposed
   by the connected Cloudinary tools. See [Cloudinary's blocked delivery formats
   documentation](https://cloudinary.com/documentation/image_delivery_options).
   Cached 401 responses may require cache expiry or an authorized CDN invalidation.
   Verify all four original URLs return 200 and actually download/extract each ZIP.
2. Pass the repository Quality workflow (lint, typecheck, tests and production build).
3. On a real iPhone Safari, verify first tap, close/reopen, scrolling/cancellation,
   Preview Pack, Get Free Pack and all four ZIPs on both public and GwapOS surfaces.
   Check Save to Files and repeat with cold/warm page loads. Verify one open event
   per interaction and no background control covering the sheet.

Keep the change in draft until these release gates pass. No production deployment
or physical-device success is implied by the automated regression tests.
