import type { GnsIdentity, GwapOsState } from "./os-state";
import { getProfileCompletion } from "./os-state";

export type TrustSignalState = "verified" | "incomplete" | "planned" | "unavailable";

export type TrustSignal = {
  id: "wallet" | "gns" | "profile" | "score" | "telegram" | "social" | "proofs";
  label: string;
  product: string;
  state: TrustSignalState;
  summary: string;
  actionLabel: string | null;
  href: string | null;
  weight: number;
};

export type TrustGraph = {
  coverage: number;
  verifiedWeight: number;
  availableWeight: number;
  signals: TrustSignal[];
  nextAction: TrustSignal | null;
};

type SocialVerificationSummary = {
  enabled: boolean;
  verifiedCount: number;
};

type TrustGraphInput = {
  gnsIdentity: GnsIdentity;
  state: GwapOsState;
  telegramLinked: boolean | null;
  walletVerified: boolean;
  socialVerification?: SocialVerificationSummary | null;
};

export function deriveTrustGraph({
  gnsIdentity,
  state,
  telegramLinked,
  walletVerified,
  socialVerification,
}: TrustGraphInput): TrustGraph {
  const profileCompletion = getProfileCompletion(state.profile);
  const socialSignal: TrustSignal = socialVerification === undefined
    ? {
        id: "social",
        label: "Verified social control",
        product: "GwapScore",
        state: "planned",
        summary: "Proof-of-Control social verification is staged but not active in this client state.",
        actionLabel: null,
        href: null,
        weight: 0,
      }
    : socialVerification === null
      ? {
          id: "social",
          label: "Verified social control",
          product: "GwapScore",
          state: "unavailable",
          summary: "Social Proof-of-Control status could not be loaded right now.",
          actionLabel: "Open GwapScore",
          href: "/app/score#social-verification",
          weight: 10,
        }
      : !socialVerification.enabled
        ? {
            id: "social",
            label: "Verified social control",
            product: "GwapScore",
            state: "planned",
            summary: "Proof-of-Control is built, but the signed platform verifier is not connected yet.",
            actionLabel: "View verification status",
            href: "/app/score#social-verification",
            weight: 0,
          }
        : socialVerification.verifiedCount > 0
          ? {
              id: "social",
              label: "Verified social control",
              product: "GwapScore",
              state: "verified",
              summary: `${socialVerification.verifiedCount} social account${socialVerification.verifiedCount === 1 ? " is" : "s are"} verified through Proof of Control.`,
              actionLabel: "Manage verification",
              href: "/app/score#social-verification",
              weight: 10,
            }
          : {
              id: "social",
              label: "Verified social control",
              product: "GwapScore",
              state: "incomplete",
              summary: "Verify control of a supported social account using GWAP's follow + DM challenge.",
              actionLabel: "Verify social account",
              href: "/app/score#social-verification",
              weight: 10,
            };

  const signals: TrustSignal[] = [
    {
      id: "wallet",
      label: "Verified wallet",
      product: "GWAP Account",
      state: walletVerified ? "verified" : "incomplete",
      summary: walletVerified
        ? "Your authenticated Solana wallet anchors this GWAP account."
        : "A verified wallet is required to anchor your GWAP identity.",
      actionLabel: walletVerified ? null : "Connect wallet",
      href: walletVerified ? null : "/sign-in?redirect_url=/app/trust",
      weight: 20,
    },
    {
      id: "gns",
      label: ".gwap identity",
      product: "GNS",
      state: gnsIdentity.status === "found" ? "verified" : gnsIdentity.status === "none" ? "incomplete" : "unavailable",
      summary:
        gnsIdentity.status === "found"
          ? `${gnsIdentity.fullName || gnsIdentity.name} resolves to your verified wallet.`
          : gnsIdentity.status === "none"
            ? "Claim a human-readable .gwap identity for your verified wallet."
            : "GNS identity resolution is temporarily unavailable.",
      actionLabel: gnsIdentity.status === "none" ? "Claim .gwap" : gnsIdentity.status === "found" ? null : "Retry in Identity",
      href: gnsIdentity.status === "found" ? null : "/app/identity",
      weight: 20,
    },
    {
      id: "profile",
      label: "Public profile context",
      product: "GWAP Profile",
      state: profileCompletion >= 67 ? "verified" : "incomplete",
      summary:
        profileCompletion >= 67
          ? `Your public profile is ${profileCompletion}% complete and gives counterparties useful context.`
          : `Your public profile is ${profileCompletion}% complete. Add context that helps others understand who they are dealing with.`,
      actionLabel: profileCompletion >= 67 ? null : "Strengthen profile",
      href: profileCompletion >= 67 ? null : "/app/profile",
      weight: 15,
    },
    {
      id: "score",
      label: "Reputation signal",
      product: "GwapScore",
      state: gnsIdentity.scoreStatus === "scored" ? "verified" : gnsIdentity.scoreStatus === "unavailable" ? "unavailable" : "incomplete",
      summary:
        gnsIdentity.scoreStatus === "scored"
          ? `GwapScore is active${typeof gnsIdentity.score === "number" ? ` at ${gnsIdentity.score}` : ""}.`
          : gnsIdentity.scoreMessage || "GWAP does not yet have enough reputation signal to score this identity.",
      actionLabel: gnsIdentity.scoreStatus === "scored" ? "Understand score" : "Review reputation",
      href: "/app/score",
      weight: 20,
    },
    {
      id: "telegram",
      label: "Telegram account link",
      product: "GWAP Account",
      state: telegramLinked === true ? "verified" : telegramLinked === false ? "incomplete" : "unavailable",
      summary:
        telegramLinked === true
          ? "Telegram is linked to the same canonical GWAP account used by GWAP OS."
          : telegramLinked === false
            ? "Link Telegram so Daily Ideas and future Telegram experiences resolve to this same identity."
            : "Telegram link status could not be loaded right now.",
      actionLabel: telegramLinked === true ? null : telegramLinked === false ? "Link Telegram" : "Open account settings",
      href: telegramLinked === true ? null : "/app/settings",
      weight: 10,
    },
    socialSignal,
    {
      id: "proofs",
      label: "Private verified proofs",
      product: "Private Proof Vault",
      state: "planned",
      summary: "Private Proof Vault is not active yet. No proof coverage is counted until the secure vault backend ships.",
      actionLabel: "View vault status",
      href: "/app/vault",
      weight: 0,
    },
  ];

  // Operational outages should never make the user look less trustworthy.
  // Only live, measurable signals with a known state contribute to coverage.
  const measurable = signals.filter((signal) => signal.weight > 0 && signal.state !== "unavailable");
  const availableWeight = measurable.reduce((sum, signal) => sum + signal.weight, 0);
  const verifiedWeight = measurable
    .filter((signal) => signal.state === "verified")
    .reduce((sum, signal) => sum + signal.weight, 0);
  const coverage = availableWeight ? Math.round((verifiedWeight / availableWeight) * 100) : 0;
  const nextAction = measurable.find((signal) => signal.state === "incomplete") ?? null;

  return { coverage, verifiedWeight, availableWeight, signals, nextAction };
}
