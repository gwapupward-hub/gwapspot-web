import "server-only";

import { createHash } from "node:crypto";
import type { DailyIdeaCategory } from "./daily-ideas-core";
import { getStoredDailyIdea } from "./daily-ideas-inventory";
import { getPrivateStorageKey, getWorkspaceRedis } from "./redis";

const MAX_PROJECTS = 50;

export type DailyIdeaProjectStatus =
  | "developing"
  | "validating"
  | "building"
  | "launched"
  | "archived";

export type DailyIdeaProject = {
  id: string;
  ideaId: string;
  title: string;
  summary: string;
  category: DailyIdeaCategory;
  status: DailyIdeaProjectStatus;
  problemDefinition: string;
  targetCustomer: string;
  marketHypothesis: string;
  businessModel: string;
  validationPlan: string[];
  mvpFeatures: string[];
  technicalArchitecture: string;
  estimatedCost: string;
  buildRoadmap: string[];
  goToMarket: string;
  risks: string[];
  firstAction: string;
  createdAt: string;
  updatedAt: string;
};

function projectsKey(subject: string) {
  return getPrivateStorageKey("daily-ideas-projects", subject);
}

function projectIdFor(ideaId: string) {
  const digest = createHash("sha256").update(ideaId).digest("hex").slice(0, 20);
  return `project_${digest}`;
}

function normalizeProjects(value: unknown): DailyIdeaProject[] {
  if (!Array.isArray(value)) return [];
  return value.filter((project): project is DailyIdeaProject => Boolean(
    project &&
      typeof project === "object" &&
      typeof (project as DailyIdeaProject).id === "string" &&
      typeof (project as DailyIdeaProject).ideaId === "string" &&
      typeof (project as DailyIdeaProject).title === "string" &&
      typeof (project as DailyIdeaProject).status === "string",
  ));
}

function seedProject(idea: NonNullable<Awaited<ReturnType<typeof getStoredDailyIdea>>>) {
  const targetCustomer = idea.targetAudience.join(", ");
  const topFeatures = idea.mvpFeatures.slice(0, 4);
  const now = new Date().toISOString();

  return {
    id: projectIdFor(idea.id),
    ideaId: idea.id,
    title: idea.title,
    summary: idea.summary,
    category: idea.category,
    status: "developing" as const,
    problemDefinition: idea.problem,
    targetCustomer,
    marketHypothesis: `Validate whether ${targetCustomer} consistently experience this problem strongly enough to adopt the proposed solution.`,
    businessModel: idea.monetization.join(" · "),
    validationPlan: idea.validationSteps,
    mvpFeatures: idea.mvpFeatures,
    technicalArchitecture: `Define the smallest implementation that can deliver this solution: ${idea.solution}`,
    estimatedCost: idea.estimatedStartupCost,
    buildRoadmap: [
      idea.firstAction,
      `Prototype the core MVP: ${topFeatures.join(", ")}.`,
      "Put the prototype in front of target users and record the strongest objections and repeated needs.",
      "Use validation evidence to decide whether to iterate, build, or archive the project.",
    ],
    goToMarket: `Start with direct validation and outreach to ${targetCustomer}; convert the strongest early users into design partners before scaling acquisition.`,
    risks: idea.risks,
    firstAction: idea.firstAction,
    createdAt: now,
    updatedAt: now,
  } satisfies DailyIdeaProject;
}

export async function startDailyIdeaProject(subject: string, ideaId: string) {
  const idea = await getStoredDailyIdea(ideaId);
  if (!idea) return { ok: false as const, reason: "not_found" as const };

  const redis = getWorkspaceRedis();
  const existing = normalizeProjects(await redis.get<DailyIdeaProject[]>(projectsKey(subject)));
  const prior = existing.find((project) => project.ideaId === idea.id);
  if (prior) return { ok: true as const, created: false, project: prior };

  const project = seedProject(idea);
  await redis.set(projectsKey(subject), [project, ...existing].slice(0, MAX_PROJECTS));
  return { ok: true as const, created: true, project };
}

export async function listDailyIdeaProjects(
  subject: string,
  input: { offset?: number; limit?: number } = {},
) {
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const limit = Math.min(10, Math.max(1, Math.floor(input.limit || 5)));
  const projects = normalizeProjects(
    await getWorkspaceRedis().get<DailyIdeaProject[]>(projectsKey(subject)),
  );
  const items = projects.slice(offset, offset + limit);
  const nextOffset = offset + items.length < projects.length ? offset + items.length : null;
  return { items, total: projects.length, offset, limit, nextOffset };
}

export async function getDailyIdeaProject(subject: string, projectId: string) {
  const projects = normalizeProjects(
    await getWorkspaceRedis().get<DailyIdeaProject[]>(projectsKey(subject)),
  );
  return projects.find((project) => project.id === projectId) || null;
}

export async function advanceDailyIdeaProject(subject: string, projectId: string) {
  const redis = getWorkspaceRedis();
  const projects = normalizeProjects(await redis.get<DailyIdeaProject[]>(projectsKey(subject)));
  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) return { ok: false as const, reason: "not_found" as const };

  const current = projects[index];
  const nextStatus: Partial<Record<DailyIdeaProjectStatus, DailyIdeaProjectStatus>> = {
    developing: "validating",
    validating: "building",
    building: "launched",
  };
  const status = nextStatus[current.status];
  if (!status) return { ok: true as const, advanced: false, project: current };

  const project = { ...current, status, updatedAt: new Date().toISOString() };
  projects[index] = project;
  await redis.set(projectsKey(subject), projects);
  return { ok: true as const, advanced: true, project };
}

export async function archiveDailyIdeaProject(subject: string, projectId: string) {
  const redis = getWorkspaceRedis();
  const projects = normalizeProjects(await redis.get<DailyIdeaProject[]>(projectsKey(subject)));
  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) return { ok: false as const, reason: "not_found" as const };

  const current = projects[index];
  if (current.status === "archived") {
    return { ok: true as const, archived: false, project: current };
  }
  const project = { ...current, status: "archived" as const, updatedAt: new Date().toISOString() };
  projects[index] = project;
  await redis.set(projectsKey(subject), projects);
  return { ok: true as const, archived: true, project };
}
