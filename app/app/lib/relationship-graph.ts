import type { GnsIdentity } from "./os-state";

export type RelationshipNodeType =
  | "account"
  | "wallet"
  | "gns"
  | "telegram"
  | "social"
  | "counterparty";

export type RelationshipNodeState = "verified" | "linked" | "available" | "planned" | "unavailable";
export type RelationshipProvenance =
  | "authenticated"
  | "account-link"
  | "resolved"
  | "proof-of-control"
  | "planned";

export type RelationshipNode = {
  id: string;
  type: RelationshipNodeType;
  label: string;
  detail: string;
  state: RelationshipNodeState;
  primary: boolean;
};

export type RelationshipEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  provenance: RelationshipProvenance;
  verified: boolean;
  detail: string;
};

export type RelationshipGraph = {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
  verifiedEdges: number;
  plannedEdges: number;
};

type AccountPayload = {
  id: string;
  linkedAccounts?: {
    privy?: boolean;
    telegram?: { userId?: string } | null;
  };
  wallets?: Array<{
    address?: string;
    kind?: "embedded" | "external";
    primary?: boolean;
  }>;
  primaryWallet?: string | null;
  primaryGnsIdentity?: string | null;
};

export type SocialRelationshipInput = {
  enabled: boolean;
  records: Array<{
    platform: string;
    socialHandle: string;
    status: string;
    verifiedAt?: string | null;
  }>;
};

function compact(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-5)}` : value;
}

export function deriveRelationshipGraph(
  account: AccountPayload,
  gnsIdentity: GnsIdentity,
  socialVerification?: SocialRelationshipInput | null,
): RelationshipGraph {
  const accountNodeId = `account:${account.id}`;
  const nodes: RelationshipNode[] = [
    {
      id: accountNodeId,
      type: "account",
      label: "GWAP Account",
      detail: account.id,
      state: "verified",
      primary: true,
    },
  ];
  const edges: RelationshipEdge[] = [];

  const wallets = Array.isArray(account.wallets) ? account.wallets : [];
  for (const wallet of wallets) {
    if (!wallet.address) continue;
    const walletId = `wallet:${wallet.address}`;
    const primary = wallet.address === account.primaryWallet || wallet.primary === true;
    nodes.push({
      id: walletId,
      type: "wallet",
      label: primary ? "Primary wallet" : wallet.kind === "embedded" ? "Embedded wallet" : "Linked wallet",
      detail: compact(wallet.address),
      state: "verified",
      primary,
    });
    edges.push({
      id: `${accountNodeId}->${walletId}`,
      from: accountNodeId,
      to: walletId,
      label: primary ? "anchors account" : "linked wallet",
      provenance: primary ? "authenticated" : "account-link",
      verified: true,
      detail: primary
        ? "This wallet is the authenticated account anchor for the current GWAP session."
        : "This wallet is stored on the canonical GWAP account record.",
    });
  }

  if (gnsIdentity.status === "found" && gnsIdentity.name) {
    const gnsId = `gns:${gnsIdentity.name}`;
    nodes.push({
      id: gnsId,
      type: "gns",
      label: gnsIdentity.fullName || `${gnsIdentity.name}.gwap`,
      detail: "GNS identity",
      state: "verified",
      primary: true,
    });
    const wallet = account.primaryWallet || wallets.find((item) => item.primary)?.address || wallets[0]?.address;
    if (wallet) {
      edges.push({
        id: `${gnsId}->wallet:${wallet}`,
        from: gnsId,
        to: `wallet:${wallet}`,
        label: "resolves to",
        provenance: "resolved",
        verified: true,
        detail: "GNS currently resolves this .gwap identity to the primary verified wallet.",
      });
    }
  } else if (gnsIdentity.status === "unavailable") {
    nodes.push({
      id: "gns:unavailable",
      type: "gns",
      label: ".gwap identity",
      detail: "Resolution temporarily unavailable",
      state: "unavailable",
      primary: false,
    });
  }

  const telegramUserId = account.linkedAccounts?.telegram?.userId;
  if (telegramUserId) {
    const telegramId = `telegram:${telegramUserId}`;
    nodes.push({
      id: telegramId,
      type: "telegram",
      label: "Telegram",
      detail: `User ${telegramUserId}`,
      state: "linked",
      primary: false,
    });
    edges.push({
      id: `${accountNodeId}->${telegramId}`,
      from: accountNodeId,
      to: telegramId,
      label: "linked account",
      provenance: "account-link",
      verified: true,
      detail: "Telegram is mapped to this canonical GWAP account through the secure account-link flow.",
    });
  }

  const verifiedSocial = socialVerification?.records.filter((record) => record.status === "verified") ?? [];
  if (verifiedSocial.length) {
    for (const record of verifiedSocial) {
      const nodeId = `social:${record.platform}:${record.socialHandle.toLowerCase()}`;
      nodes.push({
        id: nodeId,
        type: "social",
        label: `@${record.socialHandle}`,
        detail: `${record.platform.toUpperCase()} · Proof of Control`,
        state: "verified",
        primary: false,
      });
      edges.push({
        id: `${accountNodeId}->${nodeId}`,
        from: accountNodeId,
        to: nodeId,
        label: "controls account",
        provenance: "proof-of-control",
        verified: true,
        detail: "GWAP matched a one-time challenge to the social account through the signed platform verifier after the required follow and DM flow.",
      });
    }
  } else if (socialVerification?.enabled) {
    nodes.push({
      id: "social:available",
      type: "social",
      label: "Social Proof of Control",
      detail: "Verification available in GwapScore",
      state: "available",
      primary: false,
    });
  } else {
    nodes.push({
      id: "social:planned",
      type: "social",
      label: "Social Proof of Control",
      detail: "Verifier bridge not active",
      state: socialVerification === null ? "unavailable" : "planned",
      primary: false,
    });
    if (socialVerification !== null) {
      edges.push({
        id: `${accountNodeId}->social:planned`,
        from: accountNodeId,
        to: "social:planned",
        label: "future verification",
        provenance: "planned",
        verified: false,
        detail: "Social relationships remain non-verifying until the signed Proof-of-Control platform bridge is active.",
      });
    }
  }

  nodes.push({
    id: "counterparty:planned",
    type: "counterparty",
    label: "Trusted counterparties",
    detail: "Planned relationship signal",
    state: "planned",
    primary: false,
  });
  edges.push({
    id: `${accountNodeId}->counterparty:planned`,
    from: accountNodeId,
    to: "counterparty:planned",
    label: "future relationship",
    provenance: "planned",
    verified: false,
    detail: "Marketplace and transaction relationships will join only when their provenance is production-ready.",
  });

  return {
    nodes,
    edges,
    verifiedEdges: edges.filter((edge) => edge.verified).length,
    plannedEdges: edges.filter((edge) => edge.provenance === "planned").length,
  };
}
