"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GwapGradientButton } from "./gwap-gradient-button";
import {
  categoryLabel,
  formatDate,
  GWAP_BROWSER_MARK,
  normalizeAddressInput,
  type BrowserResolution,
} from "./gwap-browser-client";
import { safeTrack } from "./workspace-client";

type ViewState =
  | { key: string; status: "invalid"; message: string }
  | { key: string; status: "error"; message: string }
  | { key: string; status: "resolved"; resolution: BrowserResolution };

type ResolvePayload = Partial<BrowserResolution> & { error?: string; code?: string };

export function GwapBrowserDetailView({ address, enabled }: { address: string; enabled: boolean }) {
  const normalized = normalizeAddressInput(address);
  const [state, setState] = useState<ViewState | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const current = state && state.key === normalized ? state : null;
  const confirmed = confirmedFor === normalized;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const key = normalized;
    void (async () => {
      try {
        const response = await fetch(`/api/gwap-browser/resolve?q=${encodeURIComponent(key)}`, {
          signal: controller.signal,
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as ResolvePayload;
        if (controller.signal.aborted) return;
        if (response.status === 400) {
          setState({ key, status: "invalid", message: payload.error || "That address could not be read." });
          return;
        }
        if (!payload.kind) {
          setState({ key, status: "error", message: payload.error || "Gwap Browser is temporarily unavailable." });
          return;
        }
        const resolution = payload as BrowserResolution;
        setState({ key, status: "resolved", resolution });
        safeTrack("gwap_browser_exact_resolved", { kind: resolution.kind, source: "browser_detail" });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setState({ key, status: "error", message: cause instanceof Error ? cause.message : "Gwap Browser is temporarily unavailable." });
      }
    })();
    return () => controller.abort();
  }, [enabled, normalized]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      window.prompt("Copy this address", value);
    }
  }

  return (
    <div className="os-page os-runtime-page gwb-page">
      <header className="gwb-section-head">
        <Link href="/app/browser" className="gwb-back">← Gwap Browser</Link>
      </header>

      {!enabled ? (
        <section className="gwb-state gwb-glass">
          <span className="os-terminal-label">IN DEVELOPMENT</span>
          <h2>Gwap Browser is not switched on for this deployment yet.</h2>
          <p>Exact .gwap resolution becomes available when the server switch is on.</p>
        </section>
      ) : !current ? (
        <section className="gwb-state gwb-glass" aria-live="polite" aria-busy="true">
          <span className="os-terminal-label">RESOLVING</span>
          <h2 className="gwb-detail-address">{normalized}</h2>
          <p>Checking the .gwap namespace and current GNS ownership…</p>
        </section>
      ) : current.status === "invalid" ? (
        <section className="gwb-state gwb-glass is-error">
          <span className="os-terminal-label">NOT A VALID ADDRESS</span>
          <h2 className="gwb-detail-address">{normalized}</h2>
          <p>{current.message}</p>
          <div className="gwb-actions">
            <Link href="/app/browser" className="gwb-secondary-link">Back to Gwap Browser</Link>
          </div>
        </section>
      ) : current.status === "error" ? (
        <section className="gwb-state gwb-glass is-error">
          <span className="os-terminal-label">UNAVAILABLE</span>
          <h2>This address could not be resolved right now.</h2>
          <p>{current.message}</p>
        </section>
      ) : current.resolution.kind === "temporarily_unavailable" ? (
        <section className="gwb-state gwb-glass is-error">
          <span className="os-terminal-label">TEMPORARILY UNAVAILABLE</span>
          <h2 className="gwb-detail-address">{current.resolution.address}</h2>
          <p>
            GNS ownership could not be re-verified, so Gwap Browser will not open this destination yet. Try
            again in a moment.
          </p>
        </section>
      ) : current.resolution.kind === "not_found" ? (
        <section className="gwb-state gwb-glass">
          <span className="os-terminal-label">NOT FOUND</span>
          <h2 className="gwb-detail-address">{current.resolution.address}</h2>
          <p>
            Nothing is published at this address, or it is no longer resolvable. Private drafts, unpublished,
            and suspended projects never resolve.
          </p>
          <div className="gwb-actions">
            <Link href="/app/browser" className="gwb-secondary-link">Search projects instead</Link>
          </div>
        </section>
      ) : current.resolution.kind === "profile" ? (
        <section className="gwb-detail-card gwb-glass">
          <div className="gwb-detail-head">
            <span className="gwb-detail-art" aria-hidden="true">
              <Image src={GWAP_BROWSER_MARK} alt="" width={64} height={64} />
            </span>
            <div>
              <span className="os-terminal-label">GNS PROFILE</span>
              <h1>{current.resolution.ownerAddress}</h1>
              <span className="gwb-detail-address">{current.resolution.address}</span>
            </div>
          </div>
          <p className="gwb-detail-summary">
            {current.resolution.reason === "invalid_project"
              ? "This owner’s primary project route is no longer valid, so the address falls back to their verified GNS profile."
              : "A verified .gwap identity on the GWAP Name Service."}
          </p>
          <dl className="gwb-facts">
            <div><dt>Profile route</dt><dd>{current.resolution.profileAddress}</dd></div>
            <div><dt>Destination</dt><dd>{current.resolution.profileUrl ? new URL(current.resolution.profileUrl).hostname : "GNS profile"}</dd></div>
          </dl>
          <div className="gwb-open">
            {current.resolution.profileUrl ? (
              <a
                href={current.resolution.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gwb-secondary-link"
                onClick={() => safeTrack("gwap_browser_external_project_opened", { source: "browser_profile" })}
              >
                Open GNS profile ↗
              </a>
            ) : null}
            <button type="button" className="gwb-quiet" onClick={() => void copy(current.resolution.address)}>
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
        </section>
      ) : (
        <ProjectDetail
          resolution={current.resolution}
          copied={copied}
          onCopy={copy}
          confirmed={confirmed}
          onConfirm={() => setConfirmedFor(normalized)}
        />
      )}
    </div>
  );
}

