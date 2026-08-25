"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type SaveState = "idle" | "saving" | "saved" | "error";
type LifecycleAction = "validate" | "build" | "launch" | "archive";
type ModuleGroup = "foundation" | "execution";
type ModuleField =
  | "problemDefinition"
  | "targetCustomer"
  | "marketHypothesis"
  | "businessModel"
  | "validationPlan"
  | "mvpFeatures"
  | "technicalArchitecture"
  | "estimatedCost"
  | "buildRoadmap"
  | "goToMarket"
  | "risks"
  | "firstAction";

type ModuleDefinition = {
  key: ModuleField;
  label: string;
  eyebrow: string;
  prompt: string;
  group: ModuleGroup;
  kind: "text" | "list";
  rows: number;
};

type ModuleAssistPayload = {
  mode: "module";
  module: ModuleField;
  draft: string;
  why: string;
  checkpoints: string[];
  nextQuestion: string;
};

type ProjectReviewPayload = {
  mode: "review";
  readinessScore: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  nextAction: string;
  validationPriority: string;
  evidenceNeeded: string[];
  marketplaceBrief: string;
  developerBrief: string;
};

type AssistLoading = "module" | "review" | null;

type CopyTarget = "marketplace" | "developer" | null;

const modules: ModuleDefinition[] = [
  { key: "problemDefinition", label: "Problem", eyebrow: "DEFINE THE PAIN", prompt: "What exact pain or inefficiency are you solving?", group: "foundation", kind: "text", rows: 5 },
  { key: "targetCustomer", label: "Customer", eyebrow: "WHO NEEDS THIS", prompt: "Who feels this problem most strongly?", group: "foundation", kind: "text", rows: 5 },
  { key: "marketHypothesis", label: "Opportunity", eyebrow: "WHY NOW", prompt: "What must be true for demand to exist?", group: "foundation", kind: "text", rows: 5 },
  { key: "businessModel", label: "Business Model", eyebrow: "CREATE VALUE", prompt: "How does this create sustainable value or revenue?", group: "foundation", kind: "text", rows: 5 },
  { key: "validationPlan", label: "Validation", eyebrow: "PROVE DEMAND", prompt: "One validation experiment per line.", group: "execution", kind: "list", rows: 7 },
  { key: "mvpFeatures", label: "MVP", eyebrow: "SMALLEST USEFUL PRODUCT", prompt: "One essential MVP feature per line.", group: "execution", kind: "list", rows: 7 },
  { key: "technicalArchitecture", label: "Architecture", eyebrow: "HOW WE BUILD", prompt: "Core stack, integrations, data and architecture.", group: "execution", kind: "text", rows: 7 },
  { key: "estimatedCost", label: "Budget", eyebrow: "COST TO START", prompt: "MVP budget, infrastructure and major cost drivers.", group: "execution", kind: "text", rows: 5 },
  { key: "buildRoadmap", label: "Roadmap", eyebrow: "ORDER OF OPERATIONS", prompt: "One milestone per line.", group: "execution", kind: "list", rows: 7 },
  { key: "goToMarket", label: "Go-To-Market", eyebrow: "FIND THE FIRST USERS", prompt: "How will the first users discover and adopt it?", group: "execution", kind: "text", rows: 6 },
  { key: "risks", label: "Risks", eyebrow: "WHAT CAN BREAK", prompt: "One material risk per line.", group: "execution", kind: "list", rows: 7 },
  { key: "firstAction", label: "Next Move", eyebrow: "DO THIS NOW", prompt: "The smallest concrete thing to do next.", group: "execution", kind: "text", rows: 4 },
];

const lifecycleStages: Array<{ key: Exclude<ProjectStatus, "archived">; label: string }> = [
  { key: "developing", label: "Develop" },
  { key: "validating", label: "Validate" },
  { key: "building", label: "Build" },
  { key: "launched", label: "Launch" },
];

function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function trackProjectStage(name: string, properties: Record<string, string>) {
  try {
    track(name, properties);
  } catch {
    // Product analytics must never interrupt project work.
  }
}

function statusLabel(status: ProjectStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function isModuleComplete(project: SharedProject, key: ModuleField) {
  const value = project[key];
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0);
  return value.trim().length > 0;
}

function readinessFor(project: SharedProject) {
  const complete = modules.filter((module) => isModuleComplete(project, module.key)).length;
  return Math.round((complete / modules.length) * 100);
}

