"use client";

import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dailyIdeaCategories,
  dailyIdeaCategoryLabel,
  type DailyIdeaCategory,
} from "../../lib/daily-ideas-core";
import { useGwapOs } from "./os-provider";

type SharedIdea = {
  id: string;
  title: string;
  summary: string;
  problem: string;
  solution?: string;
  targetAudience?: string[];
  whyNow?: string;
  opportunity: string;
  category: string;
  tags?: string[];
  monetization?: string[];
  mvpFeatures?: string[];
  difficulty: "Starter" | "Intermediate" | "Advanced";
  estimatedStartupCost?: string;
  estimatedBuildScope?: string;
  opportunityScore?: number;
  risks?: string[];
  validationSteps?: string[];
  firstAction?: string;
  status: string;
};

type SavedEntry = { idea: SharedIdea; savedAt: string };
type SharedProject = {
  id: string;
  ideaId: string;
  title: string;
  status: "developing" | "validating" | "building" | "launched" | "archived";
  updatedAt: string;
};
type DailyIdeasPreferences = {
  categories: DailyIdeaCategory[];
  difficulty: "any" | "Starter" | "Intermediate" | "Advanced";
  budget: "any" | "low" | "medium" | "high";
  updatedAt: string;
};
type SharedWorkspace = {
  linked: boolean;
  identity: { telegramUserId: string; gnsIdentity: string | null; linkedAt: string } | null;
  saved: { items: SavedEntry[]; total: number };
  projects: { items: SharedProject[]; total: number };
  preferences: DailyIdeasPreferences;
  idea?: SharedIdea;
};
type IdeaDelivery = { source?: "inventory" | "generated" | "daily-cache" | "fallback" };
type DailyIdeasViewName = "today" | "discover" | "saved" | "projects" | "preferences";

const views: Array<{ id: DailyIdeasViewName; label: string }> = [
  { id: "today", label: "Today" },
  { id: "discover", label: "Discover" },
  { id: "saved", label: "Saved" },
  { id: "projects", label: "Projects" },
  { id: "preferences", label: "Preferences" },
];

const lifecycle = ["Discover", "Save", "Develop", "Validate", "Build", "Launch"] as const;

function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function categoryLabel(value: string) {
  return dailyIdeaCategories.includes(value as DailyIdeaCategory)
    ? dailyIdeaCategoryLabel(value as DailyIdeaCategory)
    : value.replaceAll("-", " ");
}

function safeTrack(name: string, properties: Record<string, string | number | boolean> = {}) {
  void import("@vercel/analytics")
    .then(({ track }) => track(name, properties))
    .catch(() => undefined);
}

