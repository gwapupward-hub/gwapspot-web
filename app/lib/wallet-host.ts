/**
 * Wallet-host evidence model for app.gwapspot.com.
 *
 * app.gwapspot.com is the wallet-hosted GWAP OS client. Rendering it requires
 * two independent gates: the exact app hostname (see `app-domain-routing.ts`)
 * and a supported Solana wallet environment, resolved here.
 *
 * Detection is capability-first. A wallet counts because it registered through
 * the Wallet Standard or injected a Solana provider — never because a user
 * agent string looked like a wallet. User-agent hints are used only to label an
 * otherwise anonymous provider and can never flip the gate open.
 */

export type WalletHostId =
  | "phantom"
  | "jupiter"
  | "solflare"
  | "backpack"
  | "unknown";

export type WalletHostSource = "wallet-standard" | "injected";

/** The subset of a Wallet Standard wallet this module reads. */
export type StandardWalletEvidence = {
  name?: string | null;
  icon?: string | null;
  chains?: readonly string[] | null;
  features?: Readonly<Record<string, unknown>> | null;
};

/** The subset of a legacy injected Solana provider this module reads. */
export type InjectedProviderEvidence = {
  /** The global it was found on, e.g. `window.phantom.solana`. */
  key?: string | null;
  name?: string | null;
  isPhantom?: boolean | null;
  isJupiter?: boolean | null;
  isSolflare?: boolean | null;
  isBackpack?: boolean | null;
  hasSignMessage?: boolean | null;
  hasConnect?: boolean | null;
};

export type WalletHostEvidence = {
  standardWallets?: readonly StandardWalletEvidence[] | null;
  injectedProviders?: readonly InjectedProviderEvidence[] | null;
  /** Secondary evidence only: labels a candidate, never creates one. */
  userAgent?: string | null;
};

export type WalletHostCandidate = {
  id: WalletHostId;
  /** Human label for the entry surface, e.g. "Phantom". */
  label: string;
  source: WalletHostSource;
  /** True when the host can prove wallet ownership by signing a message. */
  canSignMessage: boolean;
  /** True when the host exposes a connect handshake. */
  canConnect: boolean;
};

export type WalletHostResolution = {
  /**
   * "wallet" once any Solana wallet environment is present. A detected wallet
   * that cannot sign stays "wallet" so the client can show the signature
   * failure state rather than the ordinary-browser gateway.
   */
  status: "wallet" | "browser";
  primary: WalletHostCandidate | null;
  candidates: readonly WalletHostCandidate[];
};

type KnownWalletHost = {
  id: Exclude<WalletHostId, "unknown">;
  label: string;
  pattern: RegExp;
};

/**
 * Acceptance priority. Phantom and Jupiter reliability outrank breadth, so a
 * host that registers several wallets enters with the highest-priority one.
 */
const KNOWN_WALLET_HOSTS: readonly KnownWalletHost[] = [
  { id: "phantom", label: "Phantom", pattern: /phantom/i },
  { id: "jupiter", label: "Jupiter", pattern: /jupiter|\bjup\b/i },
  { id: "solflare", label: "Solflare", pattern: /solflare/i },
  { id: "backpack", label: "Backpack", pattern: /backpack/i },
];

const WALLET_HOST_PRIORITY: readonly WalletHostId[] = [
  "phantom",
  "jupiter",
  "solflare",
  "backpack",
  "unknown",
];

const SOLANA_CHAIN_PREFIX = "solana:";
const SIGN_MESSAGE_FEATURES = ["solana:signMessage", "solana:signIn"];
const CONNECT_FEATURES = ["standard:connect"];

export function identifyWalletHost(name: string | null | undefined): WalletHostId {
  const candidate = (name ?? "").trim();
  if (!candidate) return "unknown";

  const known = KNOWN_WALLET_HOSTS.find((host) => host.pattern.test(candidate));
  return known?.id ?? "unknown";
}

