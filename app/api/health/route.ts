import { getWalletAuthConfigurationStatus } from "../../lib/auth-config";
import { getWorkspaceRedis } from "../../lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const authentication = getWalletAuthConfigurationStatus();
  let storageReachable = false;

  if (authentication.storageConfigured) {
    try {
      storageReachable = await getWorkspaceRedis().ping();
    } catch {
      console.warn("gwap_redis_health_failed", {
        provider: authentication.storageSource,
      });
    }
  }

  const configured =
    authentication.authenticationConfigured && storageReachable;
  const reason =
    authentication.configured && !storageReachable
      ? "workspace_storage_unreachable"
      : authentication.reason;

  return Response.json(
    {
      status: "ok",
      service: "gwapspot-web",
      timestamp: new Date().toISOString(),
      deployment: process.env.VERCEL_URL ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      authentication: {
        provider: "privy-siws",
        configured,
        authenticationConfigured: authentication.authenticationConfigured,
        storageConfigured: authentication.storageConfigured,
        storageSource: authentication.storageSource,
        storageUrlConfigured: authentication.storageUrlConfigured,
        storageTokenConfigured: authentication.storageTokenConfigured,
        storageReachable,
        reason,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
