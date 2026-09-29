# Security Policy

## Scope

This policy applies to the GwapSpot web application and the code, CI workflows, deployment configuration, authentication integrations, API routes, and supporting services maintained in this repository.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, private keys, seed phrases, access tokens, session material, or other sensitive information.

Use GitHub's private vulnerability reporting or Security Advisory flow when it is available for this repository. If that flow is unavailable, contact the project owner through an established private channel and provide:

- a concise description of the issue;
- affected route, component, or dependency;
- reproduction steps or proof of concept;
- expected security impact;
- suggested mitigation, if known.

## Response expectations

The project will triage credible reports by severity, preserve relevant evidence, contain active risk, remediate the root cause, and document follow-up actions. Critical incidents may require credential rotation, deployment rollback, temporary feature disablement, or suspension of affected integrations.

## Key-handling rules

- Never commit private keys, seed phrases, API secrets, signing keys, session secrets, or production credentials.
- Never place private or regulated user data on a public blockchain.
- Use environment-scoped secrets for Preview and Production.
- Treat wallet-signing and custody changes as high-risk changes requiring explicit review.
- Rotate exposed credentials immediately and review logs for misuse.

## Supported version

Security fixes are applied to the active `main` branch and current production deployment.
