# Lil Gwapz design and interaction QA — 2026-10-08

final result: blocked

## Blocking evidence gap

The supplied references are mobile designs. The supported cloud browser exposes no viewport resizing or device-emulation API. A browser popup requested at 393 × 852 still reported 1363 × 988 at devicePixelRatio 1; keyboard zoom also left those dimensions unchanged. No mobile pass is claimed. The temporary popup launcher was removed. Existing frame/security headers are preserved. The Product Design workflow requires permission before switching to a direct Playwright CLI/MCP for this check.

## Source visual truth

- Original #3: `/workspace/scratch/1bb4dd8147b3/source-assets/GwapMojis/Lil Gwapz: Pick Your Vibe.png` (853 × 1844), Library `libfile_4d5144aa9e1c8191a8fc03a58ba5250f`.
- Original #2: `/workspace/scratch/1bb4dd8147b3/source-assets/GwapMojis/Lil Gwapz reaction finder.png` (853 × 1844), Library `libfile_bb2dfea3fb8c81919a1c677d6481c926`.
- Both sources were opened. The homepage source and final desktop implementation were returned together in one comparison input. This is a provisional desktop adaptation comparison, not a normalized mobile fidelity pass.

## Browser-rendered evidence

- `docs/lil-gwapz/evidence/home-desktop.jpg`: complete homepage.
- `docs/lil-gwapz/evidence/browse-desktop.jpg`: all-character finder, top of gallery.
- `docs/lil-gwapz/evidence/download-sheet.jpg`: male Crying Laugh, download/share dialog.
- `docs/lil-gwapz/evidence/enlarged-preview.jpg`: female Crying Laugh enlarged on light background.

Captured in Chrome through the supported cloud browser. Desktop CSS viewport was approximately 1363 × 988, DPR 1 (the initial tab viewport was 1348 × 924 before opening the popup). Exact raster dimensions are listed in `docs/lil-gwapz/evidence/dimensions.json`. Full-page capture height reflects page content. No image was upscaled to make the evidence. A same-state, same-viewport mobile comparison and focused typography/spacing regions are still needed.

## Required fidelity surfaces

- **Typography:** self-hosted Permanent Marker display text and Barlow Condensed bold actions preserve the brush/condensed hierarchy. The reference has heavier distressed brush lettering; exact small-screen wrapping and fidelity remain unverified.
- **Spacing/layout:** desktop preserves the centered logo, pack pill, heading, two character cards, and Browse All CTA. The finder expands to four columns on desktop. Mobile CSS supplies two columns and a bottom sheet, but browser evidence for that breakpoint is missing.
- **Colors:** dark green/black ground, bright green actions/male border, red female border. After comparison, card background tint was added to restore the reference's green/red separation, and the pack pill was moved down to clear the logo drips. The retained site texture differs from the reference's heavier crown/splatter texture; assess this in the matched mobile comparison before final acceptance.
- **Image quality:** supplied 1254 × 1254 approved masters, unchanged bytes. Responsive gallery WebP derivatives at 384/768/1254 with transparency. The dialog displays the untouched original PNG, including the enlarged view. Character caps and shoes are visible in final desktop evidence. Enlarged preview is sharp with no visible opaque background rectangle. The generated logo is a separate asset and does not change sticker art.
- **Copy/content:** homepage's 76 reactions each / 152 ways to say it and Male/Female/Browse All content retained. Added practical saving help, reaction captions, true resolution/file-size information, original-image access, empty and unsupported-share states. Counts reflect results, including singular “sticker.”

## Comparison history

1. Prior workspace draft showed a cropped cap; restoration changed hero sizing to fit artwork by height, preserving the full subject.
2. Restored desktop comparison showed the pack pill crowding the logo and insufficient green/red card distinction. Adjusted logo bottom margin and tinted the existing bitmap backgrounds. Final `home-desktop.jpg` shows the post-fix result.
3. Mobile comparison could not be captured through the supported browser surface. QA stays blocked; no successful desktop build or screenshot substitutes for this check.

## Primary interactions verified

- Male homepage pack opens the Male filter with 76 stickers.
- Female filter and search “crying laugh” yield the one matching female reaction.
- Empty search shows recovery; Clear filters restores All and 152 tiles.
- 148 of 152 grid images have native lazy loading (first four eager).
- Dialog opens with focus on Close; Escape closes it, restores focus to the selected sticker and restores body scrolling.
- Light background and enlarged-preview toggles work.
- Download via the visible control produced 1,496,342 bytes for LG-R01-021-F; SHA-256 exactly matches the approved master. Image dimensions 1254 × 1254, RGBA, alpha range 0–255.
- Unsupported Web Share gives honest download/attach guidance. Actual iOS/Android native share sheet is not verified in this desktop environment.
- No horizontal overflow observed on desktop.
- Console inspection: no application errors; one existing site-wide Next warning about `data-scroll-behavior` and browser-extension metadata errors were observed and separated from application errors.

## Engineering validation

- `npm run build`: passed, including both requested routes.
- `npm run typecheck`: passed.
- Scoped ESLint across changed TSX/TS/MJS: passed.
- Seven Lil Gwapz tests: passed. Includes all 152 master hashes, sizes/dimensions/alpha, all 456 WebP dimensions/alpha, six source-label corrections, and existing catalog tests.
- Initial import verification found eight empty preview files; these were rebuilt and every preview retested. The importer now encodes to memory and checks nonempty output and written size.

## Implementation checklist

- [x] Both requested routes implemented.
- [x] Untouched original PNG downloads and high-resolution previews.
- [x] Functional desktop browse/download journey.
- [x] Integrity tests, typecheck, lint, production build.
- [ ] Authorized phone viewport verification and source comparison.
- [ ] Resolve any remaining mobile visual differences.
- [ ] Publish review branch after upload approval; no merge or production deployment yet.

## Publication status

The user authorized continuing the GitHub upload. The shell has no GitHub credentials, so immutable blobs are uploaded through the authenticated GitHub connector and verified against local Git hashes. The target is the draft branch `feat/lil-gwapz-original-quality` in `gwapupward-hub/gwapspot-web`. No merge or production deployment is authorized by this draft.
