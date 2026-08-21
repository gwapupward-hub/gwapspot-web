# GWAP Relationship Graph — Phase B.2

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

### planned

The relationship type is part of the roadmap but has no production verification authority. Planned edges must never count as verified or increase trust coverage.

## Initial graph nodes

Live:

- GWAP Account
- primary authenticated Solana wallet
- additional linked/embedded wallets
- primary `.gwap` identity when GNS resolution succeeds
- Telegram identity when the canonical account-link exists

Planned:

- social identities using GwapScore Proof of Control
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
6. Social relationships become verified only after the platform-specific Proof-of-Control challenge succeeds.
7. Economic relationships require a transaction, agreement, marketplace event, proof, or other attributable source before becoming verified.

## Proof-of-Control readiness

Future social verification should enter the graph through a challenge lifecycle:

`unlinked → challenge-issued → challenge-observed → verified → expired/revoked`

A verified social edge should record at minimum:

- GWAP account ID
- platform
- platform account identifier
- verification method
- verification timestamp
- challenge/version identifier
- current status
- revocation/expiry state when applicable

Do not store private message contents when a minimal verification receipt is sufficient.

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

The default interface should be understandable without graph-theory knowledge. Lead with entities and plain-language relationships, then expose provenance labels such as `AUTHENTICATED`, `ACCOUNT LINK`, and `RESOLVED`.

## Current non-goals

- no inferred social edges
- no fake social verification
- no fake Proof Vault credentials
- no reputation-score changes
- no automatic negative scoring from missing relationships
- no public exposure of raw internal account identifiers beyond the authenticated user's own OS
