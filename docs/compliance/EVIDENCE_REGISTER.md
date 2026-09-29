# Compliance Evidence Register

The goal is to produce durable, reproducible evidence that a control operated. Screenshots alone should be a fallback, not the default.

| Control | Preferred evidence | Frequency |
| --- | --- | --- |
| Change review | GitHub PR, review history, commit SHA, linked issue | Per change |
| Quality validation | GitHub Actions Quality run | Per change |
| Dependency vulnerability management | Security Baseline workflow + Dependabot PRs | Weekly / per change |
| Static analysis | CodeQL results and workflow run | Weekly / per change |
| Deployment | Vercel deployment mapped to Git commit | Per production release |
| Environment separation | Provider configuration review without exposing secret values | Quarterly / after material change |
| Privileged access | GitHub/Vercel/Privy/storage/RPC access review record | Quarterly |
| Incident response | Incident ticket, timeline, logs, remediation PR, postmortem | Per incident |
| Vendor risk | Vendor register change + review record | Before use / annually |
| Recovery | Rollback/restore exercise record and outcome | Quarterly |
| Risk management | Risk register review and decisions | Quarterly |

## Evidence rules

- Evidence must identify date/time, system, environment, responsible owner, and result.
- Do not store secret values in evidence.
- Link to immutable or durable records when possible.
- Failed controls are still evidence; record remediation rather than deleting the history.
- Accepted exceptions must include an owner and expiration/review date.
