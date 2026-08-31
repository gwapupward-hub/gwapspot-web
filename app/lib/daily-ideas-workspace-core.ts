import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceRole = "owner" | "developer" | "contributor" | "viewer";

export const WORKSPACE_ROLES: WorkspaceRole[] = [
  "owner",
  "developer",
  "contributor",
  "viewer",
];

export type WorkspaceStatus = "active" | "archived";

export type WorkspaceSandboxStatus =
  | "none"
  | "provisioning"
  | "running"
  | "stopped"
  | "error"
  | "unavailable";

export type WorkspaceStage =
  | "developing"
  | "validating"
  | "building"
  | "launched"
  | "archived";

export type WorkspaceSandboxState = {
  provider: string | null;
  sandboxId: string | null;
  status: WorkspaceSandboxStatus;
  updatedAt: string;
};

export type WorkspaceRecord = {
  id: string;
  projectId: string;
  ideaId: string;
  ownerAccountId: string;
  title: string;
  summary: string;
  category: string;
  stage: WorkspaceStage;
  status: WorkspaceStatus;
  sandbox: WorkspaceSandboxState;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  schemaVersion: 1;
};

export type WorkspaceMember = {
  accountId: string;
  role: WorkspaceRole;
  displayName: string;
  wallet: string | null;
  gnsIdentity: string | null;
  invitedBy: string | null;
  joinedAt: string;
};

export type AccountWorkspaceRef = {
  workspaceId: string;
  projectId: string;
  ownerAccountId: string;
  role: WorkspaceRole;
  title: string;
  joinedAt: string;
};

export type WorkspaceTaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type WorkspaceTaskPriority = "low" | "medium" | "high";

export type WorkspaceTask = {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  status: WorkspaceTaskStatus;
  priority: WorkspaceTaskPriority;
  assigneeId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceActivityType =
  | "workspace_created"
  | "member_joined"
  | "member_role_changed"
  | "member_removed"
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "file_edited"
  | "file_created"
  | "file_deleted"
  | "command_run"
  | "sandbox_started"
  | "sandbox_stopped"
  | "invite_created";

export type WorkspaceActivityEvent = {
  id: string;
  workspaceId: string;
  type: WorkspaceActivityType;
  actorId: string;
  actorName: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
};

export type WorkspaceInviteRecord = {
  tokenHash: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedBy: string | null;
  usedAt: string | null;
};

export type WorkspaceTerminalEntry = {
  id: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  command: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  status: "completed" | "failed" | "timeout" | "error";
  durationMs: number;
};

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const WORKSPACE_ID_PATTERN = /^wsp_[a-f0-9]{24}$/;
export const PROJECT_ID_PATTERN = /^project_[a-f0-9]{20}$/;
export const TASK_ID_PATTERN = /^task_[A-Za-z0-9_-]{12,64}$/;
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;

/**
 * Derives a stable workspace id from the owning account + project so that
 * "create workspace" is idempotent (one project → one workspace) while staying
 * globally unique across owners who may have developed the same shared idea.
 */
export function deriveWorkspaceId(ownerAccountId: string, projectId: string) {
  const digest = createHash("sha256")
    .update(`${ownerAccountId}::${projectId}`)
    .digest("hex")
    .slice(0, 24);
  return `wsp_${digest}`;
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_ID_PATTERN.test(value);
}

export function isProjectId(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Role → capability matrix
// ---------------------------------------------------------------------------

export type WorkspaceCapability =
  | "workspace:read"
  | "workspace:destroy"
  | "workspace:settings"
  | "members:manage"
  | "files:read"
  | "files:write"
  | "docs:write"
  | "tasks:read"
  | "tasks:write"
  | "terminal:execute"
  | "sandbox:manage"
  | "activity:read";

const ROLE_CAPABILITIES: Record<WorkspaceRole, Set<WorkspaceCapability>> = {
  owner: new Set<WorkspaceCapability>([
    "workspace:read",
    "workspace:destroy",
    "workspace:settings",
    "members:manage",
    "files:read",
    "files:write",
    "docs:write",
    "tasks:read",
    "tasks:write",
    "terminal:execute",
    "sandbox:manage",
    "activity:read",
  ]),
  developer: new Set<WorkspaceCapability>([
    "workspace:read",
    "files:read",
    "files:write",
    "docs:write",
    "tasks:read",
    "tasks:write",
    "terminal:execute",
    "sandbox:manage",
    "activity:read",
  ]),
  contributor: new Set<WorkspaceCapability>([
    "workspace:read",
    "files:read",
    "docs:write",
    "tasks:read",
    "tasks:write",
    "activity:read",
  ]),
  viewer: new Set<WorkspaceCapability>([
    "workspace:read",
    "files:read",
    "tasks:read",
    "activity:read",
  ]),
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as string[]).includes(value)
  );
}

