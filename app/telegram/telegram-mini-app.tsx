"use client";

import Image from "next/image";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./telegram-mini-app.module.css";

type TelegramBottomButton = {
  setText(text: string): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
};

type TelegramWebApp = {
  initData: string;
  platform?: string;
  colorScheme?: "light" | "dark";
  ready(): void;
  expand(): void;
  openLink(url: string): void;
  MainButton?: TelegramBottomButton;
  BackButton?: { hide(): void };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type DailyIdea = {
  id: string;
  title: string;
  summary: string;
  problem: string;
  solution: string;
  category: string;
  difficulty: string;
  estimatedStartupCost: string;
  opportunityScore: number;
  firstAction: string;
};

type SavedItem = { idea: DailyIdea; savedAt: string };
type Project = {
  id: string;
  ideaId: string;
  title: string;
  summary: string;
  category: string;
  status: "developing" | "validating" | "building" | "launched" | "archived";
  firstAction: string;
};

type Preferences = {
  categories: string[];
  difficulty: "any" | "Starter" | "Intermediate" | "Advanced";
  budget: "any" | "low" | "medium" | "high";
};

type BootstrapData = {
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    isPremium: boolean;
  };
  linkedIdentity: { gnsIdentity: string | null; linkedAt: string } | null;
  preferences: Preferences;
  saved: { items: SavedItem[]; total: number };
  projects: { items: Project[]; total: number };
};

type Tab = "home" | "ideas" | "saved" | "projects";
type HostState = "loading" | "telegram" | "outside" | "error";

const categories = [
  ["general", "For You"],
  ["ai", "AI & Agents"],
  ["solana", "Solana"],
  ["web3", "Web3"],
  ["saas", "SaaS"],
  ["developer-tools", "Dev Tools"],
  ["creator-economy", "Creator"],
  ["b2b", "B2B"],
  ["productivity", "Productivity"],
  ["gwap-ecosystem", "GWAP"],
] as const;

const categoryLabels = Object.fromEntries(categories) as Record<string, string>;

function initials(firstName: string, lastName: string | null) {
  return `${firstName.slice(0, 1)}${lastName?.slice(0, 1) || ""}`.toUpperCase() || "G";
}

function stageIndex(status: Project["status"]) {
  return status === "developing" ? 1 : status === "validating" ? 2 : status === "building" ? 3 : status === "launched" ? 4 : 0;
}

function nextProjectStage(status: Project["status"]) {
  if (status === "developing") return { target: "validating" as const, label: "Start validation" };
  if (status === "validating") return { target: "building" as const, label: "Move to build" };
  if (status === "building") return { target: "launched" as const, label: "Mark launched" };
  return null;
}

function safeMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback;
}

