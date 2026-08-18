"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useGwapOs } from "./os-provider";

type IdeaCategory = "web3" | "saas" | "ai" | "general";
type SharedIdea = {
  id: string;
  title: string;
  summary: string;
  problem: string;
  opportunity: string;
  category: string;
  difficulty: "Starter" | "Intermediate" | "Advanced";
  status: string;
};
type SavedEntry = { idea: SharedIdea; savedAt: string };
type SharedProject = { id: string; ideaId: string; title: string; status: string; updatedAt: string };
type SharedWorkspace = {
  linked: boolean;
  identity: { telegramUserId: string; gnsIdentity: string | null; linkedAt: string } | null;
  saved: { items: SavedEntry[]; total: number };
  projects: { items: SharedProject[]; total: number };
  idea?: SharedIdea;
};

const categories: Array<{ value: IdeaCategory; label: string }> = [
  { value: "web3", label: "Web3" },
  { value: "ai", label: "AI" },
  { value: "saas", label: "SaaS" },
  { value: "general", label: "General" },
];

function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export function DailyIdeasView() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const [category, setCategory] = useState<IdeaCategory>("web3");
  const [generated, setGenerated] = useState<SharedIdea | null>(null);
  const [workspace, setWorkspace] = useState<SharedWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const startupHandledRef = useRef(false);

  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const scoreLabel = gnsIdentity.score === null ? "Unscored" : String(gnsIdentity.score);
  const busy = loading || bootstrapping;

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  }, [getAccessToken]);

  const refreshWorkspace = useCallback(async (ideaId?: string) => {
    const url = ideaId ? `/api/daily-ideas/workspace?ideaId=${encodeURIComponent(ideaId)}` : "/api/daily-ideas/workspace";
    const response = await authenticatedFetch(url);
    const payload = (await response.json()) as SharedWorkspace & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Daily Ideas workspace could not load");
    setWorkspace(payload);
    if (payload.idea) {
      setGenerated(payload.idea);
      if (["web3", "ai", "saas", "general"].includes(payload.idea.category)) setCategory(payload.idea.category as IdeaCategory);
    }
    return payload;
  }, [authenticatedFetch]);

  useEffect(() => {
    if (startupHandledRef.current) return;
    startupHandledRef.current = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const linkToken = params.get("link");
      const handoffToken = params.get("handoff");
      const ideaId = params.get("idea");
      setBootstrapping(true);
      setError(null);
      try {
        if (linkToken) {
          const response = await authenticatedFetch("/api/daily-ideas/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: linkToken }),
          });
          const payload = (await response.json()) as { linked?: boolean; gnsIdentity?: string | null; error?: string };
          if (!response.ok || !payload.linked) throw new Error(payload.error || "Telegram account linking failed");
          setNotice(payload.gnsIdentity ? `Telegram connected to ${payload.gnsIdentity}.gwap.` : "Telegram connected to your GWAP OS account.");
          router.replace("/app/ideas");
          await refreshWorkspace();
          return;
        }

        if (handoffToken) {
          const response = await authenticatedFetch("/api/ideas/handoff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: handoffToken }),
          });
          const payload = (await response.json()) as { idea?: SharedIdea; error?: string };
          if (!response.ok || !payload.idea) throw new Error(payload.error || "Daily Ideas handoff failed");
          setGenerated(payload.idea);
          if (["web3", "ai", "saas", "general"].includes(payload.idea.category)) setCategory(payload.idea.category as IdeaCategory);
          router.replace("/app/ideas");
          await refreshWorkspace();
          return;
        }

        if (ideaId) {
          await refreshWorkspace(ideaId);
          router.replace("/app/ideas");
          return;
        }

        await refreshWorkspace();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Daily Ideas workspace failed to initialize");
        if (linkToken || handoffToken || ideaId) router.replace("/app/ideas");
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [authenticatedFetch, refreshWorkspace, router]);

  async function workspaceAction(body: Record<string, unknown>) {
    const response = await authenticatedFetch("/api/daily-ideas/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Daily Ideas workspace update failed");
    return payload;
  }

  async function generateIdea() {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch("/api/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const payload = (await response.json()) as { idea?: SharedIdea; error?: string };
      if (!response.ok || !payload.idea) throw new Error(payload.error || "Idea generation failed");
      setGenerated(payload.idea);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Idea generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveGenerated() {
    if (!generated) return;
    setLoading(true);
    setError(null);
    try {
      await workspaceAction({ action: "save", ideaId: generated.id });
      await refreshWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saving failed");
    } finally {
      setLoading(false);
    }
  }

  async function develop(idea: SharedIdea) {
    setLoading(true);
    setError(null);
    try {
      await workspaceAction({ action: "develop", ideaId: idea.id });
      await refreshWorkspace();
      router.push("/app/ideas/lab");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project creation failed");
      setLoading(false);
    }
  }

  async function removeSaved(ideaId: string) {
    setLoading(true);
    setError(null);
    try {
      await workspaceAction({ action: "unsave", ideaId });
      await refreshWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Removing saved idea failed");
    } finally {
      setLoading(false);
    }
  }

  const savedItems = workspace?.saved.items ?? [];
  const projects = workspace?.projects.items ?? [];
  const generatedIsSaved = Boolean(generated && savedItems.some((entry) => entry.idea.id === generated.id));

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/ideas/discover · SHARED CORE</span>
        <h1>Daily Ideas.</h1>
        <p>Discover practical opportunities, save the strongest ones, then develop them into executable projects in Idea Lab.</p>
        <p>
          Workspace owner: <strong>{owner}</strong> · GwapScore <strong>{scoreLabel}</strong>
          {" · "}<Link href="/app/identity">Identity</Link>
        </p>
        <p>
          Telegram: <strong>{workspace?.linked ? "Connected ✅" : "Not linked"}</strong>
          {workspace?.identity?.gnsIdentity ? <> · <strong>{workspace.identity.gnsIdentity}.gwap</strong></> : null}
        </p>
      </header>

      {notice ? <p className="os-runtime-note" role="status">{notice}</p> : null}
      {error ? <p className="os-runtime-warning" role="alert">{error}</p> : null}

      <section className="os-runtime-grid">
        <article className="os-runtime-panel">
          <div className="os-console-chrome">
            <span>ideas.generator</span>
            <span>{bootstrapping ? "SYNCING" : loading ? "WORKING" : "READY"}</span>
          </div>
          <div className="os-process-table">
            <div className="os-process-row os-process-head"><span>CATEGORY</span><span>MODE</span><span>ACTION</span></div>
            <div className="os-process-row">
              <label htmlFor="idea-category">Opportunity lane</label>
              <select id="idea-category" value={category} onChange={(event) => setCategory(event.target.value as IdeaCategory)} disabled={busy}>
                {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button type="button" onClick={generateIdea} disabled={busy}>{loading ? "Working…" : bootstrapping ? "Syncing…" : "Generate idea"}</button>
            </div>
          </div>

          {generated ? (
            <div className="os-runtime-note" aria-live="polite">
              <span className="os-terminal-label">{generated.category.toUpperCase()} · {generated.difficulty}</span>
              <h2>{generated.title}</h2>
              <p>{generated.summary}</p>
              <p><strong>Problem:</strong> {generated.problem}</p>
              <p><strong>Opportunity:</strong> {generated.opportunity}</p>
              <button type="button" onClick={saveGenerated} disabled={busy || generatedIsSaved}>{generatedIsSaved ? "Saved to shared workspace" : "Save idea"}</button>
              {generatedIsSaved ? <button type="button" onClick={() => void develop(generated)} disabled={busy}>{projects.some((project) => project.ideaId === generated.id) ? "Open Idea Lab" : "Develop Idea"}</button> : null}
            </div>
          ) : (
            <p className="os-runtime-warning">{bootstrapping ? "Synchronizing your shared Daily Ideas workspace…" : "Choose a category and generate an idea. Telegram and GWAP OS use the same saved history after account linking."}</p>
          )}
        </article>

        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">MY IDEAS · {workspace?.saved.total ?? 0}</span>
          <h2>Shared workspace.</h2>
          <p>Active Daily Ideas projects: <strong>{workspace?.projects.total ?? 0}</strong>. Changes here are immediately visible to the linked Telegram client.</p>
          {savedItems.length ? (
            <div className="os-process-table" role="list">
              {savedItems.map((entry) => (
                <div key={entry.idea.id} className="os-process-row" role="listitem">
                  <span><strong>{entry.idea.title}</strong><small>{entry.idea.category.toUpperCase()} · {entry.idea.difficulty}</small></span>
                  <button type="button" onClick={() => void develop(entry.idea)} disabled={busy}>{projects.some((project) => project.ideaId === entry.idea.id) ? "Open Lab" : "Develop"}</button>
                  <button type="button" onClick={() => void removeSaved(entry.idea.id)} disabled={busy}>Remove</button>
                </div>
              ))}
            </div>
          ) : <p>No saved ideas in the shared workspace yet.</p>}
        </aside>
      </section>
    </div>
  );
}
