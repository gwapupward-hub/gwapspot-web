// Shared client-side types + helpers for the Daily Ideas collaborative
// workspace UI. Kept framework-light so each tab component can import what it
// needs without a heavy shared context.

export type WorkspaceRole = "owner" | "developer" | "contributor" | "viewer";

export type WorkspaceCapabilityFlags = {
  canWriteFiles: boolean;
  canWriteDocs: boolean;
  canManageTasks: boolean;
  canRunTerminal: boolean;
  canManageMembers: boolean;
  canManageSandbox: boolean;
  canDestroy: boolean;
};

export type WorkspaceSandboxStatus =
  | "none"
  | "provisioning"
  | "running"
  | "stopped"
  | "error"
  | "unavailable";

export type WorkspaceMemberView = {
  accountId: string;
  role: WorkspaceRole;
  displayName: string;
  gnsIdentity: string | null;
  invitedBy?: string | null;
  joinedAt: string;
};

export type WorkspaceTaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type WorkspaceTaskPriority = "low" | "medium" | "high";

export type WorkspaceTaskView = {
  id: string;
  title: string;
  description?: string;
  status: WorkspaceTaskStatus;
  priority: WorkspaceTaskPriority;
  assigneeId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceActivityView = {
  id: string;
  type: string;
  actorName: string;
  summary: string;
  createdAt: string;
};

export type WorkspaceFileEntryView = {
  path: string;
  name: string;
  kind: "file" | "dir";
  size?: number;
  updatedAt?: string;
};

export type WorkspaceTerminalEntryView = {
  id: string;
  actorName: string;
  command: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  status: "completed" | "failed" | "timeout" | "error";
  durationMs: number;
};

export type WorkspaceOverview = {
  workspace: {
    id: string;
    projectId: string;
    ideaId: string;
    title: string;
    summary: string;
    category: string;
    stage: string;
    status: string;
    sandbox: { status: WorkspaceSandboxStatus; provider: string | null };
    ownerAccountId: string;
    createdAt: string;
    lastActivityAt: string;
  };
  role: WorkspaceRole;
  capabilities: WorkspaceCapabilityFlags;
  members: WorkspaceMemberView[];
  memberCount: number;
  tasks: {
    total: number;
    open: number;
    byStatus: Record<WorkspaceTaskStatus, number>;
  };
  activity: { items: WorkspaceActivityView[]; total: number; nextOffset: number | null };
  sandboxExecutionConfigured: boolean;
};

export type WorkspaceTab = "overview" | "tasks" | "files" | "terminal" | "team" | "activity";

export type AuthedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function workspaceApi(projectId: string, suffix = "") {
  return `/api/daily-ideas/workspaces/${encodeURIComponent(projectId)}${suffix}`;
}

export function roleLabel(role: WorkspaceRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function taskStatusLabel(status: WorkspaceTaskStatus) {
  return status === "in_progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1);
}

export function relativeTime(iso: string) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function safeTrack(name: string, properties: Record<string, string | number | boolean> = {}) {
  void import("@vercel/analytics")
    .then(({ track }) => track(name, properties))
    .catch(() => undefined);
}
