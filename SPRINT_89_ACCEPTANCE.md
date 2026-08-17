# Sprint 89 — Navigation Reliability Acceptance

This branch must not merge to `main` until all acceptance items below pass on the Vercel preview and a physical iPhone Safari test.

## Code acceptance

- Product cards are native internal anchors to `/ecosystem/[slug]`.
- Product cards do not participate in the global custom tap/pulse/product-activation layer.
- Touch product cards have no scale/lurch/group animation.
- Inner pages expose explicit Home, Ecosystem, and GWAP OS navigation.
- Product pages expose Home and Back to Ecosystem actions.
- Critical logos use direct static delivery rather than Next image optimizer indirection.
- Existing WebP product masters are used where available.
- The unified mobile-first scroll renderer is unchanged.

## Preview acceptance

- Production build and TypeScript pass.
- All ecosystem routes generate.
- GNS, OCCO, GwapScore, GWAP, DIMI, Isnad, Marketplace, Money Neva $leeps, and Private Proof Vault logo URLs return successfully.
- `/#ecosystem` loads directly.
- GNS card navigates on the first physical tap.
- Repeated card taps after scrolling still navigate on first tap.
- GWAP brand mark returns Home on first tap.
- Back to Ecosystem works on every product page.
- Fast top → bottom → top scrolling remains stable.
- Cold-cache LTE test has no broken logo placeholders.

## Merge rule

Merge only after the physical iPhone acceptance test is confirmed by the user.
