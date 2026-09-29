# Data Classification & Handling

## Core rule

GwapSpot should collect and retain the minimum information necessary to deliver the product. Public blockchain storage is permanent and broadly observable, so confidential, personal, authentication, or regulated data must not be written on-chain.

## Classification

| Class | Examples | Handling |
| --- | --- | --- |
| Public | Published site content, public wallet addresses, public transaction signatures, explicitly public profiles | May be published; integrity still matters |
| Internal | Architecture notes, non-sensitive operational procedures, internal issue context | Limit to team/workspace need |
| Confidential | User email addresses, private support context, non-public product data, internal analytics tied to a user | Need-to-know access; do not expose publicly |
| Restricted | Private keys, seed phrases, signing material, session secrets, API secrets, production credentials, recovery secrets | Never commit or log; strongest access control; rotate on exposure |

## Logging

Do not log:

- passwords or authentication secrets;
- seed phrases or private keys;
- raw session tokens or bearer tokens;
- full production credentials;
- unnecessary personal information.

Security logs should favor identifiers, event type, result, timestamp, environment, and correlation IDs rather than secret payloads.

## Environment separation

Preview and Production must use separate credentials and, where practical, separate auth applications, storage namespaces/databases, and scoped service tokens. Production credentials must not be copied into local examples or test fixtures.

## Retention and deletion

- Retain data only for a documented product, security, legal, or contractual purpose.
- Delete or anonymize application data when it is no longer required and deletion is technically possible.
- On-chain records cannot be treated as deletable storage. Design payloads accordingly.
- Retention exceptions should identify the data, reason, owner, and review date.

## HIPAA boundary

GwapSpot does not intentionally accept ePHI as part of the current product scope. Any proposed healthcare integration that would create covered-entity or business-associate obligations requires a dedicated compliance review before production use.
