"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  relativeTime,
  safeTrack,
  workspaceApi,
  type AuthedFetch,
  type WorkspaceCapabilityFlags,
  type WorkspaceSandboxStatus,
  type WorkspaceTerminalEntryView,
} from "./workspace-client";

type Line =
  | { kind: "history"; entry: WorkspaceTerminalEntryView }
  | { kind: "run"; command: string; cwd: string; stdout: string; stderr: string; exitCode: number | null; status: string; truncated: boolean }
  | { kind: "info"; text: string };

const statusLabels: Record<string, string> = {
  completed: "done",
  failed: "failed",
  timeout: "timed out",
  error: "error",
};

export function WorkspaceTerminalPanel({
  projectId,
  authenticatedFetch,
  capabilities,
  sandboxStatus,
  executionConfigured,
  onChange,
}: {
  projectId: string;
  authenticatedFetch: AuthedFetch;
  capabilities: WorkspaceCapabilityFlags;
  sandboxStatus: WorkspaceSandboxStatus;
  executionConfigured: boolean;
  onChange: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("/workspace");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkspaceSandboxStatus>(sandboxStatus);
  const [starting, setStarting] = useState(false);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canRun = capabilities.canRunTerminal;

  const loadHistory = useCallback(async () => {
    const response = await authenticatedFetch(workspaceApi(projectId, "/terminal"));
    if (response.status === 403) return;
    const payload = (await response.json()) as {
      history?: { items: WorkspaceTerminalEntryView[] };
      sandbox?: { status: WorkspaceSandboxStatus };
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Terminal history could not be loaded.");
    if (payload.sandbox) setStatus(payload.sandbox.status);
    const items = (payload.history?.items ?? []).slice().reverse();
    historyRef.current = items.map((entry) => entry.command);
    setLines(items.map((entry) => ({ kind: "history", entry })));
  }, [authenticatedFetch, projectId]);

  useEffect(() => {
    void (async () => {
      try {
        if (canRun) await loadHistory();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Terminal history could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [canRun, loadHistory]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  async function startSandbox() {
    setStarting(true);
    setError(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/sandbox"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const payload = (await response.json()) as { sandbox?: { status: WorkspaceSandboxStatus }; error?: string };
      if (!response.ok) throw new Error(payload.error || "The environment could not be started.");
      if (payload.sandbox) setStatus(payload.sandbox.status);
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The environment could not be started.");
    } finally {
      setStarting(false);
    }
  }

  async function run() {
    const value = command.trim();
    if (!value || running) return;
    setRunning(true);
    setError(null);
    historyRef.current = [...historyRef.current, value];
    historyIndexRef.current = -1;
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/terminal"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: value, cwd }),
      });
      const payload = (await response.json()) as {
        entry?: WorkspaceTerminalEntryView;
        stdout?: string;
        stderr?: string;
        exitCode?: number | null;
        status?: string;
        truncated?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setLines((current) => [...current, { kind: "info", text: `$ ${value}` }, { kind: "info", text: payload.error || "Command failed." }]);
        setError(payload.error || "Command failed.");
        return;
      }
      setLines((current) => [
        ...current,
        {
          kind: "run",
          command: value,
          cwd,
          stdout: payload.stdout ?? "",
          stderr: payload.stderr ?? "",
          exitCode: payload.exitCode ?? null,
          status: payload.status ?? "completed",
          truncated: Boolean(payload.truncated),
        },
      ]);
      setCommand("");
      safeTrack("daily_ideas_workspace_terminal_used", { projectId });
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Command failed.");
    } finally {
      setRunning(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void run();
      return;
    }
    const history = historyRef.current;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!history.length) return;
      const next = historyIndexRef.current < 0 ? history.length - 1 : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = next;
      setCommand(history[next] ?? "");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndexRef.current < 0) return;
      const next = historyIndexRef.current + 1;
      if (next >= history.length) {
        historyIndexRef.current = -1;
        setCommand("");
      } else {
        historyIndexRef.current = next;
        setCommand(history[next] ?? "");
      }
    }
  }

  if (!canRun) {
    return (
      <div className="diw-terminal">
        <div className="diw-terminal-unavailable diw-glass">
          <span className="os-terminal-label">TERMINAL</span>
          <h3>Terminal access is limited to Owners and Developers.</h3>
          <p>Your current role can view files, tasks, and activity, but cannot execute commands in the shared sandbox.</p>
        </div>
      </div>
    );
  }

  const unavailable = !executionConfigured;
  const notRunning = status !== "running";

  return (
    <div className="diw-terminal">
      <div className="diw-terminal-bar">
        <span className="os-terminal-label">SANDBOX · {status.toUpperCase()}</span>
        <div className="diw-terminal-bar-actions">
          {lines.length ? (
            <button type="button" className="diw-quiet-inline" onClick={() => setLines([])}>Clear</button>
          ) : null}
          {!unavailable && notRunning && capabilities.canManageSandbox ? (
            <button type="button" className="diw-primary" disabled={starting} onClick={() => void startSandbox()}>
              {starting ? "Starting…" : status === "stopped" ? "Resume environment" : "Start environment"}
            </button>
          ) : null}
        </div>
      </div>

      {unavailable ? (
        <div className="diw-terminal-unavailable diw-glass">
          <span className="os-terminal-label">DEVELOPMENT ENVIRONMENT UNAVAILABLE</span>
          <h3>The shared sandbox is not configured in this environment.</h3>
          <p>
            Planning, tasks, and file metadata still work. Command execution requires a configured sandbox provider
            (Daytona). Once a key is present, Owners and Developers can run commands here.
          </p>
        </div>
      ) : (
        <>
          <div className="diw-terminal-screen" ref={scrollRef} aria-live="polite">
            {loading ? <p className="diw-muted">Loading history…</p> : null}
            {!loading && lines.length === 0 ? (
              <p className="diw-terminal-hint">Shared command history appears here. Run a command below to get started.</p>
            ) : null}
            {lines.map((line, index) => {
              if (line.kind === "info") return <div key={index} className="diw-term-line diw-term-info">{line.text}</div>;
              if (line.kind === "history") {
                const { entry } = line;
                return (
                  <div key={entry.id} className="diw-term-block is-history">
                    <div className="diw-term-cmd">
                      <span className="diw-term-prompt">{entry.cwd} $</span> {entry.command}
                    </div>
                    <div className="diw-term-meta">
                      {entry.actorName} · {statusLabels[entry.status] ?? entry.status}
                      {entry.exitCode !== null ? ` · exit ${entry.exitCode}` : ""} · {relativeTime(entry.startedAt)}
                    </div>
                  </div>
                );
              }
              return (
                <div key={index} className={`diw-term-block is-${line.status}`}>
                  <div className="diw-term-cmd">
                    <span className="diw-term-prompt">{line.cwd} $</span> {line.command}
                  </div>
                  {line.stdout ? <pre className="diw-term-out">{line.stdout}</pre> : null}
                  {line.stderr ? <pre className="diw-term-out diw-term-err">{line.stderr}</pre> : null}
                  <div className="diw-term-meta">
                    {statusLabels[line.status] ?? line.status}
                    {line.exitCode !== null ? ` · exit ${line.exitCode}` : ""}
                    {line.truncated ? " · output truncated" : ""}
                  </div>
                </div>
              );
            })}
            {running ? <div className="diw-term-line diw-term-running">Running…</div> : null}
          </div>

          <div className="diw-terminal-input">
            <label className="diw-field diw-field-cwd">
              <span className="diw-sr-only">Working directory</span>
              <input
                value={cwd}
                aria-label="Working directory"
                spellCheck={false}
                onChange={(event) => setCwd(event.target.value)}
                disabled={running || notRunning}
              />
            </label>
            <div className="diw-terminal-prompt-row">
              <span aria-hidden="true">$</span>
              <input
                value={command}
                maxLength={4096}
                aria-label="Command"
                placeholder={notRunning ? "Start the environment to run commands" : "Type a command and press Enter"}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                disabled={running || notRunning}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={onKeyDown}
              />
              <button type="button" className="diw-primary" disabled={running || notRunning || !command.trim()} onClick={() => void run()}>
                {running ? "…" : "Run"}
              </button>
            </div>
          </div>
          {notRunning ? (
            <p className="diw-muted diw-terminal-note">
              {status === "stopped"
                ? "The environment is stopped. Resume it to run commands — files are preserved."
                : "Start the development environment to run commands in the shared sandbox."}
            </p>
          ) : null}
        </>
      )}

      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}
    </div>
  );
}
