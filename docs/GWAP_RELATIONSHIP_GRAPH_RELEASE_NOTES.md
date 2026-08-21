# GWAP OS Phase B.2 — Relationship & Verification Graph

This release adds a provenance-aware relationship layer beneath the Trust Graph.

## Live relationships

- canonical GWAP Account → authenticated primary wallet
- canonical GWAP Account → linked/embedded wallets
- `.gwap` identity → primary verified wallet when GNS resolves successfully
- canonical GWAP Account → Telegram identity when the secure account link exists

## Provenance classes

- authenticated
- account-link
- resolved
- planned

## Planned but non-verifying

- social Proof of Control
- trusted counterparties
- team / organization relationships
- endorsements
- Private Proof Vault claims
- OCCO-derived financial relationships

Planned edges never count as verified and do not change GwapScore or Trust Coverage.
