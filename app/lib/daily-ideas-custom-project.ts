export type CustomDailyIdeaProjectInput = {
  title: string;
  problemDefinition: string;
  targetCustomer?: string;
  validationPlan?: string[];
};

function boundedRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function boundedOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function boundedOptionalList(value: unknown, maxItems: number, maxLength: number) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function parseCustomDailyIdeaProjectInput(
  value: unknown,
): CustomDailyIdeaProjectInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = boundedRequiredText(input.title, 120);
  const problemDefinition = boundedRequiredText(input.problemDefinition, 1600);
  const targetCustomer = boundedOptionalText(input.targetCustomer, 900);
  const validationPlan = boundedOptionalList(input.validationPlan, 12, 600);
  if (!title || !problemDefinition || targetCustomer === null || validationPlan === null) return null;
  return {
    title,
    problemDefinition,
    ...(targetCustomer ? { targetCustomer } : {}),
    ...(validationPlan?.length ? { validationPlan } : {}),
  };
}

export function customDailyIdeaProjectSummary(problemDefinition: string) {
  return problemDefinition.slice(0, 480);
}
