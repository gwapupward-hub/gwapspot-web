# GWAP Intelligence API

## Endpoint

`GET /api/v1/b2b/intelligence/:wallet`

Production base URL: `https://www.gwapspot.com`

The endpoint returns GNS identity, canonical GwapScore reputation, Solana asset intelligence, enriched portfolio data, and wallet exposure risk from one response.

## Authentication

Send a server-side GWAP API key using either header:

```http
x-api-key: gwap_live_...
```

or:

```http
Authorization: Bearer gwap_live_...
```

Do not expose API keys in browser bundles, client-side mobile code, public repositories, logs, or analytics payloads.

## Example

```bash
curl \
  -H "x-api-key: $GWAP_API_KEY" \
  "https://www.gwapspot.com/api/v1/b2b/intelligence/YOUR_SOLANA_WALLET"
```

## Plan limits

| Plan | Requests / month | Requests / minute |
| --- | ---: | ---: |
| Developer | 1,000 | 60 |
| Growth | 25,000 | 300 |
| Scale | 250,000 | 1,000 |

Monthly quotas are account-wide across all active API keys. The per-minute burst limit is enforced per credential.

## Response headers

Successful and quota-limited authenticated responses may include:

- `X-GWAP-Key-Id`
- `X-GWAP-Plan`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Status behavior

- `200` — intelligence returned
- `400` — invalid Solana wallet input
- `401` — missing, malformed, invalid, or revoked API key
- `429` — per-minute or monthly quota exceeded
- `503` — temporary authorization or intelligence dependency failure

Unavailable GwapScore data is never represented as `0`. Genesis score-hiding privacy is preserved on B2B responses.

## TypeScript starter

A zero-dependency starter client lives at:

`sdk/typescript/gwap-intelligence.ts`

It is source code for integration testing and future package publishing; it is not yet published to npm.
