import {
  GWAP_ENTRY_INTENTS,
  isGwapEntryIntent,
  type GwapEntryIntent,
} from "./entry-intent.ts";

export const GWAP_ACTIVATION_STORAGE_KEY = "gwap-activation-progress-v1";
export const GWAP_ACTIVATION_COOKIE_KEY = "gwap_activation_selection";

export type ActivationProgress = {
  intent: GwapEntryIntent;
  selectedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  resumedAt: string | null;
  baselineIdentityFound: boolean | null;
  baselineReputationScored: boolean | null;
  baselineReputationScore: number | null;
};

export function createActivationProgress(
  intent: GwapEntryIntent,
  selectedAt = new Date().toISOString(),
): ActivationProgress {
  return {
    intent,
    selectedAt,
    startedAt: null,
    completedAt: null,
    resumedAt: null,
    baselineIdentityFound: null,
    baselineReputationScored: null,
    baselineReputationScore: null,
  };
}

export function parseActivationProgress(value: unknown): ActivationProgress | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ActivationProgress>;
  if (!isGwapEntryIntent(typeof candidate.intent === "string" ? candidate.intent : null)) {
    return null;
  }
  if (
    typeof candidate.selectedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.selectedAt))
  ) {
    return null;
  }
  const safeDate = (date: unknown) =>
    typeof date === "string" && !Number.isNaN(Date.parse(date)) ? date : null;
  return {
    intent: candidate.intent,
    selectedAt: candidate.selectedAt,
    startedAt: safeDate(candidate.startedAt),
    completedAt: safeDate(candidate.completedAt),
    resumedAt: safeDate(candidate.resumedAt),
    baselineIdentityFound:
      typeof candidate.baselineIdentityFound === "boolean"
        ? candidate.baselineIdentityFound
        : null,
    baselineReputationScored:
      typeof candidate.baselineReputationScored === "boolean"
        ? candidate.baselineReputationScored
        : null,
    baselineReputationScore:
      typeof candidate.baselineReputationScore === "number" &&
      Number.isFinite(candidate.baselineReputationScore)
        ? candidate.baselineReputationScore
        : null,
  };
}

export function serializeActivationSelection(progress: Pick<ActivationProgress, "intent" | "selectedAt">) {
  return `${progress.intent}.${Date.parse(progress.selectedAt)}`;
}

export function parseActivationSelection(value: string | null | undefined) {
  if (!value) return null;
  const [intentValue, timestampValue, ...rest] = value.split(".");
  if (rest.length || !isGwapEntryIntent(intentValue || null)) return null;
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
  const selectedAt = new Date(timestamp).toISOString();
  return { intent: intentValue, selectedAt } as const;
}

export function isActivationStartPath(intent: GwapEntryIntent, pathname: string) {
  if (intent === "identity") {
    return pathname === "/app/identity" || pathname === "/app/profile";
  }
  if (intent === "transaction") {
    return pathname === "/app/ppv" || pathname.startsWith("/app/ppv/");
  }
  return pathname === GWAP_ENTRY_INTENTS[intent].actionHref;
}

export function isAfterSelection(timestamp: string | null | undefined, selectedAt: string) {
  if (!timestamp) return false;
  const value = Date.parse(timestamp);
  const selected = Date.parse(selectedAt);
  return !Number.isNaN(value) && !Number.isNaN(selected) && value >= selected;
}

export function activationElapsedBucket(selectedAt: string, completedAt: string) {
  const elapsed = Math.max(0, Date.parse(completedAt) - Date.parse(selectedAt));
  if (elapsed < 30_000) return "under_30s";
  if (elapsed < 120_000) return "30s_to_2m";
  if (elapsed < 300_000) return "2m_to_5m";
  return "5m_plus";
}

export function activationSurface(intent: GwapEntryIntent) {
  return {
    build: "idea_lab",
    validate: "daily_ideas",
    identity: "identity",
    reputation: "gwapscore",
    transaction: "ppv",
  }[intent];
}