function ProjectDetail({
  resolution,
  copied,
  onCopy,
  confirmed,
  onConfirm,
}: {
  resolution: Extract<BrowserResolution, { kind: "project" }>;
  copied: boolean;
  onCopy: (value: string) => Promise<void>;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const { project, target } = resolution;
  return (
    <section className="gwb-detail-card gwb-glass">
      <div className="gwb-detail-head">
        <span className="gwb-detail-art" aria-hidden="true">
          <Image src={GWAP_BROWSER_MARK} alt="" width={64} height={64} />
        </span>
        <div>
          <span className="os-terminal-label">
            PUBLISHED PROJECT · {project.visibility === "public" ? "PUBLIC" : "UNLISTED"}
          </span>
          <h1>{project.title}</h1>
          <span className="gwb-detail-address">{project.address}</span>
        </div>
      </div>
      {resolution.primaryAlias ? (
        <p className="gwb-primary-note">
          {resolution.address} is aliased to this project by its owner. The profile stays at profile.{project.ownerAddress}.
        </p>
      ) : null}
      <p className="gwb-detail-summary">{project.summary}</p>
      <div className="gwb-card-meta">
        <span className="gwb-chip is-built">Built with GWAP</span>
        <span className="gwb-chip">{categoryLabel(project.category)}</span>
        {project.tags.map((tag) => (
          <span key={tag} className="gwb-chip">#{tag}</span>
        ))}
      </div>
      <dl className="gwb-facts">
        <div><dt>Creator</dt><dd>{project.ownerAddress}</dd></div>
        <div><dt>Destination host</dt><dd>{target.host}</dd></div>
        <div><dt>Version</dt><dd>{project.version}</dd></div>
        <div><dt>Published</dt><dd>{formatDate(project.publishedAt)}</dd></div>
        <div><dt>Updated</dt><dd>{formatDate(project.updatedAt)}</dd></div>
        <div><dt>Ownership verified</dt><dd>{formatDate(resolution.ownershipVerifiedAt)}</dd></div>
      </dl>
      <div className="gwb-open">
        {confirmed ? (
          <a
            href={target.url}
            target="_blank"
            rel="noopener noreferrer"
            className="gwap-gradient-button"
            onClick={() => safeTrack("gwap_browser_external_project_opened", { source: "browser_detail", category: project.category })}
          >
            <span>Open live project ↗</span>
          </a>
        ) : (
          <GwapGradientButton onClick={onConfirm}>Open live project</GwapGradientButton>
        )}
        <button type="button" className="gwb-quiet" onClick={() => void onCopy(project.address)}>
          {copied ? "Copied" : "Copy address"}
        </button>
      </div>
      <p className="gwb-open-note">
        {confirmed ? "This leaves GwapOS and opens" : "Opening leaves GwapOS for"} <strong>{target.host}</strong>, hosted by
        the creator, not by GWAP. Gwap Browser never embeds or auto-redirects to external projects.
      </p>
    </section>
  );
}
