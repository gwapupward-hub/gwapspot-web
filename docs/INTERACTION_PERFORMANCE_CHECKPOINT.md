# Interaction Performance Checkpoint

**Status:** Paused after the final interaction-lifecycle hardening sprint  
**Checkpoint date:** August 14, 2026  
**Resume source:** The latest `main` commit containing this document  
**Production surface:** `https://www.gwapspot.com/`

## Why this checkpoint exists

The GWAP interaction-performance phase is intentionally paused here. The current implementation has completed its source-level hot-path and lifecycle cleanup. Resume from this document instead of restarting the audit or repeating speculative micro-optimizations.

## Completed architecture

- One shared `MutationObserver` enhances dynamically added GWAP trees.
- One shared capture listener owns delegated `pointerdown` events.
- One shared capture listener owns delegated `click` events.
- Interactive target lookup and disabled-state checks run once per delegated event.
- Fine-pointer capability is queried once per sensory-layer mount.
- Touch pointer movement skips decorative reactive-card work.
- Reactive card bounds are cached between geometry invalidations.
- Scroll, resize, and visual-viewport changes invalidate cached geometry.
- Raw `pointermove` records only the latest target and coordinates.
- Reactive-target lookup, geometry calculation, and CSS-variable writes run inside one RAF.
- Multiple pointer samples collapse to the latest sample before the RAF flush.
- Pending pointer RAF work is cancelled during geometry invalidation and unmount.
- Press, launch, group, and feedback timers are cleared during unmount.
- Temporary press, launch, group, and sensory-feedback classes are removed during cleanup.
- Shared event subscriptions and the shared DOM observer detach when their final subscriber leaves.

## Current event ownership

| Owner | Native events / resources |
| --- | --- |
| `gwap-interaction-events.ts` | capture `pointerdown`, capture `click` |
| `gwap-interaction-layer.tsx` | passive `pointermove`, capture/passive `scroll`, window and visual-viewport resize/scroll, capture `keydown`, one pointer RAF |
| `gwap-sensory-polish-layer.tsx` | capture `pointerup`, capture `pointercancel`, tap candidates, feedback timers |
| `gwap-dom-observer.ts` | one shared `MutationObserver` |

## Final lifecycle audit

- Listener add/remove pairs: balanced.
- Shared subscriptions/unsubscriptions: balanced.
- Mutation observer: disconnected after the final subscriber leaves.
- RAF request/cancel ownership: explicit and centralized.
- Timeout maps: cleared on unmount.
- Temporary interaction classes: removed on unmount.
- No new runtime dependency was added.

## Verification completed

- GitHub Quality workflow: lint, TypeScript, tests, and production build.
- Vercel preview and production deployment checks.
- Live production Chrome:
  - pointer tracking on reactive product cards;
  - final-sample RAF behavior;
  - scroll-driven geometry invalidation;
  - pointer and keyboard confirmation;
  - App Router navigation and return;
  - app-origin console errors.

## Measurements not yet available

The following remain unmeasured and must not be represented as verified:

- physical iPhone/iPad Safari frame pacing and memory;
- Safari Web Inspector layer count;
- real-user INP;
- Lighthouse TBT under the agreed throttle;
- long-task frequency;
- memory growth across extended navigation and wallet flows.

## Resume instructions

1. Start from the latest `main` branch containing this checkpoint.
2. Confirm production and CI are still green.
3. Reproduce on a physical iPhone or iPad in Safari.
4. Capture frame pacing, memory, layers, INP, TBT, and long tasks where tools permit.
5. Patch only a measured bottleneck. Do not resume speculative pointer micro-optimization.
6. Preserve the current GWAP visual language and genuine reduced-motion accessibility.

## Recommended next action

Run a real-device Safari verification sprint. If the measurements are healthy, close the performance initiative without further code changes.
