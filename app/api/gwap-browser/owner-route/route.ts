import {
  authenticateWorkspace,
  readWorkspaceBody,
  workspaceJson,
} from "../../../lib/daily-ideas-workspace-server.ts";
import { auditAuthEvent, checkRateLimit } from "../../../lib/request-guard.ts";
import { isPublicationId } from "../../../lib/gwap-browser-core.ts";
import { setOwnerRoute } from "../../../lib/gwap-browser-registry.ts";
import {
  describeOwnershipFailure,
  gwapBrowserFlags,
  ownershipFailureStatus,
  verifyPublisherGnsOwnership,
} from "../../../lib/gwap-browser-server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/gwap-browser/owner-route
 * Body: { mode: "profile" | "project", publicationId: "pub_..." | null }
 *
 * Authority = authenticated account + live GNS ownership of the account's
 * `.gwap` name + ownership of the chosen publication (checked in the registry).
 */
export async function PUT(request: Request) {
  const authed = await authenticateWorkspace(request, { requireOrigin: true });
  if ("error" in authed) return authed.error;
  if (!gwapBrowserFlags().enabled) {
    return workspaceJson({ error: "Gwap Browser is not enabled yet.", code: "browser_disabled" }, 503);
  }

  const rate = await checkRateLimit(`gwap-browser-owner-route:${authed.accountId}`, 10, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 2_048);
  const mode = body?.mode;
  const publicationId = body?.publicationId ?? null;
  if (
    !body ||
    (mode !== "profile" && mode !== "project") ||
    !(publicationId === null || isPublicationId(publicationId)) ||
    (mode === "project" && publicationId === null)
  ) {
    return workspaceJson({ error: "Choose Profile or one of your published projects." }, 400);
  }

  const ownership = await verifyPublisherGnsOwnership(authed.identity, authed.account);
  if (!ownership.ok) {
    auditAuthEvent("gwap-browser.owner-route", authed.identity.userId, "rejected");
    return workspaceJson(
      { error: describeOwnershipFailure(ownership.reason), code: `ownership_${ownership.reason}` },
      ownershipFailureStatus(ownership.reason),
    );
  }

  const result = await setOwnerRoute(authed.redis, {
    ownerGnsName: ownership.name,
    ownerAccountId: authed.accountId,
    mode,
    publicationId: mode === "project" ? publicationId : null,
  });
  if (!result.ok) {
    if (result.reason === "lock_busy") {
      return workspaceJson({ error: "The registry is busy. Try again in a moment.", code: "lock_busy" }, 409, { "Retry-After": "2" });
    }
    return workspaceJson({ error: "That project is not one of your published projects.", code: "invalid_publication" }, 409);
  }

  auditAuthEvent("gwap-browser.owner-route", authed.identity.userId, "success");
  return workspaceJson({
    route: {
      ownerAddress: `${result.route.ownerGnsName}.gwap`,
      mode: result.route.mode,
      primaryPublicationId: result.route.primaryPublicationId,
      updatedAt: result.route.updatedAt,
    },
  });
}
