# Lil Gwapz: Pick Your Vibe and reaction finder

The selected original #3 is the Pick Your Vibe homepage at `/lil-gwapz`. Original #2 is the searchable reaction finder at `/lil-gwapz/browse`. They replace the later purple Playground layout. Male and Female pack links open the browse route with the corresponding filter.

## Original quality

The previous implementation enlarged 192-pixel atlas cells onto a 512-pixel canvas. Downloads now link directly to the 152 approved 1254 × 1254 transparent RGBA PNG masters. Each PNG is copied byte-for-byte, with its source SHA-256 recorded in `app/lib/lil-gwapz-assets.generated.json`. No sticker artwork was generated, sharpened, recolored, or upscaled. GwapMojis is a separate collection and is unchanged.

WebP previews at 384, 768 and 1254 pixels use quality 94 and responsive `srcset`. The grid lazy-loads offscreen artwork; the dialog displays the untouched 1254-pixel PNG itself, light/dark background, enlargement, and an Open original image link. Download and Share both use the untouched PNG. Native file sharing is prepared before the click to preserve browser user activation. Unsupported sharing produces instructions to download and attach the image. Native sharing still depends on OS/browser support.

The versioned `public/lil-gwapz/r01-v1` directory has immutable cache headers. A future artwork replacement must use a new version path. About 278 MB of static originals and previews are stored with the repo and served on demand; the collection is not bundled into client JavaScript or downloaded on first load.

## Source provenance and six packaging corrections

Source: `LIL_GWAPZ_152_APPROVED_SOURCE_MASTERS.zip`, its `MANIFEST.csv`, and separately approved individual image files. The archive is retained unchanged. Visual inspection and individual image hash matches established these six mislabeled entries:

| Correct catalog slot | Archive entry used |
| --- | --- |
| LG-R01-011-F — Heart Eyes | LG-R01-012-M |
| LG-R01-012-M — Blowing Kiss | LG-R01-011-F |
| LG-R01-013-M — Much Love | LG-R01-013-F |
| LG-R01-013-F — Much Love | LG-R01-013-M |
| LG-R01-014-M — Miss You | LG-R01-014-F |
| LG-R01-014-F — Miss You | LG-R01-014-M |

The import script corrects filenames/catalog mapping only; PNG bytes stay unchanged. The generated manifest records both the corrected filename and `sourceArchiveMember`. Rebuild with Python + Pillow: `python3 scripts/import-lil-gwapz.py /path/to/LIL_GWAPZ_152_APPROVED_SOURCE_MASTERS.zip`. Integrity tests cover all 152 PNGs and 456 previews.

## Design assets and dependencies

- The logo was generated from the selected Pick Your Vibe reference, independently of the approved sticker art. The street texture is the existing Lil Gwapz site asset, exported as a smaller WebP.
- Phosphor React 2.1.10: MIT, UI icons only, server-compatible entrypoint, no external service or credentials.
- Fontsource Permanent Marker 5.2.7 (Apache-2.0) and Barlow Condensed 5.2.8 (OFL-1.1), self-hosted Latin subset. Route-scoped CSS; no Google Fonts runtime requests.
- These are pinned public registry UI packages. They do not cross payment, identity, protocol, or data-access boundaries. Existing framework versions and site security headers are preserved. The dev wrapper only maps the preview runner's host flag to Next's hostname flag.

## Verification

See root `design-qa.md` for current browser evidence and validation outcome. No production deployment or merge is included in this branch.
