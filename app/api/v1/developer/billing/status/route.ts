import { NextResponse } from "next/server";
import {
  getDeveloperBillingConfiguration,
  getDeveloperEntitlement,
} from "../../../../../app/lib/developer-billing";
import { getDeveloperPlanLimits } from "../../../../../lib/developer-api-core";
import { getAuthenticatedWalletIdentity } from "../../../../../lib/privy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex",
};

export async function GET(request: Request) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const entitlement = await getDeveloperEntitlement(identity.userId);
    const configuration = getDeveloperBillingConfiguration();
    return NextResponse.json(
      {
        entitlement,
        configuration,
        plans: {
          developer: getDeveloperPlanLimits("developer"),
          growth: getDeveloperPlanLimits("growth"),
          scale: getDeveloperPlanLimits("scale"),
        },
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Developer billing status is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
