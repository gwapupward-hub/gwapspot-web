function readErrorField(error: unknown, field: string) {
  if (!error || typeof error !== "object" || !(field in error)) return null;

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

function walletAuthFingerprint(error: unknown) {
  return [
    error instanceof Error ? error.message : null,
    typeof error === "string" ? error : null,
    readErrorField(error, "privyErrorCode"),
    readErrorField(error, "code"),
    readErrorField(error, "type"),
    readErrorField(error, "message"),
  ]
    .filter(Boolean)
    .join(" ");
}

export function getWalletAuthErrorCode(error: unknown) {
  const explicit =
    readErrorField(error, "privyErrorCode") ??
    readErrorField(error, "code") ??
    readErrorField(error, "type");

  if (explicit) return explicit.slice(0, 80).replace(/[^a-zA-Z0-9_.:-]/g, "_");

  const fingerprint = walletAuthFingerprint(error);
  if (/disallowed_login_method|login with solana wallet not allowed/i.test(fingerprint)) {
    return "solana_login_disabled";
  }
  if (/origin.*(?:not allowed|unauthorized)|invalid origin/i.test(fingerprint)) {
    return "origin_not_allowed";
  }
  if (/authenticated wallet session has no access token/i.test(fingerprint)) {
    return "session_token_missing";
  }
  if (/sign.?message.*(?:unsupported|not supported)|does not support.*message/i.test(fingerprint)) {
    return "sign_message_unsupported";
  }
  if (/reject|cancel|declin|user denied|4001/i.test(fingerprint)) {
    return "signature_rejected";
  }
  return "wallet_login_failed";
}

export function getWalletAuthErrorMessage(error: unknown) {
  const fingerprint = walletAuthFingerprint(error);

  if (/disallowed_login_method|login with solana wallet not allowed/i.test(fingerprint)) {
    return "Solana wallet sign-in is not enabled in the Privy application used by GWAP OS.";
  }

  if (/origin.*(?:not allowed|unauthorized)|invalid origin/i.test(fingerprint)) {
    return "GWAP OS wallet sign-in is not enabled for app.gwapspot.com in Privy.";
  }

  if (/authenticated wallet session has no access token/i.test(fingerprint)) {
    return "Your wallet signature was accepted, but Privy did not create the secure session. Check the production Privy client and cookie-domain configuration.";
  }

  if (/sign.?message.*(?:unsupported|not supported)|does not support.*message/i.test(fingerprint)) {
    return "This wallet cannot sign the ownership message required by GWAP OS.";
  }

  if (/reject|cancel|declin|user denied|4001/i.test(fingerprint)) {
    return "The signature request was cancelled. Nothing was changed.";
  }

  return "Wallet authentication failed after connection. Check the reference below against the Privy production configuration, then retry.";
}
