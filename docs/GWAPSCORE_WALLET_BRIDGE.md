# GwapScore Wallet Evidence Bridge

**Status:** integration pilot / fail-closed  
**Owner:** GwapOS orchestration -> GwapScore reputation  
**Production activation:** not authorized by this document

## Purpose

Allow a wallet that is already authenticated and server-verified by GwapOS to contribute reputation-eligible Wallet Intelligence evidence to GwapScore v2.

The bridge does **not** let the browser declare wallet ownership, submit wallet history, or choose the GwapScore subject.

## Authority flow

```text
Privy access token / session
  -> GwapOS server verifies token
  -> GwapOS resolves verified Solana wallet
  -> GwapOS derives bounded mainnet wallet history server-side
  -> GwapOS calls privileged GwapScore Solana adapter
  -> GwapScore persists dedicated Wallet Intelligence snapshot
  -> Wallet Reputation may contribute to GwapScore v2
```

The canonical wallet authority is `identity.verifiedWallet` returned by `getAuthenticatedWalletIdentityResult()` in `app/lib/privy-server.ts`.

Never use a client-provided wallet address or `ownershipVerified` boolean as the authority source.

## Endpoint

`POST /api/gwapscore/wallet/sync`

Properties:

- available only on the GwapOS app hostname;
- requires a valid server-verified Privy session;
- same-origin protected;
- distributed rate limited;
- request body is intentionally ignored;
- no-store response;
- forwards only server-derived evidence;
- never exposes the GwapScore adapter API key.

## Server-only configuration

The bridge is dormant and returns `503` unless both variables are configured:

```dotenv
GWAPSCORE_API_URL=
GWAPSCORE_ADAPTER_API_KEY=
```

`GWAPSCORE_ADAPTER_API_KEY` must be a GwapScore service credential with only the minimum required `adapter:solana` permission. Do not expose it through a `NEXT_PUBLIC_*` variable.

`GWAPSCORE_API_URL` must use HTTPS in production. Local non-production HTTP is allowed for development only.

## Wallet history evidence

The current GwapScore wallet model saturates at:

- 1,000 observed transactions for the transaction-activity subscore;
- 730 days of observed history for the wallet-longevity subscore.

GwapOS therefore performs a bounded `getSignaturesForAddress` scan instead of requesting unbounded lifetime history.

Current scan budget:

- page size: up to 1,000 signatures;
- maximum observed signatures: 5,000.

Evidence is accepted for sync only when either:

1. wallet history is exhausted, making observed age/count complete; or
2. both score-relevant saturation bounds are proven.

If the scan budget is exhausted before either condition is true, sync fails closed with `WALLET_HISTORY_INCOMPLETE` rather than submitting evidence that could unfairly understate the user's Wallet Reputation.

Missing `blockTime` values do not create synthetic age.

## GwapScore adapter payload

GwapOS sends only:

```json
{
  "subjectId": "<verified-wallet>",
  "walletAddress": "<verified-wallet>",
  "walletAgeDays": 0,
  "txCount": 0,
  "ownershipVerified": true
}
```

Both `subjectId` and `walletAddress` are the same server-verified wallet.

The GwapScore adapter remains responsible for its own permission checks and for storing the dedicated v2 Wallet Intelligence snapshot. Generic GwapScore profile claims are not authoritative wallet-reputation evidence.

## Separation from Wallet Exposure Risk

This bridge does not forward:

- token balances;
- portfolio value;
- token-price volatility;
- concentration;
- drawdown exposure;
- Wallet Exposure Risk labels.

Those remain separate from reputation.

## Failure behavior

The bridge fails closed for:

- unauthenticated Privy session;
- temporarily unavailable Privy identity;
- invalid origin;
- rate limit exceeded;
- unavailable Solana history;
- incomplete bounded history;
- missing GwapScore service configuration;
- GwapScore service failure.

No failure path silently marks a wallet as verified or writes guessed evidence.

## Production gates still open

Before production activation:

1. configure a reviewed GwapScore service deployment and least-privilege adapter key;
2. verify mainnet RPC capacity/rate limits for bounded history collection;
3. exercise wallet switch / primary-wallet behavior;
4. validate replay/idempotency expectations across repeated syncs;
5. validate score distributions with representative wallets;
6. complete GwapScore dependency-security remediation/disposition;
7. explicitly approve v2 model promotion.
