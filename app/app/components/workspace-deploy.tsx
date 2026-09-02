"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  relativeTime,
  safeTrack,
  workspaceApi,
  type AuthedFetch,
  type GwapBrowserFlags,
  type WorkspaceCapabilityFlags,
  type WorkspaceDeploymentProvider,
  type WorkspaceDeploymentView,
  type WorkspaceRole,
} from "./workspace-client";

const providers: Array<{ id: WorkspaceDeploymentProvider | ""; label: string }> = [
  { id: "", label: "Detect from URL" },
  { id: "vercel", label: "Vercel" },
  { id: "cloudflare", label: "Cloudflare" },
  { id: "netlify", label: "Netlify" },
  { id: "other", label: "Other" },
];

const providerLabels: Record<WorkspaceDeploymentProvider, string> = {
  vercel: "Vercel",
  cloudflare: "Cloudflare",
  netlify: "Netlify",
  other: "Other",
};

type DeployResponse = {
  deployment: WorkspaceDeploymentView | null;
  publicationLinked: boolean;
  gwapBrowser: GwapBrowserFlags;
};

export function WorkspaceDeployPanel({
  projectId,
  authenticatedFetch,
  capabilities,
  currentRole,
  onChange,
}: {
  projectId: string;
  authenticatedFetch: AuthedFetch;
  capabilities: WorkspaceCapabilityFlags;
  currentRole: WorkspaceRole;
  onChange: () => void;
}) {
  const [data, setData] = useState<DeployResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState<WorkspaceDeploymentProvider | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canManage = capabilities.canManageDeployment;
  const canRemove = currentRole === "owner";

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch(workspaceApi(projectId, "/deployment"));
    const payload = (await response.json()) as DeployResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Deployment details could not be loaded.");
    setData(payload);
    return payload;
  }, [authenticatedFetch, projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await refresh();
        if (!cancelled && !payload.deployment) setEditing(true);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Deployment details could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !url.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/deployment"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), provider: provider || undefined }),
      });
      const payload = (await response.json()) as { deployment?: WorkspaceDeploymentView; created?: boolean; error?: string };
      if (!response.ok || !payload.deployment) throw new Error(payload.error || "The deployment could not be connected.");
      safeTrack("daily_ideas_deployment_connected", { projectId, provider: payload.deployment.provider, updated: !payload.created });
      setNotice(payload.created ? "Deployment connected." : "Deployment updated.");
      setUrl("");
      setProvider("");
      setEditing(false);
      setConfirmOpen(false);
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The deployment could not be connected.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!canRemove) return;
    if (!window.confirm("Remove the connected deployment from this workspace?")) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/deployment"), { method: "DELETE" });
      const payload = (await response.json()) as { removed?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "The deployment could not be removed.");
      setNotice("Deployment removed.");
      setConfirmOpen(false);
      await refresh();
      setEditing(true);
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The deployment could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="diw-deploy">
        <section className="diw-card diw-glass" aria-live="polite">
          <span className="os-terminal-label">DEPLOY</span>
          <p>Loading deployment connection…</p>
        </section>
      </div>
    );
  }

  const deployment = data?.deployment ?? null;
  const flags = data?.gwapBrowser ?? { enabled: false, publishEnabled: false };

  return (
    <div className="diw-deploy">
      {notice ? <p className="diw-message" role="status">{notice}</p> : null}
      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}

      {!flags.enabled ? (
        <section className="diw-card diw-glass">
          <span className="os-terminal-label">DEPLOY · IN DEVELOPMENT</span>
          <p>
            Deployment connections are part of Gwap Browser V1 and are not enabled on this deployment yet.
            Nothing here changes until the server switch is on.
          </p>
        </section>
      ) : null}

      <section className="diw-card diw-glass">
        <div className="diw-deploy-head">
          <div>
            <span className="os-terminal-label">DEPLOYMENT CONNECTION</span>
            <h3>{deployment ? "Deployment connected" : "No deployment connected"}</h3>
          </div>
          <span className={`diw-status-pill ${deployment ? "is-on" : ""}`}>
            {deployment ? "Connected" : "Not connected"}
          </span>
        </div>
        <p>
          V1 connects an existing live HTTPS deployment you already host on Vercel, Cloudflare, Netlify, or
          elsewhere. GwapOS records the address you attest to. It does not check uptime, ownership, security,
          or build status, and it never deploys for you.
        </p>

        {deployment ? (
          <dl className="diw-deploy-facts">
            <div><dt>Provider</dt><dd>{providerLabels[deployment.provider]}</dd></div>
            <div><dt>Host</dt><dd>{deployment.host}</dd></div>
            <div><dt>URL</dt><dd className="diw-wrap">{deployment.url}</dd></div>
            <div><dt>Updated</dt><dd>{relativeTime(deployment.updatedAt)}</dd></div>
          </dl>
        ) : null}

        {deployment ? (
          <div className="diw-deploy-actions">
            {confirmOpen ? (
              <a
                href={deployment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="diw-secondary"
                onClick={() => safeTrack("gwap_browser_external_project_opened", { source: "workspace_deploy" })}
              >
                Open {deployment.host} ↗
              </a>
            ) : (
              <button type="button" className="diw-secondary" onClick={() => setConfirmOpen(true)}>
                Open deployment…
              </button>
            )}
            {canManage ? (
              <button type="button" className="diw-quiet-inline" onClick={() => { setEditing((value) => !value); setUrl(deployment.url); setProvider(deployment.provider); }}>
                {editing ? "Cancel update" : "Update"}
              </button>
            ) : null}
            {canRemove ? (
              <button type="button" className="diw-danger-quiet" onClick={() => void remove()} disabled={busy || data?.publicationLinked}>
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
        {confirmOpen && deployment ? (
          <p className="diw-muted">This leaves GwapOS and opens {deployment.host} in a new tab.</p>
        ) : null}
        {deployment && data?.publicationLinked ? (
          <p className="diw-muted">This deployment is published to Gwap Browser. Unpublish before removing it.</p>
        ) : null}
      </section>

      {canManage && editing && flags.enabled ? (
        <form className="diw-card diw-glass diw-deploy-form" onSubmit={(event) => void submit(event)}>
          <span className="os-terminal-label">{deployment ? "UPDATE DEPLOYMENT" : "CONNECT DEPLOYMENT"}</span>
          <label className="diw-field">
            <span>Live HTTPS URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://my-project.vercel.app"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={2048}
              required
            />
          </label>
          <label className="diw-field diw-field-narrow">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value as WorkspaceDeploymentProvider | "")}>
              {providers.map((option) => (
                <option key={option.id || "auto"} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="diw-deploy-actions">
            <button type="submit" className="diw-primary" disabled={busy || !url.trim()}>
              {busy ? "Saving…" : deployment ? "Save deployment" : "Connect deployment"}
            </button>
            {deployment ? (
              <button type="button" className="diw-quiet-inline" onClick={() => setEditing(false)}>Cancel</button>
            ) : null}
          </div>
          <p className="diw-muted">
            Only public https:// addresses are accepted. Raw IPs, private hosts, and credentials in the URL are rejected.
          </p>
        </form>
      ) : null}

      {!canManage ? (
        <p className="diw-muted">Owners and Developers can connect or update the deployment.</p>
      ) : null}
    </div>
  );
}
