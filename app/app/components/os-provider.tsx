"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  defaultGwapOsState,
  GWAP_OS_STORAGE_KEY,
  normalizeGwapOsState,
  type GwapOsState,
  type GwapProfile,
  type GwapSettings,
} from "../lib/os-state";

type OsContextValue = {
  state: GwapOsState;
  updateProfile: (profile: Omit<GwapProfile, "updatedAt">) => void;
  updateSettings: (settings: Partial<GwapSettings>) => void;
  toggleFavorite: (slug: string) => void;
  recordLaunch: (slug: string) => void;
  resetWorkspace: () => void;
};

const listeners = new Set<() => void>();
let clientState = defaultGwapOsState;
let loaded = false;

function loadClientState() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;

  try {
    const stored = window.localStorage.getItem(GWAP_OS_STORAGE_KEY);
    clientState = stored
      ? normalizeGwapOsState(JSON.parse(stored) as unknown)
      : defaultGwapOsState;
  } catch {
    clientState = defaultGwapOsState;
  }
}

function getSnapshot() {
  loadClientState();
  return clientState;
}

function getServerSnapshot() {
  return defaultGwapOsState;
}

function subscribe(listener: () => void) {
  loadClientState();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist(nextState: GwapOsState) {
  clientState = nextState;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(GWAP_OS_STORAGE_KEY, JSON.stringify(nextState));
  }
  listeners.forEach((listener) => listener());
}

const OsContext = createContext<OsContextValue | null>(null);

export function GwapOsProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.dataset.gwapCompact = String(state.settings.compactMode);
    document.documentElement.dataset.gwapReduceMotion = String(state.settings.reduceMotion);
  }, [state.settings.compactMode, state.settings.reduceMotion]);

  const updateProfile = useCallback(
    (profile: Omit<GwapProfile, "updatedAt">) => {
      persist({
        ...getSnapshot(),
        profile: { ...profile, updatedAt: new Date().toISOString() },
      });
    },
    [],
  );

  const updateSettings = useCallback((settings: Partial<GwapSettings>) => {
    const current = getSnapshot();
    persist({
      ...current,
      settings: { ...current.settings, ...settings },
    });
  }, []);

  const toggleFavorite = useCallback((slug: string) => {
    const current = getSnapshot();
    const favorites = current.favorites.includes(slug)
      ? current.favorites.filter((item) => item !== slug)
      : [slug, ...current.favorites];
    persist({ ...current, favorites });
  }, []);

  const recordLaunch = useCallback((slug: string) => {
    const current = getSnapshot();
    persist({
      ...current,
      recent: [
        { slug, openedAt: new Date().toISOString() },
        ...current.recent.filter((item) => item.slug !== slug),
      ].slice(0, 8),
    });
  }, []);

  const resetWorkspace = useCallback(() => persist(defaultGwapOsState), []);

  const value = useMemo(
    () => ({
      state,
      updateProfile,
      updateSettings,
      toggleFavorite,
      recordLaunch,
      resetWorkspace,
    }),
    [recordLaunch, resetWorkspace, state, toggleFavorite, updateProfile, updateSettings],
  );

  return <OsContext.Provider value={value}>{children}</OsContext.Provider>;
}

export function useGwapOs() {
  const context = useContext(OsContext);
  if (!context) throw new Error("useGwapOs must be used inside GwapOsProvider");
  return context;
}