function modulePreview(project: SharedProject, key: ModuleField) {
  const value = project[key];
  if (Array.isArray(value)) {
    const items = value.filter((item) => item.trim().length > 0);
    return items.length ? `${items.length} item${items.length === 1 ? "" : "s"} defined` : "Not defined yet";
  }
  const trimmed = value.trim();
  if (!trimmed) return "Not defined yet";
  return trimmed.length > 86 ? `${trimmed.slice(0, 86)}…` : trimmed;
}

function stageIndex(status: ProjectStatus) {
  if (status === "archived") return -1;
  return lifecycleStages.findIndex((stage) => stage.key === status);
}

function normalizeListDraft(draft: string) {
  return draft
    .split("\n")
    .map((item) => item.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, ""))
    .filter(Boolean);
}

export function IdeaLabView() {
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeModule, setActiveModule] = useState<ModuleField>("problemDefinition");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [assistLoading, setAssistLoading] = useState<AssistLoading>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [moduleAssist, setModuleAssist] = useState<ModuleAssistPayload | null>(null);
  const [projectReview, setProjectReview] = useState<ProjectReviewPayload | null>(null);
  const [copiedBrief, setCopiedBrief] = useState<CopyTarget>(null);
  const editorRef = useRef<HTMLElement | null>(null);

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
      try {
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Idea Lab could not load");
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const selected = useMemo(() => projects.find((project) => project.id === selectedId) ?? projects[0] ?? null, [projects, selectedId]);
  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const score = gnsIdentity.score ?? "Unscored";
  const tier = gnsIdentity.scoreTier ?? gnsIdentity.tier ?? "Unavailable";

  async function action(body: Record<string, unknown>) {
    const response = await authenticatedFetch("/api/daily-ideas/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Idea Lab update failed");
    await refresh();
  }

  async function updateProject(patch: Record<string, unknown>) {
    if (!selected) return;
    setError(null);
    setSaveState("saving");
    try {
      await action({ action: "update-project", projectId: selected.id, patch });
      setSaveState("saved");
      setProjectReview(null);
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "Project update failed");
    }
  }

  function updateLocal(patch: Partial<SharedProject>) {
    if (!selected) return;
    setSaveState("idle");
    setProjects((current) => current.map((project) => project.id === selected.id ? { ...project, ...patch } : project));
  }

  function chooseProject(project: SharedProject) {
    setSelectedId(project.id);
    const firstIncomplete = modules.find((module) => !isModuleComplete(project, module.key));
    setActiveModule(firstIncomplete?.key ?? "firstAction");
    setSaveState("idle");
    setAssistError(null);
    setModuleAssist(null);
    setProjectReview(null);
    setCopiedBrief(null);
  }

  function openModule(key: ModuleField, jumpToEditor = false) {
    setActiveModule(key);
    setAssistError(null);
    setModuleAssist(null);
    if (jumpToEditor) requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start" }));
  }

  async function lifecycle(actionName: LifecycleAction) {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      await action({ action: actionName, projectId: selected.id });
      setProjectReview(null);
      if (actionName === "validate") trackProjectStage("idea_validation_started", { category: selected.category });
      if (actionName === "build") trackProjectStage("project_moved_to_building", { category: selected.category });
      if (actionName === "launch") trackProjectStage("project_launched", { category: selected.category });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project stage update failed");
    } finally {
      setLoading(false);
    }
  }

  async function requestModuleAssist() {
    if (!selected || assistLoading) return;
    setAssistLoading("module");
    setAssistError(null);
    setModuleAssist(null);
    try {
      setSaveState("saving");
      await action({ action: "update-project", projectId: selected.id, patch: { [activeModule]: selected[activeModule] } });
      setSaveState("saved");
      const response = await authenticatedFetch("/api/ideas/lab/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "module", projectId: selected.id, module: activeModule }),
      });
      const payload = (await response.json()) as ModuleAssistPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "AI assist could not run");
      setModuleAssist(payload);
    } catch (cause) {
      setAssistError(cause instanceof Error ? cause.message : "AI assist could not run");
    } finally {
      setAssistLoading(null);
    }
  }

  async function requestProjectReview() {
    if (!selected || assistLoading) return;
    setAssistLoading("review");
    setAssistError(null);
    try {
      setSaveState("saving");
      await action({ action: "update-project", projectId: selected.id, patch: { [activeModule]: selected[activeModule] } });
      setSaveState("saved");
      const response = await authenticatedFetch("/api/ideas/lab/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "review", projectId: selected.id }),
      });
      const payload = (await response.json()) as ProjectReviewPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Project review could not run");
      setProjectReview(payload);
    } catch (cause) {
      setAssistError(cause instanceof Error ? cause.message : "Project review could not run");
    } finally {
      setAssistLoading(null);
    }
  }

  async function applyModuleDraft() {
    if (!selected || !moduleAssist || moduleAssist.module !== activeModule) return;
    const activeDefinition = modules.find((module) => module.key === activeModule) ?? modules[0];
    const value = activeDefinition.kind === "list" ? normalizeListDraft(moduleAssist.draft) : moduleAssist.draft;
    const patch = { [activeModule]: value } as Partial<SharedProject>;
    updateLocal(patch);
    await updateProject({ [activeModule]: value });
  }

  async function copyBrief(target: Exclude<CopyTarget, null>, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedBrief(target);
    } catch {
      setAssistError("Copy failed. Select the brief text manually instead.");
    }
  }

  if (loading && !selected) {
    return (
      <div className="os-page os-runtime-page idea-lab-v2">
        <section className="idea-lab-empty idea-lab-glass" aria-live="polite">
          <span className="os-terminal-label">IDEA LAB · SHARED CORE</span>
          <h2>Opening your project workspace…</h2>
          <p>Synchronizing Daily Ideas project state.</p>
        </section>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="os-page os-runtime-page idea-lab-v2">
        <header className="idea-lab-heading">
          <span className="os-terminal-label">~/ideas/lab · SHARED CORE</span>
          <h1>Idea Lab.</h1>
          <p>Turn a promising opportunity into an executable project.</p>
        </header>
        {error ? <p className="os-runtime-warning" role="alert">{error}</p> : null}
        <section className="idea-lab-empty idea-lab-glass">
          <span className="idea-lab-empty-mark" aria-hidden="true">↗</span>
          <h2>No active projects yet.</h2>
          <p>Open Daily Ideas, save an opportunity, then choose Develop Idea. Telegram-created projects appear here after account linking.</p>
          <Link href="/app/ideas" className="idea-lab-primary-link">Discover an idea</Link>
        </section>
      </div>
    );
  }

  const activeDefinition = modules.find((module) => module.key === activeModule) ?? modules[0];
  const readiness = readinessFor(selected);
  const completedModules = modules.filter((module) => isModuleComplete(selected, module.key)).length;
  const incompleteModules = modules.filter((module) => !isModuleComplete(selected, module.key));
  const firstIncomplete = incompleteModules[0] ?? null;
  const currentStageIndex = stageIndex(selected.status);
  const nextAction: Exclude<LifecycleAction, "archive"> | null = selected.status === "developing" ? "validate" : selected.status === "validating" ? "build" : selected.status === "building" ? "launch" : null;
  const nextActionLabel = nextAction === "validate" ? "Move to Validation" : nextAction === "build" ? "Move to Building" : nextAction === "launch" ? "Mark Launched" : null;
  const fallbackNextMove = selected.firstAction.trim() || (firstIncomplete ? `Complete ${firstIncomplete.label}` : nextActionLabel || "Project workspace complete");
  const nextMove = projectReview?.nextAction || fallbackNextMove;
  const activeValue = selected[activeDefinition.key];
  const activeText = Array.isArray(activeValue) ? activeValue.join("\n") : activeValue;
  const activeAssist = moduleAssist?.module === activeModule ? moduleAssist : null;

  return (
    <div className="os-page os-runtime-page idea-lab-v2">
      <header className="idea-lab-heading">
        <span className="os-terminal-label">~/ideas/lab · SHARED CORE</span>
        <div className="idea-lab-heading-row">
          <div>
            <h1>Idea Lab.</h1>
            <p>Build the project, prove the opportunity, and move it toward launch. Changes stay synchronized with the shared Daily Ideas workspace.</p>
          </div>
          <div className={`idea-lab-sync-state is-${saveState}`} aria-live="polite">
            <span aria-hidden="true" />
            {saveState === "saving" ? "Saving" : saveState === "saved" ? "Synced" : saveState === "error" ? "Save failed" : "Shared core online"}
          </div>
        </div>
      </header>

      {error ? <p className="os-runtime-warning idea-lab-error" role="alert">{error}</p> : null}

      <details className="idea-lab-mobile-projects idea-lab-glass">
        <summary>
          <span><small>ACTIVE PROJECT</small><strong>{selected.title}</strong></span>
          <em>{statusLabel(selected.status)} · {readiness}%</em>
        </summary>
        <div className="idea-lab-mobile-project-list">
          {projects.map((project) => (
            <button key={project.id} type="button" onClick={() => chooseProject(project)} aria-pressed={project.id === selected.id}>
              <span><strong>{project.title}</strong><small>{statusLabel(project.status)}</small></span>
              <em>{readinessFor(project)}%</em>
            </button>
          ))}
        </div>
      </details>

      <section className="idea-lab-workspace">
        <aside className="idea-lab-sidebar idea-lab-glass" aria-label="Idea Lab projects">
          <div className="idea-lab-panel-kicker">
            <span>PROJECTS</span>
            <strong>{projects.length}</strong>
          </div>
          <nav className="idea-lab-project-list">
            {projects.map((project) => {
              const projectReadiness = readinessFor(project);
              const active = project.id === selected.id;
              return (
                <button key={project.id} type="button" className={active ? "is-active" : ""} onClick={() => chooseProject(project)} aria-pressed={active}>
                  <span className="idea-lab-project-copy">
                    <strong>{project.title}</strong>
                    <small>{project.category.toUpperCase()} · {statusLabel(project.status)}</small>
                  </span>
                  <span className="idea-lab-project-progress" aria-label={`${projectReadiness}% ready`}>
                    <i style={{ width: `${projectReadiness}%` }} />
                  </span>
                </button>
              );
            })}
          </nav>
          <Link href="/app/ideas" className="idea-lab-new-idea">+ Develop another idea</Link>

          <div className="idea-lab-identity-mini">
            <span className="os-terminal-label">GWAP IDENTITY</span>
            <strong>{owner}</strong>
            <p>GwapScore {score} · {tier}</p>
            <div>
              <Link href="/app/identity">Identity</Link>
              <Link href="/app/score">Score</Link>
              {gnsIdentity.profileUrl ? <a href={gnsIdentity.profileUrl}>Profile</a> : null}
            </div>
          </div>
        </aside>

        <main className="idea-lab-canvas">
          <section className="idea-lab-project-hero idea-lab-glass">
            <div className="idea-lab-project-meta">
              <span>{selected.category || "GENERAL"}</span>
              <span className={`is-${selected.status}`}>{statusLabel(selected.status)}</span>
              <span>{new Date(selected.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
            <label className="idea-lab-title-field">
              <span>Project title</span>
              <input
                value={selected.title}
                maxLength={120}
                onChange={(event) => updateLocal({ title: event.target.value })}
                onBlur={() => void updateProject({ title: selected.title })}
              />
            </label>
            {selected.summary ? <p className="idea-lab-project-summary">{selected.summary}</p> : null}

            <div className="idea-lab-stage-rail" aria-label={`Project stage: ${statusLabel(selected.status)}`}>
              {lifecycleStages.map((stage, index) => {
                const done = currentStageIndex > index || selected.status === "launched";
                const current = currentStageIndex === index;
                return (
                  <div key={stage.key} className={`${done ? "is-done" : ""} ${current ? "is-current" : ""}`}>
                    <span>{done ? "✓" : index + 1}</span>
                    <strong>{stage.label}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="idea-lab-module-section" aria-labelledby="idea-lab-foundation-title">
            <div className="idea-lab-section-heading">
              <div><span className="os-terminal-label">01 · FOUNDATION</span><h2 id="idea-lab-foundation-title">Make the idea make sense.</h2></div>
              <p>Define the problem, customer, opportunity and business model before execution gets expensive.</p>
            </div>
            <div className="idea-lab-modules-grid">
              {modules.filter((module) => module.group === "foundation").map((module) => {
                const complete = isModuleComplete(selected, module.key);
                const active = activeModule === module.key;
                return (
                  <button key={module.key} type="button" className={`${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`} onClick={() => openModule(module.key)} aria-pressed={active}>
                    <span className="idea-lab-module-top"><small>{module.eyebrow}</small><em>{complete ? "✓" : "○"}</em></span>
                    <strong>{module.label}</strong>
                    <p>{modulePreview(selected, module.key)}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="idea-lab-module-section" aria-labelledby="idea-lab-execution-title">
            <div className="idea-lab-section-heading">
              <div><span className="os-terminal-label">02 · EXECUTION</span><h2 id="idea-lab-execution-title">Turn thinking into movement.</h2></div>
              <p>Validate the demand, scope the MVP, plan the build and decide how the first users arrive.</p>
            </div>
            <div className="idea-lab-modules-grid">
              {modules.filter((module) => module.group === "execution").map((module) => {
                const complete = isModuleComplete(selected, module.key);
                const active = activeModule === module.key;
                return (
                  <button key={module.key} type="button" className={`${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`} onClick={() => openModule(module.key)} aria-pressed={active}>
                    <span className="idea-lab-module-top"><small>{module.eyebrow}</small><em>{complete ? "✓" : "○"}</em></span>
                    <strong>{module.label}</strong>
                    <p>{modulePreview(selected, module.key)}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="idea-lab-editor idea-lab-glass" id="idea-lab-editor" ref={editorRef}>
            <div className="idea-lab-editor-heading">
              <div>
                <span className="os-terminal-label">ACTIVE MODULE · {activeDefinition.eyebrow}</span>
                <h2>{activeDefinition.label}</h2>
                <p>{activeDefinition.prompt}</p>
                <button className="idea-lab-ai-assist-button" type="button" disabled={assistLoading !== null} onClick={() => void requestModuleAssist()}>
                  <span aria-hidden="true">✦</span>{assistLoading === "module" ? "Building a draft…" : "Help with this step"}
                </button>
              </div>
              <span className={isModuleComplete(selected, activeDefinition.key) ? "is-complete" : ""}>
                {isModuleComplete(selected, activeDefinition.key) ? "Complete" : "In progress"}
              </span>
            </div>
            <label>
              <span>{activeDefinition.kind === "list" ? "One item per line" : "Project thinking"}</span>
              <textarea
                value={activeText}
                rows={activeDefinition.rows}
                placeholder={activeDefinition.prompt}
                onChange={(event) => {
                  const value = activeDefinition.kind === "list" ? event.target.value.split("\n") : event.target.value;
                  updateLocal({ [activeDefinition.key]: value } as Partial<SharedProject>);
                }}
                onBlur={() => void updateProject({ [activeDefinition.key]: selected[activeDefinition.key] })}
              />
            </label>

            {assistError ? <p className="idea-lab-ai-error" role="alert">{assistError}</p> : null}

            {activeAssist ? (
              <section className="idea-lab-ai-draft" aria-live="polite">
                <div className="idea-lab-ai-draft-heading">
                  <div><span>GWAP AI DRAFT</span><strong>Review it. Keep what fits.</strong></div>
                  <button type="button" onClick={() => setModuleAssist(null)}>Dismiss</button>
                </div>
                <p className="idea-lab-ai-draft-copy">{activeAssist.draft}</p>
                {activeAssist.why ? <p className="idea-lab-ai-why"><strong>Why this direction:</strong> {activeAssist.why}</p> : null}
                {activeAssist.checkpoints.length ? (
                  <ul>{activeAssist.checkpoints.map((checkpoint) => <li key={checkpoint}>{checkpoint}</li>)}</ul>
                ) : null}
                <div className="idea-lab-ai-draft-footer">
                  <button className="idea-lab-ai-use" type="button" disabled={saveState === "saving"} onClick={() => void applyModuleDraft()}>Use this draft</button>
                  {activeAssist.nextQuestion ? <span>Next question: {activeAssist.nextQuestion}</span> : null}
                </div>
              </section>
            ) : null}

            <div className="idea-lab-editor-footer">
              <span>Autosaves when you leave this module. AI suggestions never overwrite your work automatically.</span>
              <div>
                {modules.map((module) => (
                  <button key={module.key} type="button" aria-label={`Open ${module.label}`} className={module.key === activeModule ? "is-active" : ""} onClick={() => openModule(module.key)} />
                ))}
              </div>
            </div>
          </section>
        </main>

        <aside className="idea-lab-execution idea-lab-glass" aria-label="Project execution status">
          <div className="idea-lab-panel-kicker"><span>EXECUTION</span><strong>{completedModules}/{modules.length}</strong></div>
          <section className="idea-lab-readiness">
            <span className="os-terminal-label">PROJECT COMPLETION</span>
            <strong>{readiness}<small>%</small></strong>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness}><i style={{ width: `${readiness}%` }} /></div>
            <p>{readiness < 50 ? "Still shaping the fundamentals." : readiness < 100 ? "The project is becoming executable." : "All core project modules are filled in."}</p>
          </section>

          <section className="idea-lab-ai-review">
            <div className="idea-lab-ai-review-heading">
              <span className="os-terminal-label">AI QUALITY REVIEW</span>
              <button type="button" disabled={assistLoading !== null} onClick={() => void requestProjectReview()}>{assistLoading === "review" ? "Reviewing…" : projectReview ? "Refresh" : "Review project"}</button>
            </div>
            {projectReview ? (
              <div className="idea-lab-ai-review-result" aria-live="polite">
                <div className="idea-lab-ai-score"><strong>{projectReview.readinessScore}</strong><span>/ 100</span></div>
                <p>{projectReview.verdict}</p>
                {projectReview.gaps.length ? (
                  <div className="idea-lab-ai-gaps"><span>TOP GAPS</span><ul>{projectReview.gaps.slice(0, 3).map((gap) => <li key={gap}>{gap}</li>)}</ul></div>
                ) : null}
                {projectReview.validationPriority ? <div className="idea-lab-ai-priority"><span>VALIDATE FIRST</span><strong>{projectReview.validationPriority}</strong></div> : null}
                {projectReview.evidenceNeeded.length ? (
                  <details className="idea-lab-ai-evidence"><summary>Evidence to collect</summary><ul>{projectReview.evidenceNeeded.map((item) => <li key={item}>{item}</li>)}</ul></details>
                ) : null}
              </div>
            ) : <p>Completion measures filled modules. AI review checks whether the thinking is actually strong enough to execute.</p>}
          </section>

          <section className="idea-lab-next-move">
            <span className="os-terminal-label">NEXT MOVE{projectReview ? " · AI REVIEW" : ""}</span>
            <strong>{nextMove}</strong>
            {firstIncomplete ? <button type="button" onClick={() => openModule(firstIncomplete.key, true)}>Open {firstIncomplete.label} →</button> : null}
          </section>

          <section className="idea-lab-blockers">
            <span className="os-terminal-label">OPEN WORK</span>
            {incompleteModules.length ? (
              <ul>
                {incompleteModules.slice(0, 4).map((module) => <li key={module.key}><span>○</span>{module.label}</li>)}
              </ul>
            ) : <p>All project modules are defined.</p>}
          </section>

          <section className="idea-lab-lifecycle-actions">
            <span className="os-terminal-label">LIFECYCLE</span>
            <p>Current stage: <strong>{statusLabel(selected.status)}</strong>. Stage changes stay sequential and sync to Telegram.</p>
            {nextAction && nextActionLabel ? <button className="idea-lab-primary-action" type="button" disabled={loading} onClick={() => void lifecycle(nextAction)}>{nextActionLabel}</button> : null}
            {selected.status !== "archived" ? <button className="idea-lab-quiet-action" type="button" disabled={loading} onClick={() => void lifecycle("archive")}>Archive project</button> : null}
          </section>

          <section className="idea-lab-handoff">
            <span className="os-terminal-label">GWAP HANDOFF</span>
            {projectReview ? (
              <>
                <details className="idea-lab-handoff-brief">
                  <summary>Marketplace brief <span>+</span></summary>
                  <p>{projectReview.marketplaceBrief}</p>
                  <div><button type="button" onClick={() => void copyBrief("marketplace", projectReview.marketplaceBrief)}>{copiedBrief === "marketplace" ? "Copied" : "Copy brief"}</button><Link href="/app/marketplace">Open Marketplace ↗</Link></div>
                </details>
                <details className="idea-lab-handoff-brief">
                  <summary>Developer brief <span>+</span></summary>
                  <p>{projectReview.developerBrief}</p>
                  <div><button type="button" onClick={() => void copyBrief("developer", projectReview.developerBrief)}>{copiedBrief === "developer" ? "Copied" : "Copy brief"}</button><Link href="/app/developer">Open Developer ↗</Link></div>
                </details>
              </>
            ) : (
              <>
                <Link href="/app/marketplace">Marketplace briefs <span>↗</span></Link>
                <Link href="/app/developer">Developer APIs <span>↗</span></Link>
              </>
            )}
            <Link href="/app/ideas">Daily Ideas <span>↗</span></Link>
          </section>
        </aside>
      </section>

      <div className="idea-lab-mobile-next">
        {firstIncomplete ? (
          <button type="button" onClick={() => openModule(firstIncomplete.key, true)}><span>Next</span><strong>{firstIncomplete.label}</strong><em>→</em></button>
        ) : nextAction && nextActionLabel ? (
          <button type="button" disabled={loading} onClick={() => void lifecycle(nextAction)}><span>Lifecycle</span><strong>{nextActionLabel}</strong><em>→</em></button>
        ) : (
          <span><small>PROJECT READINESS</small><strong>{readiness}% complete</strong></span>
        )}
      </div>
    </div>
  );
}
