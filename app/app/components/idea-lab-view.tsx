"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useGwapOs } from "./os-provider";

type ProjectStatus = "developing" | "validating" | "building" | "launched" | "archived";
type SharedProject = {
  id: string;
  ideaId: string;
  title: string;
  summary: string;
  category: string;
  status: ProjectStatus;
  problemDefinition: string;
  targetCustomer: string;
  marketHypothesis: string;
  businessModel: string;
  validationPlan: string[];
  mvpFeatures: string[];
  technicalArchitecture: string;
  estimatedCost: string;
  buildRoadmap: string[];
  goToMarket: string;
  risks: string[];
  firstAction: string;
  createdAt: string;
  updatedAt: string;
};
type WorkspacePayload = { projects: { items: SharedProject[]; total: number }; error?: string };

type TextField = "title" | "problemDefinition" | "targetCustomer" | "marketHypothesis" | "businessModel" | "technicalArchitecture" | "estimatedCost" | "goToMarket" | "firstAction";
type ListField = "validationPlan" | "mvpFeatures" | "buildRoadmap" | "risks";

const textFields: Array<[TextField, string, string, number]> = [
  ["problemDefinition", "Problem", "What exact pain or inefficiency are you solving?", 4],
  ["targetCustomer", "Target customer", "Who feels this problem most strongly?", 4],
  ["marketHypothesis", "Market hypothesis", "What must be true for demand to exist?", 4],
  ["businessModel", "Business model", "How does this create sustainable value or revenue?", 4],
  ["technicalArchitecture", "Technical architecture", "Core stack, integrations, data and architecture.", 6],
  ["estimatedCost", "Estimated cost", "MVP budget, infrastructure and major cost drivers.", 4],
  ["goToMarket", "Go-to-market", "How will the first users discover and adopt it?", 5],
  ["firstAction", "Next action", "The smallest concrete thing to do next.", 3],
];
const listFields: Array<[ListField, string]> = [
  ["validationPlan", "Validation plan"],
  ["mvpFeatures", "MVP features"],
  ["buildRoadmap", "Build roadmap"],
  ["risks", "Risks"],
];

