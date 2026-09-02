import {
  loadWorkspaceContext,
  readWorkspaceBody,
  requireCapability,
  workspaceJson,
} from "../../../../../lib/daily-ideas-workspace-server.ts";
import { checkRateLimit } from "../../../../../lib/request-guard.ts";
import {
  getWorkspaceDeployment,
  toDeploymentView,
} from "../../../../../lib/daily-ideas-workspace-deployment.ts";
import {
  buildDefaultDraft,
  findOwnerRoute,
  findPublicationByWorkspace,
  getPublicationDraft,
  readRegistry,
  savePublicationDraft,
  toMemberPublicationView,
} from "../../../../../lib/gwap-browser-registry.ts";
import {
  deploymentHash,
  projectAddress,
  publicationSnapshotEquals,
  validatePublicationDraftInput,
  type GwapBrowserPublicationDraft,
} from "../../../../../lib/gwap-browser-core.ts";
import { normalizeOwnerGnsName } from "../../../../../lib/gwap-browser-ownership.ts";
import {
  gwapBrowserFlags,
  verifyPublisherGnsOwnership,
} from "../../../../../lib/gwap-browser-server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReadinessState = "pass" | "needs_action" | "unavailable";

function draftView(draft: GwapBrowserPublicationDraft, stored: boolean) {
  return {
    stored,
    slug: draft.slug,
    title: draft.title,
    summary: draft.summary,
    category: draft.category,
    tags: draft.tags,
    visibility: draft.visibility,
    attestedDeploymentControl: draft.attestedDeploymentControl,
    updatedAt: draft.updatedAt,
  };
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId);
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "publication:read");
  if (denied) return denied.error;

  const rate = await checkRateLimit(`di-workspace-publication-read:${resolved.accountId}`, 30, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const { redis, workspace, membership, identity, account } = resolved;
  const [storedDraft, deployment, registry] = await Promise.all([
    getPublicationDraft(redis, workspace.id),
    getWorkspaceDeployment(redis, workspace.id),
    readRegistry(redis),
  ]);
  const draft = storedDraft ?? buildDefaultDraft(workspace);
  const publication = findPublicationByWorkspace(registry, workspace.id);
  const flags = gwapBrowserFlags();
  const isOwner = membership.role === "owner";

  // Ownership readiness is only meaningful for the account that can publish.
  let ownership: "verified" | "mismatch" | "not_found" | "unavailable" | "no_name" | "not_applicable" = "not_applicable";
  let gnsName: string | null = null;
  if (isOwner) {
    const check = await verifyPublisherGnsOwnership(identity, account);
    ownership = check.ok ? "verified" : check.reason;
    gnsName = check.ok ? check.name : normalizeOwnerGnsName(account.primaryGnsIdentity);
  }

  const metadata = validatePublicationDraftInput(draft);
  const slugTaken = Boolean(
    gnsName &&
      metadata.ok &&
      registry.publications.some(
        (entry) =>
          entry.workspaceId !== workspace.id &&
          entry.status === "published" &&
          entry.ownerGnsName === gnsName &&
          entry.slug === metadata.value.slug,
      ),
  );

  const unpublishedChanges = Boolean(
    publication &&
      deployment &&
      metadata.ok &&
      metadata.value.visibility !== "private" &&
      !publicationSnapshotEquals(publication, {
        ...metadata.value,
        visibility: metadata.value.visibility,
        deploymentUrl: deployment.url,
        deploymentHash: deploymentHash(deployment.provider, deployment.url),
      }),
  );

  const readiness: Record<string, ReadinessState> = {
    identity: gnsName ? "pass" : isOwner ? "needs_action" : "unavailable",
    ownership: ownership === "verified" ? "pass" : ownership === "unavailable" || ownership === "not_applicable" ? "unavailable" : "needs_action",
    deployment: deployment ? "pass" : "needs_action",
    metadata: metadata.ok ? "pass" : "needs_action",
    address: !gnsName ? "unavailable" : metadata.ok && !slugTaken ? "pass" : "needs_action",
    visibility: draft.visibility === "private" ? "needs_action" : "pass",
    attestation: draft.attestedDeploymentControl ? "pass" : "needs_action",
  };

  const ownerRoute = gnsName ? findOwnerRoute(registry, gnsName) : null;
  const previewAddress = gnsName && metadata.ok ? projectAddress(gnsName, metadata.value.slug) : null;

  return workspaceJson({
    draft: draftView(draft, Boolean(storedDraft)),
    draftErrors: metadata.ok ? null : metadata.errors,
    publication: publication ? toMemberPublicationView(publication) : null,
    deployment: toDeploymentView(deployment),
    identity: { gnsName, ownerAddress: gnsName ? `${gnsName}.gwap` : null, ownership },
    previewAddress,
    slugTaken,
    unpublishedChanges,
    readiness,
    primaryRoute: {
      mode: ownerRoute?.mode ?? "profile",
      isPrimary: Boolean(publication && ownerRoute?.mode === "project" && ownerRoute.primaryPublicationId === publication.id),
    },
    gwapBrowser: flags,
  });
}

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const resolved = await loadWorkspaceContext(request, projectId, { requireOrigin: true });
  if ("error" in resolved) return resolved.error;
  const denied = requireCapability(resolved, "publication:manage");
  if (denied) return denied.error;
  if (!gwapBrowserFlags().enabled) {
    return workspaceJson({ error: "Gwap Browser publishing is not enabled yet.", code: "browser_disabled" }, 503);
  }

  const rate = await checkRateLimit(`di-workspace-publication-draft:${resolved.accountId}`, 30, 60_000);
  if (!rate.allowed) {
    return workspaceJson({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readWorkspaceBody(request, 16_384);
  if (!body) return workspaceJson({ error: "Invalid request" }, 400);

  const result = await savePublicationDraft(resolved.redis, {
    workspaceId: resolved.workspace.id,
    projectId: resolved.workspace.projectId,
    actorId: resolved.accountId,
    fields: body,
  });
  if (!result.ok) {
    return workspaceJson({ error: "Fix the highlighted fields.", errors: result.errors }, 400);
  }
  return workspaceJson({ draft: draftView(result.draft, true) });
}
