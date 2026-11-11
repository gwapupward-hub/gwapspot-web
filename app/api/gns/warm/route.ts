import { warmGnsRegistry } from "../../../app/lib/gns";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";

// Lets a GNS screen wake a sleeping registry instance before the user submits
// a name. It reports nothing about the registry beyond "request accepted".
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkRateLimit(`gns-warm:${identity.userId}`, 6, 60_000);
  if (rateLimit.allowed) await warmGnsRegistry();

  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
