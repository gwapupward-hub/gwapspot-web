"use client";

import { useCallback, useEffect, useState } from "react";
import {
  relativeTime,
  workspaceApi,
  type AuthedFetch,
  type WorkspaceActivityView,
} from "./workspace-client";

const typeLabels: Record<string, string> = {
  workspace_created: "Workspace",
  member_joined: "Team",
  member_role_changed: "Team",
  member_removed: "Team",
  task_created: "Task",
  task_updated: "Task",
  task_deleted: "Task",
  file_edited: "Files",
  file_created: "Files",
  file_deleted: "Files",
  command_run: "Terminal",
  sandbox_started: "Sandbox",
  sandbox_stopped: "Sandbox",
  invite_created: "Team",
  deployment_connected: "Deploy",
  deployment_updated: "Deploy",
  deployment_removed: "Deploy",
  publication_published: "Publish",
  publication_updated: "Publish",
  publication_unpublished: "Publish",
};

export function WorkspaceActivityPanel({
  projectId,
  authenticatedFetch,
}: {
  projectId: string;
  authenticatedFetch: AuthedFetch;
}) {
  const [items, setItems] = useState<WorkspaceActivityView[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      const response = await authenticatedFetch(workspaceApi(projectId, `/activity?offset=${offset}&limit=20`));
      const payload = (await response.json()) as {
        activity?: { items: WorkspaceActivityView[]; total: number; nextOffset: number | null };
        error?: string;
      };
      if (!response.ok || !payload.activity) throw new Error(payload.error || "Activity could not be loaded.");
      setItems((current) => (offset === 0 ? payload.activity!.items : [...current, ...payload.activity!.items]));
      setNextOffset(payload.activity.nextOffset);
      setTotal(payload.activity.total);
    },
    [authenticatedFetch, projectId],
  );

  useEffect(() => {
    void (async () => {
      try {
        await load(0);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Activity could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function loadMore() {
    if (nextOffset === null) return;
    setLoading(true);
    try {
      await load(nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="diw-activity">
      <div className="diw-activity-head">
        <span className="os-terminal-label">ACTIVITY TIMELINE</span>
        {total > 0 ? <small className="diw-muted">{total} event{total === 1 ? "" : "s"}</small> : null}
      </div>

      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}

      {!loading && items.length === 0 && !error ? (
        <p className="diw-muted">No activity recorded yet. Real actions in this workspace will appear here.</p>
      ) : null}

      <ul className="diw-activity-feed">
        {items.map((event) => (
          <li key={event.id}>
            <span className="diw-activity-tag">{typeLabels[event.type] ?? "Event"}</span>
            <div className="diw-activity-copy">
              <strong>{event.summary}</strong>
              <small>{event.actorName} · {relativeTime(event.createdAt)}</small>
            </div>
          </li>
        ))}
      </ul>

      {loading ? <p className="diw-muted">Loading…</p> : null}
      {nextOffset !== null && !loading ? (
        <button type="button" className="diw-secondary diw-activity-more" onClick={() => void loadMore()}>
          Load more
        </button>
      ) : null}
    </div>
  );
}
