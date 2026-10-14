export type CustomDailyIdeaProjectInput = {
  title: string;
  problemDefinition: string;
};

function boundedRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export function parseCustomDailyIdeaProjectInput(
  value: unknown,
): CustomDailyIdeaProjectInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = boundedRequiredText(input.title, 120);
  const problemDefinition = boundedRequiredText(input.problemDefinition, 1600);
  if (!title || !problemDefinition) return null;
  return { title, problemDefinition };
}

export function customDailyIdeaProjectSummary(problemDefinition: string) {
  return problemDefinition.slice(0, 480);
}
