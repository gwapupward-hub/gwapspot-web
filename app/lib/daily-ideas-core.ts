export const dailyIdeaCategories = [
  "ai",
  "solana",
  "web3",
  "saas",
  "developer-tools",
  "fintech",
  "creator-economy",
  "music",
  "commerce",
  "local-business",
  "automation",
  "productivity",
  "consumer-apps",
  "b2b",
  "education",
  "community",
  "general",
  "gwap-ecosystem",
] as const;

export type DailyIdeaCategory = (typeof dailyIdeaCategories)[number];
export type DailyIdeaMode = "idea" | "daily" | "discover";
export const dailyIdeaFocuses = [
  "high-opportunity",
  "easy-to-build",
  "low-cost",
  "startup",
  "b2b",
  "ai",
  "web3",
  "random",
] as const;
export type DailyIdeaFocus = (typeof dailyIdeaFocuses)[number];
export type DailyIdeaDifficulty = "Starter" | "Intermediate" | "Advanced";
export type DailyIdeaStatus =
  | "generated"
  | "saved"
  | "developing"
  | "validating"
  | "building"
  | "launched"
  | "archived";

export type GeneratedDailyIdea = {
  id: string;
  title: string;
  summary: string;
  problem: string;
  solution: string;
  targetAudience: string[];
  whyNow: string;
  category: DailyIdeaCategory;
  tags: string[];
  monetization: string[];
  mvpFeatures: string[];
  difficulty: DailyIdeaDifficulty;
  estimatedStartupCost: string;
  estimatedBuildScope: string;
  opportunityScore: number;
  risks: string[];
  validationSteps: string[];
  firstAction: string;
  creatorType: "ai";
  source: "ai";
  generatedAt: string;
  createdBy: "daily-ideas-engine";
  status: DailyIdeaStatus;
  /** Backward-compatible alias for the current GWAP OS Idea Lab. */
  opportunity: string;
};

export type DailyIdeaGenerationContext = {
  id: string;
  requestedCategory: DailyIdeaCategory;
  generatedAt: string;
};

