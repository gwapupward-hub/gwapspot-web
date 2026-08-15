"use client";

import { useState } from "react";
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

export function DailyIdeasView() {
  const { getAccessToken } = usePrivy();
  const { state, saveIdea, removeIdea, syncStatus } = useGwapOs();
  const [category, setCategory] = useState<IdeaCategory>("web3");
  const [generated, setGenerated] = useState<DailyIdea | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const generatedIsSaved = Boolean(generated && state.ideas.some((idea) => idea.id === generated.id));

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/ideas/discover</span>
        <h1>Daily Ideas.</h1>
        <p>Discover practical opportunities, save the strongest ones to your GWAP workspace, and turn them into projects in the next Idea Lab phase.</p>
      </header>

      <section className="os-runtime-grid">
        <article className="os-runtime-panel">
          <div className="os-console-chrome"><span>ideas.generator</span><span>{loading ? "GENERATING" : "READY"}</span></div>
          <div className="os-process-table" aria-label="Daily Ideas generator">
            <div className="os-process-row os-process-head"><span>CATEGORY</span><span>MODE</span><span>ACTION</span></div>
            <div className="os-process-row">
              <label htmlFor="idea-category">Opportunity lane</label>
              <select id="idea-category" value={category} onChange={(event) => setCategory(event.target.value as IdeaCategory)} disabled={loading}>
                {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button type="button" onClick={generateIdea} disabled={loading}>{loading ? "Generating…" : "Generate idea"}</button>
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
            </div>
          ) : (
            <p className="os-runtime-warning">Choose a category and generate your first native Daily Idea. No TON wallet or separate account is required.</p>
          )}
        </article>

        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">MY IDEAS · {state.ideas.length}/12</span>
          <h2>Saved workspace.</h2>
          <p>Saved ideas sync with your existing GWAP OS account state. Sync status: <strong>{syncStatus}</strong>.</p>
          {state.ideas.length ? (
            <div className="os-process-table" role="list" aria-label="Saved ideas">
              {state.ideas.map((idea) => (
                <div key={idea.id} className="os-process-row" role="listitem">
                  <span><strong>{idea.title}</strong><small>{idea.category.toUpperCase()} · {idea.difficulty}</small></span>
                  <span>{idea.savedAt ? new Date(idea.savedAt).toLocaleDateString() : "Saved"}</span>
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
