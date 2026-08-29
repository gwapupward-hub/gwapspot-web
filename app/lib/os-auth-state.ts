// Deterministic wallet authentication and session lifecycle for GWAP OS.
//
// This is the single canonical model of the sign-in sequence required by the
// wallet-native client:
//
//   SPLASH → READY_TO_ENTER → DETECTING_WALLET → AUTHORIZING_WALLET
//   → WAITING_FOR_SIGNATURE → ESTABLISHING_SESSION → OPENING_GWAP_OS → READY
//
// Keeping the transitions here (pure and total) makes rejected signatures,
// wallet changes, and session expiry recover deterministically instead of
// through ad-hoc component state that can loop or blank out.

export type OsAuthState =
  | "SPLASH"
  | "READY_TO_ENTER"
  | "DETECTING_WALLET"
  | "AUTHORIZING_WALLET"
  | "WAITING_FOR_SIGNATURE"
  | "ESTABLISHING_SESSION"
  | "OPENING_GWAP_OS"
  | "READY";

export type OsAuthEvent =
  | "ENTER_PRESSED"
  | "AUTHORIZE_STARTED"
  | "WALLET_DETECTED"
  | "WALLET_MISSING"
  | "SIGNATURE_REQUESTED"
  | "SIGNATURE_APPROVED"
  | "SIGNATURE_REJECTED"
  | "SESSION_ESTABLISHED"
  | "SESSION_FAILED"
  | "GWAP_OS_READY"
  | "WALLET_CHANGED"
  | "SESSION_EXPIRED"
  | "RESET";

export const INITIAL_OS_AUTH_STATE: OsAuthState = "SPLASH";

// Ordered forward sequence, exported so UIs can render a deterministic stepper
// and tests can assert the required order.
export const OS_AUTH_SEQUENCE: readonly OsAuthState[] = [
  "SPLASH",
  "READY_TO_ENTER",
  "DETECTING_WALLET",
  "AUTHORIZING_WALLET",
  "WAITING_FOR_SIGNATURE",
  "ESTABLISHING_SESSION",
  "OPENING_GWAP_OS",
  "READY",
];

const TRANSITIONS: Record<
  OsAuthState,
  Partial<Record<OsAuthEvent, OsAuthState>>
> = {
  SPLASH: { ENTER_PRESSED: "READY_TO_ENTER" },
  READY_TO_ENTER: { AUTHORIZE_STARTED: "DETECTING_WALLET" },
  DETECTING_WALLET: {
    WALLET_DETECTED: "AUTHORIZING_WALLET",
    // A missing wallet returns to the entry state so the gateway can offer a
    // recoverable next step rather than stalling.
    WALLET_MISSING: "READY_TO_ENTER",
  },
  AUTHORIZING_WALLET: {
    SIGNATURE_REQUESTED: "WAITING_FOR_SIGNATURE",
    // Authorization can fail before a signature is ever requested.
    SIGNATURE_REJECTED: "READY_TO_ENTER",
  },
  WAITING_FOR_SIGNATURE: {
    SIGNATURE_APPROVED: "ESTABLISHING_SESSION",
    // Rejected signatures recover cleanly to the entry state (no loop, no blank).
    SIGNATURE_REJECTED: "READY_TO_ENTER",
  },
  ESTABLISHING_SESSION: {
    SESSION_ESTABLISHED: "OPENING_GWAP_OS",
    SESSION_FAILED: "READY_TO_ENTER",
  },
  OPENING_GWAP_OS: { GWAP_OS_READY: "READY" },
  READY: {},
};

// Events that can arrive from any authenticated-in-progress state and must
// always force a safe, deterministic recovery.
function globalTransition(event: OsAuthEvent): OsAuthState | null {
  switch (event) {
    case "RESET":
      return "SPLASH";
    case "WALLET_CHANGED":
      // A different wallet must re-authenticate.
      return "DETECTING_WALLET";
    case "SESSION_EXPIRED":
      // Expiry invalidates the session and returns to the entry state.
      return "READY_TO_ENTER";
    default:
      return null;
  }
}

// Compute the next state. Unknown/invalid events are ignored (state unchanged),
// keeping the machine total and predictable.
export function nextOsAuthState(
  state: OsAuthState,
  event: OsAuthEvent,
): OsAuthState {
  const global = globalTransition(event);
  if (global) return global;
  return TRANSITIONS[state][event] ?? state;
}

// Navigation into /app is only permitted once the session is established.
export function canOpenGwapOs(state: OsAuthState): boolean {
  return state === "OPENING_GWAP_OS" || state === "READY";
}

// The session is fully ready (shell mounted and interactive).
export function isSessionReady(state: OsAuthState): boolean {
  return state === "READY";
}

// True while the flow is actively working and should show progress rather than
// an idle entry affordance.
export function isOsAuthInProgress(state: OsAuthState): boolean {
  return (
    state === "DETECTING_WALLET" ||
    state === "AUTHORIZING_WALLET" ||
    state === "WAITING_FOR_SIGNATURE" ||
    state === "ESTABLISHING_SESSION" ||
    state === "OPENING_GWAP_OS"
  );
}

const STATE_LABELS: Record<OsAuthState, string> = {
  SPLASH: "Preparing GWAP OS…",
  READY_TO_ENTER: "Ready to enter",
  DETECTING_WALLET: "Detecting your wallet…",
  AUTHORIZING_WALLET: "Authorizing your wallet…",
  WAITING_FOR_SIGNATURE: "Waiting for signature…",
  ESTABLISHING_SESSION: "Establishing your session…",
  OPENING_GWAP_OS: "Opening GWAP OS…",
  READY: "GWAP OS ready",
};

export function osAuthStateLabel(state: OsAuthState): string {
  return STATE_LABELS[state];
}
