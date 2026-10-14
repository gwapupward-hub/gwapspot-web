export const TRUST_HOME_OPPORTUNITY_BRIEF_LIMIT = 2;

export type TrustHomeOpportunityBriefStatus = "Draft" | "Ready";
export type TrustHomeOpportunityRole =
  | "developer"
  | "designer"
  | "marketer"
  | "researcher"
  | "operations";

export type TrustHomeOpportunityBrief = {
  id: string;
  projectId: string;
  projectTitle: string;
  role: TrustHomeOpportunityRole;
  roleLabel: string;
  status: TrustHomeOpportunityBriefStatus;
  updatedAt: string;
};

export type TrustHomeOpportunitySummary = {
  total: number;
  ready: number;
  draft: number;
  briefs: TrustHomeOpportunityBrief[];
};

type MarketplaceIntentLike = {
  id?: unknown;
  projectId?: unknown;
  role?: unknown;
  status?: unknown;
  updatedAt?: unknown;
};

type IdeaProjectLike = {
  id?: unknown;
  title?: unknown;
};

const ROLE_LABELS: Record<TrustHomeOpportunityRole, string> = {
  developer: "Developer",
  designer: "Designer",
  marketer: "Marketer",
  researcher: "Researcher",
  operations: "Operations",
};

const ROLES = new Set<TrustHomeOpportunityRole>(Object.keys(ROLE_LABELS) as TrustHomeOpportunityRole[]);
const STATUSES = new Set<TrustHomeOpportunityBriefStatus>(["Draft", "Ready"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function parseProjectTitle(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const project = value as IdeaProjectLike;
  const id = typeof project.id === "string" ? project.id : "";
  const title = typeof project.title === "string" ? project.title.trim() : "";
  if (!SAFE_ID.test(id) || !title || title.length > 120) return null;
  return { id, title };
}

function parseIntent(
  value: unknown,
  projectTitles: Map<string, string>,
): TrustHomeOpportunityBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const intent = value as MarketplaceIntentLike;
  const id = typeof intent.id === "string" ? intent.id : "";
  const projectId = typeof intent.projectId === "string" ? intent.projectId : "";
  const role = typeof intent.role === "string" ? intent.role : "";
  const status = typeof intent.status === "string" ? intent.status : "";
  const updatedAt = typeof intent.updatedAt === "string" ? intent.updatedAt : "";

  if (!SAFE_ID.test(id) || !SAFE_ID.test(projectId)) return null;
  if (!ROLES.has(role as TrustHomeOpportunityRole)) return null;
  if (!STATUSES.has(status as TrustHomeOpportunityBriefStatus)) return null;
  if (Number.isNaN(Date.parse(updatedAt))) return null;

  const safeRole = role as TrustHomeOpportunityRole;
  return {
    id,
    projectId,
    projectTitle: projectTitles.get(projectId) || "Project collaboration",
    role: safeRole,
    roleLabel: ROLE_LABELS[safeRole],
    status: status as TrustHomeOpportunityBriefStatus,
    updatedAt,
  };
}

export function getTrustHomeOpportunityReadiness(
  intents: unknown,
  projects: unknown,
  limit = TRUST_HOME_OPPORTUNITY_BRIEF_LIMIT,
): TrustHomeOpportunitySummary {
  const projectTitles = new Map<string, string>();
  if (Array.isArray(projects)) {
    projects.forEach((project) => {
      const parsed = parseProjectTitle(project);
      if (parsed) projectTitles.set(parsed.id, parsed.title);
    });
  }

  const unique = new Map<string, TrustHomeOpportunityBrief>();
  if (Array.isArray(intents)) {
    intents.forEach((intent) => {
      const parsed = parseIntent(intent, projectTitles);
      if (!parsed) return;
      const existing = unique.get(parsed.id);
      if (!existing || Date.parse(parsed.updatedAt) > Date.parse(existing.updatedAt)) {
        unique.set(parsed.id, parsed);
      }
    });
  }

  const all = [...unique.values()].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
  const ready = all.filter((brief) => brief.status === "Ready").length;
  const safeLimit = Math.min(
    TRUST_HOME_OPPORTUNITY_BRIEF_LIMIT,
    Math.max(0, Math.floor(Number.isFinite(limit) ? limit : TRUST_HOME_OPPORTUNITY_BRIEF_LIMIT)),
  );

  return {
    total: all.length,
    ready,
    draft: all.length - ready,
    briefs: all.slice(0, safeLimit),
  };
}