export default function TelegramMiniApp({ botUsername }: { botUsername: string }) {
  const [host, setHost] = useState<HostState>("loading");
  const [data, setData] = useState<BootstrapData | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [currentIdea, setCurrentIdea] = useState<DailyIdea | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("general");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const initDataRef = useRef("");
  const telegramRef = useRef<TelegramWebApp | null>(null);
  const bootedRef = useRef(false);

  const request = useCallback(async <T,>(method: "GET" | "POST", body?: Record<string, unknown>) => {
    const response = await fetch("/api/telegram/mini-app", {
      method,
      cache: "no-store",
      headers: {
        "x-telegram-init-data": initDataRef.current,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) throw new Error(safeMessage(payload, "Request failed."));
    return payload;
  }, []);

  const refresh = useCallback(async () => {
    const next = await request<BootstrapData>("GET");
    setData(next);
    if (next.preferences.categories[0]) setSelectedCategory((current) => current === "general" ? next.preferences.categories[0] : current);
    return next;
  }, [request]);

  const haptic = useCallback((type: "tap" | "success" | "warning" | "error") => {
    const feedback = telegramRef.current?.HapticFeedback;
    if (!feedback) return;
    if (type === "tap") feedback.impactOccurred("light");
    else feedback.notificationOccurred(type);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const consumeHandoff = useCallback(async () => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("handoff");
    if (!token) return;
    try {
      const result = await request<{ idea: DailyIdea }>("POST", { action: "consume-handoff", token });
      setCurrentIdea(result.idea);
      setSelectedCategory(result.idea.category);
      setTab("ideas");
      url.searchParams.delete("handoff");
      url.searchParams.delete("source");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (handoffError) {
      notify(handoffError instanceof Error ? handoffError.message : "That idea link has expired.");
    }
  }, [notify, request]);

  const initializeTelegram = useCallback(async () => {
    if (bootedRef.current) return;
    const telegram = window.Telegram?.WebApp;
    if (!telegram?.initData) {
      setHost("outside");
      return;
    }

    bootedRef.current = true;
    telegramRef.current = telegram;
    initDataRef.current = telegram.initData;
    telegram.ready();
    telegram.expand();
    telegram.BackButton?.hide();
    setHost("telegram");

    try {
      await refresh();
      await consumeHandoff();
    } catch (bootError) {
      setError(bootError instanceof Error ? bootError.message : "Telegram session could not be started.");
      setHost("error");
      haptic("error");
    }
  }, [consumeHandoff, haptic, refresh]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!bootedRef.current && !window.Telegram?.WebApp?.initData) setHost("outside");
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, []);

  const generateIdea = useCallback(async (mode: "daily" | "discover" | "idea" = "idea") => {
    if (busy) return;
    setBusy(true);
    setError("");
    haptic("tap");
    try {
      const result = await request<{ idea: DailyIdea }>("POST", {
        action: "next",
        category: selectedCategory,
        mode,
      });
      setCurrentIdea(result.idea);
      setSelectedCategory(result.idea.category);
      setTab("ideas");
      haptic("success");
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "The idea engine did not finish that one.";
      setError(message);
      haptic("error");
    } finally {
      setBusy(false);
    }
  }, [busy, haptic, request, selectedCategory]);

  const savedIds = useMemo(() => new Set(data?.saved.items.map((item) => item.idea.id) || []), [data]);
  const currentSaved = currentIdea ? savedIds.has(currentIdea.id) : false;

  const toggleSave = useCallback(async (idea: DailyIdea) => {
    if (busy) return;
    setBusy(true);
    const saved = savedIds.has(idea.id);
    try {
      await request("POST", { action: saved ? "unsave" : "save", ideaId: idea.id });
      await refresh();
      notify(saved ? "Removed from Saved" : "Saved to Daily Ideas");
      haptic("success");
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "Could not update this idea.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  }, [busy, haptic, notify, refresh, request, savedIds]);

  const developIdea = useCallback(async (idea: DailyIdea) => {
    if (busy) return;
    setBusy(true);
    try {
      await request("POST", { action: "develop", ideaId: idea.id });
      await refresh();
      setTab("projects");
      notify("Project created — time to execute.");
      haptic("success");
    } catch (projectError) {
      notify(projectError instanceof Error ? projectError.message : "Could not start this project.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  }, [busy, haptic, notify, refresh, request]);

  const advanceProject = useCallback(async (project: Project) => {
    const next = nextProjectStage(project.status);
    if (!next || busy) return;
    setBusy(true);
    try {
      await request("POST", { action: "advance", projectId: project.id, target: next.target });
      await refresh();
      notify(`Moved to ${next.target}.`);
      haptic("success");
    } catch (projectError) {
      notify(projectError instanceof Error ? projectError.message : "Could not update project.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  }, [busy, haptic, notify, refresh, request]);

  const linkAccount = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await request<{ linked: boolean; gnsIdentity?: string | null; url?: string }>("POST", { action: "link-token" });
      if (result.linked) {
        notify(result.gnsIdentity ? `Linked as ${result.gnsIdentity}` : "GWAP account already linked.");
        haptic("success");
      } else if (result.url) {
        telegramRef.current?.openLink(new URL(result.url, window.location.origin).href);
      }
    } catch (linkError) {
      notify(linkError instanceof Error ? linkError.message : "Could not start account linking.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  }, [busy, haptic, notify, request]);

  const openGwapOS = useCallback(() => {
    telegramRef.current?.openLink("https://www.gwapspot.com/app");
  }, []);

  useEffect(() => {
    const button = telegramRef.current?.MainButton;
    if (!button || host !== "telegram") return;

    let text = "";
    let handler: (() => void) | null = null;
    if (tab === "home") {
      text = "Get Today's Idea";
      handler = () => void generateIdea("daily");
    } else if (tab === "ideas" && currentIdea) {
      text = "Develop This Idea";
      handler = () => void developIdea(currentIdea);
    } else if (tab === "ideas") {
      text = "Generate Idea";
      handler = () => void generateIdea("idea");
    }

    if (!handler) {
      button.hide();
      return;
    }

    button.setText(text);
    button.show();
    if (busy) button.disable(); else button.enable();
    button.onClick(handler);
    return () => button.offClick(handler);
  }, [busy, currentIdea, developIdea, generateIdea, host, tab]);

  const selectTab = useCallback((next: Tab) => {
    haptic("tap");
    setTab(next);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [haptic]);

  if (host === "outside") {
    const botUrl = botUsername ? `https://t.me/${botUsername}` : "https://www.gwapspot.com";
    return (
      <main className={styles.gateway}>
        <div className={styles.gatewayInner}>
          <Image className={styles.gatewayLogo} src="/logos/gwap.svg" width={58} height={58} alt="GWAP" priority />
          <h1>Open inside Telegram</h1>
          <p>This is the Telegram edition of Tha GwapSpot. Launch it through the Daily Ideas 2.0 bot for the native experience.</p>
          <a href={botUrl}>{botUsername ? "Open Daily Ideas 2.0" : "Visit Tha GwapSpot"}</a>
        </div>
      </main>
    );
  }

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => void initializeTelegram()} onError={() => setHost("outside")} />
      <main className={styles.app}>
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.brand}>
              <span className={styles.logoWrap}>
                <Image className={styles.logo} src="/logos/gwap.svg" width={25} height={25} alt="GWAP" priority />
              </span>
              <div className={styles.brandText}>
                <p className={styles.brandName}>Tha GwapSpot</p>
                <p className={styles.brandMeta}>Telegram Edition</p>
              </div>
            </div>
            {host === "telegram" && <span className={styles.statusDot}>Live</span>}
          </header>

          {host === "loading" && (
            <div className={styles.loader}>
              <div><div className={styles.spinner} />Starting GWAP…</div>
            </div>
          )}

          {host === "error" && (
            <div className={styles.errorCard}>
              <strong>Session unavailable</strong>
              <p>{error || "We could not verify this Telegram session."}</p>
              <button className={styles.secondaryButton} onClick={() => window.location.reload()}>Reload Mini App</button>
            </div>
          )}

          {host === "telegram" && data && tab === "home" && (
            <section className={styles.screen}>
              <p className={styles.eyebrow}>GWAP OS · Daily Ideas 2.0</p>
              <h1 className={styles.title}>Build something worth shipping.</h1>
              <p className={styles.lede}>Your Telegram-native path from opportunity to execution, synced with the same Daily Ideas account behind GWAP OS.</p>

              <div className={styles.heroCard}>
                <span className={styles.heroBadge}>Today&apos;s move</span>
                <h2>Daily Ideas 2.0</h2>
                <p>Discover a focused opportunity, save it, turn it into a project, validate it, build it, then launch.</p>
                <div className={styles.lifecycle} aria-label="Daily Ideas lifecycle">
                  <span>Discover</span><span>Save</span><span>Develop</span><span>Validate</span><span>Build</span><span>Launch</span>
                </div>
              </div>

              <div className={styles.statGrid}>
                <div className={styles.stat}><strong>{data.saved.total}</strong><span>Saved</span></div>
                <div className={styles.stat}><strong>{data.projects.total}</strong><span>Projects</span></div>
                <div className={styles.stat}><strong>{data.projects.items.filter((project) => project.status === "launched").length}</strong><span>Launched</span></div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}><h2>Your identity</h2></div>
                <div className={styles.accountCard}>
                  <span className={styles.avatar}>{initials(data.user.firstName, data.user.lastName)}</span>
                  <div className={styles.accountCopy}>
                    <strong>{data.user.firstName}{data.user.lastName ? ` ${data.user.lastName}` : ""}</strong>
                    <span>{data.linkedIdentity?.gnsIdentity || (data.user.username ? `@${data.user.username}` : "Telegram account")}</span>
                  </div>
                  <button className={styles.textButton} onClick={() => void linkAccount()} disabled={busy}>
                    {data.linkedIdentity ? "Linked" : "Link GWAP"}
                  </button>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}><h2>GWAP OS</h2></div>
                <div className={styles.card} style={{ padding: 16 }}>
                  <strong style={{ fontSize: 14 }}>Identity, reputation & wallet tools</strong>
                  <p className={styles.ideaSummary}>Sensitive wallet and Solana signing flows stay in the full GWAP OS instead of being squeezed into Telegram.</p>
                  <button className={styles.secondaryButton} style={{ width: "100%", marginTop: 12 }} onClick={openGwapOS}>Open GWAP OS ↗</button>
                </div>
              </div>
            </section>
          )}

          {host === "telegram" && data && tab === "ideas" && (
            <section className={styles.screen}>
              <p className={styles.eyebrow}>Discover</p>
              <h1 className={styles.title}>Find your next move.</h1>
              <p className={styles.lede}>Choose a lane or keep it broad. The engine avoids repeating ideas you&apos;ve already received.</p>

              <div className={styles.chips} role="list" aria-label="Idea categories">
                {categories.map(([value, label]) => (
                  <button key={value} className={`${styles.chip} ${selectedCategory === value ? styles.chipActive : ""}`} onClick={() => { setSelectedCategory(value); haptic("tap"); }}>
                    {label}
                  </button>
                ))}
              </div>

              {error && <div className={styles.errorCard}><strong>Idea engine</strong><p>{error}</p></div>}

              {!currentIdea && !error && (
                <div className={styles.empty}>
                  <strong>No idea on deck yet.</strong>
                  <p>Use the Telegram action button below to generate one in {categoryLabels[selectedCategory] || "your selected category"}.</p>
                </div>
              )}

              {currentIdea && (
                <article className={styles.ideaCard}>
                  <div className={styles.ideaMeta}>
                    <span className={styles.pill}>{categoryLabels[currentIdea.category] || currentIdea.category}</span>
                    <span className={`${styles.pill} ${styles.pillMuted}`}>{currentIdea.difficulty}</span>
                    <span className={`${styles.pill} ${styles.pillMuted}`}>Score {currentIdea.opportunityScore}</span>
                  </div>
                  <h2>{currentIdea.title}</h2>
                  <p className={styles.ideaSummary}>{currentIdea.summary}</p>
                  <div className={styles.detailGrid}>
                    <div className={styles.detail}><span className={styles.detailLabel}>Problem</span><p>{currentIdea.problem}</p></div>
                    <div className={styles.detail}><span className={styles.detailLabel}>Solution</span><p>{currentIdea.solution}</p></div>
                    <div className={styles.detail}><span className={styles.detailLabel}>Startup cost</span><p>{currentIdea.estimatedStartupCost}</p></div>
                    <div className={styles.detail}><span className={styles.detailLabel}>Difficulty</span><p>{currentIdea.difficulty}</p></div>
                  </div>
                  <div className={styles.firstAction}><strong>First action</strong><span>{currentIdea.firstAction}</span></div>
                  <div className={styles.actionRow}>
                    <button className={styles.secondaryButton} onClick={() => void toggleSave(currentIdea)} disabled={busy}>{currentSaved ? "Unsave" : "Save Idea"}</button>
                    <button className={styles.secondaryButton} onClick={() => void generateIdea("discover")} disabled={busy}>Another Idea</button>
                  </div>
                </article>
              )}
            </section>
          )}

          {host === "telegram" && data && tab === "saved" && (
            <section className={styles.screen}>
              <p className={styles.eyebrow}>Saved</p>
              <h1 className={styles.title}>Ideas worth keeping.</h1>
              <p className={styles.lede}>Your shortlist stays synchronized with Daily Ideas 2.0 and follows you into GWAP OS when your account is linked.</p>
              <div className={styles.section}>
                {data.saved.items.length === 0 ? (
                  <div className={styles.empty}><strong>Your shortlist is empty.</strong><p>Save ideas that deserve another look, then develop the strongest one.</p><button className={styles.secondaryButton} onClick={() => selectTab("ideas")}>Discover ideas</button></div>
                ) : (
                  <div className={styles.list}>
                    {data.saved.items.map(({ idea }) => (
                      <article className={styles.savedCard} key={idea.id}>
                        <button className={styles.textButton} style={{ textAlign: "left", padding: 0, color: "inherit" }} onClick={() => { setCurrentIdea(idea); setTab("ideas"); }}>
                          <h3>{idea.title}</h3><p>{idea.summary}</p>
                        </button>
                        <button className={styles.iconButton} onClick={() => void toggleSave(idea)} aria-label={`Remove ${idea.title} from saved ideas`}>×</button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {host === "telegram" && data && tab === "projects" && (
            <section className={styles.screen}>
              <p className={styles.eyebrow}>Execution</p>
              <h1 className={styles.title}>Projects in motion.</h1>
              <p className={styles.lede}>Move each idea through the actual lifecycle. Execution beats an overflowing idea graveyard.</p>
              <div className={styles.section}>
                {data.projects.items.length === 0 ? (
                  <div className={styles.empty}><strong>No projects yet.</strong><p>Develop an idea when you&apos;re ready to turn inspiration into a working plan.</p><button className={styles.secondaryButton} onClick={() => selectTab("ideas")}>Find an idea</button></div>
                ) : (
                  <div className={styles.list}>
                    {data.projects.items.filter((project) => project.status !== "archived").map((project) => {
                      const next = nextProjectStage(project.status);
                      const progress = stageIndex(project.status);
                      return (
                        <article className={styles.projectCard} key={project.id}>
                          <h3>{project.title}</h3>
                          <div className={styles.projectMeta}><span>{categoryLabels[project.category] || project.category}</span><span>·</span><span>{project.status}</span></div>
                          <div className={styles.progressTrack} aria-label={`Project stage: ${project.status}`}>
                            {[1, 2, 3, 4].map((step) => <span className={step <= progress ? styles.done : ""} key={step} />)}
                          </div>
                          {next && <button className={styles.secondaryButton} style={{ width: "100%", marginTop: 12 }} onClick={() => void advanceProject(project)} disabled={busy}>{next.label}</button>}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {host === "telegram" && data && (
          <nav className={styles.nav} aria-label="GWAP Telegram navigation">
            {([[
              "home", "⌂", "Home"
            ], [
              "ideas", "✦", "Ideas"
            ], [
              "saved", "♡", "Saved"
            ], [
              "projects", "↗", "Projects"
            ]] as Array<[Tab, string, string]>).map(([value, icon, label]) => (
              <button key={value} className={`${styles.navButton} ${tab === value ? styles.navActive : ""}`} onClick={() => selectTab(value)} aria-current={tab === value ? "page" : undefined}>
                <span className={styles.navIcon} aria-hidden="true">{icon}</span>{label}
              </button>
            ))}
          </nav>
        )}

        {toast && <div className={styles.toast} role="status">{toast}</div>}
      </main>
    </>
  );
}
