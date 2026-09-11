import type { StockAsset } from "./gwapfolio";

export const XSTOCKS_TOKEN_API = "https://api.backed.fi/api/v1/token";

type XStocksDeployment = {
  network?: unknown;
  address?: unknown;
  decimals?: unknown;
};

type XStocksTokenNode = {
  symbol?: unknown;
  name?: unknown;
  deployments?: unknown;
};

type XStocksTokenResponse = {
  nodes?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requestedTokenSymbol(underlyingSymbol: string): string {
  return `${underlyingSymbol.trim().toUpperCase()}X`;
}

function deploymentDecimals(deployment: XStocksDeployment): number {
  const raw = deployment.decimals;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  // SPL fungible assets overwhelmingly use finite decimal precision, but we do not
  // guess it here. Missing decimals must be resolved from chain metadata before trade construction.
  return -1;
}

export function parseSolanaXStocks(
  payload: unknown,
  underlyingSymbols: string[],
): StockAsset[] {
  if (!payload || typeof payload !== "object") throw new Error("invalid xStocks token response");
  const nodes = (payload as XStocksTokenResponse).nodes;
  if (!Array.isArray(nodes)) throw new Error("xStocks token response is missing nodes");

  const requested = new Map(
    underlyingSymbols.map((symbol) => [requestedTokenSymbol(symbol), symbol.trim().toUpperCase()]),
  );
  const assets = new Map<string, StockAsset>();

  for (const rawNode of nodes) {
    if (!rawNode || typeof rawNode !== "object") continue;
    const node = rawNode as XStocksTokenNode;
    const tokenSymbol = asString(node.symbol).toUpperCase();
    const underlying = requested.get(tokenSymbol);
    if (!underlying || !Array.isArray(node.deployments)) continue;

    const solanaDeployment = (node.deployments as XStocksDeployment[]).find(
      (deployment) => asString(deployment?.network).toLowerCase() === "solana",
    );
    if (!solanaDeployment) continue;

    const address = asString(solanaDeployment.address).replace(/^solana:/i, "");
    if (!address) continue;

    assets.set(underlying, {
      symbol: underlying,
      mint: address,
      decimals: deploymentDecimals(solanaDeployment),
      name: asString(node.name) || tokenSymbol,
    });
  }

  return underlyingSymbols
    .map((symbol) => assets.get(symbol.trim().toUpperCase()))
    .filter((asset): asset is StockAsset => Boolean(asset));
}

export async function fetchSolanaXStocks(
  underlyingSymbols: string[],
  fetcher: typeof fetch = fetch,
): Promise<StockAsset[]> {
  const response = await fetcher(XSTOCKS_TOKEN_API, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`xStocks token registry unavailable (${response.status})`);
  return parseSolanaXStocks(await response.json(), underlyingSymbols);
}

export function assertResolvedXStocks(
  requestedSymbols: string[],
  assets: StockAsset[],
): StockAsset[] {
  const bySymbol = new Map(assets.map((asset) => [asset.symbol.toUpperCase(), asset]));
  const missing = requestedSymbols
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => !bySymbol.has(symbol));
  if (missing.length) throw new Error(`unsupported or unavailable xStocks: ${missing.join(", ")}`);

  const unresolvedDecimals = assets.filter((asset) => asset.decimals < 0).map((asset) => asset.symbol);
  if (unresolvedDecimals.length) {
    throw new Error(`on-chain mint decimals required before execution: ${unresolvedDecimals.join(", ")}`);
  }

  return requestedSymbols.map((symbol) => bySymbol.get(symbol.trim().toUpperCase())!);
}
