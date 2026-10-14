import {
  GWAP_ENTRY_INTENTS,
  isGwapEntryIntent,
  type GwapEntryIntent,
} from "./entry-intent.ts";

export const GWAP_ACTIVATION_STORAGE_KEY = "gwap-activation-progress-v1";
export const GWAP_ACTIVATION_COOKIE_KEY = "gwap_activation_selection";
export const GWAP_ACTIVATION_SIGNAL_COOKIE_KEY = "gwap_activation_signal";
export const GWAP_ACTIVATION_SELECTED_EVENT = "gwap:activation-selected";

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

export type ActivationSignalKind = "resumed" | "completed";
export type ActivationMilestone =
  | "existing_project"
  | "existing_validation_project"
  | "existing_identity"
  | "existing_reputation"
  | "existing_social_verification"
  | "existing_verified_activity"
  | "project_created"
  | "validation_started"
  | "identity_established"
  | "identity_strengthened"
  | "reputation_scored"
  | "proof_of_control_verified"
  | "verified_transaction_activity";

export type ActivationSignal = {
  kind: ActivationSignalKind;
  intent: GwapEntryIntent;
  milestone: ActivationMilestone;
  occurredAt: string;
};

const ACTIVATION_MILESTONES_BY_INTENT = {
  build: ["existing_project", "project_created"],
  validate: ["existing_validation_project", "validation_started"],
  identity: ["existing_identity", "identity_established", "identity_strengthened"],
  reputation: [
    "existing_reputation",
    "existing_social_verification",
    "reputation_scored",
    "proof_of_control_verified",
  ],
  transaction: ["existing_verified_activity", "verified_transaction_activity"],
} as const satisfies Record<GwapEntryIntent, readonly ActivationMilestone[]>;

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
  const intent = typeof candidate.intent === "string" ? candidate.intent : null;
  if (!isGwapEntryIntent(intent)) return null;
  if (
    typeof candidate.selectedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.selectedAt))
  ) {
    return null;
  }
  const safeDate = (date: unknown) =>
    typeof date === "string" && !Number.isNaN(Date.parse(date)) ? date : null;
  return {
    intent,
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

export function serializeActivationSelection(
  progress: Pick<ActivationProgress, "intent" | "selectedAt">,
) {
  return `${progress.intent}.${Date.parse(progress.selectedAt)}`;
}

export function parseActivationSelection(value: string | null | undefined) {
  if (!value) return null;
  const [intentValue, timestampValue, ...rest] = value.split(".");
  const intent = intentValue || null;
  if (rest.length || !isGwapEntryIntent(intent)) return null;
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
  const selectedAt = new Date(timestamp).toISOString();
  return { intent, selectedAt } as const;
}

export function chooseActivationProgress(
  stored: ActivationProgress | null,
  selection: ReturnType<typeof parseActivationSelection>,
) {
  if (!selection) return stored;
  if (!stored) return createActivationProgress(selection.intent, selection.selectedAt);

  const selectedAt = Date.parse(selection.selectedAt);
  const storedAt = Date.parse(stored.selectedAt);
  if (selection.intent !== stored.intent || selectedAt > storedAt) {
    return createActivationProgress(selection.intent, selection.selectedAt);
  }
  return stored;
}

export function serializeActivationSignal(signal: ActivationSignal) {
  return [
    signal.kind,
    signal.intent,
    signal.milestone,
    Date.parse(signal.occurredAt),
  ].join(".");
}

export function parseActivationSignal(value: string | null | undefined): ActivationSignal | null {
  if (!value) return null;
  const [kindValue, intentValue, milestoneValue, timestampValue, ...rest] = value.split(".");
  if (rest.length) return null;
  if (kindValue !== "resumed" && kindValue !== "completed") return null;
  if (!isGwapEntryIntent(intentValue || null)) return null;
  const intent = intentValue as GwapEntryIntent;
  const milestones = ACTIVATION_MILESTONES_BY_INTENT[intent] as readonly string[];
  if (!milestoneValue || !milestones.includes(milestoneValue)) return null;
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
  return {
    kind: kindValue,
    intent,
    milestone: milestoneValue as ActivationMilestone,
    occurredAt: new Date(timestamp).toISOString(),
  };
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
