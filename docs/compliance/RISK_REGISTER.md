# Security Risk Register

Use this file for material security/compliance risks that need explicit ownership. Do not mark a risk closed without evidence.

| ID | Risk | Impact | Baseline treatment | Status |
| --- | --- | --- | --- | --- |
| R-001 | Unauthorized production code/config change | Compromise of application integrity | PR-based change control, CODEOWNERS, required checks, branch protection | Branch protection verification pending |
| R-002 | Dependency or CI supply-chain compromise | Remote code execution, credential exposure, malicious build | Dependabot, npm audit, CodeQL, restricted workflow permissions | Active controls |
| R-003 | Secret/private-key exposure | Account, infrastructure, or on-chain authority compromise | No secrets in source/logs, environment-scoped credentials, immediate rotation procedure | Active controls |
| R-004 | Wrong Solana network/program/authority configuration | Failed or unsafe transactions; incorrect custody behavior | Explicit environment/program IDs, devnet/localnet testing, production checklist | Active controls; verify per release |
| R-005 | Private or sensitive data written on-chain | Permanent privacy/confidentiality failure | Data-handling policy forbids confidential/restricted on-chain payloads | Active control |
| R-006 | PPV custody capability enabled beyond approved boundary | Asset-loss or regulatory/operational risk | Maintain documented custody gate; mainnet custody not enabled as a shortcut | Restricted by architecture/process |
| R-007 | Authentication/session misconfiguration | Unauthorized account access | Privy environment separation, health/smoke tests, security review for auth changes | Active controls |
| R-008 | Critical vendor outage or account lockout | Loss of availability or deploy/operate capability | Health monitoring, vendor register, rollback/recovery procedures | Recovery evidence pending |
| R-009 | Inadequate evidence for future audit | SOC 2/ISO readiness delay despite technical controls | Evidence register and recurring operational reviews | New control |

## Review

Review this register at least quarterly and after:

- a P0/P1 incident;
- a material architecture change;
- a new custody/payment/authentication capability;
- a new critical vendor;
- a significant vulnerability or dependency event.
