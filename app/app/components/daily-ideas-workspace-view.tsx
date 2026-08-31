"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGwapOs } from "./os-provider";
import {
  roleLabel,
  safeTrack,
  workspaceApi,
  type AuthedFetch,
  type WorkspaceOverview,
  type WorkspaceTab,
} from "./workspace-client";
import { WorkspaceOverviewPanel } from "./workspace-overview";
import { WorkspaceTasksPanel } from "./workspace-tasks";
import { WorkspaceFilesPanel } from "./workspace-files";
import { WorkspaceTerminalPanel } from "./workspace-terminal";
import { WorkspaceTeamPanel } from "./workspace-team";
import { WorkspaceActivityPanel } from "./workspace-activity";

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "files", label: "Files" },
  { id: "terminal", label: "Terminal" },
  { id: "team", label: "Team" },
  { id: "activity", label: "Activity" },
];

const stageLabels: Record<string, string> = {
  developing: "DEVELOPING",
  validating: "VALIDATING",
  building: "BUILDING",
  launched: "LAUNCHED",
  archived: "ARCHIVED",
};

export function DailyIdeasWorkspaceView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const startupRef = useRef(false);

  const authenticatedFetch = useCallback<AuthedFetch>(
    async (input, init) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const loadOverview = useCallback(async () => {
    const response = await authenticatedFetch(workspaceApi(projectId));
    if (response.status === 404) {
      setNotFound(true);
      setOverview(null);
      return null;
    }
    const payload = (await response.json()) as WorkspaceOverview & { error?: string };
    if (!response.ok) throw new Error(payload.error || "This workspace could not be loaded.");
    setNotFound(false);
    setOverview(payload);
    return payload;
  }, [authenticatedFetch, projectId]);

  const createWorkspace = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId), { method: "POST" });
      const payload = (await response.json()) as { created?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "The workspace could not be created.");
      if (payload.created) safeTrack("daily_ideas_workspace_created", { projectId });
      await loadOverview();
      setNotice("Workspace ready. Files were scaffolded from your project brief.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The workspace could not be created.");
    } finally {
      setCreating(false);
    }
  }, [authenticatedFetch, loadOverview, projectId]);

  useEffect(() => {
    if (startupRef.current) return;
    startupRef.current = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams(window.location.search);
        const invite = params.get("invite");
        if (invite) {
          const response = await authenticatedFetch("/api/daily-ideas/workspace-invites/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, token: invite }),
          });
          const payload = (await response.json()) as { joined?: boolean; alreadyMember?: boolean; role?: string; error?: string };
          if (response.ok) {
            if (payload.joined) {
              safeTrack("daily_ideas_workspace_member_joined", { projectId, role: payload.role || "" });
              setNotice(`You joined this workspace as ${payload.role}.`);
            } else if (payload.alreadyMember) {
              setNotice("You are already a collaborator on this workspace.");
            }
          } else {
            setError(payload.error || "This invite link could not be used.");
          }
          router.replace(`/app/ideas/workspace/${projectId}`);
        }
        const payload = await loadOverview();
        if (payload) safeTrack("daily_ideas_workspace_opened", { projectId, role: payload.role });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "This workspace could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authenticatedFetch, loadOverview, projectId, router]);

  const ownerLabel = gnsIdentity.fullName || `${account.verifiedWallet.slice(0, 4)}…${account.verifiedWallet.slice(-4)}`;

  if (loading) {
    return (
      <div className="os-page os-runtime-page diw-page">
        <section className="diw-empty diw-glass" aria-live="polite">
          <span className="os-terminal-label">SYNCING WORKSPACE</span>
          <h2>Opening your workspace…</h2>
          <p>Loading collaborators, tasks, and the shared build environment.</p>
        </section>
      </div>
    );
  }

  if (notFound || !overview) {
    return (
      <div className="os-page os-runtime-page diw-page">
        <header className="diw-header">
          <Link href="/app/ideas" className="diw-back">← Daily Ideas</Link>
        </header>
        <section className="diw-empty diw-glass">
          <span className="os-terminal-label">DAILY IDEAS WORKSPACE</span>
          <h2>Turn this project into a collaborative workspace.</h2>
          <p>
            Create a shared build environment for this Daily Ideas project. Invite collaborators, plan
            tasks, edit files, and run commands together. Idea Lab stays your strategy space — the
            Workspace is where you build.
          </p>
          {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}
          <div className="diw-empty-actions">
            <button type="button" className="diw-primary" onClick={() => void createWorkspace()} disabled={creating}>
              {creating ? "Creating workspace…" : "Create Workspace"}
            </button>
            <Link href="/app/ideas/lab" className="diw-quiet">Open Idea Lab</Link>
          </div>
        </section>
      </div>
    );
  }

  const { workspace, role, capabilities, members } = overview;

  return (
    <div className="os-page os-runtime-page diw-page">
      <header className="diw-header">
        <div className="diw-header-top">
          <Link href="/app/ideas" className="diw-back">← Daily Ideas</Link>
          <span className="diw-stage-badge" data-stage={workspace.stage}>{stageLabels[workspace.stage] || workspace.stage.toUpperCase()}</span>
        </div>
        <div className="diw-title-row">
          <div>
            <span className="os-terminal-label">~/ideas/workspace · SHARED BUILD</span>
            <h1>{workspace.title}</h1>
          </div>
          <div className="diw-role-pill" aria-label={`Your role: ${roleLabel(role)}`}>
            <small>YOUR ROLE</small>
            <strong>{roleLabel(role)}</strong>
          </div>
        </div>
        <p className="diw-owner-line">Owner {ownerLabel} · {overview.memberCount} collaborator{overview.memberCount === 1 ? "" : "s"}</p>
      </header>

      {notice ? <p className="diw-message" role="status">{notice}</p> : null}
      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}

      <nav className="diw-tabs" aria-label="Workspace sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "is-active" : undefined}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === "tasks" && overview.tasks.open > 0 ? <span>{overview.tasks.open}</span> : null}
            {tab.id === "team" ? <span>{overview.memberCount}</span> : null}
          </button>
        ))}
      </nav>

      <section className="diw-panel">
        {activeTab === "overview" ? (
          <WorkspaceOverviewPanel overview={overview} onNavigate={setActiveTab} />
        ) : null}
        {activeTab === "tasks" ? (
          <WorkspaceTasksPanel
            projectId={projectId}
            authenticatedFetch={authenticatedFetch}
            capabilities={capabilities}
            members={members}
            currentAccountId={overview.workspace.ownerAccountId}
            onChange={() => void loadOverview()}
          />
        ) : null}
        {activeTab === "files" ? (
          <WorkspaceFilesPanel
            projectId={projectId}
            authenticatedFetch={authenticatedFetch}
            capabilities={capabilities}
            onChange={() => void loadOverview()}
          />
        ) : null}
        {activeTab === "terminal" ? (
          <WorkspaceTerminalPanel
            projectId={projectId}
            authenticatedFetch={authenticatedFetch}
            capabilities={capabilities}
            sandboxStatus={workspace.sandbox.status}
            executionConfigured={overview.sandboxExecutionConfigured}
            onChange={() => void loadOverview()}
          />
        ) : null}
        {activeTab === "team" ? (
          <WorkspaceTeamPanel
            projectId={projectId}
            authenticatedFetch={authenticatedFetch}
            capabilities={capabilities}
            members={members}
            currentRole={role}
            onChange={() => void loadOverview()}
          />
        ) : null}
        {activeTab === "activity" ? (
          <WorkspaceActivityPanel projectId={projectId} authenticatedFetch={authenticatedFetch} />
        ) : null}
      </section>
    </div>
  );
}