export function walletHostLabel(
  id: WalletHostId,
  fallbackName?: string | null,
): string {
  const known = KNOWN_WALLET_HOSTS.find((host) => host.id === id);
  if (known) return known.label;

  const trimmed = (fallbackName ?? "").trim();
  return trimmed || "Your wallet";
}

/**
 * Secondary evidence. Returns a wallet id only when the user agent names a
 * known wallet browser; callers must already hold provider evidence.
 */
export function userAgentWalletHint(
  userAgent: string | null | undefined,
): WalletHostId {
  return identifyWalletHost(userAgent);
}

function hasFeature(
  features: Readonly<Record<string, unknown>> | null | undefined,
  names: readonly string[],
) {
  if (!features) return false;
  return names.some((name) => Boolean(features[name]));
}

function supportsSolana(wallet: StandardWalletEvidence) {
  const chains = wallet.chains ?? [];
  if (chains.some((chain) => chain?.toLowerCase().startsWith(SOLANA_CHAIN_PREFIX))) {
    return true;
  }

  const features = wallet.features ?? {};
  return Object.keys(features).some((feature) =>
    feature.toLowerCase().startsWith(SOLANA_CHAIN_PREFIX),
  );
}

function comparePriority(left: WalletHostCandidate, right: WalletHostCandidate) {
  const byPriority =
    WALLET_HOST_PRIORITY.indexOf(left.id) - WALLET_HOST_PRIORITY.indexOf(right.id);
  if (byPriority !== 0) return byPriority;

  // Within one wallet, prefer the entry that can actually authenticate, then
  // the Wallet Standard registration over the legacy injected global.
  if (left.canSignMessage !== right.canSignMessage) {
    return left.canSignMessage ? -1 : 1;
  }
  if (left.source !== right.source) {
    return left.source === "wallet-standard" ? -1 : 1;
  }
  return 0;
}

function dedupeCandidates(candidates: readonly WalletHostCandidate[]) {
  const byIdentity = new Map<string, WalletHostCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.id}:${candidate.label.toLowerCase()}`;
    const existing = byIdentity.get(key);
    if (!existing || comparePriority(candidate, existing) < 0) {
      byIdentity.set(key, candidate);
    }
  }

  return [...byIdentity.values()];
}

export function resolveWalletHost(
  evidence: WalletHostEvidence,
): WalletHostResolution {
  const hint = userAgentWalletHint(evidence.userAgent);

  const fromStandard = (evidence.standardWallets ?? [])
    .filter((wallet): wallet is StandardWalletEvidence => Boolean(wallet))
    .filter(supportsSolana)
    .map<WalletHostCandidate>((wallet) => {
      const named = identifyWalletHost(wallet.name);
      const id = named === "unknown" ? hint : named;
      return {
        id,
        label: walletHostLabel(id, wallet.name),
        source: "wallet-standard",
        canSignMessage: hasFeature(wallet.features, SIGN_MESSAGE_FEATURES),
        canConnect: hasFeature(wallet.features, CONNECT_FEATURES),
      };
    });

  const fromInjected = (evidence.injectedProviders ?? [])
    .filter((provider): provider is InjectedProviderEvidence => Boolean(provider))
    .map<WalletHostCandidate>((provider) => {
      const flagged =
        (provider.isPhantom && "phantom") ||
        (provider.isJupiter && "jupiter") ||
        (provider.isSolflare && "solflare") ||
        (provider.isBackpack && "backpack") ||
        null;
      const named = flagged ?? identifyWalletHost(provider.name ?? provider.key);
      const id: WalletHostId = named === "unknown" ? hint : (named as WalletHostId);
      return {
        id,
        label: walletHostLabel(id, provider.name),
        source: "injected",
        canSignMessage: Boolean(provider.hasSignMessage),
        canConnect: Boolean(provider.hasConnect),
      };
    });

  const candidates = dedupeCandidates([...fromStandard, ...fromInjected]).sort(
    comparePriority,
  );

  return {
    status: candidates.length > 0 ? "wallet" : "browser",
    primary: candidates[0] ?? null,
    candidates,
  };
}
