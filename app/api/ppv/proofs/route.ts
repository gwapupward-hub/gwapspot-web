import { NextResponse } from "next/server";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { auditAuthEvent, checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";
import { getPpvCluster, parseContentHash, readPpvProof } from "../../../lib/ppv/chain";
import { indexProof, listIndexedProofs } from "../../../lib/ppv/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ proofs: await listIndexedProofs(identity.verifiedWallet) });
  } catch {
    return NextResponse.json({ error: "PPV index unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const rate = await checkRateLimit(`ppv-index:${identity.userId}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many PPV updates" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  }

  try {
    const body = await request.json() as { proofId?: unknown; contentHash?: unknown; transactionSignature?: unknown };
    if (typeof body.proofId !== "string" || typeof body.contentHash !== "string" || typeof body.transactionSignature !== "string") {
      return NextResponse.json({ error: "Invalid proof payload" }, { status: 400 });
    }
    const expectedHash = parseContentHash(body.contentHash);
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(body.transactionSignature)) {
      return NextResponse.json({ error: "Invalid transaction signature" }, { status: 400 });
    }

    const onChain = await readPpvProof(identity.verifiedWallet, body.proofId);
    if (!onChain) return NextResponse.json({ error: "Proof not found on-chain" }, { status: 409 });
    if (onChain.authority !== identity.verifiedWallet || onChain.contentHash !== expectedHash) {
      auditAuthEvent("ppv.proof.index", identity.userId, "rejected");
      return NextResponse.json({ error: "Proof authority/hash mismatch" }, { status: 403 });
    }

    const record = {
      proofId: onChain.proofId,
      proofPda: onChain.proofPda,
      owner: onChain.authority,
      contentHash: onChain.contentHash,
      transactionSignature: body.transactionSignature,
      cluster: getPpvCluster(),
      createdAt: new Date(onChain.createdAt * 1000).toISOString(),
      revoked: onChain.revoked,
    } as const;
    await indexProof(identity.verifiedWallet, record);
    auditAuthEvent("ppv.proof.index", identity.userId, "success");
    return NextResponse.json({ proof: record }, { status: 201 });
  } catch (error) {
    auditAuthEvent("ppv.proof.index", identity.userId, "failed");
    const message = error instanceof Error && error.message.includes("configured") ? "PPV devnet program is not configured" : "Unable to index proof";
    return NextResponse.json({ error: message }, { status: message.includes("configured") ? 503 : 400 });
  }
}
