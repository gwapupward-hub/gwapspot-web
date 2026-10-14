export const GWAP_PUBLIC_SITE_ORIGIN = "https://www.gwapspot.com";

export type MarketplaceCollaborationPacketRole =
  | "developer"
  | "designer"
  | "marketer"
  | "researcher"
  | "operations";

export type MarketplaceCollaborationPacket = {
  text: string;
  trustProfileUrl: string | null;
};

type CollaborationPacketInput = {
  status?: unknown;
  projectTitle?: unknown;
  role?: unknown;
  brief?: unknown;
  budget?: unknown;
  timeline?: unknown;
  gnsName?: unknown;
};

const ROLE_LABELS: Record<MarketplaceCollaborationPacketRole, string> = {
  developer: "Developer",
  designer: "Designer",
  marketer: "Marketer",
  researcher: "Researcher",
  operations: "Operations",
};

const ROLE_VALUES = new Set<MarketplaceCollaborationPacketRole>(
  Object.keys(ROLE_LABELS) as MarketplaceCollaborationPacketRole[],
);

function safeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeGnsName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\.gwap$/, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(normalized)
    ? normalized
    : null;
}

export function getCanonicalTrustProfileUrl(value: unknown) {
  const name = normalizeGnsName(value);
  return name
    ? `${GWAP_PUBLIC_SITE_ORIGIN}/profile/${encodeURIComponent(name)}`
    : null;
}

export function buildMarketplaceCollaborationPacket(
  input: CollaborationPacketInput,
): MarketplaceCollaborationPacket | null {
  if (input.status !== "Ready") return null;

  const brief = safeText(input.brief, 1200);
  if (!brief) return null;

  const role = typeof input.role === "string" ? input.role : "";
  if (!ROLE_VALUES.has(role as MarketplaceCollaborationPacketRole)) return null;

  const projectTitle = safeText(input.projectTitle, 120) || "Project collaboration";
  const budget = safeText(input.budget, 160) || "Not specified";
  const timeline = safeText(input.timeline, 160) || "Not specified";
  const safeRole = role as MarketplaceCollaborationPacketRole;
  const trustProfileUrl = getCanonicalTrustProfileUrl(input.gnsName);

  const lines = [
    "GWAP Collaboration Packet",
    "",
    `Project: ${projectTitle}`,
    `Capability needed: ${ROLE_LABELS[safeRole]}`,
    "Brief status: Ready",
    "",
    "Scope:",
    brief,
    "",
    `Budget: ${budget}`,
    `Timeline: ${timeline}`,
    trustProfileUrl
      ? `Public trust profile: ${trustProfileUrl}`
      : "Public trust profile: Not attached",
    "",
    "This packet was explicitly copied by the brief owner. It does not publish or match this brief in GWAP Marketplace.",
  ];

  return {
    text: lines.join("\n"),
    trustProfileUrl,
  };
}
