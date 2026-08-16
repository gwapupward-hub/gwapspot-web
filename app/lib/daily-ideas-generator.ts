import "server-only";

import {
  dailyIdeaCategoryLabel,
  dailyIdeaFocusInstruction,
  isDuplicateDailyIdea,
  parseDailyIdeaCategory,
  parseGeneratedDailyIdea,
  type DailyIdeaCategory,
  type DailyIdeaFocus,
  type GeneratedDailyIdea,
} from "./daily-ideas-core";

export {
  dailyIdeaCategories,
  parseDailyIdeaCategory,
  type DailyIdeaCategory,
  type GeneratedDailyIdea,
} from "./daily-ideas-core";

const DEFAULT_DAILY_IDEAS_MODEL = "claude-sonnet-4-6";
const MAX_GENERATION_ATTEMPTS = 2;

export class DailyIdeasConfigurationError extends Error {}
export class DailyIdeasProviderError extends Error {}

export type DailyIdeaGenerationResult = {
  idea: GeneratedDailyIdea;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  attempts: number;
};

export function getDailyIdeasConfiguration() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const configuredModel = process.env.DAILY_IDEAS_MODEL?.trim();

  return {
    apiKey,
    configured: Boolean(apiKey),
    model: configuredModel || DEFAULT_DAILY_IDEAS_MODEL,
    modelSource: configuredModel ? ("environment" as const) : ("default" as const),
  };
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new DailyIdeasProviderError("No JSON object returned");
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new DailyIdeasProviderError("Invalid JSON returned");
  }
}

function systemPrompt() {
  return [
    "You are the Daily Ideas Intelligence Engine for the GWAP ecosystem.",
    "Discover realistic opportunities and transform inspiration into execution.",
    "Identify a real problem, inefficiency, unmet demand, emerging behavior, technology shift, or business opportunity.",
    "Produce an executable idea with an identifiable user, clear business model, smallest realistic MVP, risks, validation steps, and first action.",
    "Avoid generic startup clichés, invented statistics, hype, investment promises, and tokenization without practical utility.",
    "Do not assume AI or blockchain is necessary unless it materially improves the solution.",
    "Return one JSON object only. Do not use markdown.",
    "Daily Ideas follows: Idea → Grind → Purpose → Execution.",
  ].join(" ");
}

function userPrompt(
  category: DailyIdeaCategory,
  recentIdeas: GeneratedDailyIdea[],
  retry: boolean,
  focus: DailyIdeaFocus | null,
) {
  const recentTitles = recentIdeas.slice(0, 20).map((idea) => idea.title);
  return [
    `Generate one high-quality ${dailyIdeaCategoryLabel(category)} idea.`,
    dailyIdeaFocusInstruction(focus),
    retry ? "The prior response was invalid or too similar. Produce a materially different complete idea." : "",
    recentTitles.length ? `Do not repeat or closely paraphrase these recent ideas: ${recentTitles.join(" | ")}.` : "",
    "Use exactly this JSON shape:",
    JSON.stringify({
      title: "",
      summary: "",
      problem: "",
      solution: "",
      targetAudience: [],
      whyNow: "",
      category,
      tags: [],
      monetization: [],
      mvpFeatures: [],
      difficulty: "Starter|Intermediate|Advanced",
      estimatedStartupCost: "",
      estimatedBuildScope: "",
      opportunityScore: 0,
      risks: [],
      validationSteps: [],
      firstAction: "",
    }),
    "Keep prose concise, specific, and actionable. opportunityScore must be a number from 0 to 10.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function requestProvider(
  apiKey: string,
  model: string,
  category: DailyIdeaCategory,
  recentIdeas: GeneratedDailyIdea[],
  retry: boolean,
  focus: DailyIdeaFocus | null,
) {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1_800,
        temperature: 0.85,
        system: systemPrompt(),
        messages: [{ role: "user", content: userPrompt(category, recentIdeas, retry, focus) }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new DailyIdeasProviderError("AI provider request failed");
  }

  if (!response.ok) throw new DailyIdeasProviderError(`AI provider returned ${response.status}`);
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const responseText = payload.content?.find((item) => item.type === "text")?.text;
  if (!responseText) throw new DailyIdeasProviderError("AI response was empty");

  return {
    value: extractJson(responseText),
    usage: {
      inputTokens: Number(payload.usage?.input_tokens) || 0,
      outputTokens: Number(payload.usage?.output_tokens) || 0,
    },
  };
}

export async function generateDailyIdeaWithMetadata(
  categoryInput: unknown,
  recentIdeas: GeneratedDailyIdea[] = [],
  generationId = crypto.randomUUID(),
  focus: DailyIdeaFocus | null = null,
): Promise<DailyIdeaGenerationResult> {
  const { apiKey, model } = getDailyIdeasConfiguration();
  if (!apiKey) {
    throw new DailyIdeasConfigurationError("Daily Ideas AI is not configured: ANTHROPIC_API_KEY is missing.");
  }

  const category = parseDailyIdeaCategory(categoryInput);
  let lastValidationError = "AI response was incomplete";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const provider = await requestProvider(apiKey, model, category, recentIdeas, attempt > 1, focus);
    const idea = parseGeneratedDailyIdea(provider.value, {
      id: generationId,
      requestedCategory: category,
      generatedAt: new Date().toISOString(),
    });

    if (!idea) {
      lastValidationError = "AI response failed structured validation";
      continue;
    }
    if (isDuplicateDailyIdea(idea, recentIdeas)) {
      lastValidationError = "AI response duplicated a recent idea";
      continue;
    }

    return { idea, model, usage: provider.usage, attempts: attempt };
  }

  throw new DailyIdeasProviderError(lastValidationError);
}

export async function generateDailyIdea(categoryInput: unknown): Promise<GeneratedDailyIdea> {
  return (await generateDailyIdeaWithMetadata(categoryInput)).idea;
}
