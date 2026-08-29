// RPC request discipline for the wallet client: in-flight deduplication and
// bounded retries so repeated component mounts and transient failures cannot
// produce duplicate calls or retry storms on the critical path.

export type MinimalResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type MinimalFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<MinimalResponse>;

// Coalesce concurrent calls that share a key into a single in-flight promise.
// The entry is cleared once settled so later calls issue a fresh request.
export function createInflightDeduper<T>() {
  const inflight = new Map<string, Promise<T>>();
  return function dedupe(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = factory().finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// Run `fn` with at most `retries` additional attempts. Aborts are never
// retried, and callers can further restrict retries via `shouldRetry`.
export async function withBoundedRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: {
    retries?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 1);
  const delayMs = options.delayMs ?? 250;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      if (isAbortError(error) || !shouldRetry(error)) break;
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

const balanceDeduper = createInflightDeduper<number | null>();

// Fetch a wallet's SOL balance in lamports with deduplication and one bounded
// retry. Returns null when the RPC responds without a numeric balance. The
// fetch implementation and sleep are injectable for tests.
export async function fetchSolBalanceLamports(
  rpcUrl: string,
  wallet: string,
  options: {
    signal?: AbortSignal;
    retries?: number;
    fetchImpl?: MinimalFetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<number | null> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as MinimalFetch);
  const key = `${rpcUrl}|getBalance|${wallet}`;

  return balanceDeduper(key, () =>
    withBoundedRetry(
      async () => {
        const response = await fetchImpl(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [wallet, { commitment: "confirmed" }],
          }),
          signal: options.signal,
        });
        if (!response.ok) throw new Error("RPC request failed");
        const payload = (await response.json()) as {
          result?: { value?: number };
        };
        const lamports = payload.result?.value;
        return typeof lamports === "number" ? lamports : null;
      },
      { retries: options.retries ?? 1, sleep: options.sleep },
    ),
  );
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}
