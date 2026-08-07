import { NextResponse } from "next/server";
import { getClerkConfigurationStatus } from "../../lib/auth-config";

export const dynamic = "force-dynamic";

export function GET() {
  const authentication = getClerkConfigurationStatus();

  return NextResponse.json(
    {
      status: "ok",
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
