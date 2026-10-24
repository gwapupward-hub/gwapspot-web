export const TRUST_HOME_ACTIVE_WORK_LIMIT = 3;

export type TrustHomeProjectStatus =
  | "developing"
  | "validating"
  | "building"
  | "launched";

export type TrustHomeActiveWorkItem = {
  id: string;
  title: string;
  status: TrustHomeProjectStatus;
  stageLabel: string;
  note: string;
  href: string;
  updatedAt: string;
};

const ACTIVE_STATUSES = new Set<TrustHomeProjectStatus>([
  "developing",
  "validating",
  "building",
  "launched",
]);

const PROJECT_ID_PATTERN = /^project_[a-f0-9]{20}$/;

const STAGE_COPY: Record<TrustHomeProjectStatus, { label: string; note: string }> = {
  developing: {
    label: "Developing",
    note: "Shape the problem, customer, and plan before committing deeper execution.",
  },
  validating: {
    label: "Validating",
    note: "Collect evidence and test the riskiest assumptions before you build further.",
  },
  building: {
    label: "Building",
    note: "Turn the validated direction into working execution and measurable progress.",
  },
  launched: {
    label: "Launched",
    note: "Keep improving, proving, and growing what is already live.",
  },
};

function parseProject(value: unknown): TrustHomeActiveWorkItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const project = value as Record<string, unknown>;
  const id = typeof project.id === "string" ? project.id : "";
  const title = typeof project.title === "string" ? project.title.trim() : "";
  const status = typeof project.status === "string" ? project.status : "";
  const updatedAt = typeof project.updatedAt === "string" ? project.updatedAt : "";

  if (!PROJECT_ID_PATTERN.test(id) || !title || title.length > 120) return null;
  if (!ACTIVE_STATUSES.has(status as TrustHomeProjectStatus)) return null;
  if (Number.isNaN(Date.parse(updatedAt))) return null;

  const safeStatus = status as TrustHomeProjectStatus;
  const copy = STAGE_COPY[safeStatus];
  return {
    id,
    title,
    status: safeStatus,
    stageLabel: copy.label,
    note: copy.note,
    href: `/app/ideas/workspace/${id}`,
    updatedAt,
  };
}

export function getTrustHomeActiveWork(value: unknown, limit = TRUST_HOME_ACTIVE_WORK_LIMIT) {
  if (!Array.isArray(value)) return [];
  const safeLimit = Math.min(TRUST_HOME_ACTIVE_WORK_LIMIT, Math.max(0, Math.floor(limit)));
  return value
    .map(parseProject)
    .filter((project): project is TrustHomeActiveWorkItem => Boolean(project))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, safeLimit);
}