function IdeaCard({
  idea,
  busy,
  saved,
  projectExists,
  onSave,
  onDevelop,
  onExploreAnother,
}: {
  idea: SharedIdea;
  busy: boolean;
  saved: boolean;
  projectExists: boolean;
  onSave: () => void;
  onDevelop: () => void;
  onExploreAnother: () => void;
}) {
  return (
    <article className="daily-ideas-card" aria-live="polite">
      <div className="daily-ideas-card-meta">
        <span>{categoryLabel(idea.category)}</span>
        <span>{idea.difficulty}</span>
        {typeof idea.opportunityScore === "number" ? <span>{idea.opportunityScore}/100 opportunity</span> : null}
      </div>
      <h2>{idea.title}</h2>
      <p className="daily-ideas-summary">{idea.summary}</p>

      <div className="daily-ideas-snapshot">
        <div><span>PROBLEM</span><p>{idea.problem}</p></div>
        <div><span>OPPORTUNITY</span><p>{idea.opportunity}</p></div>
        {idea.firstAction ? <div className="is-next"><span>FIRST ACTION</span><p>{idea.firstAction}</p></div> : null}
      </div>

      <details className="daily-ideas-details">
        <summary>Open the execution brief</summary>
        <div className="daily-ideas-detail-grid">
          {idea.solution ? <section><span>SOLUTION</span><p>{idea.solution}</p></section> : null}
          {idea.whyNow ? <section><span>WHY NOW</span><p>{idea.whyNow}</p></section> : null}
          {idea.targetAudience?.length ? <section><span>TARGET USER</span><ul>{idea.targetAudience.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          {idea.monetization?.length ? <section><span>MONETIZATION</span><ul>{idea.monetization.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          {idea.mvpFeatures?.length ? <section><span>MVP SCOPE</span><ul>{idea.mvpFeatures.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          {idea.validationSteps?.length ? <section><span>VALIDATE</span><ol>{idea.validationSteps.map((item) => <li key={item}>{item}</li>)}</ol></section> : null}
          {idea.risks?.length ? <section><span>RISKS</span><ul>{idea.risks.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          {idea.estimatedStartupCost || idea.estimatedBuildScope ? (
            <section><span>COST + BUILD</span><p>{[idea.estimatedStartupCost, idea.estimatedBuildScope].filter(Boolean).join(" · ")}</p></section>
          ) : null}
        </div>
      </details>

      <div className="daily-ideas-card-actions">
        <button type="button" onClick={onSave} disabled={busy || saved}>{saved ? "Saved" : "Save idea"}</button>
        {saved ? <button type="button" onClick={onDevelop} disabled={busy}>{projectExists ? "Open Idea Lab" : "Develop idea"}</button> : null}
        <button type="button" className="is-quiet" onClick={onExploreAnother} disabled={busy}>Explore another</button>
      </div>
    </article>
  );
}

export function DailyIdeasView() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const [activeView, setActiveView] = useState<DailyIdeasViewName>("today");
  const [category, setCategory] = useState<DailyIdeaCategory>("general");
  const [todayIdea, setTodayIdea] = useState<SharedIdea | null>(null);
  const [discoveredIdea, setDiscoveredIdea] = useState<SharedIdea | null>(null);
  const [workspace, setWorkspace] = useState<SharedWorkspace | null>(null);
  const [preferenceDraft, setPreferenceDraft] = useState<Omit<DailyIdeasPreferences, "updatedAt">>({
    categories: ["general"],
    difficulty: "any",
    budget: "any",
  });
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const startupHandledRef = useRef(false);

  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const scoreLabel = gnsIdentity.score === null ? "Unscored" : String(gnsIdentity.score);
  const busy = loading || bootstrapping || !online;

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
    if (!response.ok) throw new Error(payload.error || "We couldn’t load your Daily Ideas workspace.");
    setWorkspace(payload);
    setPreferenceDraft({
      categories: payload.preferences.categories,
      difficulty: payload.preferences.difficulty,
      budget: payload.preferences.budget,
    });
    const preferred = payload.preferences.categories[0];
    if (preferred) setCategory(preferred);
    return payload;
  }, [authenticatedFetch]);

  const requestIdea = useCallback(async (nextCategory: DailyIdeaCategory, mode: "daily" | "discover") => {
    if (!online) throw new Error("You’re offline. Reconnect, then try again.");
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch("/api/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: nextCategory, mode }),
      });
      const payload = (await response.json()) as { idea?: SharedIdea; delivery?: IdeaDelivery; error?: string };
      if (!response.ok || !payload.idea) throw new Error(payload.error || "We couldn’t load an idea right now.");
      if (mode === "daily") {
        setTodayIdea(payload.idea);
        setActiveView("today");
      } else {
        setDiscoveredIdea(payload.idea);
        setActiveView("discover");
      }
      setCategory(nextCategory);
      safeTrack("idea_viewed", {
        category: payload.idea.category,
        difficulty: payload.idea.difficulty,
        mode,
        source: payload.delivery?.source || "unknown",
      });
      return payload.idea;
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, online]);

  useEffect(() => {
    const syncOnlineState = () => setOnline(window.navigator.onLine);
    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

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
        let payload: SharedWorkspace;
        if (linkToken) {
          const response = await authenticatedFetch("/api/daily-ideas/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: linkToken }),
          });
          const linked = (await response.json()) as { linked?: boolean; gnsIdentity?: string | null; error?: string };
          if (!response.ok || !linked.linked) throw new Error(linked.error || "Telegram account linking failed.");
          setNotice(linked.gnsIdentity ? `Telegram connected to ${linked.gnsIdentity}.gwap.` : "Telegram connected to your GWAP OS account.");
          router.replace("/app/ideas");
          payload = await refreshWorkspace();
        } else if (handoffToken) {
          const response = await authenticatedFetch("/api/ideas/handoff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: handoffToken }),
          });
          const handoff = (await response.json()) as { idea?: SharedIdea; error?: string };
          if (!response.ok || !handoff.idea) throw new Error(handoff.error || "Daily Ideas handoff failed.");
          setDiscoveredIdea(handoff.idea);
          setActiveView("discover");
          safeTrack("idea_viewed", { category: handoff.idea.category, difficulty: handoff.idea.difficulty, mode: "handoff", source: "telegram" });
          router.replace("/app/ideas");
          payload = await refreshWorkspace();
        } else if (ideaId) {
          payload = await refreshWorkspace(ideaId);
          if (payload.idea) {
            setDiscoveredIdea(payload.idea);
            setActiveView("discover");
            safeTrack("idea_viewed", { category: payload.idea.category, difficulty: payload.idea.difficulty, mode: "handoff", source: "shared" });
          }
          router.replace("/app/ideas");
        } else {
          payload = await refreshWorkspace();
        }

        safeTrack("daily_ideas_opened", {
          linked: payload.linked,
          returning: Boolean(payload.preferences.updatedAt || payload.saved.total || payload.projects.total),
        });

        if (!handoffToken && !ideaId) {
          if (payload.preferences.updatedAt) {
            await requestIdea(payload.preferences.categories[0] || "general", "daily");
          } else {
            setActiveView("preferences");
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "We couldn’t open Daily Ideas.");
        if (linkToken || handoffToken || ideaId) router.replace("/app/ideas");
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [authenticatedFetch, refreshWorkspace, requestIdea, router]);

  async function workspaceAction(body: Record<string, unknown>) {
    if (!online) throw new Error("You’re offline. Reconnect, then try again.");
    const response = await authenticatedFetch("/api/daily-ideas/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string; created?: boolean };
    if (!response.ok) throw new Error(payload.error || "We couldn’t update your Daily Ideas workspace.");
    return payload;
  }

  async function saveIdea(idea: SharedIdea) {
    setLoading(true);
    setError(null);
    try {
      await workspaceAction({ action: "save", ideaId: idea.id });
      await refreshWorkspace();
      setNotice("Idea saved to your shared workspace.");
      safeTrack("idea_saved", { category: idea.category, difficulty: idea.difficulty });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t save that idea.");
    } finally {
      setLoading(false);
    }
  }

  async function develop(idea: SharedIdea) {
    setLoading(true);
    setError(null);
    try {
      const result = await workspaceAction({ action: "develop", ideaId: idea.id });
      safeTrack("idea_developed", { category: idea.category, difficulty: idea.difficulty });
      if (result.created) safeTrack("project_created", { category: idea.category });
      router.push("/app/ideas/lab");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t open this idea in Idea Lab.");
    } finally {
      setLoading(false);
    }
  }

  async function removeSaved(ideaId: string) {
    setLoading(true);
    setError(null);
    try {
      await workspaceAction({ action: "unsave", ideaId });
      await refreshWorkspace();
      setNotice("Idea removed from Saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t remove that saved idea.");
    } finally {
      setLoading(false);
    }
  }

  async function exploreAnother(idea?: SharedIdea) {
    if (idea) safeTrack("idea_skipped", { category: idea.category, difficulty: idea.difficulty });
    try {
      await requestIdea(category, "discover");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t load another idea.");
    }
  }

  async function savePreferences() {
    if (!preferenceDraft.categories.length) {
      setError("Choose at least one interest to personalize Daily Ideas.");
      return;
    }
    const firstSetup = !workspace?.preferences.updatedAt;
    setLoading(true);
    setError(null);
    try {
      await workspaceAction({ action: "preferences", ...preferenceDraft });
      const payload = await refreshWorkspace();
      setNotice("Daily Ideas preferences saved.");
      safeTrack("daily_ideas_preferences_updated", { categories: preferenceDraft.categories.length });
      if (firstSetup || !todayIdea) await requestIdea(payload.preferences.categories[0] || "general", "daily");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t save your preferences.");
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    setLoading(true);
    setError(null);
    try {
      const payload = await refreshWorkspace();
      if (activeView === "today" && !todayIdea && payload.preferences.updatedAt) {
        await requestIdea(payload.preferences.categories[0] || "general", "daily");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We still couldn’t reach Daily Ideas.");
    } finally {
      setLoading(false);
    }
  }

  function togglePreferenceCategory(next: DailyIdeaCategory) {
    setPreferenceDraft((current) => {
      const selected = current.categories.includes(next);
      if (selected) return { ...current, categories: current.categories.filter((item) => item !== next) };
      if (current.categories.length >= 8) return current;
      return { ...current, categories: [...current.categories, next] };
    });
  }

  const savedItems = workspace?.saved.items ?? [];
  const projects = workspace?.projects.items ?? [];
  const isSaved = (idea: SharedIdea) => savedItems.some((entry) => entry.idea.id === idea.id);
  const hasProject = (idea: SharedIdea) => projects.some((project) => project.ideaId === idea.id);

  return (
    <div className="os-page os-runtime-page daily-ideas-page">
      <header className="daily-ideas-heading">
        <div className="daily-ideas-logo">
          <Image src="/logos/daily-ideas-2-official.webp" alt="Daily Ideas 2.0 logo" width={176} height={176} sizes="(max-width: 700px) 96px, 132px" priority />
        </div>
        <div>
          <span className="os-terminal-label">~/daily-ideas · SHARED CORE</span>
          <h1>Daily Ideas 2.0</h1>
          <p>Turn inspiration into execution. Discover opportunities, develop ideas, validate them, and turn them into real projects.</p>
        </div>
      </header>

      <div className="daily-ideas-context" aria-label="Daily Ideas workspace context">
        <span><small>WORKSPACE</small><strong>{owner}</strong></span>
        <span><small>GWAPSCORE</small><strong>{scoreLabel}</strong></span>
        <span><small>TELEGRAM</small><strong>{workspace?.linked ? "Connected" : "Optional"}</strong></span>
        <Link href="/app/identity">Identity settings</Link>
      </div>

      <ol className="daily-ideas-lifecycle" aria-label="Daily Ideas project lifecycle">
        {lifecycle.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}
      </ol>

      <nav className="daily-ideas-tabs" aria-label="Daily Ideas sections">
        {views.map((view) => (
          <button type="button" key={view.id} className={activeView === view.id ? "is-active" : undefined} aria-current={activeView === view.id ? "page" : undefined} onClick={() => setActiveView(view.id)}>
            {view.label}
            {view.id === "saved" ? <span>{workspace?.saved.total ?? 0}</span> : null}
            {view.id === "projects" ? <span>{workspace?.projects.total ?? 0}</span> : null}
          </button>
        ))}
      </nav>

      {!online ? <p className="daily-ideas-message is-offline" role="status">You’re offline. Your workspace is safe; reconnect to load or change ideas.</p> : null}
      {notice ? <p className="daily-ideas-message" role="status">{notice}</p> : null}
      {error ? <div className="daily-ideas-message is-error" role="alert"><span>{error}</span><button type="button" onClick={() => void retry()} disabled={loading || !online}>Try again</button></div> : null}

      {bootstrapping ? (
        <section className="daily-ideas-empty" aria-live="polite">
          <span className="os-terminal-label">SYNCING SHARED WORKSPACE</span>
          <h2>Opening Daily Ideas…</h2>
          <p>Loading your preferences, saved ideas, and active projects.</p>
        </section>
      ) : null}

      {!bootstrapping && activeView === "today" ? (
        <section className="daily-ideas-section" aria-labelledby="daily-ideas-today-title">
          <div className="daily-ideas-section-heading"><div><span>TODAY</span><h2 id="daily-ideas-today-title">One worthwhile move.</h2></div><p>Your Today idea is cached, so reopening this page does not create another AI request.</p></div>
          {todayIdea ? (
            <IdeaCard idea={todayIdea} busy={busy} saved={isSaved(todayIdea)} projectExists={hasProject(todayIdea)} onSave={() => void saveIdea(todayIdea)} onDevelop={() => void develop(todayIdea)} onExploreAnother={() => void exploreAnother(todayIdea)} />
          ) : (
            <div className="daily-ideas-empty"><h2>No Today idea loaded.</h2><p>Load one useful opportunity from your preferred category.</p><button type="button" onClick={() => void requestIdea(category, "daily").catch((cause) => setError(cause instanceof Error ? cause.message : "We couldn’t load today’s idea."))} disabled={busy}>Load today’s idea</button></div>
          )}
        </section>
      ) : null}

      {!bootstrapping && activeView === "discover" ? (
        <section className="daily-ideas-section" aria-labelledby="daily-ideas-discover-title">
          <div className="daily-ideas-section-heading"><div><span>DISCOVER</span><h2 id="daily-ideas-discover-title">Explore another lane.</h2></div><div className="daily-ideas-discover-control"><label htmlFor="daily-ideas-category">Category</label><select id="daily-ideas-category" value={category} onChange={(event) => setCategory(event.target.value as DailyIdeaCategory)} disabled={busy}>{dailyIdeaCategories.map((item) => <option key={item} value={item}>{dailyIdeaCategoryLabel(item)}</option>)}</select><button type="button" onClick={() => void exploreAnother(discoveredIdea ?? undefined)} disabled={busy}>{loading ? "Loading…" : "Explore idea"}</button></div></div>
          {discoveredIdea ? <IdeaCard idea={discoveredIdea} busy={busy} saved={isSaved(discoveredIdea)} projectExists={hasProject(discoveredIdea)} onSave={() => void saveIdea(discoveredIdea)} onDevelop={() => void develop(discoveredIdea)} onExploreAnother={() => void exploreAnother(discoveredIdea)} /> : <div className="daily-ideas-empty"><h2>Choose a category.</h2><p>Daily Ideas will reuse suitable inventory before generating a new response.</p></div>}
        </section>
      ) : null}

      {!bootstrapping && activeView === "saved" ? (
        <section className="daily-ideas-section" aria-labelledby="daily-ideas-saved-title">
          <div className="daily-ideas-section-heading"><div><span>SAVED</span><h2 id="daily-ideas-saved-title">Ideas worth returning to.</h2></div><p>Saved ideas persist in the canonical shared workspace—not only in this browser.</p></div>
          {savedItems.length ? <div className="daily-ideas-list">{savedItems.map((entry) => <article key={entry.idea.id}><div><span>{categoryLabel(entry.idea.category)} · {entry.idea.difficulty}</span><h3>{entry.idea.title}</h3><p>{entry.idea.summary}</p></div><div><button type="button" onClick={() => void develop(entry.idea)} disabled={busy}>{hasProject(entry.idea) ? "Open Lab" : "Develop"}</button><button type="button" className="is-quiet" onClick={() => void removeSaved(entry.idea.id)} disabled={busy}>Remove</button></div></article>)}</div> : <div className="daily-ideas-empty"><h2>No saved ideas yet.</h2><p>Save a useful idea from Today or Discover and it will appear here.</p><button type="button" onClick={() => setActiveView("discover")}>Discover ideas</button></div>}
        </section>
      ) : null}

      {!bootstrapping && activeView === "projects" ? (
        <section className="daily-ideas-section" aria-labelledby="daily-ideas-projects-title">
          <div className="daily-ideas-section-heading"><div><span>PROJECTS</span><h2 id="daily-ideas-projects-title">Move from thought to launch.</h2></div><p>Develop → Validate → Build → Launch stays synchronized with Telegram and the shared backend.</p></div>
          {projects.length ? <div className="daily-ideas-list">{projects.map((project) => <article key={project.id}><div><span>{project.status.toUpperCase()}</span><h3>{project.title}</h3><p>Last updated {new Date(project.updatedAt).toLocaleDateString()}</p></div><Link href="/app/ideas/lab">Open Idea Lab</Link></article>)}</div> : <div className="daily-ideas-empty"><h2>No active projects.</h2><p>Save an idea, choose Develop, and your execution workspace will start here.</p><button type="button" onClick={() => setActiveView("saved")}>Open saved ideas</button></div>}
        </section>
      ) : null}

      {!bootstrapping && activeView === "preferences" ? (
        <section className="daily-ideas-section" aria-labelledby="daily-ideas-preferences-title">
          <div className="daily-ideas-section-heading"><div><span>PERSONALIZE</span><h2 id="daily-ideas-preferences-title">What should Daily Ideas look for?</h2></div><p>Choose up to eight interests. GNS is optional; basic discovery never requires a .gwap name.</p></div>
          <div className="daily-ideas-preferences">
            <fieldset><legend>Interests</legend><div className="daily-ideas-category-grid">{dailyIdeaCategories.map((item) => { const selected = preferenceDraft.categories.includes(item); return <button type="button" key={item} className={selected ? "is-selected" : undefined} aria-pressed={selected} onClick={() => togglePreferenceCategory(item)}>{dailyIdeaCategoryLabel(item)}</button>; })}</div><small>{preferenceDraft.categories.length}/8 selected</small></fieldset>
            <label>Preferred difficulty<select value={preferenceDraft.difficulty} onChange={(event) => setPreferenceDraft((current) => ({ ...current, difficulty: event.target.value as DailyIdeasPreferences["difficulty"] }))}><option value="any">Any difficulty</option><option value="Starter">Starter</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></label>
            <label>Starting budget<select value={preferenceDraft.budget} onChange={(event) => setPreferenceDraft((current) => ({ ...current, budget: event.target.value as DailyIdeasPreferences["budget"] }))}><option value="any">Any budget</option><option value="low">Low cost</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <button type="button" className="daily-ideas-save-preferences" onClick={() => void savePreferences()} disabled={busy || !preferenceDraft.categories.length}>{loading ? "Saving…" : workspace?.preferences.updatedAt ? "Save preferences" : "Start exploring"}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
