import { PublicKey } from "@solana/web3.js";

export const GNS_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export type PublicLookupMode = "wallet" | "name";

export type NormalizedPublicLookup =
  | { mode: "wallet"; value: string }
  | { mode: "name"; value: string; fullName: string };

export class PublicLookupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicLookupValidationError";
  }
}

export function isPublicLookupMode(
  value: string | null,
): value is PublicLookupMode {
  return value === "wallet" || value === "name";
}

export function normalizeGnsName(rawValue: string) {
  const value = rawValue.trim().toLowerCase().replace(/\.gwap$/, "");
  if (!GNS_NAME_PATTERN.test(value)) {
    throw new PublicLookupValidationError(
      "Use 1–40 letters, numbers, or internal hyphens.",
    );
  }
  return value;
}

export function normalizeWalletAddress(rawValue: string) {
  const value = rawValue.trim();
  try {
    const canonical = new PublicKey(value).toBase58();
    if (canonical !== value) throw new Error("Non-canonical address");
    return canonical;
  } catch {
    throw new PublicLookupValidationError(
      "Enter a valid Solana wallet address.",
    );
  }
}

export function normalizePublicLookup(
  mode: PublicLookupMode,
  rawValue: string,
): NormalizedPublicLookup {
  if (!rawValue.trim() || rawValue.length > 96) {
    throw new PublicLookupValidationError(
      mode === "wallet"
        ? "Enter a Solana wallet address."
        : "Enter a .gwap name.",
    );
  }

  if (mode === "wallet") {
    return { mode, value: normalizeWalletAddress(rawValue) };
  }

  const value = normalizeGnsName(rawValue);
  return { mode, value, fullName: `${value}.gwap` };
}

export function getPublicLookupSubject(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export function shortAddress(value: string, start = 6, end = 4) {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}