const categoryAliases: Record<string, DailyIdeaCategory> = {
  "ai & agents": "ai",
  "ai-agents": "ai",
  creator: "creator-economy",
  "creator-economy": "creator-economy",
  local: "local-business",
  "local-business": "local-business",
  devtools: "developer-tools",
  "developer-tools": "developer-tools",
  consumer: "consumer-apps",
  "consumer-apps": "consumer-apps",
  random: "general",
  anything: "general",
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function textList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

export function parseDailyIdeaCategory(value: unknown): DailyIdeaCategory {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (dailyIdeaCategories.includes(normalized as DailyIdeaCategory)) {
    return normalized as DailyIdeaCategory;
  }
  return categoryAliases[normalized] || "general";
}

export function parseDailyIdeaMode(value: unknown): DailyIdeaMode {
  return value === "daily" || value === "discover" ? value : "idea";
}

export function parseDailyIdeaFocus(value: unknown): DailyIdeaFocus | null {
  return dailyIdeaFocuses.includes(value as DailyIdeaFocus) ? (value as DailyIdeaFocus) : null;
}

export function dailyIdeaFocusInstruction(focus: DailyIdeaFocus | null) {
  const instructions: Record<DailyIdeaFocus, string> = {
    "high-opportunity": "Favor a strong, timely problem with a credible path to demand.",
    "easy-to-build": "Keep the MVP realistic for one builder to prototype in a weekend.",
    "low-cost": "Keep validation and the first MVP inexpensive, with no large upfront inventory or licensing cost.",
    startup: "Frame the opportunity as a focused startup with a repeatable revenue model.",
    b2b: "The paying customer must be a clearly defined business buyer.",
    ai: "Use AI only where it creates a concrete product advantage.",
    web3: "Use Web3 only for practical utility, not tokenization for its own sake.",
    random: "Favor useful novelty outside overused startup patterns.",
  };
  return focus ? instructions[focus] : "";
}

export function dailyIdeaCategoryLabel(category: DailyIdeaCategory) {
  const labels: Record<DailyIdeaCategory, string> = {
    ai: "AI & Agents",
    solana: "Solana",
    web3: "Web3",
    saas: "SaaS",
    "developer-tools": "Developer Tools",
    fintech: "FinTech",
    "creator-economy": "Creator Economy",
    music: "Music",
    commerce: "Commerce",
    "local-business": "Local Business",
    automation: "Automation",
    productivity: "Productivity",
    "consumer-apps": "Consumer Apps",
    b2b: "B2B",
    education: "Education",
    community: "Community",
    general: "General Opportunities",
    "gwap-ecosystem": "GWAP Ecosystem",
  };
  return labels[category];
}

export function parseGeneratedDailyIdea(
  value: unknown,
  context: DailyIdeaGenerationContext,
): GeneratedDailyIdea | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = text(input.title, 120);
  const summary = text(input.summary, 480);
  const problem = text(input.problem, 600);
  const solution = text(input.solution, 600);
  const targetAudience = textList(input.targetAudience, 6, 120);
  const whyNow = text(input.whyNow, 600);
  const monetization = textList(input.monetization, 6, 160);
  const mvpFeatures = textList(input.mvpFeatures, 8, 160);
  const estimatedStartupCost = text(input.estimatedStartupCost, 160);
  const estimatedBuildScope = text(input.estimatedBuildScope, 240);
  const risks = textList(input.risks, 6, 180);
  const validationSteps = textList(input.validationSteps, 8, 180);
  const firstAction = text(input.firstAction, 240);

  if (
    !title ||
    !summary ||
    !problem ||
    !solution ||
    !whyNow ||
    !estimatedStartupCost ||
    !estimatedBuildScope ||
    !firstAction ||
    targetAudience.length === 0 ||
    monetization.length === 0 ||
    mvpFeatures.length === 0 ||
    risks.length === 0 ||
    validationSteps.length === 0
  ) {
    return null;
  }

  const difficulty: DailyIdeaDifficulty = ["Starter", "Intermediate", "Advanced"].includes(
    String(input.difficulty),
  )
    ? (input.difficulty as DailyIdeaDifficulty)
    : "Intermediate";
  const rawScore = typeof input.opportunityScore === "number" ? input.opportunityScore : Number(input.opportunityScore);
  if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 10) return null;

  const suppliedCategory = parseDailyIdeaCategory(input.category);
  const category = context.requestedCategory === "general" ? suppliedCategory : context.requestedCategory;

  return {
    id: context.id,
    title,
    summary,
    problem,
    solution,
    targetAudience,
    whyNow,
    category,
    tags: textList(input.tags, 8, 40),
    monetization,
    mvpFeatures,
    difficulty,
    estimatedStartupCost,
    estimatedBuildScope,
    opportunityScore: Math.round(rawScore * 10) / 10,
    risks,
    validationSteps,
    firstAction,
    creatorType: "ai",
    source: "ai",
    generatedAt: context.generatedAt,
    createdBy: "daily-ideas-engine",
    status: "generated",
    opportunity: whyNow,
  };
}

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((token) => token.length > 2),
  );
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function dailyIdeaSimilarity(left: GeneratedDailyIdea, right: GeneratedDailyIdea) {
  const leftTitle = tokens(left.title);
  const rightTitle = tokens(right.title);
  const leftBody = tokens(`${left.title} ${left.summary} ${left.tags.join(" ")}`);
  const rightBody = tokens(`${right.title} ${right.summary} ${right.tags.join(" ")}`);
  return Math.max(jaccard(leftTitle, rightTitle), jaccard(leftBody, rightBody));
}

export function isDuplicateDailyIdea(
  candidate: GeneratedDailyIdea,
  existing: GeneratedDailyIdea[],
  threshold = 0.72,
) {
  const normalizedTitle = candidate.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  return existing.some((idea) => {
    const existingTitle = idea.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalizedTitle === existingTitle || dailyIdeaSimilarity(candidate, idea) >= threshold;
  });
}

export function selectReusableDailyIdea(
  inventory: GeneratedDailyIdea[],
  deliveredIds: ReadonlySet<string>,
) {
  return inventory.find((idea) => idea.status !== "archived" && !deliveredIds.has(idea.id)) || null;
}
