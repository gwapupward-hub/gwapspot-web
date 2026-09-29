# Incident Response Plan

## Objectives

Protect users and assets, stop active harm, preserve evidence, restore trusted service, meet applicable notification obligations, and prevent recurrence.

## Severity

| Severity | Example | Target action |
| --- | --- | --- |
| P0 Critical | Private-key/seed exposure, unauthorized custody movement, active account takeover at scale, destructive production compromise | Immediate containment and leadership escalation |
| P1 High | Authentication bypass, material data exposure, exploitable production vulnerability, sustained outage of a critical path | Same-day containment and remediation plan |
| P2 Medium | Limited security defect with no confirmed exploitation, degraded security control, non-critical service outage | Prioritized remediation |
| P3 Low | Hardening issue, low-impact misconfiguration, informational finding | Normal backlog with owner |

Severity may be raised whenever scope is uncertain.

## Response lifecycle

1. **Detect and record** — capture time, reporter, affected systems, observed behavior, and initial evidence.
2. **Triage** — assign severity, incident owner, affected assets, and immediate risks.
3. **Contain** — disable vulnerable features, revoke sessions, rotate credentials, restrict access, or roll back a deployment as appropriate.
4. **Preserve evidence** — retain relevant Git commits, workflow logs, deployment IDs, provider logs, transaction signatures, timestamps, and configuration state.
5. **Eradicate** — remove the root cause, compromised credentials, malicious code, or unsafe configuration.
6. **Recover** — redeploy from a trusted revision, verify health/authentication/payment or transaction paths, and monitor for recurrence.
7. **Communicate** — notify affected stakeholders and satisfy applicable legal/contractual notification requirements.
8. **Postmortem** — document root cause, timeline, control failures, remediation, owner, and due dates.

## Web3-specific containment

- Never rotate or replace an on-chain program authority casually; verify the intended authority and network first.
- Treat wallet private keys, seed phrases, deployer keypairs, upgrade authorities, and custody keys as Restricted data.
- If a signing key may be compromised, stop affected signing flows before investigating convenience fixes.
- Verify mainnet/devnet/localnet before executing remediation transactions.
- For PPV custody/escrow functions, preserve the current custody boundary and do not enable mainnet custody as an incident workaround.

## Evidence

Each P0/P1 incident must retain enough evidence to reconstruct what happened and demonstrate remediation. Postmortems should be completed promptly after service is stabilized and tracked to closure.
