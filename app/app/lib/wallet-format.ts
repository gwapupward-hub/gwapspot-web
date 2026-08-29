// Shared, pure wallet-address formatting for the GwapOS shell and wallet views.
// Keeping a single implementation avoids the inconsistent 4…4 / 5…5 truncations
// that previously lived inline across components.

// Shorten a wallet address to `lead…tail` form. Addresses short enough to show
// in full are returned unchanged so nothing important is hidden.
export function shortenWalletAddress(
  address: string | null | undefined,
  lead = 4,
  tail = 4,
): string {
  const value = (address ?? "").trim();
  if (!value) return "";
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
