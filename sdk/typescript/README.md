# GWAP Intelligence TypeScript SDK Starter

This is the source starter for the future `@gwap/intelligence` package. It has no runtime dependencies and can be copied into a server-side TypeScript project today.

## Usage

```ts
import { GwapIntelligenceClient } from "./gwap-intelligence";

const gwap = new GwapIntelligenceClient({
  apiKey: process.env.GWAP_API_KEY!,
});

const intelligence = await gwap.getWalletIntelligence(
  "YOUR_SOLANA_WALLET_ADDRESS",
);

console.log(intelligence.reputation.gwapScore);
console.log(intelligence.risk);
```

Keep `gwap_live_...` keys on the server. Do not embed them in browser bundles or public mobile application code.
