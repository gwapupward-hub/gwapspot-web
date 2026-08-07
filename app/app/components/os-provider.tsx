"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  areGwapOsStatesEqual,
  createDefaultGwapOsState,
  GWAP_OS_STORAGE_KEY,
  normalizeGwapOsState,
  type GwapAccount,
  type GwapOsState,
  type GwapProfile,
  type GwapSettings,
} from "../lib/os-state";

type SyncStatus = "idle" | "saving" | "saved" | "error";

function readPendingState() {
  try {
    return window.localStorage.getItem(GWAP_OS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePendingState(state: GwapOsState) {
  try {
    window.localStorage.setItem(GWAP_OS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Cloud sync still proceeds when browser storage is unavailable.
  }
}

function clearPendingState() {
  try {
    window.localStorage.removeItem(GWAP_OS_STORAGE_KEY);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

type OsContextValue = {
  account: GwapAccount;
  migrationAvailable: boolean;
  retrySync: () => void;
  state: GwapOsState;
  syncStatus: SyncStatus;
  keepAccountState: () => void;
  migrateLocalState: () => void;
  updateProfile: (profile: Omit<GwapProfile, "updatedAt">) => void;
  updateSettings: (settings: Partial<GwapSettings>) => void;
  toggleFavorite: (slug: string) => void;
  recordLaunch: (slug: string) => void;
  resetWorkspace: () => void;
};

const OsContext = createContext<OsContextValue | null>(null);

export function GwapOsProvider({
  account,
  children,
  hasCloudState,
  initialState,
}: {
  account: GwapAccount;
  children: ReactNode;
  hasCloudState: boolean;
  initialState: GwapOsState;
}) {
  const { getAccessToken } = usePrivy();
  const [state, setState] = useState(initialState);
  const [migrationAvailable, setMigrationAvailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    hasCloudState ? "saved" : "idle",
  );
  const stateRef = useRef(state);
  const migrationRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const updateState = useCallback((nextState: GwapOsState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);

      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const saveNow = useCallback((nextState: GwapOsState) => {
    setSyncStatus("saving");

    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      const response = await authenticatedFetch("/api/os-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState }),
      });
      if (!response.ok) throw new Error("Workspace sync failed");

      if (areGwapOsStatesEqual(stateRef.current, nextState)) {
        clearPendingState();
        setSyncStatus("saved");
      }
    });

    saveQueueRef.current = operation;
    void operation.catch(() => {
      if (areGwapOsStatesEqual(stateRef.current, nextState)) setSyncStatus("error");
    });
  }, [authenticatedFetch]);

  const scheduleSave = useCallback(
    (nextState: GwapOsState) => {
      writePendingState(nextState);
      if (timerRef.current) clearTimeout(timerRef.current);
      setSyncStatus("saving");
      timerRef.current = setTimeout(() => saveNow(nextState), 450);
    },
    [saveNow],
  );

  useEffect(() => {
    const migrationTimer = window.setTimeout(() => {
      try {
        const stored = readPendingState();
        if (!stored) return;

        const localState = normalizeGwapOsState(JSON.parse(stored) as unknown);
        if (!areGwapOsStatesEqual(localState, initialState)) {
          migrationRef.current = true;
          setMigrationAvailable(true);
          updateState(localState);
        } else {
          clearPendingState();
        }
      } catch {
        clearPendingState();
      }
    }, 0);

    return () => window.clearTimeout(migrationTimer);
  }, [initialState, updateState]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.gwapCompact = String(state.settings.compactMode);
    document.documentElement.dataset.gwapReduceMotion = String(state.settings.reduceMotion);
  }, [state.settings.compactMode, state.settings.reduceMotion]);

  const commit = useCallback(
    (nextState: GwapOsState) => {
      updateState(nextState);
      if (migrationRef.current) {
        writePendingState(nextState);
        return;
      }
      scheduleSave(nextState);
    },
    [scheduleSave, updateState],
  );

  const migrateLocalState = useCallback(() => {
    migrationRef.current = false;
    setMigrationAvailable(false);
    saveNow(stateRef.current);
  }, [saveNow]);

  const keepAccountState = useCallback(() => {
    migrationRef.current = false;
    setMigrationAvailable(false);
    clearPendingState();
    updateState(initialState);
    setSyncStatus(hasCloudState ? "saved" : "idle");
  }, [hasCloudState, initialState, updateState]);

  const updateProfile = useCallback(
    (profile: Omit<GwapProfile, "updatedAt">) => {
      const current = stateRef.current;
      commit({
        ...current,
        profile: {
          ...profile,
          primaryWallet: account.verifiedWallet,
          updatedAt: new Date().toISOString(),
        },
      });
    },
    [account.verifiedWallet, commit],
  );

  const updateSettings = useCallback(
    (settings: Partial<GwapSettings>) => {
      const current = stateRef.current;
      commit({
        ...current,
        settings: { ...current.settings, ...settings },
      });
    },
    [commit],
  );

  const toggleFavorite = useCallback(
    (slug: string) => {
      const current = stateRef.current;
      const favorites = current.favorites.includes(slug)
        ? current.favorites.filter((item) => item !== slug)
        : [slug, ...current.favorites];
      commit({ ...current, favorites });
    },
    [commit],
  );

  const recordLaunch = useCallback(
    (slug: string) => {
      const current = stateRef.current;
      commit({
        ...current,
        recent: [
          { slug, openedAt: new Date().toISOString() },
          ...current.recent.filter((item) => item.slug !== slug),
        ].slice(0, 8),
      });
    },
    [commit],
  );

  const resetWorkspace = useCallback(() => {
    migrationRef.current = false;
    setMigrationAvailable(false);
    updateState(createDefaultGwapOsState());
    clearPendingState();
    if (timerRef.current) clearTimeout(timerRef.current);
    setSyncStatus("saving");
    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      const response = await authenticatedFetch("/api/os-state", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Workspace reset failed");
      setSyncStatus("saved");
    });
    saveQueueRef.current = operation;
    void operation.catch(() => setSyncStatus("error"));
  }, [authenticatedFetch, updateState]);

  const retrySync = useCallback(() => saveNow(stateRef.current), [saveNow]);

  const value = useMemo(
    () => ({
      account,
      keepAccountState,
      migrateLocalState,
      migrationAvailable,
      recordLaunch,
      resetWorkspace,
      retrySync,
      state,
      syncStatus,
      toggleFavorite,
      updateProfile,
      updateSettings,
    }),
    [
      account,
      keepAccountState,
      migrateLocalState,
      migrationAvailable,
      recordLaunch,
      resetWorkspace,
      retrySync,
      state,
      syncStatus,
      toggleFavorite,
      updateProfile,
      updateSettings,
    ],
  );

  return <OsContext.Provider value={value}>{children}</OsContext.Provider>;
}

export function useGwapOs() {
  const context = useContext(OsContext);
  if (!context) throw new Error("useGwapOs must be used inside GwapOsProvider");
  return context;
}
