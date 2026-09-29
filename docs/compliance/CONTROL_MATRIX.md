# Control Matrix

Status values:

- **Implemented** — a control is directly represented in the repository or current architecture.
- **Operational** — requires recurring human/process evidence outside code.
- **Pending** — needs configuration, testing, or organizational implementation.

| Control area | Baseline requirement | Current implementation / evidence | SOC 2 relevance | ISO/IEC 27001 relevance | Status |
| --- | --- | --- | --- | --- | --- |
| Change management | Production changes are reviewed, tested, traceable, and reversible | PR template, Quality workflow, Vercel previews, Git history | Security / Processing Integrity | Change control / secure development | Implemented |
| Code ownership | Sensitive surfaces have accountable owners | `.github/CODEOWNERS` | Security | Roles and responsibilities | Implemented |
| Dependency management | Dependencies are monitored and critical production vulnerabilities block | Dependabot + Security Baseline workflow | Security | Vulnerability management | Implemented |
| Static security analysis | Application code receives recurring automated analysis | CodeQL job | Security | Secure development / technical vulnerability management | Implemented |
| Secret handling | Secrets are excluded from source and separated by environment | `.gitignore`, environment-based configuration, security policy | Security / Confidentiality | Access control / secret protection | Implemented |
| Web hardening | Common browser security headers are enabled | `next.config.ts` security headers | Security | Secure configuration | Implemented |
| Authentication | User/session access is mediated through the configured authentication layer | Privy production/preview separation and health checks | Security / Privacy | Identity and access management | Implemented |
| Privileged access review | Admin access to GitHub, Vercel, Privy, storage, and RPC services is reviewed periodically | Quarterly review required by policy | Security | Access review | Operational |
| Branch protection | Direct changes to `main` are restricted and required checks are enforced | GitHub repository setting | Security | Change control | Pending verification/configuration |
| Incident response | Security incidents have severity, containment, recovery, and postmortem procedures | `INCIDENT_RESPONSE.md` | Security / Availability | Incident management | Implemented + Operational |
| Data classification | Data is classified and restricted data is handled under stricter rules | `DATA_HANDLING.md` | Confidentiality / Privacy | Information classification | Implemented + Operational |
| Data minimization | Collect only data required for product functionality; avoid sensitive data on-chain | `DATA_HANDLING.md` | Privacy / Confidentiality | Privacy / information handling | Implemented + Operational |
| Vendor management | Production vendors are inventoried and reviewed for access/data impact | `VENDOR_REGISTER.md` | Security / Availability / Confidentiality | Supplier security | Implemented + Operational |
| Risk management | Material risks are recorded, assigned, mitigated, accepted, or closed with evidence | `RISK_REGISTER.md` | Security | Risk assessment and treatment | Implemented + Operational |
| Availability | Health checks, deploy history, rollback path, and service dependencies are monitored | `/api/health`, Vercel, production checklist | Availability | Resilience / continuity | Partial |
| Recovery testing | Critical restore/rollback procedures are tested and evidenced | Quarterly evidence requirement | Availability | Business continuity | Pending |
| Logging and monitoring | Security-relevant failures are observable without logging secrets | Runtime/deployment logs; evidence standard below | Security / Availability | Monitoring | Partial |
| Compliance evidence | Control operation is linked to durable records | `EVIDENCE_REGISTER.md` | All selected criteria | ISMS evidence / continual improvement | Implemented + Operational |

## Minimum release gate

A production-impacting release should not ship when any of the following is true without an explicit documented exception:

1. required quality checks fail;
2. the Security Baseline reports a critical production dependency vulnerability;
3. a change introduces an unresolved secret or private-key exposure;
4. authentication/custody/payment authorization behavior changed without review;
5. a rollback or containment path is unknown for a high-risk change.

Exceptions must record the owner, rationale, compensating control, and expiration date.
