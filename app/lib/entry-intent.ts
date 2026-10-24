export const GWAP_ENTRY_INTENT_STORAGE_KEY = "gwap-entry-intent-v1";
export const GWAP_ENTRY_INTENT_COOKIE_KEY = "gwap_entry_intent";

export type GwapEntryIntent =
  | "build"
  | "validate"
  | "identity"
  | "reputation"
  | "transaction";

type GwapEntryIntentConfig = {
  label: string;
  dashboardTitle: string;
  dashboardDetail: string;
  actionHref: string;
  actionLabel: string;
  sourcePath: string;
};

export const GWAP_ENTRY_INTENTS = {
  build: {
    label: "Start a business or project",
    dashboardTitle: "Build something real",
    dashboardDetail:
      "Turn the idea into a structured project, define what matters first, and move toward an executable build plan.",
    actionHref: "/app/ideas/lab/start",
    actionLabel: "Start my project",
    sourcePath: "/app/ideas/lab",
  },
  validate: {
    label: "Develop and validate an idea",
    dashboardTitle: "Validate before you build",
    dashboardDetail:
      "Turn your idea into a focused validation project, define who has the problem, and test the riskiest assumption before committing time or money to execution.",
    actionHref: "/app/ideas/validate",
    actionLabel: "Validate my idea",
    sourcePath: "/app/ideas",
  },
  identity: {
    label: "Build my digital identity",
    dashboardTitle: "Own your digital identity",
    dashboardDetail:
      "Create a recognizable .gwap identity and strengthen the profile context that can travel across the GWAP ecosystem.",
    actionHref: "/app/identity",
    actionLabel: "Open Identity",
    sourcePath: "/app/identity",
  },
  reputation: {
    label: "Build my reputation",
    dashboardTitle: "Build verifiable credibility",
    dashboardDetail:
      "Review the social, identity, ecosystem, and eligible wallet signals that can strengthen your explainable GwapScore.",
    actionHref: "/app/score",
    actionLabel: "Open GwapScore",
    sourcePath: "/app/score",
  },
  transaction: {
    label: "Make or protect a transaction",
    dashboardTitle: "Protect the work when value moves",
    dashboardDetail:
      "Use Private Proof Vault for proofs, agreements, receipts, and protected transaction workflows when economic activity begins.",
    actionHref: "/app/ppv",
    actionLabel: "Open Private Proof Vault",
    sourcePath: "/app/ppv",
  },
} as const satisfies Record<GwapEntryIntent, GwapEntryIntentConfig>;

const intentBySourcePath = new Map<string, GwapEntryIntent>(
  Object.entries(GWAP_ENTRY_INTENTS).map(([intent, config]) => [
    config.sourcePath,
    intent as GwapEntryIntent,
  ]),
);

export function isGwapEntryIntent(value: string | null): value is GwapEntryIntent {
  return Boolean(value && value in GWAP_ENTRY_INTENTS);
}

export function getGwapEntryIntentForPath(pathname: string) {
  return intentBySourcePath.get(pathname) ?? null;
}
