import "server-only";

import { PublicKey } from "@solana/web3.js";

const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const SPL_TOKEN_PROGRAM_IDS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
] as const;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_TIMEOUT_MS = 15_000;

type UnknownRecord = Record<string, unknown>;
type ParsedTokenAccounts = {
  tokens: AssetHolding[];
  tokenAccountCount: number;
  uniqueMintCount: number;
};

export type AssetHolding = {
  mint: string;
  amount: string;
  decimals: number;
  uiAmountString: string;
  accountCount: number;
};

export type AssetIntelligenceResult = {
  status: "available" | "partial" | "unavailable";
  source: "solana-rpc";
  network: "mainnet-beta";
  sol: {
    lamports: number | null;
    amount: number | null;
  };
  tokens: AssetHolding[];
  tokenAccountCount: number | null;
  uniqueMintCount: number | null;
  tokenPrograms: {
    classic: "available" | "unavailable";
    token2022: "available" | "unavailable";
  };
  message: string | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function getRpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    DEFAULT_SOLANA_RPC_URL
  ).trim();
}

export function isValidSolanaWallet(value: string) {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function formatRawTokenAmount(rawAmount: string, decimals: number) {
  if (decimals === 0) return rawAmount;
  const padded = rawAmount.padStart(decimals + 1, "0");
  const integer = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

async function rpcRequest(
  method: string,
  params: unknown[],
  signal: AbortSignal,
): Promise<UnknownRecord> {
  const response = await fetch(getRpcUrl(), {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `gwap-${method}`,
      method,
      params,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Solana RPC returned ${response.status}.`);
  }

  const payload = asRecord(await response.json());
  if (!payload || payload.error) {
    throw new Error("Solana RPC returned an invalid response.");
  }
  return payload;
}

function parseSolBalance(payload: UnknownRecord) {
  const result = asRecord(payload.result);
  const lamports = result?.value;
  if (typeof lamports !== "number" || !Number.isFinite(lamports) || lamports < 0) {
    throw new Error("SOL balance response was invalid.");
  }
  return {
    lamports,
    amount: lamports / 1_000_000_000,
  };
}

function parseTokenAccounts(payload: UnknownRecord): ParsedTokenAccounts {
  const result = asRecord(payload.result);
  const accounts = Array.isArray(result?.value) ? result.value : null;
  if (!accounts) throw new Error("Token account response was invalid.");

  const holdings = new Map<
    string,
    { amount: bigint; decimals: number; accountCount: number }
  >();

  for (const value of accounts) {
    const account = asRecord(value);
    const accountInfo = asRecord(account?.account);
    const data = asRecord(accountInfo?.data);
    const parsed = asRecord(data?.parsed);
    const info = asRecord(parsed?.info);
    const tokenAmount = asRecord(info?.tokenAmount);
    const mint = typeof info?.mint === "string" ? info.mint : null;
    const rawAmount = typeof tokenAmount?.amount === "string" ? tokenAmount.amount : null;
    const decimals = tokenAmount?.decimals;

    if (
      !mint ||
      !rawAmount ||
      !/^\d+$/.test(rawAmount) ||
      typeof decimals !== "number" ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 255
    ) {
      continue;
    }

    const amount = BigInt(rawAmount);
    if (amount === BigInt(0)) continue;
    const current = holdings.get(mint);
    if (current && current.decimals === decimals) {
      current.amount += amount;
      current.accountCount += 1;
    } else if (!current) {
      holdings.set(mint, { amount, decimals, accountCount: 1 });
    }
  }

  const tokens = Array.from(holdings.entries())
    .map(([mint, holding]): AssetHolding => {
      const amount = holding.amount.toString();
      return {
        mint,
        amount,
        decimals: holding.decimals,
        uiAmountString: formatRawTokenAmount(amount, holding.decimals),
        accountCount: holding.accountCount,
      };
    })
    .sort((a, b) => a.mint.localeCompare(b.mint));

  return {
    tokens,
    tokenAccountCount: accounts.length,
    uniqueMintCount: tokens.length,
  };
}

function mergeTokenResults(results: ParsedTokenAccounts[]) {
  if (!results.length) {
    return {
      tokens: [] as AssetHolding[],
      tokenAccountCount: null,
      uniqueMintCount: null,
    };
  }

  const holdings = new Map<
    string,
    { amount: bigint; decimals: number; accountCount: number }
  >();
  let tokenAccountCount = 0;

  for (const result of results) {
    tokenAccountCount += result.tokenAccountCount;
    for (const token of result.tokens) {
      const current = holdings.get(token.mint);
      const amount = BigInt(token.amount);
      if (current && current.decimals === token.decimals) {
        current.amount += amount;
        current.accountCount += token.accountCount;
      } else if (!current) {
        holdings.set(token.mint, {
          amount,
          decimals: token.decimals,
          accountCount: token.accountCount,
        });
      }
    }
  }

  const tokens = Array.from(holdings.entries())
    .map(([mint, holding]): AssetHolding => {
      const amount = holding.amount.toString();
      return {
        mint,
        amount,
        decimals: holding.decimals,
        uiAmountString: formatRawTokenAmount(amount, holding.decimals),
        accountCount: holding.accountCount,
      };
    })
    .sort((a, b) => a.mint.localeCompare(b.mint));

  return {
    tokens,
    tokenAccountCount,
    uniqueMintCount: tokens.length,
  };
}

export async function fetchAssetIntelligence(
  wallet: string,
  options: { timeoutMs?: number } = {},
): Promise<AssetIntelligenceResult> {
  const unavailableTokenPrograms = {
    classic: "unavailable" as const,
    token2022: "unavailable" as const,
  };

  if (!isValidSolanaWallet(wallet)) {
    return {
      status: "unavailable",
      source: "solana-rpc",
      network: "mainnet-beta",
      sol: { lamports: null, amount: null },
      tokens: [],
      tokenAccountCount: null,
      uniqueMintCount: null,
      tokenPrograms: unavailableTokenPrograms,
      message: "The wallet address is invalid.",
    };
  }

  const requestedTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(requestedTimeout, 1_000), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const [balanceResult, classicTokensResult, token2022Result] =
      await Promise.allSettled([
        rpcRequest(
          "getBalance",
          [wallet, { commitment: "confirmed" }],
          controller.signal,
        ),
        ...SPL_TOKEN_PROGRAM_IDS.map((programId) =>
          rpcRequest(
            "getTokenAccountsByOwner",
            [
              wallet,
              { programId },
              { commitment: "confirmed", encoding: "jsonParsed" },
            ],
            controller.signal,
          ),
        ),
      ]);

    const sol =
      balanceResult.status === "fulfilled"
        ? parseSolBalance(balanceResult.value)
        : { lamports: null, amount: null };

    const tokenResults: ParsedTokenAccounts[] = [];
    if (classicTokensResult.status === "fulfilled") {
      tokenResults.push(parseTokenAccounts(classicTokensResult.value));
    }
    if (token2022Result.status === "fulfilled") {
      tokenResults.push(parseTokenAccounts(token2022Result.value));
    }
    const parsedTokens = mergeTokenResults(tokenResults);

    const succeeded =
      Number(balanceResult.status === "fulfilled") +
      Number(classicTokensResult.status === "fulfilled") +
      Number(token2022Result.status === "fulfilled");

    return {
      status:
        succeeded === 3 ? "available" : succeeded > 0 ? "partial" : "unavailable",
      source: "solana-rpc",
      network: "mainnet-beta",
      sol,
      ...parsedTokens,
      tokenPrograms: {
        classic:
          classicTokensResult.status === "fulfilled" ? "available" : "unavailable",
        token2022:
          token2022Result.status === "fulfilled" ? "available" : "unavailable",
      },
      message:
        succeeded === 3
          ? null
          : succeeded > 0
            ? "Some mainnet asset data is temporarily unavailable."
            : "Solana mainnet asset data is temporarily unavailable.",
    };
  } catch {
    return {
      status: "unavailable",
      source: "solana-rpc",
      network: "mainnet-beta",
      sol: { lamports: null, amount: null },
      tokens: [],
      tokenAccountCount: null,
      uniqueMintCount: null,
      tokenPrograms: unavailableTokenPrograms,
      message: "Solana mainnet asset data is temporarily unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
