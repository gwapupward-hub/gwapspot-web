import type { PrivyClientConfig } from "@privy-io/react-auth";
import type { WalletHostCandidate } from "./wallet-host";

export type WalletAuthVariant = "public" | "app";

/** Acceptance priority, mirroring the wallet-host resolver. */
const WALLET_LOGIN_PRIORITY = [
  "phantom",
  "jupiter",
  "solflare",
  "backpack",
] as const;

/**
 * Privy wallet ordering for the app client. The detected host leads so the
 * user is never asked to choose a wallet they are not standing in.
 */
export function walletLoginOrder(primary: WalletHostCandidate | null) {
  const detected = primary?.id;
  if (!detected || !WALLET_LOGIN_PRIORITY.some((wallet) => wallet === detected)) {
    return [...WALLET_LOGIN_PRIORITY];
  }
  return [
    detected,
    ...WALLET_LOGIN_PRIORITY.filter((wallet) => wallet !== detected),
  ];
}

type SolanaConnectors = NonNullable<
  NonNullable<PrivyClientConfig["externalWallets"]>["solana"]
>["connectors"];

/**
 * One system owns wallet authentication: Privy runs wallet selection,
 * connection, the ownership signature, and the session. The Solana wallet
 * adapter stays mounted for downstream compatibility with `autoConnect`
 * disabled and no adapters of its own, so it can never open a second
 * connection flow alongside this one.
 */
export function buildWalletAuthConfig({
  variant,
  solanaConnectors,
  detectedHost = null,
}: {
  variant: WalletAuthVariant;
  solanaConnectors: SolanaConnectors;
  detectedHost?: WalletHostCandidate | null;
}): PrivyClientConfig {
  const isAppVariant = variant === "app";

  // Inside a wallet the user already has a wallet. The app client never offers
  // email onboarding or an embedded wallet — the public website owns that path.
  const loginMethods: PrivyClientConfig["loginMethods"] = isAppVariant
    ? ["wallet"]
    : ["wallet", "email"];

  const walletList = [
    ...(isAppVariant
      ? walletLoginOrder(detectedHost)
      : ["phantom", "jupiter", "solflare", "backpack"]),
    "detected_solana_wallets",
  ] as NonNullable<PrivyClientConfig["appearance"]>["walletList"];

  return {
    loginMethods,
    appearance: {
      theme: "dark",
      accentColor: "#13dd13",
      logo: "/logos/gwap-agent.png",
      walletChainType: "solana-only",
      walletList,
      showWalletLoginFirst: true,
    },
    externalWallets: {
      solana: { connectors: solanaConnectors },
    },
    embeddedWallets: {
      ethereum: { createOnLogin: "off" },
      solana: {
        createOnLogin: isAppVariant ? "off" : "users-without-wallets",
      },
    },
  };
}

/** True when a configuration can create a wallet from an email address. */
export function offersEmailWalletCreation(config: PrivyClientConfig) {
  const methods: readonly string[] = config.loginMethods ?? [];
  return (
    methods.includes("email") ||
    config.embeddedWallets?.solana?.createOnLogin === "users-without-wallets" ||
    config.embeddedWallets?.solana?.createOnLogin === "all-users"
  );
}
