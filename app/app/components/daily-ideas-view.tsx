"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useGwapOs } from "./os-provider";
import type { DailyIdea } from "../lib/os-state";

type IdeaCategory = DailyIdea["category"];

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
  const { account, gnsIdentity, state, saveIdea, removeIdea, startIdeaProject, syncStatus } = useGwapOs();
  const [category, setCategory] = useState<IdeaCategory>("web3");
  const [generated, setGenerated] = useState<DailyIdea | null>(null);
  const [loading, setLoading] = useState(false);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handoffAttemptedRef = useRef(false);

  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const busy = loading || handoffLoading;

  useEffect(() => {
    if (handoffAttemptedRef.current) return;
    const handoffToken = new URLSearchParams(window.location.search).get("handoff");
    if (!handoffToken) return;
    handoffAttemptedRef.current = true;

    setHandoffLoading(true);
    setError(null);

    void (async () => {
      try {
        const accessToken = await getAccessToken();
        const response = await fetch("/api/ideas/handoff", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          credentials: "same-origin",
          body: JSON.stringify({ token: handoffToken }),
        });
        const payload = (await response.json()) as { idea?: Omit<DailyIdea, "savedAt">; error?: string };
        if (!response.ok || !payload.idea) {
          if (response.status === 404) router.replace("/app/ideas");
          throw new Error(payload.error || "Daily Ideas handoff failed");
        }
        setGenerated({ ...payload.idea, savedAt: "" });
        setCategory(payload.idea.category);
        router.replace("/app/ideas");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Daily Ideas handoff failed");
      } finally {
        setHandoffLoading(false);
      }
    })();
  }, [getAccessToken, router]);

  async function generateIdea() {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/ideas/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({ category }),
      });
      const payload = (await response.json()) as { idea?: Omit<DailyIdea, "savedAt">; error?: string };
      if (!response.ok || !payload.idea) throw new Error(payload.error || "Idea generation failed");
      setGenerated({ ...payload.idea, savedAt: "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Idea generation failed");
    } finally {
      setLoading(false);
    }
  }

  function saveGenerated() {
    if (!generated) return;
    const saved = { ...generated, savedAt: new Date().toISOString() };
    saveIdea(saved);
    setGenerated(saved);
  }

  function develop(idea: DailyIdea) {
    startIdeaProject(idea);
    router.push("/app/ideas/lab");
  }

  const generatedIsSaved = Boolean(generated && state.ideas.some((idea) => idea.id === generated.id));

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/ideas/discover</span>
        <h1>Daily Ideas.</h1>
        <p>Discover practical opportunities, save the strongest ones, then develop them into executable projects in Idea Lab.</p>
        <p>
          Workspace owner: <strong>{owner}</strong>
          {gnsIdentity.score !== null ? <> · GwapScore <strong>{gnsIdentity.score}</strong></> : null}
          {" · "}<Link href="/app/identity">Identity</Link>
        </p>
      </header>

      <section className="os-runtime-grid">
        <article className="os-runtime-panel">
          <div className="os-console-chrome">
            <span>ideas.generator</span>
            <span>{handoffLoading ? "IMPORTING" : loading ? "GENERATING" : "READY"}</span>
          </div>
          <div className="os-process-table">
            <div className="os-process-row os-process-head"><span>CATEGORY</span><span>MODE</span><span>ACTION</span></div>
            <div className="os-process-row">
              <label htmlFor="idea-category">Opportunity lane</label>
              <select id="idea-category" value={category} onChange={(event) => setCategory(event.target.value as IdeaCategory)} disabled={busy}>
                {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button type="button" onClick={generateIdea} disabled={busy}>{loading ? "Generating…" : handoffLoading ? "Importing…" : "Generate idea"}</button>
            </div>
          </div>

          {error ? <p className="os-runtime-warning" role="alert">{error}</p> : null}

          {generated ? (
            <div className="os-runtime-note" aria-live="polite">
              <span className="os-terminal-label">{generated.category.toUpperCase()} · {generated.difficulty}</span>
              <h2>{generated.title}</h2>
              <p>{generated.summary}</p>
              <p><strong>Problem:</strong> {generated.problem}</p>
              <p><strong>Opportunity:</strong> {generated.opportunity}</p>
              <button type="button" onClick={saveGenerated} disabled={generatedIsSaved}>{generatedIsSaved ? "Saved to workspace" : "Save idea"}</button>
              {generatedIsSaved ? <button type="button" onClick={() => develop(generated)}>Develop Idea</button> : null}
            </div>
          ) : (
            <p className="os-runtime-warning">{handoffLoading ? "Importing the idea you opened from Telegram…" : "Choose a category and generate your first native Daily Idea. No TON wallet or separate account is required."}</p>
          )}
        </article>

        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">MY IDEAS · {state.ideas.length}/12</span>
          <h2>Saved workspace.</h2>
          <p>Sync status: <strong>{syncStatus}</strong>. Active Idea Lab projects: <strong>{state.ideaProjects.length}</strong>.</p>
          {state.ideas.length ? (
            <div className="os-process-table" role="list">
              {state.ideas.map((idea) => (
                <div key={idea.id} className="os-process-row" role="listitem">
                  <span><strong>{idea.title}</strong><small>{idea.category.toUpperCase()} · {idea.difficulty}</small></span>
                  <button type="button" onClick={() => develop(idea)}>{state.ideaProjects.some((project) => project.ideaId === idea.id) ? "Open Lab" : "Develop"}</button>
                  <button type="button" onClick={() => removeIdea(idea.id)}>Remove</button>
                </div>
              ))}
            </div>
          ) : <p>No saved ideas yet.</p>}
        </aside>
      </section>
    </div>
  );
}
