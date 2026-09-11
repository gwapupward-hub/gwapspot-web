export type ExecutionLegStatus =
  | "planned"
  | "simulated"
  | "signature_requested"
  | "broadcast"
  | "confirmed"
  | "rejected"
  | "failed"
  | "uncertain";

export type ExecutionLeg = {
  id: string;
  symbol: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  minimumOutputAmount: string;
  quoteId: string;
  quoteExpiresAt: string;
  status: ExecutionLegStatus;
  signature?: string;
  error?: string;
};

export type ExecutionPlanStatus =
  | "review"
  | "ready"
  | "executing"
  | "complete"
  | "stopped"
  | "uncertain";

export type ExecutionPlan = {
  id: string;
  wallet: string;
  createdAt: string;
  status: ExecutionPlanStatus;
  legs: ExecutionLeg[];
};

const TERMINAL_LEG_STATUSES = new Set<ExecutionLegStatus>([
  "confirmed",
  "rejected",
  "failed",
  "uncertain",
]);

export function validateExecutionPlan(plan: ExecutionPlan, nowMs = Date.now()): ExecutionPlan {
  if (!plan.id.trim()) throw new Error("execution plan id is required");
  if (!plan.wallet.trim()) throw new Error("execution wallet is required");
  if (!plan.legs.length) throw new Error("execution plan requires at least one leg");

  const ids = new Set<string>();
  for (const leg of plan.legs) {
    if (!leg.id.trim()) throw new Error("execution leg id is required");
    if (ids.has(leg.id)) throw new Error(`duplicate execution leg: ${leg.id}`);
    ids.add(leg.id);
    if (!leg.symbol.trim()) throw new Error(`execution leg ${leg.id} requires a symbol`);
    if (!leg.inputMint.trim() || !leg.outputMint.trim()) throw new Error(`execution leg ${leg.id} requires mints`);
    if (!/^\d+$/.test(leg.inputAmount) || BigInt(leg.inputAmount) <= 0n) {
      throw new Error(`execution leg ${leg.id} has invalid input amount`);
    }
    if (!/^\d+$/.test(leg.minimumOutputAmount) || BigInt(leg.minimumOutputAmount) <= 0n) {
      throw new Error(`execution leg ${leg.id} has invalid minimum output`);
    }
    const expiry = Date.parse(leg.quoteExpiresAt);
    if (!Number.isFinite(expiry)) throw new Error(`execution leg ${leg.id} has invalid quote expiry`);
    if (expiry <= nowMs && !TERMINAL_LEG_STATUSES.has(leg.status)) {
      throw new Error(`execution quote expired for ${leg.symbol}`);
    }
  }
  return plan;
}

export function markLegSimulated(plan: ExecutionPlan, legId: string): ExecutionPlan {
  return updateLeg(plan, legId, (leg) => {
    if (leg.status !== "planned") throw new Error(`cannot simulate leg from ${leg.status}`);
    return { ...leg, status: "simulated", error: undefined };
  });
}

export function markLegSignatureRequested(plan: ExecutionPlan, legId: string): ExecutionPlan {
  return updateLeg(plan, legId, (leg) => {
    if (leg.status !== "simulated") throw new Error(`cannot request signature from ${leg.status}`);
    return { ...leg, status: "signature_requested" };
  });
}

export function markLegBroadcast(plan: ExecutionPlan, legId: string, signature: string): ExecutionPlan {
  if (!signature.trim()) throw new Error("broadcast signature is required");
  return updateLeg(plan, legId, (leg) => {
    if (leg.status !== "signature_requested") throw new Error(`cannot mark broadcast from ${leg.status}`);
    return { ...leg, status: "broadcast", signature, error: undefined };
  });
}

export function markLegConfirmed(plan: ExecutionPlan, legId: string): ExecutionPlan {
  return updateLeg(plan, legId, (leg) => {
    if (leg.status !== "broadcast") throw new Error(`cannot confirm leg from ${leg.status}`);
    return { ...leg, status: "confirmed", error: undefined };
  });
}

export function markLegRejected(plan: ExecutionPlan, legId: string): ExecutionPlan {
  return updateLeg(plan, legId, (leg) => {
    if (leg.status !== "signature_requested") throw new Error(`cannot reject leg from ${leg.status}`);
    return { ...leg, status: "rejected", error: "user_rejected" };
  });
}

export function markLegFailed(plan: ExecutionPlan, legId: string, error: string): ExecutionPlan {
  return updateLeg(plan, legId, (leg) => {
    if (!["planned", "simulated", "signature_requested", "broadcast"].includes(leg.status)) {
      throw new Error(`cannot fail leg from ${leg.status}`);
    }
    return { ...leg, status: "failed", error: error || "execution_failed" };
  });
}

export function markLegUncertain(plan: ExecutionPlan, legId: string, error: string): ExecutionPlan {
  return updateLeg(plan, legId, (leg) => {
    if (leg.status !== "broadcast") throw new Error(`uncertain state requires a broadcast leg; received ${leg.status}`);
    return { ...leg, status: "uncertain", error: error || "confirmation_unknown" };
  });
}

export function nextExecutableLeg(plan: ExecutionPlan): ExecutionLeg | null {
  // Sequential execution is deliberate for the MVP. If any prior leg is not confirmed,
  // a later leg is never automatically submitted. This prevents a partial portfolio
  // failure from cascading into additional wallet prompts or trades.
  for (const leg of plan.legs) {
    if (leg.status === "confirmed") continue;
    if (leg.status === "simulated") return leg;
    return null;
  }
  return null;
}

function derivePlanStatus(legs: ExecutionLeg[]): ExecutionPlanStatus {
  if (legs.every((leg) => leg.status === "confirmed")) return "complete";
  if (legs.some((leg) => leg.status === "uncertain")) return "uncertain";
  if (legs.some((leg) => leg.status === "rejected" || leg.status === "failed")) return "stopped";
  if (legs.some((leg) => ["signature_requested", "broadcast", "confirmed"].includes(leg.status))) return "executing";
  if (legs.every((leg) => leg.status === "simulated")) return "ready";
  return "review";
}

function updateLeg(
  plan: ExecutionPlan,
  legId: string,
  updater: (leg: ExecutionLeg) => ExecutionLeg,
): ExecutionPlan {
  let matched = false;
  const legs = plan.legs.map((leg) => {
    if (leg.id !== legId) return leg;
    matched = true;
    return updater(leg);
  });
  if (!matched) throw new Error(`unknown execution leg: ${legId}`);
  return { ...plan, legs, status: derivePlanStatus(legs) };
}