/** Roles that an owner may assign through an invitation (never a second owner). */
export function isAssignableInviteRole(value: unknown): value is Exclude<WorkspaceRole, "owner"> {
  return value === "developer" || value === "contributor" || value === "viewer";
}

export function can(role: WorkspaceRole, capability: WorkspaceCapability) {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

/** True when writing to this path only requires the doc-editing capability. */
export function isProjectDocPath(relativePath: string) {
  return /^[^/]+\.md$/i.test(relativePath);
}

/**
 * Resolves the capability required to write a given workspace-relative path.
 * Root markdown docs are editable by contributors; everything else is code.
 */
export function fileWriteCapabilityFor(relativePath: string): WorkspaceCapability {
  return isProjectDocPath(relativePath) ? "docs:write" : "files:write";
}

// ---------------------------------------------------------------------------
// Path security (workspace root = /workspace)
// ---------------------------------------------------------------------------

export const WORKSPACE_ROOT = "/workspace";
const MAX_PATH_LENGTH = 1024;
const MAX_PATH_SEGMENTS = 40;
const MAX_SEGMENT_LENGTH = 255;

function safeDecode(value: string) {
  let current = value;
  for (let i = 0; i < 2; i += 1) {
    if (!current.includes("%")) break;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      return null;
    }
  }
  return current;
}

/**
 * Normalizes a caller-supplied path to a workspace-root-relative POSIX path.
 * Returns null when the input escapes the root, contains traversal, control
 * characters, or is otherwise unsafe. Returns "" for the workspace root itself.
 */
export function normalizeWorkspacePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_PATH_LENGTH) return null;

  const decoded = safeDecode(raw);
  if (decoded === null) return null;
  if (decoded.includes("\0")) return null;
  // Reject Windows-style separators outright to avoid ambiguity.
  if (decoded.includes("\\")) return null;

  let candidate = decoded.trim();
  // Allow callers to pass an absolute path anchored at the workspace root.
  if (candidate === WORKSPACE_ROOT) return "";
  if (candidate.startsWith(`${WORKSPACE_ROOT}/`)) {
    candidate = candidate.slice(WORKSPACE_ROOT.length);
  }

  const segments = candidate.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    if (segment.length > MAX_SEGMENT_LENGTH) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(segment)) return null;
    resolved.push(segment);
    if (resolved.length > MAX_PATH_SEGMENTS) return null;
  }

  return resolved.join("/");
}

export function isPathWithinWorkspace(raw: unknown): boolean {
  return normalizeWorkspacePath(raw) !== null;
}

/** Absolute path inside the sandbox, safe to hand to a provider. */
export function toSandboxAbsolutePath(relativePath: string) {
  return relativePath ? `${WORKSPACE_ROOT}/${relativePath}` : WORKSPACE_ROOT;
}

// ---------------------------------------------------------------------------
// Invitation tokens
// ---------------------------------------------------------------------------

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
}

export const DEFAULT_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export function isInviteExpired(invite: WorkspaceInviteRecord, now = Date.now()) {
  const expiry = Date.parse(invite.expiresAt);
  return Number.isNaN(expiry) || expiry <= now;
}

export function isInviteRedeemable(invite: WorkspaceInviteRecord, now = Date.now()) {
  return !invite.used && !isInviteExpired(invite, now);
}

// ---------------------------------------------------------------------------
// Terminal guardrails
// ---------------------------------------------------------------------------

