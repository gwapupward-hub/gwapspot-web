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

A supported platform verification flow proves control of an external account through a one-time GWAP challenge.

The initial production method is **GWAP Public Proof**:

1. the authenticated GWAP user claims a social handle;
2. GWAP issues a short-lived one-time challenge;
3. the user chooses one approved GWAP share theme;
4. GWAP generates a branded public verification link and prewritten post;
5. the user publishes the post from the claimed account;
6. the user submits the public post URL;
7. GWAP independently retrieves the post through the platform API;
8. GWAP confirms the exact challenge text, author username, and stable platform account ID;
9. the social relationship becomes verified provenance.

The pasted URL is user input and is never proof by itself.

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
6. Public Proof verifies by independently retrieving the submitted platform post and matching its author, stable account ID, and exact challenge.
7. Economic relationships require a transaction, agreement, marketplace event, proof, or other attributable source before becoming verified.
8. Missing or expired social verification is not itself a negative GwapScore event.

## Proof-of-Control lifecycle

Initial social verification uses:

`unlinked → challenge-issued → awaiting-post → verified → revoked/expired`

Challenge requirements:

- challenge is account- and platform-scoped;
- challenge expires automatically;
- requested social handle is normalized and bound before issuance;
- user chooses one approved GWAP Public Proof share theme before generation;
- the share link and image are marketing/distribution surfaces, not the proof event;
- the published platform post must contain the exact one-time challenge;
- GWAP must retrieve the post independently through the platform API;
- the retrieved post author must match the claimed handle;
- successful verification binds both the displayed handle and the platform's stable account identifier to the canonical GWAP account;
- handle and stable-account claims reject duplicate ownership and are released on revocation;
- the same platform account cannot be verified to two canonical GWAP accounts even if its handle changes;
- raw internal GWAP account identifiers are never placed in public verification receipts.

A verified social edge records at minimum:

- GWAP account ID privately
- platform
- verification method (`public-post` initially)
- normalized platform handle
- stable platform account identifier privately
- public post ID / URL
- one-time challenge identifier
- selected share theme
- verification timestamp
- current status
- revocation/expiry state

## Public Proof as a distribution surface

Every generated Public Proof link has a branded social preview. Initial approved themes are:

- Neon Green
- Red
- Electric Blue
- Purple
- White / Silver
- Orange

The user's selected theme is stored with the challenge and follows the verification link through pending, verified, revoked, and expired states.

A Public Proof link is a living receipt:

- pending challenge → pending state;
- verified post → verified state;
- revoked verification → revoked state;
- expired challenge → expired state.

The public receipt also acts as an acquisition surface for GWAP OS, `.gwap` identity, reputation, and wallet/trust utilities. Theme selection may be measured later for share, click-through, and conversion performance, but marketing performance must never change trust status.

## Future private method

A private/DM Proof-of-Control method may be added later for users who do not want a public verification post. It must produce the same underlying fact—control of the external account at verification time—but retain its own verification-method provenance.

## Trust Graph integration

Proof of Control contributes live Trust Coverage only when the platform verifier is explicitly enabled and configured. Before that, the capability remains `planned` with zero trust weight.

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
