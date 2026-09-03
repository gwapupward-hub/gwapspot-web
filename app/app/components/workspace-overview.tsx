"use client";

import Link from "next/link";
import { PpvDeliverableAnchor } from "../../components/ppv/ppv-deliverable-anchor";
import "../../components/ppv/ppv.css";
import { relativeTime, type WorkspaceOverview, type WorkspaceTab } from "./workspace-client";

const publicationLabels: Record<string, string> = {
  draft: "Draft",
  public: "Public",
  unlisted: "Unlisted",
  suspended: "Suspended",
};

const sandboxLabels: Record<string, string> = {
  none: "Not started",
  provisioning: "Provisioning",
  running: "Running",
  stopped: "Stopped",
  error: "Needs attention",
  unavailable: "Unavailable",
};

export function WorkspaceOverviewPanel({
  overview,
  onNavigate,
}: {
  overview: WorkspaceOverview;
  onNavigate: (tab: WorkspaceTab) => void;
}) {
  const { workspace, tasks, memberCount, capabilities, activity } = overview;
  const readiness = tasks.total > 0 ? Math.round((tasks.byStatus.done / tasks.total) * 100) : 0;

  return (
    <div className="diw-overview">
      <div className="diw-stat-grid">
        <div className="diw-stat"><small>STAGE</small><strong>{workspace.stage}</strong></div>
        <div className="diw-stat"><small>COLLABORATORS</small><strong>{memberCount}</strong></div>
        <div className="diw-stat"><small>OPEN TASKS</small><strong>{tasks.open}</strong></div>
        <div className="diw-stat"><small>SANDBOX</small><strong>{sandboxLabels[workspace.sandbox.status] || workspace.sandbox.status}</strong></div>
        <div className="diw-stat"><small>WORKSPACE</small><strong>{workspace.status === "archived" ? "Archived" : "Active"}</strong></div>
        <div className="diw-stat"><small>LAST ACTIVITY</small><strong>{relativeTime(workspace.lastActivityAt)}</strong></div>
      </div>

      <section className="diw-card diw-glass">
        <span className="os-terminal-label">DEPLOY &amp; PUBLISH</span>
        <ul className="diw-status-rows">
          <li>
            <span>Deployment</span>
            <strong>{overview.deployment ? `Connected · ${overview.deployment.host}` : "Not connected"}</strong>
            <button type="button" className="diw-inline-link" onClick={() => onNavigate("deploy")}>Open Deploy →</button>
          </li>
          <li>
            <span>Publication</span>
            <strong>
              {overview.publication
                ? `${publicationLabels[overview.publication.status] ?? overview.publication.status}${overview.publication.address ? ` · ${overview.publication.address}` : ""}`
                : "Not published"}
            </strong>
            <button type="button" className="diw-inline-link" onClick={() => onNavigate("publish")}>Open Publish →</button>
          </li>
        </ul>
        {!overview.gwapBrowser.enabled ? (
          <p>Gwap Browser is in development on this deployment. Deploy and Publish become active when the server switch is on.</p>
        ) : null}
      </section>

      <section className="diw-card diw-glass">
        <span className="os-terminal-label">PROJECT READINESS</span>
        <div className="diw-readiness" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness}>
          <i style={{ width: `${readiness}%` }} />
        </div>
        <p>{tasks.byStatus.done}/{tasks.total} seeded build steps complete.</p>
      </section>

      <section className="diw-card diw-glass">
        <PpvDeliverableAnchor
          sourceProduct="daily-ideas"
          sourceObjectId={workspace.projectId}
          deliverableId="launch"
          payload={{ projectId: workspace.projectId, status: workspace.stage }}
          eligible={workspace.stage === "launched"}
          ineligibleReason="PPV anchors finalized work only. Move the project to Launched to anchor its deliverable; drafts and generated ideas are never anchored."
        />
      </section>

      {workspace.summary ? (
        <section className="diw-card diw-glass">
          <span className="os-terminal-label">IDEA LAB SUMMARY</span>
          <p>{workspace.summary}</p>
          <Link href="/app/ideas/lab" className="diw-inline-link">Open Idea Lab →</Link>
        </section>
      ) : null}

      <section className="diw-card diw-glass">
        <span className="os-terminal-label">FIRST ACTIONS</span>
        <div className="diw-quick-actions">
          {capabilities.canRunTerminal ? (
            <button type="button" onClick={() => onNavigate("terminal")}>Open Terminal</button>
          ) : null}
          <button type="button" onClick={() => onNavigate("files")}>Open Files</button>
          {capabilities.canManageTasks ? (
            <button type="button" onClick={() => onNavigate("tasks")}>Add Task</button>
          ) : null}
          {capabilities.canManageMembers ? (
            <button type="button" onClick={() => onNavigate("team")}>Invite Collaborator</button>
          ) : null}
          <Link href="/app/ideas/lab" className="diw-quiet-inline">Open Idea Lab</Link>
        </div>
      </section>

      <section className="diw-card diw-glass">
        <span className="os-terminal-label">RECENT ACTIVITY</span>
        {activity.items.length ? (
          <ul className="diw-activity-mini">
            {activity.items.slice(0, 5).map((event) => (
              <li key={event.id}>
                <span>{event.summary}</span>
                <em>{relativeTime(event.createdAt)}</em>
              </li>
            ))}
          </ul>
        ) : (
          <p>No activity yet. Actions you take here will appear in the timeline.</p>
        )}
        <button type="button" className="diw-inline-link" onClick={() => onNavigate("activity")}>View all activity →</button>
      </section>
    </div>
  );
}