export const TERMINAL_MAX_COMMAND_LENGTH = 4096;
export const TERMINAL_DEFAULT_TIMEOUT_MS = 60_000;
export const TERMINAL_HARD_TIMEOUT_MS = 120_000;
export const TERMINAL_MAX_OUTPUT_BYTES = 100_000;
export const TERMINAL_MAX_CONCURRENT = 2;

export type CommandValidation =
  | { ok: true; command: string }
  | { ok: false; reason: "empty" | "too_long" | "invalid" };

export function validateTerminalCommand(raw: unknown): CommandValidation {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const command = raw.replace(/\r\n/g, "\n").trimEnd();
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (command.length > TERMINAL_MAX_COMMAND_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (command.includes("\0")) return { ok: false, reason: "invalid" };
  return { ok: true, command };
}

export function clampTerminalTimeout(requestedMs: unknown) {
  const value =
    typeof requestedMs === "number" && Number.isFinite(requestedMs)
      ? Math.floor(requestedMs)
      : TERMINAL_DEFAULT_TIMEOUT_MS;
  return Math.min(TERMINAL_HARD_TIMEOUT_MS, Math.max(1_000, value));
}

/** Truncates command output to a bounded byte length, preserving UTF-8 safety. */
export function truncateOutput(
  text: string,
  maxBytes = TERMINAL_MAX_OUTPUT_BYTES,
): { output: string; truncated: boolean } {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) return { output: text, truncated: false };
  let end = maxBytes;
  // Avoid slicing in the middle of a multi-byte UTF-8 sequence.
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end -= 1;
  return { output: buffer.subarray(0, end).toString("utf8"), truncated: true };
}

// ---------------------------------------------------------------------------
// File content helpers
// ---------------------------------------------------------------------------

export const MAX_EDITABLE_FILE_BYTES = 512_000;

const TEXT_FILE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "css",
  "scss",
  "html",
  "yml",
  "yaml",
  "toml",
  "env",
  "sh",
  "py",
  "rs",
  "go",
  "sql",
  "xml",
  "svg",
  "gitignore",
]);

export function isLikelyEditableTextPath(relativePath: string) {
  const name = relativePath.split("/").pop() ?? "";
  if (!name.includes(".")) return true; // dotfiles like Dockerfile / LICENSE
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_FILE_EXTENSIONS.has(ext);
}

/** Detects binary content by scanning for NUL bytes in the leading window. */
export function looksBinary(content: string) {
  const window = content.slice(0, 8_000);
  return window.includes("\0");
}

// ---------------------------------------------------------------------------
// Scaffold + seed generation (derived purely from existing project data)
// ---------------------------------------------------------------------------

export type ScaffoldProjectInput = {
  title: string;
  summary: string;
  category: string;
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
};

export type ScaffoldFile = { path: string; content: string };

function bulletList(items: string[], emptyLabel: string) {
  const filtered = items.map((item) => item.trim()).filter(Boolean);
  if (!filtered.length) return `_${emptyLabel}_\n`;
  return `${filtered.map((item) => `- ${item}`).join("\n")}\n`;
}

function numberedList(items: string[], emptyLabel: string) {
  const filtered = items.map((item) => item.trim()).filter(Boolean);
  if (!filtered.length) return `_${emptyLabel}_\n`;
  return `${filtered.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n`;
}

function paragraph(value: string, emptyLabel: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed}\n` : `_${emptyLabel}_\n`;
}

/**
 * Builds the initial /workspace scaffold from existing project data. This is a
 * pure transform — it never calls an AI provider.
 */
export function buildWorkspaceScaffold(project: ScaffoldProjectInput): ScaffoldFile[] {
  const title = project.title.trim() || "Untitled Project";

  const readme = `# ${title}

${paragraph(project.summary, "No summary captured yet.")}
> Generated by GwapOS Daily Ideas Workspace from your existing project brief.
> Edit these files directly — they are the shared source of truth for your build.

