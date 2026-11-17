# GWAP Messenger — Server-Side Delivery Fencing Spike

**Date:** November 17, 2026. **Scope:** isolated ephemeral SQLite and Chromium test fixtures. **No production code, GNS changes, keys, user traffic, or deployment.**

## Engineering intent

Prevent a browser from bypassing its own pre-send checks by requiring the receiving Delivery Service (DS) to consult the independently durable per-device checkpoint **inside the same SQLite transaction that accepts the opaque ciphertext**. An Ed25519 signature authenticates the sender's delivery intent; the DS compares the current account/binding version, writer fence, revision, and exact sealed-snapshot hash against durable authority state before insertion.

## Verified CI outcome

**Both isolated CI workflows PASSED on November 17, 2026.**

- SQLite server-side signed delivery enforcement: [run #44192476963](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44192476963) — 10/10 reference checkpoint tests + 1/1 durable checkpoint crash test + 1/1 signed delivery crash/replay test; zero failures.
- Real Chromium OpenMLS WASM + independently persistent SQLite DS gate: [run #44192877221](https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44192877221) — native MLS regression, `wasm-pack build`, and browser integration each succeeded. GitHub job emitted `result: PASS` with real MLS PrivateMessage submitted only after external checkpoint acceptance, byte-identical ciphertext retained in SQLite, duplicate request idempotency, rejection of a fully rolled-back valid browser snapshot, fail-closed service outage, recovery of both browser and server after restart, two ciphertext decryptions, and simulated device revocation denial.
- The server stores ciphertext bytes and routing metadata only; it has **no MLS private group state or plaintext**. Test fixtures use a privileged admin endpoint to inspect opaque ciphertext; this is NOT an authorized recipient sync endpoint.

## Test implementation

- `openmls-poc/checkpoint/sqlite-delivery.mjs`: test-only `SQLiteDeliveryGate` with persisted opaque ciphertext and receipt. Signed `canonicalDelivery` is domain-separated from checkpoint advances and resume proofs.
- `openmls-poc/checkpoint/sqlite-server.mjs`: loopback-only `POST /delivery/submit`, with simulated SIGKILL **after** database commit and before HTTP response. Admin-token-only fixture listing cannot be deployed.
- `openmls-poc/checkpoint/sqlite-delivery.test.mjs`: independently signed fixture submissions, negative authorization cases, crash/replay, no plaintext in service storage.
- `openmls-poc/src/outbox_spike.rs`: Rust/WASM test-only export of queued **MLS ciphertext**, not OpenMLS secrets, for browser→DS integration checks.
- `openmls-poc/browser-test/checkpoint-integration-runner.mjs`: actual Chromium OpenMLS-generated encrypted messages submitted to the DS after external checkpoint approval, plus whole-local-snapshot rollback, process restart and simulated revocation.

## Important constraints and release blockers

1. **Not a production DS:** authenticated device enrollment, server-issued lease proof, recipient identity/consent, group membership validation, abuse controls, per-group Commit sequencing, offline sync, durable delivery cursor, retention, rate limits, and independent audit are all absent.
2. **Opaque ciphertext correctness:** the DS checks bytes against a signed hash, but cannot validate MLS content or prove a submitted ciphertext was included in the committed encrypted outbox snapshot. A production app needs a binding between checkpoint, *specific* queued envelope(s), and idempotency receipt that the server can verify without learning plaintext.
3. **Revision relationship:** the test ties a delivery request to the *current checkpoint*; it does not model asynchronous older queued sends under later state revisions. Future design needs a sealed per-envelope authorization / expiry / fencing scheme, rather than requiring all pending messages to stay at one revision indefinitely.
4. **No real GNS:** stable account/device identities, current .gwap ownership, binding transfer, and signature enrollment are fixture controls. The admin token bypass is deliberately test-only.
5. **Browser secret lifecycle:** OpenMLS `MemoryStorage` entire snapshot is still serialized through WASM/JS; replace with a reviewed storage adapter, preserve ciphertext/key separation, and perform real crash/power loss, quota failure, and XSS review.
6. **iPhone Safari:** no real Apple mobile WebKit test yet. Browser tests run Chrome on a Linux GitHub runner.
7. **Release boundary:** no GitHub merge/PR merge, Vercel preview, main branch update, or production deployment is authorized.

## Required production sequence

Reviewed OpenMLS storage adapter → auth-enrolled device and live GNS checks → externally durable signed checkpoint + per-envelope proof and server fence → group/member authenticated Delivery Service → two-device interoperability and mobile Safari → third-party security review and explicit owner approval.

## Evidence

- Durable SQLite checkpoint fixture: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44189734926
- Chromium with independently durable SQLite authority: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44190106769
- DS server-only signed checkpoint enforcement: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44192476963
- Combined browser/DS CI: https://github.com/gwapupward-hub/gwapspot-web/actions/runs/44192877221 — verified SUCCESS.

**No public end-user E2EE claim is supported.**