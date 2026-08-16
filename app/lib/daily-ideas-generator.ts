import "server-only";

import {
  dailyIdeaCategoryLabel,
  dailyIdeaFocusInstruction,
  isDuplicateDailyIdea,
  parseDailyIdeaCategory,
  parseGeneratedDailyIdea,
  resolveDailyIdeasProvider,
  type DailyIdeaCategory,
  type DailyIdeaFocus,
  type DailyIdeasProvider,
  type GeneratedDailyIdea,
} from "./daily-ideas-core";

export {
  dailyIdeaCategories,
  parseDailyIdeaCategory,
  type DailyIdeaCategory,
  type GeneratedDailyIdea,
} from "./daily-ideas-core";

const MAX_GENERATION_ATTEMPTS = 2;

export class DailyIdeasConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyIdeasConfigurationError";
  }
}

export class DailyIdeasProviderError extends Error {
  readonly providerStatus: number | null;
  readonly providerCode: string | null;

  constructor(
    message: string,
    options: { providerStatus?: number | null; providerCode?: string | null } = {},
  ) {
    super(message);
    this.name = "DailyIdeasProviderError";
    this.providerStatus = options.providerStatus ?? null;
    this.providerCode = options.providerCode ?? null;
  }
}

class DailyIdeasOutputError extends DailyIdeasProviderError {
  constructor(message: string) {
    super(message);
    this.name = "DailyIdeasOutputError";
  }
}

export type DailyIdeaGenerationResult = {
  idea: GeneratedDailyIdea;
  provider: DailyIdeasProvider;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  attempts: number;
};

export function getDailyIdeasConfiguration() {
  return resolveDailyIdeasProvider({
    openAiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    configuredModel: process.env.DAILY_IDEAS_MODEL,
  });
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new DailyIdeasOutputError("No JSON object returned");
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new DailyIdeasOutputError("Invalid JSON returned");
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

const DAILY_IDEA_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "problem",
    "solution",
    "targetAudience",
    "whyNow",
    "category",
    "tags",
    "monetization",
    "mvpFeatures",
    "difficulty",
    "estimatedStartupCost",
    "estimatedBuildScope",
    "opportunityScore",
    "risks",
    "validationSteps",
    "firstAction",
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    problem: { type: "string" },
    solution: { type: "string" },
    targetAudience: { type: "array", items: { type: "string" } },
    whyNow: { type: "string" },
    category: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    monetization: { type: "array", items: { type: "string" } },
    mvpFeatures: { type: "array", items: { type: "string" } },
    difficulty: { type: "string", enum: ["Starter", "Intermediate", "Advanced"] },
    estimatedStartupCost: { type: "string" },
    estimatedBuildScope: { type: "string" },
    opportunityScore: { type: "number", minimum: 0, maximum: 10 },
    risks: { type: "array", items: { type: "string" } },
    validationSteps: { type: "array", items: { type: "string" } },
    firstAction: { type: "string" },
  },
} as const;

function extractOpenAIResponseText(payload: {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const output of payload.output || []) {
    const text = output.content?.find((item) => item.type === "output_text" && typeof item.text === "string")?.text;
    if (typeof text === "string" && text.trim()) return text;
  }
  return "";
}

function normalizeProviderCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().slice(0, 80);
  return code && /^[A-Za-z0-9_.:-]+$/.test(code) ? code : null;
}

async function buildProviderHttpError(response: Response) {
  let providerCode: string | null = null;
  try {
    const payload = (await response.clone().json()) as {
      error?: { code?: unknown; type?: unknown };
    };
    providerCode = normalizeProviderCode(payload.error?.code) ?? normalizeProviderCode(payload.error?.type);
  } catch {
    // Never log or surface raw provider response bodies.
  }
  return new DailyIdeasProviderError(`AI provider returned ${response.status}`, {
    providerStatus: response.status,
    providerCode,
  });
}

async function requestProvider(
  provider: DailyIdeasProvider,
  apiKey: string,
  model: string,
  category: DailyIdeaCategory,
  recentIdeas: GeneratedDailyIdea[],
  retry: boolean,
  focus: DailyIdeaFocus | null,
) {
  let response: Response;
  try {
    response = provider === "openai"
      ? await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            store: false,
            instructions: systemPrompt(),
            input: userPrompt(category, recentIdeas, retry, focus),
            max_output_tokens: 2_500,
            text: {
              format: {
                type: "json_schema",
                name: "daily_idea",
                strict: true,
                schema: DAILY_IDEA_RESPONSE_SCHEMA,
              },
            },
          }),
          signal: AbortSignal.timeout(25_000),
        })
      : await fetch("https://api.anthropic.com/v1/messages", {
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

  if (!response.ok) throw await buildProviderHttpError(response);
  const payload = (await response.json()) as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const responseText = provider === "openai"
    ? extractOpenAIResponseText(payload)
    : payload.content?.find((item) => item.type === "text")?.text;
  if (!responseText) throw new DailyIdeasOutputError("AI response was empty");

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
  const { apiKey, model, provider: providerName } = getDailyIdeasConfiguration();
  if (!apiKey || !providerName) {
    throw new DailyIdeasConfigurationError(
      "Daily Ideas AI is not configured: OPENAI_API_KEY or ANTHROPIC_API_KEY is required.",
    );
  }

  const category = parseDailyIdeaCategory(categoryInput);
  let lastValidationError = "AI response was incomplete";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let providerResponse: Awaited<ReturnType<typeof requestProvider>>;
    try {
      providerResponse = await requestProvider(
        providerName,
        apiKey,
        model,
        category,
        recentIdeas,
        attempt > 1,
        focus,
      );
    } catch (error) {
      if (error instanceof DailyIdeasOutputError) {
        lastValidationError = error.message;
        continue;
      }
      throw error;
    }
    const idea = parseGeneratedDailyIdea(providerResponse.value, {
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

    return { idea, provider: providerName, model, usage: providerResponse.usage, attempts: attempt };
  }

  throw new DailyIdeasProviderError(lastValidationError);
}

export async function generateDailyIdea(categoryInput: unknown): Promise<GeneratedDailyIdea> {
  return (await generateDailyIdeaWithMetadata(categoryInput)).idea;
}
