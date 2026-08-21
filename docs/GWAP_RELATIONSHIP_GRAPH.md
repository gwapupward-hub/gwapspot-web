# GWAP Relationship Graph — Phase B.2+

Status: implementation contract

## Purpose

Relationship Graph explains how identities and services attach to the canonical GWAP account. It complements Trust Graph:

- Trust Graph answers **what trust signals exist?**
- Relationship Graph answers **what is connected to what, and why does GWAP believe the connection?**

The graph is not a social graph and must not infer relationships merely because public identifiers look similar.

## Root entity

Every graph starts from the canonical `gwapUserId` / GWAP Account record. Product-specific clients, including GWAP OS and Telegram, resolve into this account rather than creating parallel identities.

## Provenance classes

### authenticated

The active authenticated session proves control of the primary wallet used to anchor the account.

### account-link

GWAP has stored an explicit canonical relationship through a controlled link flow, such as a Telegram user ID or additional wallet attached to the account.

### resolved

A live protocol establishes the relationship independently. Initial example: GNS resolving a `.gwap` name to the verified wallet.

### proof-of-control

A supported social-platform verifier independently observed the one-time GWAP challenge after the required platform-specific control actions. Initial flow requires the user to follow the canonical GWAP account and DM the exact one-time challenge from the social account being verified.

The browser's "I sent the DM" action is never sufficient to create this provenance. Only the explicitly enabled, signed server-to-server verifier bridge can complete verification.

### planned

The relationship type is part of the roadmap but has no production verification authority. Planned edges must never count as verified or increase trust coverage.

## Initial graph nodes

Live:

- GWAP Account
- primary authenticated Solana wallet
- additional linked/embedded wallets
- primary `.gwap` identity when GNS resolution succeeds
- Telegram identity when the canonical account-link exists
- supported social identities after Proof-of-Control verification succeeds

Planned:

- trusted counterparties sourced from Marketplace/transaction provenance
- organizations and teams
- endorsements
- Private Proof Vault claims
- OCCO-derived financial relationships

## Verification doctrine

1. A node may exist without having a verified edge.
2. A relationship is verified only when its provenance is explicit.
3. Service outages create an unavailable state, not a negative trust event.
4. Inference may eventually assist discovery, but inference alone must never establish a verified edge.
5. Public usernames, display names, avatars, or matching profile text are not proof of control.
6. Social relationships become verified only after the platform-specific Proof-of-Control challenge succeeds through the signed verifier bridge.
7. Economic relationships require a transaction, agreement, marketplace event, proof, or other attributable source before becoming verified.
8. Missing or expired social verification is not itself a negative GwapScore event.

## Proof-of-Control lifecycle

Social verification uses:

`unlinked → challenge-issued → awaiting-dm → verified → revoked/expired`

Challenge requirements:

- challenge is account- and platform-scoped;
- challenge expires automatically;
- requested social handle is normalized and bound before issuance;
- completing a browser action never verifies the account;
- the platform verifier must independently prove both the required follow and observed DM challenge;
- verifier callbacks use an HMAC-signed raw request body;
- production verification requires an explicit server-side enable flag in addition to the signing secret;
- successful verification binds both the displayed handle and the platform's stable account identifier to the canonical GWAP account;
- handle and stable-account claims are acquired atomically enough to reject concurrent double-claims and are released on revocation;
- the same platform account cannot be verified to two canonical GWAP accounts even if its handle changes;
- the bridge stores only the verification receipt needed for provenance, not private DM content.

A verified social edge records at minimum:

- GWAP account ID
- platform
- normalized platform handle
- stable platform account identifier
- verification timestamp
- challenge identifier
- current status
- revocation/expiry state

## Trust Graph integration

Proof of Control contributes live Trust Coverage only when the signed platform verifier is explicitly enabled and configured. Before that, the capability remains `planned` with zero trust weight.

When the verifier is active:

- no verified social account → `incomplete` live signal;
- at least one verified social account → `verified` live signal;
- verifier/status infrastructure failure → `unavailable`, excluded from the coverage denominator.

Proof of Control is a provenance signal. It does **not** automatically change the GwapScore formula in this phase.

## Counterparty readiness

Counterparty edges should eventually distinguish relationship types such as:

- hired / was hired by
- paid / was paid by
- completed work with
- team member of
- endorsed by
- disputed with
- verified transaction with

Each edge must cite its source domain and lifecycle rather than collapsing every interaction into a generic connection.

## UX rule

The default interface should be understandable without graph-theory knowledge. Lead with entities and plain-language relationships, then expose provenance labels such as `AUTHENTICATED`, `ACCOUNT LINK`, `RESOLVED`, and `PROOF OF CONTROL`.

## Current non-goals

- no inferred social edges
- no username-only social verification
- no fake Proof Vault credentials
- no GwapScore formula changes from verification alone
- no automatic negative scoring from missing relationships
- no public exposure of raw internal account identifiers beyond the authenticated user's own OS
