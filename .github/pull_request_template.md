## What changed

## Why

## Risk / security impact

- [ ] No secrets, private keys, seed phrases, tokens, or production credentials are committed.
- [ ] Authentication, authorization, wallet signing, custody, payments, or API permission changes are explicitly described above.
- [ ] New or changed personal/confidential data collection, storage, logging, retention, or third-party sharing is documented.
- [ ] New vendors/services or material permission changes are documented.
- [ ] Rollback or feature-disable path is understood for production-impacting changes.

## Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Security Baseline workflow passes or any exception is documented.
- [ ] Vercel preview verified when UI/runtime behavior changed.
- [ ] Production-impacting changes include post-deploy verification.
