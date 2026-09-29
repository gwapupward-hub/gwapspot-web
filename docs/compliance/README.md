# GwapSpot Security & Compliance Baseline

## Purpose

This directory defines the operational baseline for building GwapSpot toward SOC 2 readiness and an ISO/IEC 27001-aligned information security management system (ISMS).

This repository is **not** claiming SOC 2 attestation, ISO/IEC 27001 certification, or HIPAA compliance. Those outcomes require organization-level controls, evidence over time, management ownership, and independent assessment where applicable.

## Current scope

The baseline covers the systems materially involved in operating the GwapSpot web product:

- this GitHub repository and GitHub Actions;
- Vercel deployments and environment configuration;
- Privy authentication and wallet/session integration;
- Redis-compatible workspace/application storage;
- Solana RPC and program integrations used by GwapOS/PPV;
- application API routes, public web routes, and security headers.

As additional repositories or services become production dependencies, add them to the vendor and control registers before treating them as in-scope.

## Framework direction

### SOC 2

The initial target is the Security criterion, with Availability, Confidentiality, Processing Integrity, and Privacy added where product commitments require them.

### ISO/IEC 27001

The initial target is an ISMS-style operating model: documented scope, risk ownership, security policies, access/change controls, vendor risk management, incident response, evidence collection, and continual review.

### HIPAA

HIPAA is not an assumed requirement for GwapSpot. The product must not intentionally collect or process protected health information for a covered entity or business associate without a formal HIPAA scope review, appropriate contracts, and additional administrative, technical, and operational safeguards.

## Required operating cadence

- **Every change:** pull request, automated checks, security/data impact review.
- **Weekly:** dependency and code security scanning.
- **Monthly:** review open security findings, exceptions, incidents, and material vendor changes.
- **Quarterly:** privileged-access review, risk-register review, recovery/rollback evidence review.
- **Annually:** policy review, vendor review, and compliance scope review.

## Evidence sources

Audit evidence should be reproducible instead of manually asserted. Primary evidence sources are:

- GitHub pull requests, reviews, commits, CODEOWNERS, Dependabot, and Actions;
- CodeQL and dependency-audit results;
- Vercel deployment history and environment separation;
- incident tickets and postmortems;
- access-review records;
- vendor-review records;
- recovery/rollback tests;
- risk-register decisions and accepted exceptions.

See `CONTROL_MATRIX.md` and `EVIDENCE_REGISTER.md` for the working control set.
