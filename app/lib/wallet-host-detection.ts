// Capability-based wallet-host detection for the wallet-native GwapOS client.
//
// The classifier never trusts user-agent strings. It inspects the concrete
// provider capabilities (a callable `signMessage`, Wallet Standard features)
// that a supported Solana wallet browser injects. This keeps ordinary Safari
// and Chrome classified as unsupported wallet environments while recognizing
// Phantom, Jupiter, Solflare, and Backpack through their injected providers.

export type WalletHostStatus = "detecting" | "ready" | "unsupported" | "missing";

export type WalletProviderName =
  | "phantom"
  | "jupiter"
  | "solflare"
  | "backpack"
  | "unknown";

export type SolanaProviderLike =
  | {
      isPhantom?: boolean;
      isJupiter?: boolean;
      isSolflare?: boolean;
      isBackpack?: boolean;
      signMessage?: unknown;
      signIn?: unknown;
      connect?: unknown;
    }
  | null
  | undefined;

// A snapshot of the wallet-related globals a browser may expose. Reading the
// live `window` is isolated in `readWalletHostEnvironment` so this module stays
// pure and unit-testable with injected fixtures.
export type WalletHostEnvironment = {
  solana?: SolanaProviderLike;
  phantomSolana?: SolanaProviderLike;
  jupiter?: SolanaProviderLike;
  solflare?: SolanaProviderLike;
  backpack?: SolanaProviderLike;
  // Count of Wallet Standard wallets that advertise the `solana:signMessage`
  // (or `solana:signIn`) feature. Zero means no capable standard wallet.
  standardSignerCount?: number;
};

export type WalletHostDetection = {
  status: WalletHostStatus;
  provider: WalletProviderName | null;
  canSignMessage: boolean;
};

function hasSigningCapability(provider: SolanaProviderLike): boolean {
  if (!provider) return false;
  return (
    typeof provider.signMessage === "function" ||
    typeof provider.signIn === "function"
  );
}

function identifyProvider(provider: SolanaProviderLike): WalletProviderName {
  if (!provider) return "unknown";
  if (provider.isPhantom) return "phantom";
  if (provider.isJupiter) return "jupiter";
  if (provider.isSolflare) return "solflare";
  if (provider.isBackpack) return "backpack";
  return "unknown";
}

// Classify a single snapshot of the environment. This is deliberately
// synchronous and total: `detecting` is a transient state owned by the React
// hook while it waits for delayed provider injection, never returned here.
export function classifyWalletHost(
  environment: WalletHostEnvironment,
): WalletHostDetection {
  const candidates: SolanaProviderLike[] = [
    environment.phantomSolana,
    environment.solana,
    environment.jupiter,
    environment.solflare,
    environment.backpack,
  ];

  const present = candidates.filter(
    (candidate): candidate is NonNullable<SolanaProviderLike> =>
      Boolean(candidate),
  );

  const standardSigners = environment.standardSignerCount ?? 0;

  // Prefer a candidate that can actually sign — that is the true readiness
  // signal, independent of any brand flag or user agent.
  const signer = present.find(hasSigningCapability);
  if (signer) {
    return {
      status: "ready",
      provider: identifyProvider(signer),
      canSignMessage: true,
    };
  }

  // A Wallet Standard wallet exposing a signing feature is equally valid even
  // when no legacy window provider is present.
  if (standardSigners > 0) {
    return { status: "ready", provider: "unknown", canSignMessage: true };
  }

  // A provider object exists but cannot sign: an unsupported wallet environment
  // (or one that will never expose signing). Surface it as actionable rather
  // than waiting indefinitely.
  if (present.length > 0) {
    return {
      status: "unsupported",
      provider: identifyProvider(present[0]),
      canSignMessage: false,
    };
  }

  // No provider at all: an ordinary browser.
  return { status: "missing", provider: null, canSignMessage: false };
}

// Read the wallet-related globals from a browser `window`. Returns an empty
// environment when called without a DOM (SSR), so callers can classify safely.
export function readWalletHostEnvironment(
  scope: typeof globalThis | undefined = typeof window === "undefined"
    ? undefined
    : window,
): WalletHostEnvironment {
  if (!scope) return {};

  const win = scope as unknown as {
    solana?: SolanaProviderLike;
    phantom?: { solana?: SolanaProviderLike };
    jupiter?: SolanaProviderLike;
    Jupiter?: SolanaProviderLike;
    solflare?: SolanaProviderLike;
    backpack?: SolanaProviderLike;
  };

  return {
    solana: win.solana,
    phantomSolana: win.phantom?.solana,
    jupiter: win.jupiter ?? win.Jupiter,
    solflare: win.solflare,
    backpack: win.backpack,
    standardSignerCount: countStandardSigners(scope),
  };
}

// Best-effort count of Wallet Standard wallets that advertise a Solana signing
// feature. The Wallet Standard app registry is optional; absence is treated as
// zero rather than an error.
function countStandardSigners(scope: typeof globalThis): number {
  try {
    const registry = (
      scope as unknown as {
        navigator?: { wallets?: { get?: () => unknown[] } };
      }
    ).navigator?.wallets;
    const wallets = registry?.get?.();
    if (!Array.isArray(wallets)) return 0;
    return wallets.filter((wallet) => {
      const features = (wallet as { features?: Record<string, unknown> })
        ?.features;
      if (!features) return false;
      return (
        "solana:signMessage" in features || "solana:signIn" in features
      );
    }).length;
  } catch {
    return 0;
  }
}

// Whether the classification represents a supported wallet host that may
// proceed to wallet authentication.
export function isSupportedWalletHost(detection: WalletHostDetection): boolean {
  return detection.status === "ready";
}
