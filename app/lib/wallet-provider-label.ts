// Privy's wallet_client_type is a lowercase, machine-readable identifier
// ("phantom", "coinbase_wallet", ...) rather than a display name. Title-case
// each word instead of hardcoding a lookup table, so a wallet Privy adds
// support for later shows up reasonably without this needing an update.
export function formatWalletClientType(clientType: string) {
  return clientType
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function walletProviderLabel(wallet: {
  connector_type?: string;
  wallet_client_type?: string;
}) {
  if (wallet.connector_type === "embedded") return "GWAP Wallet";
  if (!wallet.wallet_client_type || wallet.wallet_client_type === "unknown") {
    return "External wallet";
  }
  return formatWalletClientType(wallet.wallet_client_type);
}
