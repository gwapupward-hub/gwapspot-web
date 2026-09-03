"use client";

import { useCallback, useEffect, useState } from "react";
import {
  roleLabel,
  safeTrack,
  workspaceApi,
  type AuthedFetch,
  type WorkspaceCapabilityFlags,
  type WorkspaceMemberView,
  type WorkspaceRole,
} from "./workspace-client";

const assignableRoles: WorkspaceRole[] = ["developer", "contributor", "viewer"];

export function WorkspaceTeamPanel({
  projectId,
  authenticatedFetch,
  capabilities,
  members: initialMembers,
  currentRole,
  onChange,
}: {
  projectId: string;
  authenticatedFetch: AuthedFetch;
  capabilities: WorkspaceCapabilityFlags;
  members: WorkspaceMemberView[];
  currentRole: WorkspaceRole;
  onChange: () => void;
}) {
  const [members, setMembers] = useState<WorkspaceMemberView[]>(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("developer");
  const [linkRole, setLinkRole] = useState<WorkspaceRole>("developer");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const canManage = capabilities.canManageMembers;

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch(workspaceApi(projectId, "/members"));
    const payload = (await response.json()) as { members?: WorkspaceMemberView[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Members could not be loaded.");
    setMembers(payload.members ?? []);
  }, [authenticatedFetch, projectId]);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Members could not be loaded.");
      }
    })();
  }, [refresh]);

  async function post(suffix: string, body: Record<string, unknown>) {
    const response = await authenticatedFetch(workspaceApi(projectId, suffix), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown> & { error?: string };
    if (!response.ok) throw new Error((payload.error as string) || "That request failed.");
    return payload;
  }

  async function inviteDirect() {
    if (!identifier.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await post("/members", { action: "invite-direct", identifier: identifier.trim(), role: inviteRole });
      safeTrack("daily_ideas_workspace_member_joined", { projectId, role: inviteRole });
      setIdentifier("");
      setNotice("Collaborator added.");
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That identity could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function createLink() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await post("/invites", { role: linkRole });
      const path = typeof payload.path === "string" ? payload.path : "";
      const url = `${window.location.origin}${path}`;
      setInviteLink(url);
      safeTrack("daily_ideas_workspace_invite_created", { projectId, role: linkRole });
      try {
        await navigator.clipboard.writeText(url);
        setNotice("Invite link created and copied to your clipboard.");
      } catch {
        setNotice("Invite link created. Copy it below.");
      }
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invite link could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(accountId: string, role: WorkspaceRole) {
    setBusy(true);
    setError(null);
    try {
      await post("/members", { action: "change-role", accountId, role });
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The role could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: WorkspaceMemberView) {
    if (!window.confirm(`Remove ${member.displayName} from this workspace?`)) return;
    setBusy(true);
    setError(null);
    try {
      await post("/members", { action: "remove", accountId: member.accountId });
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The collaborator could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="diw-team">
      {canManage ? (
        <section className="diw-card diw-glass diw-invite">
          <span className="os-terminal-label">INVITE COLLABORATOR</span>
          <div className="diw-invite-direct">
            <label className="diw-field">
              <span>.gwap name or wallet address</span>
              <input
                value={identifier}
                placeholder="alice.gwap or a Solana address"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </label>
            <label className="diw-field diw-field-narrow">
              <span>Role</span>
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)}>
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>{roleLabel(role)}</option>
                ))}
              </select>
            </label>
            <button type="button" className="diw-primary" disabled={busy || !identifier.trim()} onClick={() => void inviteDirect()}>
              Add
            </button>
          </div>

          <div className="diw-invite-link">
            <div className="diw-invite-link-controls">
              <label className="diw-field diw-field-narrow">
                <span>Link role</span>
                <select value={linkRole} onChange={(event) => setLinkRole(event.target.value as WorkspaceRole)}>
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>{roleLabel(role)}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="diw-secondary" disabled={busy} onClick={() => void createLink()}>
                Generate invite link
              </button>
            </div>
            {inviteLink ? (
              <div className="diw-invite-result">
                <input readOnly value={inviteLink} aria-label="Invite link" onFocus={(event) => event.currentTarget.select()} />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteLink).then(() => setNotice("Copied.")).catch(() => undefined);
                  }}
                >
                  Copy
                </button>
              </div>
            ) : null}
            <small className="diw-muted">Links expire in 7 days and can be used once, bound to the selected role.</small>
          </div>
        </section>
      ) : null}

      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="diw-message" role="status">{notice}</p> : null}

      <section className="diw-card diw-glass">
        <span className="os-terminal-label">COLLABORATORS · {members.length}</span>
        <ul className="diw-member-list">
          {members.map((member) => {
            const isOwner = member.role === "owner";
            return (
              <li key={member.accountId} className="diw-member">
                <div className="diw-member-id">
                  <strong>{member.displayName}</strong>
                  <small>{member.gnsIdentity || `${member.accountId.slice(0, 6)}…`}</small>
                </div>
                {canManage && !isOwner ? (
                  <div className="diw-member-controls">
                    <select
                      aria-label={`Role for ${member.displayName}`}
                      value={member.role}
                      disabled={busy}
                      onChange={(event) => void changeRole(member.accountId, event.target.value as WorkspaceRole)}
                    >
                      {assignableRoles.map((role) => (
                        <option key={role} value={role}>{roleLabel(role)}</option>
                      ))}
                    </select>
                    <button type="button" className="diw-danger-quiet" disabled={busy} aria-label={`Remove ${member.displayName}`} onClick={() => void removeMember(member)}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <span className={`diw-role-tag${isOwner ? " is-owner" : ""}`}>{roleLabel(member.role)}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {!canManage ? (
        <p className="diw-muted">
          You are a {roleLabel(currentRole)} on this workspace. Only Owners can invite collaborators or change roles.
        </p>
      ) : null}
    </div>
  );
}