function compactWallet(wallet: string) { return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`; }
function statusLabel(status: ProjectStatus) { return status.charAt(0).toUpperCase() + status.slice(1); }

export function IdeaLabView() {
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  }, [getAccessToken]);

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch("/api/daily-ideas/workspace");
    const payload = (await response.json()) as WorkspacePayload;
    if (!response.ok) throw new Error(payload.error || "Idea Lab could not load");
    setProjects(payload.projects.items);
    setSelectedId((current) => current && payload.projects.items.some((project) => project.id === current) ? current : payload.projects.items[0]?.id || "");
  }, [authenticatedFetch]);

  useEffect(() => {
    void (async () => {
      try { await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Idea Lab could not load"); } finally { setLoading(false); }
    })();
  }, [refresh]);

  const selected = useMemo(() => projects.find((project) => project.id === selectedId) ?? projects[0] ?? null, [projects, selectedId]);
  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const score = gnsIdentity.score ?? "Unscored";
  const tier = gnsIdentity.scoreTier ?? gnsIdentity.tier ?? "Unavailable";

  async function action(body: Record<string, unknown>) {
    const response = await authenticatedFetch("/api/daily-ideas/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Idea Lab update failed");
    await refresh();
  }

  async function updateProject(patch: Record<string, unknown>) {
    if (!selected) return;
    setError(null);
    try { await action({ action: "update-project", projectId: selected.id, patch }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Project update failed"); }
  }

  function updateLocal(patch: Partial<SharedProject>) {
    if (!selected) return;
    setProjects((current) => current.map((project) => project.id === selected.id ? { ...project, ...patch } : project));
  }

  async function lifecycle(actionName: "validate" | "build" | "launch" | "archive") {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try { await action({ action: actionName, projectId: selected.id }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Project stage update failed"); } finally { setLoading(false); }
  }

  if (loading && !selected) {
    return <div className="os-page os-runtime-page"><section className="os-runtime-panel"><h2>Loading shared Idea Lab…</h2></section></div>;
  }

  if (!selected) {
    return (
      <div className="os-page os-runtime-page">
        <header className="os-runtime-heading"><span className="os-terminal-label">~/ideas/lab · SHARED CORE</span><h1>Idea Lab.</h1><p>Develop a saved Daily Idea into a concrete validation and MVP plan.</p></header>
        {error ? <p className="os-runtime-warning" role="alert">{error}</p> : null}
        <section className="os-runtime-panel"><h2>No active shared projects.</h2><p>Open Daily Ideas, save an opportunity, then choose Develop Idea. Telegram-created projects appear here after account linking.</p><Link href="/app/ideas">Open Daily Ideas</Link></section>
      </div>
    );
  }

  const nextAction = selected.status === "developing" ? "validate" : selected.status === "validating" ? "build" : selected.status === "building" ? "launch" : null;

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/ideas/lab · SHARED CORE</span>
        <h1>Idea Lab.</h1>
        <p>Move an opportunity from interesting to executable. The project state here is the same project state used by Telegram.</p>
      </header>
      {error ? <p className="os-runtime-warning" role="alert">{error}</p> : null}

      <section className="os-runtime-grid">
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">PROJECTS · {projects.length}</span>
          {projects.map((project) => (
            <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} aria-pressed={project.id === selected.id}>
              <strong>{project.title}</strong><br /><small>{statusLabel(project.status)}</small>
            </button>
          ))}
          <div className="os-console-chrome"><span>gwappass.identity</span><span>{gnsIdentity.status.toUpperCase()}</span></div>
          <p><strong>{owner}</strong></p>
          <p>GwapScore: <strong>{score}</strong> · Tier: <strong>{tier}</strong></p>
          <p>Identity and reputation are resolved live from the authenticated GWAP identity layer; they are not copied into the project record.</p>
          <div><Link href="/app/identity">Open Identity</Link>{" · "}<Link href="/app/score">View Score</Link>{gnsIdentity.profileUrl ? <> · <a href={gnsIdentity.profileUrl}>Public Profile</a></> : null}</div>
        </aside>

        <article className="os-runtime-panel">
          <div className="os-console-chrome"><span>idea-lab.shared-workspace</span><span>{selected.status.toUpperCase()}</span></div>
          <label>Project title<input value={selected.title} maxLength={120} onChange={(event) => updateLocal({ title: event.target.value })} onBlur={() => void updateProject({ title: selected.title })} /></label>

          {textFields.map(([key, label, placeholder, rows]) => (
            <label key={key}>{label}<textarea value={selected[key]} placeholder={placeholder} rows={rows} onChange={(event) => updateLocal({ [key]: event.target.value } as Partial<SharedProject>)} onBlur={() => void updateProject({ [key]: selected[key] })} /></label>
          ))}

          {listFields.map(([key, label]) => (
            <label key={key}>{label}<textarea value={selected[key].join("\n")} rows={5} placeholder="One item per line" onChange={(event) => updateLocal({ [key]: event.target.value.split("\n") } as Partial<SharedProject>)} onBlur={() => void updateProject({ [key]: selected[key] })} /></label>
          ))}

          <section className="os-runtime-note">
            <span className="os-terminal-label">LIFECYCLE</span>
            <p>Current stage: <strong>{statusLabel(selected.status)}</strong>. Stage changes are sequential and immediately visible in Telegram.</p>
            {nextAction ? <button type="button" disabled={loading} onClick={() => void lifecycle(nextAction)}>{nextAction === "validate" ? "Move to Validation" : nextAction === "build" ? "Move to Building" : "Mark Launched"}</button> : null}
            {selected.status !== "archived" ? <button type="button" disabled={loading} onClick={() => void lifecycle("archive")}>Archive project</button> : null}
          </section>

          <section className="os-runtime-note">
            <span className="os-terminal-label">GWAP ECOSYSTEM HANDOFF</span>
            <p>The Daily Ideas project is now canonical across Telegram and GWAP OS. Marketplace collaboration briefs remain private GWAP OS records and are not used as a second project database.</p>
            <div><Link href="/app/marketplace">Marketplace briefs</Link>{" · "}<Link href="/app/developer">Developer APIs</Link>{" · "}<Link href="/app/ideas">Back to Daily Ideas</Link></div>
          </section>
        </article>
      </section>
    </div>
  );
}
