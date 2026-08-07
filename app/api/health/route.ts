import { getClerkConfigurationStatus } from "../../lib/auth-config";

export const dynamic = "force-dynamic";

export function GET() {
  const authentication = getClerkConfigurationStatus();

  return Response.json(
    {
      status: "ok",
      service: "gwapspot-web",
      timestamp: new Date().toISOString(),
      deployment: process.env.VERCEL_URL ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      authentication: {
        configured: authentication.configured,
        keyMode: authentication.keyMode,
        reason: authentication.reason,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