## Problem
${paragraph(project.problemDefinition, "Define the problem in PRODUCT_SPEC.md.")}
## Target customer
${paragraph(project.targetCustomer, "Define who feels this problem.")}
## First action
${paragraph(project.firstAction, "Decide the smallest next step.")}
## Workspace map
- \`PRODUCT_SPEC.md\` — problem, customer, market, business model
- \`VALIDATION.md\` — how demand gets proven
- \`ARCHITECTURE.md\` — how the product gets built
- \`ROADMAP.md\` — order of operations
- \`TASKS.md\` — working task list (also tracked in the Tasks tab)
- \`src/\` — application source code
`;

  const productSpec = `# Product Spec — ${title}

## Category
${paragraph(project.category, "Uncategorized")}
## Problem
${paragraph(project.problemDefinition, "What exact pain is being solved?")}
## Target customer
${paragraph(project.targetCustomer, "Who feels this problem most strongly?")}
## Market hypothesis
${paragraph(project.marketHypothesis, "What must be true for demand to exist?")}
## Business model
${paragraph(project.businessModel, "How does this create sustainable value?")}
## MVP features
${bulletList(project.mvpFeatures, "List the smallest useful set of features.")}
`;

  const validation = `# Validation Plan — ${title}

## Experiments
${numberedList(project.validationPlan, "Add validation experiments.")}
## Risks to retire
${bulletList(project.risks, "Capture the risks that could break this.")}
## Go-to-market
${paragraph(project.goToMarket, "How will the first users discover this?")}
`;

  const architecture = `# Architecture — ${title}

## Technical approach
${paragraph(project.technicalArchitecture, "Core stack, integrations, data, and architecture.")}
## Estimated cost
${paragraph(project.estimatedCost, "MVP budget and major cost drivers.")}
`;

  const roadmap = `# Roadmap — ${title}

${numberedList(project.buildRoadmap, "Add build milestones.")}`;

  const tasks = `# Tasks — ${title}

The Tasks tab is the live source of truth. These roadmap steps seed the initial list.

${project.buildRoadmap
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `- [ ] ${item}`)
    .join("\n") || "- [ ] Define the first build milestone."}
`;

  const srcReadme = `# src/

Application source code lives here. Use the Terminal tab to scaffold your stack
inside the shared development sandbox.
`;

  return [
    { path: "README.md", content: readme },
    { path: "PRODUCT_SPEC.md", content: productSpec },
    { path: "VALIDATION.md", content: validation },
    { path: "ARCHITECTURE.md", content: architecture },
    { path: "ROADMAP.md", content: roadmap },
    { path: "TASKS.md", content: tasks },
    { path: "src/README.md", content: srcReadme },
  ];
}

export type SeedTaskInput = {
  workspaceId: string;
  createdBy: string;
  buildRoadmap: string[];
  firstAction: string;
  now: string;
  makeId: (index: number) => string;
};

/** Builds seed tasks from the existing project's build roadmap + first action. */
export function buildSeedTasks(input: SeedTaskInput): WorkspaceTask[] {
  const steps: Array<{ title: string; priority: WorkspaceTaskPriority }> = [];
  const firstAction = input.firstAction.trim();
  if (firstAction) steps.push({ title: firstAction, priority: "high" });
  for (const step of input.buildRoadmap.map((item) => item.trim()).filter(Boolean)) {
    if (step === firstAction) continue;
    steps.push({ title: step, priority: "medium" });
  }
  if (!steps.length) {
    steps.push({ title: "Define the first build milestone.", priority: "high" });
  }

  return steps.slice(0, 16).map((step, index) => ({
    id: input.makeId(index),
    workspaceId: input.workspaceId,
    title: step.title.slice(0, 200),
    status: "todo" as const,
    priority: step.priority,
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  }));
}

// ---------------------------------------------------------------------------
// Task validation
// ---------------------------------------------------------------------------

export function isWorkspaceTaskStatus(value: unknown): value is WorkspaceTaskStatus {
  return (
    value === "todo" ||
    value === "in_progress" ||
    value === "blocked" ||
    value === "done"
  );
}

export function isWorkspaceTaskPriority(value: unknown): value is WorkspaceTaskPriority {
  return value === "low" || value === "medium" || value === "high";
}

export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, max);
}
