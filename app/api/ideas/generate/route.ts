import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";

export const runtime = "nodejs";

const categories = ["web3", "saas", "ai", "general"] as const;
type IdeaCategory = (typeof categories)[number];

function parseCategory(value: unknown): IdeaCategory {
  return categories.includes(value as IdeaCategory) ? (value as IdeaCategory) : "general";
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object returned");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!isWalletAuthConfigured()) return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const rate = await checkRateLimit(`ideas-generate:${identity.userId}`, 8, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Idea generation limit reached. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Daily Ideas AI is not configured yet." }, { status: 503 });

  try {
    const body = (await request.json()) as { category?: unknown };
    const category = parseCategory(body.category);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.DAILY_IDEAS_MODEL || "claude-sonnet-4-5",
        max_tokens: 700,
        temperature: 0.9,
        system: "You are Daily Ideas inside GWAP OS. Generate practical, specific opportunities that a solo founder or small team could realistically validate. Avoid hype, fake metrics, investment promises, and generic startup filler. Return JSON only.",
        messages: [{
          role: "user",
          content: `Generate one ${category} idea. Return exactly this JSON shape: {"title":"...","summary":"...","problem":"...","opportunity":"...","difficulty":"Starter|Intermediate|Advanced"}. Keep each prose field concise and actionable.`,
        }],
      }),
    });

    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = payload.content?.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("AI response was empty");
    const idea = extractJson(text);

    const title = typeof idea.title === "string" ? idea.title.trim().slice(0, 120) : "";
    const summary = typeof idea.summary === "string" ? idea.summary.trim().slice(0, 480) : "";
    const problem = typeof idea.problem === "string" ? idea.problem.trim().slice(0, 480) : "";
    const opportunity = typeof idea.opportunity === "string" ? idea.opportunity.trim().slice(0, 480) : "";
    const difficulty = ["Starter", "Intermediate", "Advanced"].includes(String(idea.difficulty)) ? idea.difficulty : "Intermediate";
    if (!title || !summary || !problem || !opportunity) throw new Error("AI response was incomplete");

    return NextResponse.json({
      idea: {
        id: crypto.randomUUID(),
        title,
        category,
        summary,
        problem,
        opportunity,
        difficulty,
      },
    });
  } catch {
    return NextResponse.json({ error: "Daily Ideas could not generate an idea right now." }, { status: 502 });
  }
}
