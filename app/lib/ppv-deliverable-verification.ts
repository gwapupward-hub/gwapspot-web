import "server-only";

import { getDailyIdeaProject } from "./daily-ideas-projects";
import { gwapDailyIdeasSubject } from "./daily-ideas-identity-link";
import { listWorkspaceTasks } from "./daily-ideas-workspace-tasks";
import { getOrCreateGwapAccount } from "./gwap-account";
import { getWorkspaceRedis } from "./redis";
import type { WalletIdentity } from "./privy-server";
import { loadAccountWorkspace } from "../app/lib/os-server";
import { DeliverableAdapterError } from "./ppv-deliverable-adapters.ts";

/**
 * Product-side truth checks for deliverable anchoring. The browser says which
 * object it wants to anchor; the product's own store says whether that object
 * is finalized. Status claims in the request body are replaced by these
 * server-side reads before the adapter sees them.
 */
export async function verifyDeliverableSource(
  identity: WalletIdentity,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  if (body.sourceProduct === "daily-ideas") {
    const account = await getOrCreateGwapAccount(identity);
    const subject = gwapDailyIdeasSubject(account.id);
    const projectId = text(body.projectId);
    const project = projectId ? await getDailyIdeaProject(subject, projectId) : null;
    if (!project) throw new DeliverableAdapterError("That Daily Ideas project does not belong to this account.");
    if (body.taskId) {
      const tasks = await listWorkspaceTasks(getWorkspaceRedis(), text(body.workspaceId));
      const task = tasks.find((item) => item.id === text(body.taskId));
      if (!task) throw new DeliverableAdapterError("That workspace task could not be found.");
      return { ...body, projectId, status: task.status };
    }
    return { ...body, projectId, status: project.status };
  }

  if (body.sourceProduct === "marketplace") {
    const workspace = await loadAccountWorkspace(identity);
    const intentId = text(body.intentId);
    const intent = workspace.state.marketplaceIntents.find((item) => item.id === intentId);
    if (!intent) throw new DeliverableAdapterError("That Marketplace brief does not belong to this account.");
    if (intent.status !== "Ready") throw new DeliverableAdapterError("Mark the Marketplace brief Ready before anchoring its deliverable.");
    return { ...body, intentId };
  }

  // DIMI has no server-side model in this repository yet; the adapter enforces
  // the finalization rule on the submitted status until it does.
  return body;
}
