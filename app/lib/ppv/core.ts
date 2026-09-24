export const PPV_CORE_PROOF_KINDS = [
  "creation",
  "document",
  "agreement",
  "invoice",
  "deliverable",
  "other",
] as const;

export type PpvCoreProofKind = (typeof PPV_CORE_PROOF_KINDS)[number];

export function isPpvCoreProofKind(value: unknown): value is PpvCoreProofKind {
  return (
    typeof value === "string" &&
    (PPV_CORE_PROOF_KINDS as readonly string[]).includes(value)
  );
}

export function fixedHexToBytes(
  value: string,
  bytes: number,
  label: string,
): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of lowercase hex`);
  }
  const out = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) {
    out[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

export function bytesToLowerHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
