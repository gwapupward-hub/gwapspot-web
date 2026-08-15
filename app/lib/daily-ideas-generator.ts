import "server-only";

export const dailyIdeaCategories = ["web3", "saas", "ai", "general"] as const;
export type DailyIdeaCategory = (typeof dailyIdeaCategories)[number];
export type GeneratedDailyIdea = {
  id: string;
  title: string;
  category: DailyIdeaCategory;
  summary: string;
  problem: string;
  opportunity: string;
  difficulty: "Starter" | "Intermediate" | "Advanced";
};

const DEFAULT_DAILY_IDEAS_MODEL = "claude-sonnet-4-6";

export class DailyIdeasConfigurationError extends Error {}
export class DailyIdeasProviderError extends Error {}

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

export function parseDailyIdeaCategory(value: unknown): DailyIdeaCategory {
  return dailyIdeaCategories.includes(value as DailyIdeaCategory)
    ? (value as DailyIdeaCategory)
    : "general";
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

export async function generateDailyIdea(categoryInput: unknown): Promise<GeneratedDailyIdea> {
  const { apiKey, model } = getDailyIdeasConfiguration();
  if (!apiKey) {
    throw new DailyIdeasConfigurationError("Daily Ideas AI is not configured: ANTHROPIC_API_KEY is missing.");
  }

  const category = parseDailyIdeaCategory(categoryInput);
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
        max_tokens: 700,
        temperature: 0.9,
        system:
          "You are Daily Ideas inside GWAP OS. Generate practical, specific opportunities that a solo founder or small team could realistically validate. Avoid hype, fake metrics, investment promises, and generic startup filler. Return JSON only.",
        messages: [
          {
            role: "user",
            content: `Generate one ${category} idea. Return exactly this JSON shape: {"title":"...","summary":"...","problem":"...","opportunity":"...","difficulty":"Starter|Intermediate|Advanced"}. Keep each prose field concise and actionable.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new DailyIdeasProviderError("AI provider request failed");
  }

  if (!response.ok) throw new DailyIdeasProviderError(`AI provider returned ${response.status}`);
  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new DailyIdeasProviderError("AI response was empty");

  const idea = extractJson(text);
  const title = typeof idea.title === "string" ? idea.title.trim().slice(0, 120) : "";
  const summary = typeof idea.summary === "string" ? idea.summary.trim().slice(0, 480) : "";
  const problem = typeof idea.problem === "string" ? idea.problem.trim().slice(0, 480) : "";
  const opportunity = typeof idea.opportunity === "string" ? idea.opportunity.trim().slice(0, 480) : "";
  const difficulty: GeneratedDailyIdea["difficulty"] = ["Starter", "Intermediate", "Advanced"].includes(String(idea.difficulty))
    ? (idea.difficulty as GeneratedDailyIdea["difficulty"])
    : "Intermediate";

  if (!title || !summary || !problem || !opportunity) {
    throw new DailyIdeasProviderError("AI response was incomplete");
  }

  return {
    id: crypto.randomUUID(),
    title,
    category,
    summary,
    problem,
    opportunity,
    difficulty,
  };
}
