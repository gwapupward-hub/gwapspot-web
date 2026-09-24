// Client-observable phases of the GwapOS wallet sign-in flow, mapped onto
// the skill's required state sequence:
//
//   SPLASH                -> app/os-entry/splash.tsx
//   READY_TO_ENTER         -> app/os-entry/splash.tsx (showEnter)
//   DETECTING_WALLET       -> app/lib/use-wallet-host-detection.ts ("detecting")
//   AUTHORIZING_WALLET   \
//                          >- "connecting" below
//   WAITING_FOR_SIGNATURE /
//   ESTABLISHING_SESSION   -> "establishing_session" below
//   OPENING_GWAP_OS        -> "opening" below
//   READY                  -> app/app/layout.tsx + app/app/components/os-shell.tsx
//
// AUTHORIZING_WALLET and WAITING_FOR_SIGNATURE collapse into one observable
// phase here. Once the Privy login modal opens, it owns wallet selection,
// connecting, and the signature prompt internally; its public API exposes
// only whether the modal is open (useModalStatus), not which of those
// sub-steps is active. Inventing a transition between them with no real
// signal behind it would be less honest than naming the one phase we can
// actually observe.

export type WalletSignInPhase = "idle" | "establishing_session" | "opening";

export type WalletSignInDisplayStatus = WalletSignInPhase | "connecting";

export function resolveWalletSignInDisplay(
  phase: WalletSignInPhase,
  modalOpen: boolean,
): WalletSignInDisplayStatus {
  if (phase !== "idle") return phase;
  return modalOpen ? "connecting" : "idle";
}

export const WALLET_SIGN_IN_LABEL: Record<WalletSignInDisplayStatus, string> = {
  idle: "Connect Solana wallet",
  connecting: "Connecting your wallet…",
  establishing_session: "Finishing sign-in…",
  opening: "Opening GWAP OS…",
};


export function canContinueAuthenticatedSession(input: {
  ready: boolean;
  authenticated: boolean;
  hasSolanaWallet: boolean;
  sessionIssue: boolean;
  explicitLoginCompleted: boolean;
}) {
  if (!input.ready || !input.authenticated || !input.hasSolanaWallet) return false;
  if (input.sessionIssue && !input.explicitLoginCompleted) return false;
  return true;
}
