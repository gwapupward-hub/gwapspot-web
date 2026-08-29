export type WalletSessionAction = "keep" | "reauthenticate";

/**
 * A connected address is not proof of account ownership — the GWAP OS session
 * belongs to the wallet that signed for it. When the host wallet switches to a
 * different account, the session no longer matches its owner and must be
 * re-established rather than silently reused.
 */
export function walletSessionAction({
  sessionWallet,
  hostWallet,
}: {
  sessionWallet: string | null | undefined;
  hostWallet: string | null | undefined;
}): WalletSessionAction {
  const session = (sessionWallet ?? "").trim();
  const host = (hostWallet ?? "").trim();

  // Nothing to compare against: a locked or disconnected host wallet is not an
  // account switch, and the server still verifies every request.
  if (!session || !host) return "keep";

  // Base58 Solana addresses are case-sensitive; compare them exactly.
  return session === host ? "keep" : "reauthenticate";
}
