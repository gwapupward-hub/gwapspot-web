import "server-only";

import {
  DailyIdeasConfigurationError,
  DailyIdeasProviderError,
  getDailyIdeasConfiguration,
} from "./daily-ideas-generator";
import type { DailyIdeaProject } from "./daily-ideas-projects";

export const dailyIdeasLabModules = [
  "problemDefinition",
  "targetCustomer",
  "marketHypothesis",
  "businessModel",
  "validationPlan",
  "mvpFeatures",
  "technicalArchitecture",
  "estimatedCost",
  "buildRoadmap",
  "goToMarket",
  "risks",
  "firstAction",
] as const;

export type DailyIdeasLabModule = (typeof dailyIdeasLabModules)[number];

export type DailyIdeasModuleAssist = {
  mode: "module";
  module: DailyIdeasLabModule;
  draft: string;
  why: string;
  checkpoints: string[];
  nextQuestion: string;
};

export type DailyIdeasProjectReview = {
  mode: "review";
  readinessScore: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  nextAction: string;
  validationPriority: string;
  evidenceNeeded: string[];
  marketplaceBrief: string;
  developerBrief: string;
};

const moduleLabels: Record<DailyIdeasLabModule, string> = {
  problemDefinition: "Problem",
  targetCustomer: "Customer",
  marketHypothesis: "Opportunity",
  businessModel: "Business Model",
  validationPlan: "Validation",
  mvpFeatures: "MVP",
  technicalArchitecture: "Architecture",
  estimatedCost: "Budget",
  buildRoadmap: "Roadmap",
  goToMarket: "Go-To-Market",
  risks: "Risks",
  firstAction: "Next Move",
};

const moduleInstructions: Record<DailyIdeasLabModule, string> = {
  problemDefinition: "Define one precise problem, who experiences it, and the costly or frustrating consequence. Avoid describing the solution.",
  targetCustomer: "Describe the narrowest realistic first customer segment, including context and why the problem matters to them.",
  marketHypothesis: "State the demand hypothesis that still needs evidence. Do not invent market size, growth rates, or adoption statistics.",
  businessModel: "Describe the simplest credible way this project creates and captures value. Keep pricing assumptions explicitly provisional.",
  validationPlan: "Return a short practical validation plan, one experiment per line, ordered from cheapest evidence to stronger evidence.",
  mvpFeatures: "Return only the essential MVP capabilities, one per line. Remove nice-to-have features.",
  technicalArchitecture: "Describe the smallest implementation architecture that can deliver the MVP, including major services, data, integrations, and security concerns where relevant.",
  estimatedCost: "Give a bounded planning estimate with major cost drivers and assumptions. Avoid false precision and do not present uncertain costs as facts.",
  buildRoadmap: "Return an ordered build roadmap, one milestone per line, starting with the smallest testable increment.",
  goToMarket: "Describe how to reach the first credible users before scaling acquisition. Prioritize direct channels and design partners where appropriate.",
  risks: "Return the most material product, market, execution, technical, legal, or trust risks, one per line. Do not pad the list.",
  firstAction: "Return one concrete action that can be completed next and produces information or progress. Keep it specific and small.",
};

const MODULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["draft", "why", "checkpoints", "nextQuestion"],
  properties: {
    draft: { type: "string" },
    why: { type: "string" },
    checkpoints: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
    nextQuestion: { type: "string" },
  },
} as const;

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "readinessScore",
    "verdict",
    "strengths",
    "gaps",
    "nextAction",
    "validationPriority",
    "evidenceNeeded",
    "marketplaceBrief",
    "developerBrief",
  ],
  properties: {
    readinessScore: { type: "number", minimum: 0, maximum: 100 },
    verdict: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
    gaps: { type: "array", items: { type: "string" }, maxItems: 5 },
    nextAction: { type: "string" },
    validationPriority: { type: "string" },
    evidenceNeeded: { type: "array", items: { type: "string" }, maxItems: 5 },
    marketplaceBrief: { type: "string" },
    developerBrief: { type: "string" },
  },
} as const;

type JsonSchema = typeof MODULE_SCHEMA | typeof REVIEW_SCHEMA;

function systemPrompt() {
  return [
    "You are the Idea Lab execution coach inside the GWAP Daily Ideas system.",
    "Your job is to make an existing project more executable, not to replace the founder's judgment.",
    "Use only the project information provided in the request.",
    "Do not invent statistics, customers, traction, competitors, legal conclusions, market research, or technical facts that are not in the project.",
    "When evidence is missing, identify what should be validated instead of pretending it is known.",
    "Prefer the smallest realistic experiment, MVP, or next action.",
    "Keep recommendations concise, specific, and useful to a first-time founder.",
    "Return one JSON object only. Do not use markdown.",
  ].join(" ");
}

