"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  safeTrack,
  taskStatusLabel,
  workspaceApi,
  type AuthedFetch,
  type WorkspaceCapabilityFlags,
  type WorkspaceMemberView,
  type WorkspaceTaskPriority,
  type WorkspaceTaskStatus,
  type WorkspaceTaskView,
} from "./workspace-client";

const statusOptions: WorkspaceTaskStatus[] = ["todo", "in_progress", "blocked", "done"];
const priorityOptions: WorkspaceTaskPriority[] = ["low", "medium", "high"];
const filters: Array<{ id: "all" | WorkspaceTaskStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

export function WorkspaceTasksPanel({
  projectId,
  authenticatedFetch,
  capabilities,
  members,
  onChange,
}: {
  projectId: string;
  authenticatedFetch: AuthedFetch;
  capabilities: WorkspaceCapabilityFlags;
  members: WorkspaceMemberView[];
  currentAccountId: string;
  onChange: () => void;
}) {
  const [tasks, setTasks] = useState<WorkspaceTaskView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | WorkspaceTaskStatus>("all");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<WorkspaceTaskPriority>("medium");
  const [busy, setBusy] = useState(false);

  const memberName = useMemo(() => {
    const map = new Map(members.map((member) => [member.accountId, member.displayName]));
    return (accountId?: string) => (accountId ? map.get(accountId) ?? "Assigned" : "Unassigned");
  }, [members]);

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch(workspaceApi(projectId, "/tasks"));
    const payload = (await response.json()) as { tasks?: WorkspaceTaskView[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Tasks could not be loaded.");
    setTasks(payload.tasks ?? []);
  }, [authenticatedFetch, projectId]);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Tasks could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Task update failed.");
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addTask() {
    if (!title.trim()) return;
    await mutate({ action: "create", title: title.trim(), priority });
    safeTrack("daily_ideas_workspace_task_created", { projectId });
    setTitle("");
    setPriority("medium");
  }

  const visible = filter === "all" ? tasks : tasks.filter((task) => task.status === filter);

  return (
    <div className="diw-tasks">
      {capabilities.canManageTasks ? (
        <div className="diw-task-create diw-glass">
          <label className="diw-field">
            <span>New task</span>
            <input
              value={title}
              maxLength={200}
              placeholder="What needs to happen?"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addTask();
              }}
            />
          </label>
          <label className="diw-field diw-field-narrow">
            <span>Priority</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as WorkspaceTaskPriority)}>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button type="button" className="diw-primary" onClick={() => void addTask()} disabled={busy || !title.trim()}>
            Add task
          </button>
        </div>
      ) : null}

      <div className="diw-task-filters" role="tablist" aria-label="Filter tasks">
        {filters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={filter === entry.id ? "is-active" : undefined}
            aria-pressed={filter === entry.id}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}
      {loading ? <p className="diw-muted">Loading tasks…</p> : null}

      {!loading && visible.length === 0 ? (
        <p className="diw-muted">No tasks in this view yet.</p>
      ) : null}

      <ul className="diw-task-list">
        {visible.map((task) => (
          <li key={task.id} className={`diw-task is-${task.status}`}>
            <div className="diw-task-main">
              <span className={`diw-priority is-${task.priority}`} aria-label={`${task.priority} priority`} />
              <div>
                <strong>{task.title}</strong>
                <small>{taskStatusLabel(task.status)} · {memberName(task.assigneeId)}</small>
              </div>
            </div>
            {capabilities.canManageTasks ? (
              <div className="diw-task-controls">
                <select
                  aria-label="Task status"
                  value={task.status}
                  disabled={busy}
                  onChange={(event) => void mutate({ action: "update", taskId: task.id, patch: { status: event.target.value } })}
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{taskStatusLabel(option)}</option>
                  ))}
                </select>
                <select
                  aria-label="Assignee"
                  value={task.assigneeId ?? ""}
                  disabled={busy}
                  onChange={(event) => void mutate({ action: "update", taskId: task.id, patch: { assigneeId: event.target.value || null } })}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.accountId} value={member.accountId}>{member.displayName}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="diw-danger-quiet"
                  disabled={busy}
                  aria-label={`Delete ${task.title}`}
                  onClick={() => {
                    if (window.confirm(`Delete task “${task.title}”?`)) void mutate({ action: "delete", taskId: task.id });
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <span className="diw-task-readonly">{taskStatusLabel(task.status)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
