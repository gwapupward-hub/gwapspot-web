# Mobile Navigation Reliability v2 — Acceptance

This replaces the stale implementation in PR #91 with a rebuild from the current `main` branch.

## Scope locked

- Product cards do not participate in the global custom tap/pulse/reactive layer.
- Product navigation remains normal internal anchor navigation.
- Touch product cards use restrained opacity/border feedback only; no scale/lurch/group activation.
- Decorative card children cannot own the touch hit target.
- Inner pages expose Home / Ecosystem / GWAP OS quick navigation on mobile.
- Product detail pages expose Home and Back to Ecosystem routes.
- Wallet-auth critical logos use direct static delivery, including the locked OCCO official SVG.
- Existing homepage conversion content, ecosystem graph logic, GWAP OS, Idea Lab, APIs, authentication logic, and unified mobile-first scroll renderer are intentionally unchanged.

## Automated gate

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Vercel preview ready

## Physical iPhone Safari gate

- [ ] Cold-load homepage and `/#ecosystem`.
- [ ] Tap GNS, GwapScore, OCCO, DIMI, Isnad, Marketplace, Money Neva $leeps, and Private Proof Vault once each; every card should navigate on the first tap.
- [ ] Repeat a product-card tap after a fast scroll.
- [ ] Tap near the edge of a card; it should still navigate once.
- [ ] Product page: Home and Back to Ecosystem work on the first tap.
- [ ] Inner-page quick nav: Home / Ecosystem / GWAP OS all work on the first tap.
- [ ] Browser Back restores the prior page/scroll context acceptably.
- [ ] Wallet sign-in shows GWAP / OCCO / GNS logos without broken placeholders.
- [ ] Fast top → bottom → top homepage scrolling remains stable.
- [ ] Background the Safari tab, restore it, and repeat navigation.

## Merge rule

Merge after automated checks and Vercel are green. Physical iPhone acceptance remains the final user-facing confirmation for the navigation behavior.
