export const PPV_MAX_LOCAL_FILE_BYTES = 20 * 1024 * 1024;

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string, expectedBytes?: number) {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Expected a hexadecimal value");
  }
  const bytes = Uint8Array.from(normalized.match(/.{2}/g)!.map((value) => Number.parseInt(value, 16)));
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new Error(`Expected ${expectedBytes} bytes`);
  }
  return bytes;
}

export function createProofId() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function sha256Bytes(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export async function hashFile(file: File) {
  if (file.size > PPV_MAX_LOCAL_FILE_BYTES) {
    throw new Error("Founding Beta proofs are limited to 20 MB per file.");
  }
  return sha256Bytes(new Uint8Array(await file.arrayBuffer()));
}

export function classifyFile(file: File) {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.includes("pdf") || type.includes("text") || type.includes("document")) return "document";
  if (type.includes("zip") || type.includes("archive") || type.includes("compressed")) return "archive";
  return "other";
}

export async function proofMetadataHash(file: File) {
  // Deliberately excludes the filename and MIME subtype. The chain receives a
  // commitment to coarse metadata, not a searchable description of a private artifact.
  const value = JSON.stringify({
    byteLength: String(file.size),
    mediaClass: classifyFile(file),
    specVersion: "1",
  });
  return sha256Bytes(new TextEncoder().encode(value));
}

export function shorten(value: string, left = 6, right = 6) {
  return value.length <= left + right + 1 ? value : `${value.slice(0, left)}…${value.slice(-right)}`;
}
