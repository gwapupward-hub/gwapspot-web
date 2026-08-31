"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  workspaceApi,
  type AuthedFetch,
  type WorkspaceCapabilityFlags,
  type WorkspaceFileEntryView,
} from "./workspace-client";

type OpenFile = {
  path: string;
  content: string;
  editable: boolean;
  size: number;
};

function fileIndent(path: string) {
  return Math.max(0, path.split("/").length - 1);
}

export function WorkspaceFilesPanel({
  projectId,
  authenticatedFetch,
  capabilities,
  onChange,
}: {
  projectId: string;
  authenticatedFetch: AuthedFetch;
  capabilities: WorkspaceCapabilityFlags;
  onChange: () => void;
}) {
  const [entries, setEntries] = useState<WorkspaceFileEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenFile | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canWrite = capabilities.canWriteFiles || capabilities.canWriteDocs;

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch(workspaceApi(projectId, "/files"));
    const payload = (await response.json()) as { files?: WorkspaceFileEntryView[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Files could not be loaded.");
    setEntries(payload.files ?? []);
  }, [authenticatedFetch, projectId]);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Files could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const openFile = useCallback(
    async (path: string) => {
      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        const response = await authenticatedFetch(workspaceApi(projectId, `/files?path=${encodeURIComponent(path)}`));
        const payload = (await response.json()) as {
          file?: { path: string; content: string; size: number };
          editable?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.file) throw new Error(payload.error || "This file could not be opened.");
        setOpen({
          path: payload.file.path,
          content: payload.file.content,
          size: payload.file.size,
          editable: Boolean(payload.editable),
        });
        setDraft(payload.file.content);
        setDirty(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "This file could not be opened.");
      } finally {
        setBusy(false);
      }
    },
    [authenticatedFetch, projectId],
  );

  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await authenticatedFetch(workspaceApi(projectId, "/files"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "That file operation failed.");
      return payload;
    },
    [authenticatedFetch, projectId],
  );

  async function save() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      await mutate({ action: "write", path: open.path, content: draft });
      setOpen({ ...open, content: draft });
      setDirty(false);
      setNotice(`Saved ${open.path}`);
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This file could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function createFile() {
    const raw = window.prompt("New file path (relative to /workspace)", "src/notes.md");
    if (!raw || !raw.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await mutate({ action: "create", path: raw.trim(), content: "" });
      await refresh();
      await openFile(raw.trim().replace(/^\/+/, ""));
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function createDir() {
    const raw = window.prompt("New directory path (relative to /workspace)", "src/lib");
    if (!raw || !raw.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await mutate({ action: "mkdir", path: raw.trim() });
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The directory could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function renameEntry(entry: WorkspaceFileEntryView) {
    const raw = window.prompt(`Rename ${entry.path} to`, entry.path);
    if (!raw || !raw.trim() || raw.trim() === entry.path) return;
    setBusy(true);
    setError(null);
    try {
      await mutate({ action: "rename", from: entry.path, to: raw.trim() });
      if (open?.path === entry.path) setOpen(null);
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The entry could not be renamed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry: WorkspaceFileEntryView) {
    if (!window.confirm(`Delete ${entry.kind === "dir" ? "directory" : "file"} “${entry.path}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutate({ action: "delete", path: entry.path });
      if (open?.path === entry.path) setOpen(null);
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The entry could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  const tree = useMemo(() => entries, [entries]);

  return (
    <div className="diw-files">
      <div className="diw-files-toolbar">
        <span className="os-terminal-label">/workspace</span>
        {capabilities.canWriteFiles ? (
          <div className="diw-files-toolbar-actions">
            <button type="button" onClick={() => void createFile()} disabled={busy}>+ File</button>
            <button type="button" onClick={() => void createDir()} disabled={busy}>+ Folder</button>
          </div>
        ) : null}
      </div>

      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="diw-message" role="status">{notice}</p> : null}

      <div className="diw-files-body">
        <div className="diw-file-tree" role="tree" aria-label="Workspace files">
          {loading ? <p className="diw-muted">Loading files…</p> : null}
          {!loading && tree.length === 0 ? <p className="diw-muted">No files yet.</p> : null}
          <ul>
            {tree.map((entry) => (
              <li key={entry.path} style={{ paddingLeft: `${fileIndent(entry.path) * 12}px` }}>
                {entry.kind === "dir" ? (
                  <span className="diw-file-row is-dir">
                    <span className="diw-file-name" title={entry.path}>📁 {entry.name}</span>
                    {capabilities.canWriteFiles ? (
                      <span className="diw-file-ops">
                        <button type="button" aria-label={`Rename ${entry.name}`} disabled={busy} onClick={() => void renameEntry(entry)}>✎</button>
                        <button type="button" className="diw-danger-quiet" aria-label={`Delete ${entry.name}`} disabled={busy} onClick={() => void deleteEntry(entry)}>✕</button>
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className={`diw-file-row${open?.path === entry.path ? " is-open" : ""}`}>
                    <button type="button" className="diw-file-name" title={entry.path} disabled={busy} onClick={() => void openFile(entry.path)}>
                      📄 {entry.name}
                    </button>
                    {capabilities.canWriteFiles ? (
                      <span className="diw-file-ops">
                        <button type="button" aria-label={`Rename ${entry.name}`} disabled={busy} onClick={() => void renameEntry(entry)}>✎</button>
                        <button type="button" className="diw-danger-quiet" aria-label={`Delete ${entry.name}`} disabled={busy} onClick={() => void deleteEntry(entry)}>✕</button>
                      </span>
                    ) : null}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="diw-file-editor diw-glass">
          {open ? (
            <>
              <div className="diw-file-editor-head">
                <div>
                  <span className="os-terminal-label">EDITING</span>
                  <strong title={open.path}>{open.path}</strong>
                </div>
                {open.editable && canWrite ? (
                  <button type="button" className="diw-primary" disabled={busy || !dirty} onClick={() => void save()}>
                    {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
                  </button>
                ) : null}
              </div>
              {open.editable ? (
                canWrite ? (
                  <textarea
                    className="diw-code"
                    value={draft}
                    spellCheck={false}
                    aria-label={`Contents of ${open.path}`}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setDirty(event.target.value !== open.content);
                    }}
                  />
                ) : (
                  <pre className="diw-code diw-code-readonly" aria-label={`Contents of ${open.path}`}>{open.content}</pre>
                )
              ) : (
                <p className="diw-muted diw-file-notice">
                  This file is binary or too large to edit here. Use the terminal to work with it inside the sandbox.
                </p>
              )}
            </>
          ) : (
            <div className="diw-file-empty">
              <span className="os-terminal-label">EDITOR</span>
              <p>Select a file from the tree to view or edit it. Documents scaffolded from your project brief live at the root.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
