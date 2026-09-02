"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { GwapGradientButton } from "./gwap-gradient-button";
import { GwapMetalButton } from "./gwap-metal-button";
import {
  browserAddressPath,
  relativeTime,
  safeTrack,
  workspaceApi,
  type AuthedFetch,
  type PublicationDraftView,
  type PublicationPanelData,
  type PublicationVisibility,
  type ReadinessState,
  type WorkspaceCapabilityFlags,
} from "./workspace-client";

const categories: Array<{ id: string; label: string }> = [
  { id: "ai", label: "AI" },
  { id: "web3", label: "Web3" },
  { id: "saas", label: "SaaS" },
  { id: "tools", label: "Tools" },
  { id: "commerce", label: "Commerce" },
  { id: "media", label: "Media" },
  { id: "community", label: "Community" },
  { id: "games", label: "Games" },
  { id: "finance", label: "Finance" },
  { id: "other", label: "Other" },
];

const visibilityOptions: Array<{ id: PublicationVisibility; label: string; note: string }> = [
  { id: "public", label: "Public", note: "Exact address + keyword discovery" },
  { id: "unlisted", label: "Unlisted", note: "Exact address only" },
  { id: "private", label: "Private", note: "Draft only — not resolvable, not listed" },
];

const ownershipCopy: Record<PublicationPanelData["identity"]["ownership"], string> = {
  verified: "Live GNS registry confirms your wallet owns this name.",
  mismatch: "The GNS registry lists a different wallet as the owner of your name.",
  not_found: "Your .gwap name was not found in the GNS registry.",
  unavailable: "GNS could not be reached. Publishing stays locked until it answers.",
  no_name: "Claim a .gwap identity to publish.",
  not_applicable: "Only the workspace owner publishes.",
};

const stateLabel: Record<ReadinessState, string> = {
  pass: "Pass",
  needs_action: "Needs action",
  unavailable: "Unavailable",
};

type FormState = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string;
  visibility: PublicationVisibility;
  attestedDeploymentControl: boolean;
};

function toForm(draft: PublicationDraftView): FormState {
  return {
    slug: draft.slug,
    title: draft.title,
    summary: draft.summary,
    category: draft.category,
    tags: draft.tags.join(", "),
    visibility: draft.visibility,
    attestedDeploymentControl: draft.attestedDeploymentControl,
  };
}

function Readiness({ label, state, note }: { label: string; state: ReadinessState; note?: string }) {
  return (
    <li className={`diw-ready is-${state}`}>
      <span className="diw-ready-dot" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        {note ? <small>{note}</small> : null}
      </div>
      <em>{stateLabel[state]}</em>
    </li>
  );
}

