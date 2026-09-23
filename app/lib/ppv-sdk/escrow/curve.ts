// VENDORED FROM gwapupward-hub/ppv@7c4ea67a9b6d69ab85a20f497eb0c2a31b48cfd2 (sdk/src/escrow/curve.ts).
// Local compatibility adaptation only: preserve PPV wire behavior while compiling under GwapSpot's ES2017 TypeScript target.
/**
 * Ed25519 point decompression, used only to answer one question: is a candidate
 * 32-byte address on the curve?
 *
 * A program-derived address must be *off* the curve, because an on-curve
 * address could have a private key and therefore a signer who is not the
 * program. Deriving PDAs client-side without that check produces addresses the
 * runtime will refuse, so the check is part of the derivation, not a nicety.
 *
 * This mirrors `curve25519-dalek`'s `CompressedEdwardsY::decompress`, which is
 * what the Solana runtime calls, including its two quirks: a non-canonical `y`
 * is reduced rather than rejected, and `x == 0` with the sign bit set is
 * rejected. Dependency-free on purpose — the SDK ships no runtime dependencies.
 */

const P = (BigInt("1") << BigInt("255")) - BigInt("19");
// d = -121665 / 121666 (mod p)
const D = BigInt("37095705934669439343138083508754565189542113879843219016388785533085940283555");

function mod(value: bigint): bigint {
  const result = value % P;
  return result < BigInt("0") ? result + P : result;
}

function modPow(base: bigint, exponent: bigint): bigint {
  let result = BigInt("1");
  let acc = mod(base);
  let e = exponent;
  while (e > BigInt("0")) {
    if (e & BigInt("1")) result = (result * acc) % P;
    acc = (acc * acc) % P;
    e >>= BigInt("1");
  }
  return result;
}

function inverse(value: bigint): bigint {
  return modPow(value, P - BigInt("2"));
}

/** Whether `w` is a quadratic residue mod p. Zero counts: sqrt(0) = 0. */
function isSquare(w: bigint): boolean {
  if (w === BigInt("0")) return true;
  return modPow(w, (P - BigInt("1")) / BigInt("2")) === BigInt("1");
}

export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;

  let y = BigInt("0");
  for (let i = 31; i >= 0; i -= 1) {
    y = (y << BigInt("8")) | BigInt(bytes[i] as number);
  }
  const signBit = (y >> BigInt("255")) & BigInt("1");
  y = mod(y & ((BigInt("1") << BigInt("255")) - BigInt("1")));

  const ySquared = (y * y) % P;
  const u = mod(ySquared - BigInt("1"));
  const v = mod(D * ySquared + BigInt("1"));
  if (v === BigInt("0")) return false;

  const w = (u * inverse(v)) % P;
  if (!isSquare(w)) return false;
  // x == 0 with the sign bit set is the one square that still fails to
  // decompress, because there is no negative zero to encode.
  if (w === BigInt("0") && signBit === BigInt("1")) return false;
  return true;
}
