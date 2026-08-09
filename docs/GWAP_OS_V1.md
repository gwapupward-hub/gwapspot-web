# GWAP OS v1 runtime

This release turns the post-wallet-connect `/app` experience into the first production-safe GWAP OS vertical slice.

## Shipped

- Wallet-authenticated OS shell with persistent terminal menu bar and app dock.
- GNS wallet reverse-resolution with a hard 2.5 second timeout and limited-mode fallback.
- GNS profile + GwapScore hydration when an active `.gwap` identity is found.
- First-connect full boot sequence, abbreviated return boot, reduced-motion bypass, and settings toggle.
- `Cmd/Ctrl + K` command palette.
- Identity-first home screen and truthful live system log.
- Identity/GNS app with authenticated, rate-limited live `.gwap` availability lookup.
- GwapScore app showing the canonical score/tier returned by GNS without inventing thresholds.
- Marketplace and PPV app surfaces that fail closed until their backend contracts are connected.
- Responsive desktop/mobile runtime treatment using the existing GWAP visual system.

## Intentionally not faked

- Marketplace listings, escrow writes, disputes, and SLA data: the current repository has no mounted production marketplace API contract.
- PPV storage/writes: the proof schema, encryption, and authorization service are not connected here.
- In-OS GNS mint/profile writes: live search is integrated, while signed writes still hand off to the existing GNS application.
- Branded PFP background removal: arbitrary-photo segmentation requires an explicit client model/service decision before production launch.

These are integration follow-ups, not mocked production features.