export function WorkspacePublishPanel({
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
  const [data, setData] = useState<PublicationPanelData | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PublicationPanelData["draftErrors"]>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "publish" | "unpublish" | "route" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openConfirmed, setOpenConfirmed] = useState(false);

  const canManage = capabilities.canManagePublication;

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch(workspaceApi(projectId, "/publication"));
    const payload = (await response.json()) as PublicationPanelData & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Publication details could not be loaded.");
    setData(payload);
    setForm((current) => current ?? toForm(payload.draft));
    return payload;
  }, [authenticatedFetch, projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Publication details could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function saveDraft(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!form || !canManage) return false;
    setBusy("save");
    setError(null);
    setNotice(null);
    setFieldErrors(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/publication"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { draft?: PublicationDraftView; error?: string; errors?: PublicationPanelData["draftErrors"] };
      if (!response.ok) {
        if (payload.errors) setFieldErrors(payload.errors);
        throw new Error(payload.error || "The draft could not be saved.");
      }
      safeTrack("daily_ideas_publication_draft_saved", { projectId, visibility: form.visibility, category: form.category });
      setNotice("Publication details saved.");
      const next = await refresh();
      if (payload.draft) setForm(toForm(payload.draft));
      onChange();
      return Boolean(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The draft could not be saved.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!canManage) return;
    setBusy("publish");
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/publication/publish"), { method: "POST" });
      const payload = (await response.json()) as { publication?: { address: string; visibility: string; version: number }; created?: boolean; changed?: boolean; error?: string; errors?: PublicationPanelData["draftErrors"] };
      if (!response.ok || !payload.publication) {
        if (payload.errors) setFieldErrors(payload.errors);
        throw new Error(payload.error || "The project could not be published.");
      }
      safeTrack(payload.created ? "daily_ideas_publication_published" : "daily_ideas_publication_updated", {
        projectId,
        visibility: payload.publication.visibility,
        version: payload.publication.version,
        changed: Boolean(payload.changed),
      });
      setNotice(
        payload.created
          ? `Published to ${payload.publication.address}.`
          : payload.changed
            ? `Updated ${payload.publication.address} (version ${payload.publication.version}).`
            : `${payload.publication.address} is already up to date.`,
      );
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be published.");
    } finally {
      setBusy(null);
    }
  }

  async function unpublish() {
    if (!canManage || !data?.publication) return;
    if (!window.confirm(`Unpublish ${data.publication.address}? It will stop resolving in Gwap Browser. Your draft is kept.`)) return;
    setBusy("unpublish");
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(workspaceApi(projectId, "/publication/unpublish"), { method: "POST" });
      const payload = (await response.json()) as { unpublished?: boolean; routeReset?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "The project could not be unpublished.");
      safeTrack("daily_ideas_publication_unpublished", { projectId, routeReset: Boolean(payload.routeReset) });
      setNotice(payload.routeReset ? "Unpublished. Your primary .gwap route returned to Profile." : "Unpublished.");
      await refresh();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be unpublished.");
    } finally {
      setBusy(null);
    }
  }

  async function setPrimary(mode: "profile" | "project") {
    if (!canManage || !data?.publication) return;
    setBusy("route");
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch("/api/gwap-browser/owner-route", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, publicationId: mode === "project" ? data.publication.id : null }),
      });
      const payload = (await response.json()) as { route?: { ownerAddress: string; mode: string }; error?: string };
      if (!response.ok || !payload.route) throw new Error(payload.error || "The primary route could not be changed.");
      safeTrack("gwap_browser_primary_route_changed", { mode, source: "workspace_publish" });
      setNotice(
        mode === "project"
          ? `${payload.route.ownerAddress} now opens this project. Your profile stays at profile.${payload.route.ownerAddress}.`
          : `${payload.route.ownerAddress} returned to your GNS profile.`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The primary route could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      window.prompt("Copy this address", address);
    }
  }

  if (loading || !data || !form) {
    return (
      <div className="diw-publish">
        <section className="diw-card diw-glass" aria-live="polite">
          <span className="os-terminal-label">PUBLISH</span>
          <p>{error ?? "Loading publication readiness…"}</p>
        </section>
      </div>
    );
  }

  const { publication, deployment, identity, readiness, gwapBrowser, primaryRoute } = data;
  const allReady = Object.values(readiness).every((state) => state === "pass");
  const publishDisabled = !gwapBrowser.publishEnabled || !allReady || busy !== null;
  const publishLabel = publication ? (data.unpublishedChanges ? "Publish update" : "Republish") : "Publish";
  const disabledReason = !gwapBrowser.enabled
    ? "Gwap Browser is in development on this deployment."
    : !gwapBrowser.publishEnabled
      ? "Publishing is not enabled on this deployment yet. Your draft is saved and stays private."
      : !allReady
        ? "Complete every readiness item to publish."
        : null;

  return (
    <div className="diw-publish">
      {notice ? <p className="diw-message" role="status">{notice}</p> : null}
      {error ? <p className="diw-message is-error" role="alert">{error}</p> : null}

      {publication ? (
        <section className="diw-card diw-glass diw-pub-live">
          <div className="diw-deploy-head">
            <div>
              <span className="os-terminal-label">
                {publication.status === "suspended" ? "PUBLICATION · SUSPENDED" : `PUBLISHED · ${publication.visibility.toUpperCase()}`}
              </span>
              <h3 className="diw-address">{publication.address}</h3>
            </div>
            <span className={`diw-status-pill ${publication.status === "published" ? "is-on" : "is-warn"}`}>
              {publication.status === "suspended" ? "Suspended" : publication.visibility === "public" ? "Public" : "Unlisted"}
            </span>
          </div>
          {publication.status === "suspended" ? (
            <p>
              GNS ownership of {publication.ownerAddress} no longer matched the publishing wallet, so this
              address stopped resolving. Re-verify ownership and publish again to restore it.
            </p>
          ) : null}
          <dl className="diw-deploy-facts">
            <div><dt>Version</dt><dd>{publication.version}</dd></div>
            <div><dt>Published</dt><dd>{relativeTime(publication.publishedAt)}</dd></div>
            <div><dt>Ownership verified</dt><dd>{relativeTime(publication.ownershipVerifiedAt)}</dd></div>
            <div><dt>Primary route</dt><dd>{primaryRoute.isPrimary ? `${publication.ownerAddress} → this project` : `${publication.ownerAddress} → profile`}</dd></div>
          </dl>
          {data.unpublishedChanges ? (
            <p className="diw-muted">Your draft or deployment changed since the last publish. Publish an update to make it live.</p>
          ) : null}
          <div className="diw-pub-actions">
            <button type="button" className="diw-secondary" onClick={() => void copyAddress(publication.address)}>
              {copied ? "Copied" : "Copy address"}
            </button>
            <Link href={browserAddressPath(publication.address)} className="diw-secondary">View in Gwap Browser</Link>
            {openConfirmed ? (
              <a
                href={publication.deploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="diw-secondary"
                onClick={() => safeTrack("gwap_browser_external_project_opened", { source: "workspace_publish" })}
              >
                Open {new URL(publication.deploymentUrl).hostname} ↗
              </a>
            ) : (
              <button type="button" className="diw-secondary" onClick={() => setOpenConfirmed(true)}>Open live project…</button>
            )}
            {canManage && publication.status === "published" ? (
              <GwapMetalButton
                onClick={() => void setPrimary(primaryRoute.isPrimary ? "profile" : "project")}
                disabled={busy !== null || !gwapBrowser.enabled}
              >
                {busy === "route" ? "Updating…" : primaryRoute.isPrimary ? "Return Primary to Profile" : "Set as Primary"}
              </GwapMetalButton>
            ) : null}
            {canManage ? (
              <button type="button" className="diw-danger-quiet" onClick={() => void unpublish()} disabled={busy !== null}>
                {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="diw-card diw-glass">
        <span className="os-terminal-label">PUBLISH READINESS</span>
        <ul className="diw-ready-list">
          <Readiness label=".gwap identity" state={readiness.identity} note={identity.ownerAddress ?? "No .gwap identity on this account"} />
          <Readiness label="GNS ownership" state={readiness.ownership} note={ownershipCopy[identity.ownership]} />
          <Readiness label="Deployment" state={readiness.deployment} note={deployment ? deployment.host : "Connect a live HTTPS deployment in the Deploy tab"} />
          <Readiness label="Metadata" state={readiness.metadata} note="Title, summary, category, and project name" />
          <Readiness
            label="Project address"
            state={readiness.address}
            note={data.slugTaken ? "You already publish another project at this address" : data.previewAddress ?? "Set a project name"}
          />
          <Readiness label="Visibility" state={readiness.visibility} note={form.visibility === "private" ? "Private drafts never publish" : visibilityOptions.find((option) => option.id === form.visibility)?.note} />
          <Readiness label="Deployment control" state={readiness.attestation} note="Confirm you control or may publish the linked deployment" />
        </ul>
      </section>

      {!gwapBrowser.enabled ? (
        <section className="diw-card diw-glass">
          <span className="os-terminal-label">PUBLISH · IN DEVELOPMENT</span>
          <p>Gwap Browser publishing is not enabled on this deployment yet. Drafts can be reviewed but not changed.</p>
        </section>
      ) : null}

      <form className="diw-card diw-glass diw-pub-form" onSubmit={(event) => void saveDraft(event)}>
        <span className="os-terminal-label">PUBLICATION DETAILS</span>
        <div className="diw-pub-grid">
          <label className="diw-field">
            <span>Project name (address label)</span>
            <input
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              placeholder="store"
              maxLength={48}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={!canManage || !gwapBrowser.enabled}
            />
            {fieldErrors?.slug ? <em className="diw-field-error">{fieldErrors.slug}</em> : null}
            {identity.gnsName ? <small className="diw-field-hint">{form.slug.trim().toLowerCase() || "project"}.{identity.gnsName}.gwap</small> : null}
          </label>
          <label className="diw-field">
            <span>Title</span>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={80} disabled={!canManage || !gwapBrowser.enabled} />
            {fieldErrors?.title ? <em className="diw-field-error">{fieldErrors.title}</em> : null}
          </label>
          <label className="diw-field diw-field-wide">
            <span>Summary</span>
            <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} maxLength={280} rows={3} disabled={!canManage || !gwapBrowser.enabled} />
            {fieldErrors?.summary ? <em className="diw-field-error">{fieldErrors.summary}</em> : null}
          </label>
          <label className="diw-field">
            <span>Category</span>
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} disabled={!canManage || !gwapBrowser.enabled}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
            {fieldErrors?.category ? <em className="diw-field-error">{fieldErrors.category}</em> : null}
          </label>
          <label className="diw-field">
            <span>Tags (comma separated, max 8)</span>
            <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="ai, trading" maxLength={240} disabled={!canManage || !gwapBrowser.enabled} />
            {fieldErrors?.tags ? <em className="diw-field-error">{fieldErrors.tags}</em> : null}
          </label>
        </div>

        <fieldset className="diw-visibility">
          <legend className="os-terminal-label">VISIBILITY</legend>
          {visibilityOptions.map((option) => (
            <label key={option.id} className={`diw-visibility-option ${form.visibility === option.id ? "is-active" : ""}`}>
              <input
                type="radio"
                name="visibility"
                value={option.id}
                checked={form.visibility === option.id}
                onChange={() => setForm({ ...form, visibility: option.id })}
                disabled={!canManage || !gwapBrowser.enabled}
              />
              <strong>{option.label}</strong>
              <small>{option.note}</small>
            </label>
          ))}
          {fieldErrors?.visibility ? <em className="diw-field-error">{fieldErrors.visibility}</em> : null}
        </fieldset>

        <label className="diw-attest">
          <input
            type="checkbox"
            checked={form.attestedDeploymentControl}
            onChange={(event) => setForm({ ...form, attestedDeploymentControl: event.target.checked })}
            disabled={!canManage || !gwapBrowser.enabled}
          />
          <span>I control, or have permission to publish, the linked deployment.</span>
        </label>

        {canManage ? (
          <div className="diw-pub-actions">
            <button type="submit" className="diw-secondary" disabled={busy !== null || !gwapBrowser.enabled}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <GwapGradientButton onClick={() => void publish()} disabled={publishDisabled}>
              {busy === "publish" ? "Publishing…" : publishLabel}
            </GwapGradientButton>
          </div>
        ) : (
          <p className="diw-muted">Only the workspace owner can edit or publish these details.</p>
        )}
        {canManage && disabledReason ? <p className="diw-muted">{disabledReason}</p> : null}
        {canManage && !disabledReason && !data.draft.stored ? (
          <p className="diw-muted">Save the draft before publishing so the server publishes exactly what you reviewed.</p>
        ) : null}
        <p className="diw-muted">
          Publishing snapshots the connected deployment URL. Gwap Browser resolves the address only inside
          GwapOS; ordinary browser address bars cannot resolve .gwap today.
        </p>
      </form>
    </div>
  );
}
