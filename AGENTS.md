<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## GWAP MASTER

For cross-system architecture, Solana protocol claims, payments, identity/reputation boundaries, digital assets, or release-evidence decisions, read `docs/master/README.md` before implementation.

GWAP MASTER is the cross-system source of truth, but it does not weaken stronger repo-local security/release gates or explicit Founder decisions.

When adding a new external repository, SDK, protocol, standard, or tooling dependency:
1. classify the source;
2. pin the reviewed version/commit;
3. record the intended GWAP boundary;
4. evaluate security/license/compatibility;
5. update MASTER when the decision materially affects another GWAP subsystem.
