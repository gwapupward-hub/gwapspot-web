import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../../lib/daily-ideas-workspace-server.ts";
import { auditAuthEvent, checkRateLimit } from "../../../../../../lib/request-guard.ts";
import { recordWorkspaceActivity } from "../../../../../../lib/daily-ideas-workspace-activity.ts";
import { touchWorkspaceActivity } from "../../../../../../lib/daily-ideas-collab-workspace.ts";
import { getWorkspaceDeployment } from "../../../../../../lib/daily-ideas-workspace-deployment.ts";
import {
  getPublicationDraft,
  publishWorkspaceProject,
  toMemberPublicationView,
} from "../../../../../../lib/gwap-browser-registry.ts";
import {
  describeOwnershipFailure,
  gwapBrowserFlags,
  ownershipFailureStatus,
  verifyPublisherGnsOwnership,
} from "../../../../../../lib/gwap-browser-server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLISH_FAILURES: Record<string, { status: number; message: string }> = {
  lock_busy: { status: 409, message: "The registry is busy. Try again in a moment." },
  invalid_draft: { status: 400, message: "Fix the publication details before publishing." },
  visibility_private: { status: 400, message: "Set visibility to Public or Unlisted to publish." },
  not_attested: { status: 400, message: "Confirm you control the linked deployment." },
  not_owner: { status: 403, message: "Only the workspace owner can publish." },
  slug_taken: { status: 409, message: "You already publish another project at that address." },
  registry_full: { status: 503, message: "The Gwap Browser registry is at capacity for this beta." },
  owner_limit: { status: 409, message: "You have reached the maximum number of published projects." },
};

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "publication:manage");
  if (denied) return denied.error;

  const flags = gwapBrowserFlags();
  if (!flags.publishEnabled) {
    return workspaceJson(
      { error: "Publishing to Gwap Browser is not enabled yet.", code: "publish_disabled" },
      503,
    );
  }

  const rate = await checkRateLimit(`di-workspace-publish:${resolved.accountId}`, 10, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }
  await readWorkspaceBody(request, 1_024).catch(() => null);

  const { redis, workspace, membership, identity, account } = resolved;
  const [draft, deployment] = await Promise.all([
    getPublicationDraft(redis, workspace.id),
    getWorkspaceDeployment(redis, workspace.id),
  ]);
  if (!draft) return workspaceJson({ error: "Save the publication details first.", code: "draft_missing" }, 400);
  if (!deployment) return workspaceJson({ error: "Connect a live deployment first.", code: "deployment_missing" }, 409);

  // Live GNS ownership is the publishing authority. Fail closed on any doubt.
  const ownership = await verifyPublisherGnsOwnership(identity, account);
  if (!ownership.ok) {
    auditAuthEvent("gwap-browser.publish", identity.userId, "rejected");
    return workspaceJson(
      { error: describeOwnershipFailure(ownership.reason), code: `ownership_${ownership.reason}` },
      ownershipFailureStatus(ownership.reason),
    );
  }

  const result = await publishWorkspaceProject(redis, {
    workspace: { id: workspace.id, projectId: workspace.projectId, ownerAccountId: workspace.ownerAccountId },
    draft,
    deployment,
    owner: { accountId: resolved.accountId, wallet: ownership.wallet, gnsName: ownership.name },
    ownershipVerifiedAt: ownership.verifiedAt,
  });
  if (!result.ok) {
    const failure = PUBLISH_FAILURES[result.reason] ?? { status: 400, message: "The project could not be published." };
    return workspaceJson(
      { error: failure.message, code: result.reason, ...(result.errors ? { errors: result.errors } : {}) },
      failure.status,
      result.reason === "lock_busy" ? { "Retry-After": "2" } : undefined,
    );
  }

  if (result.created || result.changed) {
    await recordWorkspaceActivity(redis, {
      workspaceId: workspace.id,
      type: result.created ? "publication_published" : "publication_updated",
      actorId: resolved.accountId,
      actorName: membership.displayName,
      summary: `${result.created ? "Published" : "Updated"} ${result.publication.address} (${result.publication.visibility})`,
      metadata: { visibility: result.publication.visibility, version: result.publication.version },
    });
    await touchWorkspaceActivity(redis, workspace.id);
  }
  auditAuthEvent("gwap-browser.publish", identity.userId, "success");

  return workspaceJson(
    { publication: toMemberPublicationView(result.publication), created: result.created, changed: result.changed },
    result.created ? 201 : 200,
  );
}
