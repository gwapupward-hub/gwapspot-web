import type { ActivationSignal } from "./activation-analytics.ts";
import { GWAP_ENTRY_INTENTS, type GwapEntryIntent } from "./entry-intent.ts";

export type NextBestActionMode = "advance" | "resume" | "intent" | "foundation";

export type NextBestAction = {
  href: string;
  title: string;
  detail: string;
  label: string;
  mode: NextBestActionMode;
  nextIntent?: GwapEntryIntent;
};

type NextBestActionInput = {
  entryIntent: GwapEntryIntent | null;
  signal: ActivationSignal | null;
  identityStatus: "found" | "none" | "unavailable";
  profileCompletion: number;
  scoreStatus: "scored" | "unscored" | "unavailable";
};

function completedAction(signal: ActivationSignal): NextBestAction | null {
  switch (signal.milestone) {
    case "project_created":
      return {
        href: "/app/ideas/lab",
        title: "Validate what you just started",
        detail:
          "Your project exists. Pressure-test the problem, target customer, and assumptions before committing deeper build time.",
        label: "Start validation",
        mode: "advance",
        nextIntent: "validate",
      };
    case "validation_started":
      return {
        href: "/app/ideas/lab",
        title: "Turn validation into a build decision",
        detail:
          "You have moved into validation. Use the evidence you collect to decide what deserves to be built next.",
        label: "Continue to build",
        mode: "advance",
        nextIntent: "build",
      };
    case "identity_established":
    case "identity_strengthened":
      return {
        href: "/app/score",
        title: "Build the reputation layer next",
        detail:
          "Your identity foundation is in place. Add verifiable reputation signals so people can evaluate more than a profile.",
        label: "Review GwapScore",
        mode: "advance",
        nextIntent: "reputation",
      };
    case "reputation_scored":
    case "proof_of_control_verified":
      return {
        href: "/app/ppv",
        title: "Turn trust into verifiable work",
        detail:
          "Your reputation layer has meaningful signal. Use Private Proof Vault when agreements, proofs, or economic activity begin.",
        label: "Open Private Proof Vault",
        mode: "advance",
        nextIntent: "transaction",
      };
    case "verified_transaction_activity":
      return {
        href: "/#overview",
        title: "Your verified activity is on record",
        detail:
          "You completed a trust-to-transaction loop. Choose the next outcome GWAP should help you move forward.",
        label: "Choose next goal",
        mode: "advance",
      };
    default:
      return null;
  }
}

function resumedAction(
  signal: ActivationSignal,
  input: Pick<NextBestActionInput, "identityStatus" | "profileCompletion">,
): NextBestAction | null {
  switch (signal.milestone) {
    case "existing_project":
      return {
        href: "/app/ideas/lab",
        title: "Resume the project already in motion",
        detail:
          "You already have an Idea Lab project. Continue the work instead of starting another project from zero.",
        label: "Resume project",
        mode: "resume",
      };
    case "existing_validation_project":
      return {
        href: "/app/ideas/lab",
        title: "Continue the validation already underway",
        detail:
          "A project has already reached validation or beyond. Pick up from the evidence and next-stage decision you already started.",
        label: "Resume validation",
        mode: "resume",
      };
    case "existing_identity":
      if (input.identityStatus === "found" && input.profileCompletion < 67) {
        return {
          href: "/app/profile",
          title: "Strengthen the identity you already own",
          detail:
            "Your .gwap identity exists. Add enough profile context for people to understand who they are dealing with.",
          label: "Complete profile",
          mode: "resume",
        };
      }
      return {
        href: "/app/identity",
        title: "Review your existing identity foundation",
        detail:
          "Your identity is already active. Review the connections and provenance that carry it across GWAP.",
        label: "Manage identity",
        mode: "resume",
      };
    case "existing_reputation":
    case "existing_social_verification":
      return {
        href: "/app/score",
        title: "Resume from your existing reputation signals",
        detail:
          "You already have reputation context. Review what is verified and what can meaningfully strengthen your credibility next.",
        label: "Review reputation",
        mode: "resume",
      };
    case "existing_verified_activity":
      return {
        href: "/app/ppv/activity",
        title: "Continue from your verified history",
        detail:
          "You already have identity-bound verified activity. Review the record before creating or protecting the next piece of work.",
        label: "View verified activity",
        mode: "resume",
      };
    default:
      return null;
  }
}

export function getNextBestAction(input: NextBestActionInput): NextBestAction {
  if (input.signal?.kind === "completed") {
    const action = completedAction(input.signal);
    if (action) return action;
  }

  if (
    input.signal?.kind === "resumed" &&
    (!input.entryIntent || input.entryIntent === input.signal.intent)
  ) {
    const action = resumedAction(input.signal, input);
    if (action) return action;
  }

  if (input.entryIntent) {
    const config = GWAP_ENTRY_INTENTS[input.entryIntent];

    if (input.entryIntent === "identity" && input.identityStatus === "found") {
      if (input.profileCompletion < 67) {
        return {
          href: "/app/profile",
          title: "Strengthen your digital identity",
          detail:
            "Your .gwap identity is active. Add the profile context that helps people understand who they are dealing with.",
          label: "Complete profile",
          mode: "intent",
        };
      }

      return {
        href: "/app/identity",
        title: "Your identity foundation is active",
        detail:
          "Review the identity and account connections that carry your credibility across GWAP.",
        label: "Manage identity",
        mode: "intent",
      };
    }

    return {
      href: config.actionHref,
      title: config.dashboardTitle,
      detail: config.dashboardDetail,
      label: config.actionLabel,
      mode: "intent",
    };
  }

  if (input.identityStatus === "none") {
    return {
      href: "/app/identity",
      title: "Establish your digital identity",
      detail:
        "Claim a recognizable .gwap identity so your profile, reputation, and verified activity can resolve to one place.",
      label: "Create identity",
      mode: "foundation",
    };
  }

  if (input.profileCompletion < 67) {
    return {
      href: "/app/profile",
      title: "Give people useful context",
      detail:
        "Complete your public profile so people can understand who you are before they work or transact with you.",
      label: "Strengthen profile",
      mode: "foundation",
    };
  }

  if (input.scoreStatus !== "scored") {
    return {
      href: "/app/score",
      title: "Build your reputation signal",
      detail:
        "Review the trust signals available to GwapScore and see which verified signals can strengthen your reputation.",
      label: "Review reputation",
      mode: "foundation",
    };
  }

  return {
    href: "/app/ppv",
    title: "Turn trusted work into verified history",
    detail:
      "Use Private Proof Vault for proofs, agreements, and activity that can become durable evidence of what happened.",
    label: "Open Private Proof Vault",
    mode: "foundation",
  };
}
