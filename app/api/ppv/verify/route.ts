import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";
import { parseContentHash, readPpvProof, safeProofActor } from "../../../lib/ppv/chain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rate = await checkRateLimit(`ppv-verify:${safeProofActor(client)}`, 40, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many verification requests" }, { status: 429 });

  try {
    const body = await request.json() as { proofId?: unknown; contentHash?: unknown };
    if (typeof body.proofId !== "string" || typeof body.contentHash !== "string") {
      return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 });
    }
    const supplied = parseContentHash(body.contentHash);
    const proof = await readPpvProof(body.proofId);
    if (!proof) return NextResponse.json({ verified: false, reason: "not_found" }, { status: 404 });

    const hashesMatch = timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(proof.contentHash, "hex"));
    const reason = proof.revoked ? "revoked" : hashesMatch ? "verified" : "hash_mismatch";
    return NextResponse.json({
      verified: hashesMatch && !proof.revoked,
      reason,
      proof: {
        proofId: proof.proofId,
        proofPda: proof.proofPda,
        owner: proof.owner,
        contentHash: proof.contentHash,
        createdAt: new Date(proof.createdAt * 1000).toISOString(),
        revoked: proof.revoked,
      },
    });
  } catch (error) {
    const unavailable = error instanceof Error && error.message.includes("configured");
    return NextResponse.json({ error: unavailable ? "PPV devnet program is not configured" : "Verification failed" }, { status: unavailable ? 503 : 400 });
  }
}