function projectContext(project: DailyIdeaProject) {
  return JSON.stringify({
    title: project.title,
    summary: project.summary,
    category: project.category,
    status: project.status,
    problemDefinition: project.problemDefinition,
    targetCustomer: project.targetCustomer,
    marketHypothesis: project.marketHypothesis,
    businessModel: project.businessModel,
    validationPlan: project.validationPlan,
    mvpFeatures: project.mvpFeatures,
    technicalArchitecture: project.technicalArchitecture,
    estimatedCost: project.estimatedCost,
    buildRoadmap: project.buildRoadmap,
    goToMarket: project.goToMarket,
    risks: project.risks,
    firstAction: project.firstAction,
  });
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new DailyIdeasProviderError("AI response did not contain structured output");
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new DailyIdeasProviderError("AI response could not be parsed");
  }
}

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

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function boundedList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

async function requestStructuredOutput(input: string, schema: JsonSchema, schemaName: string, maxOutputTokens: number) {
  const configuration = getDailyIdeasConfiguration();
  if (!configuration.apiKey || !configuration.provider) {
    throw new DailyIdeasConfigurationError(
      "Daily Ideas AI is not configured: OPENAI_API_KEY or ANTHROPIC_API_KEY is required.",
    );
  }

  let response: Response;
  try {
    response = configuration.provider === "openai"
      ? await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${configuration.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: configuration.model,
            store: false,
            instructions: systemPrompt(),
            input,
            max_output_tokens: maxOutputTokens,
            text: {
              format: {
                type: "json_schema",
                name: schemaName,
                strict: true,
                schema,
              },
            },
          }),
          signal: AbortSignal.timeout(25_000),
        })
      : await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": configuration.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: configuration.model,
            max_tokens: maxOutputTokens,
            temperature: 0.35,
            system: systemPrompt(),
            messages: [{ role: "user", content: input }],
          }),
          signal: AbortSignal.timeout(25_000),
        });
  } catch {
    throw new DailyIdeasProviderError("AI provider request failed");
  }

  if (!response.ok) {
    throw new DailyIdeasProviderError(`AI provider returned ${response.status}`, {
      providerStatus: response.status,
    });
  }

  const payload = (await response.json()) as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = configuration.provider === "openai"
    ? extractOpenAIResponseText(payload)
    : payload.content?.find((item) => item.type === "text")?.text || "";
  if (!text) throw new DailyIdeasProviderError("AI response was empty");
  return extractJson(text);
}

export function isDailyIdeasLabModule(value: unknown): value is DailyIdeasLabModule {
  return typeof value === "string" && (dailyIdeasLabModules as readonly string[]).includes(value);
}

export async function assistDailyIdeasModule(project: DailyIdeaProject, module: DailyIdeasLabModule): Promise<DailyIdeasModuleAssist> {
  const payload = await requestStructuredOutput([
    `Project: ${projectContext(project)}`,
    `Active module: ${moduleLabels[module]}`,
    moduleInstructions[module],
    "Draft an improved answer using only the project context. If the module is naturally a list, put one item per line in draft.",
    "checkpoints should be 2-4 short criteria the founder can use to judge the draft.",
    "nextQuestion should be the single most useful question to answer after this draft.",
  ].join("\n\n"), MODULE_SCHEMA, "idea_lab_module_assist", 1_200);

  const draft = boundedText(payload.draft, 3_200);
  if (!draft) throw new DailyIdeasProviderError("AI module draft was empty");
  return {
    mode: "module",
    module,
    draft,
    why: boundedText(payload.why, 600),
    checkpoints: boundedList(payload.checkpoints, 4, 220),
    nextQuestion: boundedText(payload.nextQuestion, 500),
  };
}

export async function reviewDailyIdeasProject(project: DailyIdeaProject): Promise<DailyIdeasProjectReview> {
  const payload = await requestStructuredOutput([
    `Project: ${projectContext(project)}`,
    "Review the project for execution readiness and quality, not mere field completion.",
    "readinessScore should reflect clarity, testability, MVP discipline, evidence, execution sequence, and risk awareness.",
    "Treat unvalidated assumptions as gaps. Do not award points for confident wording without evidence.",
    "validationPriority should name the single assumption that should be tested first.",
    "evidenceNeeded should list concrete evidence the founder should collect; do not claim that evidence already exists.",
    "marketplaceBrief should be a concise collaboration brief describing what kind of help, builder, creator, or service the project needs next.",
    "developerBrief should be a concise technical implementation brief suitable for handing to a developer or agent.",
  ].join("\n\n"), REVIEW_SCHEMA, "idea_lab_project_review", 1_800);

  const score = Math.max(0, Math.min(100, Math.round(Number(payload.readinessScore) || 0)));
  return {
    mode: "review",
    readinessScore: score,
    verdict: boundedText(payload.verdict, 500),
    strengths: boundedList(payload.strengths, 4, 260),
    gaps: boundedList(payload.gaps, 5, 300),
    nextAction: boundedText(payload.nextAction, 600),
    validationPriority: boundedText(payload.validationPriority, 600),
    evidenceNeeded: boundedList(payload.evidenceNeeded, 5, 320),
    marketplaceBrief: boundedText(payload.marketplaceBrief, 1_600),
    developerBrief: boundedText(payload.developerBrief, 2_000),
  };
}
