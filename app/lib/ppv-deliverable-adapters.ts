import {
  DELIVERABLE_REFERENCE_SCHEMA_VERSION,
  isSha256Hex,
  isSolanaAddress,
  type GnsRecordSnapshotV1,
  type GwapDeliverableReferenceV1,
  type SourceProduct,
} from "./ppv-reputation/contracts.ts";

/**
 * Product adapters onto the one shared deliverable interface. Each adapter
 * decides which of its product's objects are worth anchoring: finalized or
 * accepted work only. Drafts, ephemeral generations and unaccepted
 * submissions are refused here so they never reach PPV.
 */

export class DeliverableAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliverableAdapterError";
  }
}

const OBJECT_ID = /^[A-Za-z0-9:_.-]{1,120}$/;

export type DeliverableProofInput = {
  ppvProofId: string;
  proofHash: string;
  counterpartyWallet?: string | null;
};

export type DeliverableDraft = Omit<GwapDeliverableReferenceV1, "creatorGnsRecord" | "createdAt">;

function draft(
  sourceProduct: SourceProduct,
  sourceObjectId: string,
  deliverableId: string,
  deliverableKind: string,
  creatorWallet: string,
  proof: DeliverableProofInput,
): DeliverableDraft {
  if (!OBJECT_ID.test(sourceObjectId)) throw new DeliverableAdapterError("Invalid source object id.");
  if (!OBJECT_ID.test(deliverableId)) throw new DeliverableAdapterError("Invalid deliverable id.");
  if (!isSolanaAddress(creatorWallet)) throw new DeliverableAdapterError("Invalid creator wallet.");
  if (!isSolanaAddress(proof.ppvProofId)) throw new DeliverableAdapterError("Invalid PPV proof id.");
  if (!isSha256Hex(proof.proofHash)) throw new DeliverableAdapterError("Invalid proof hash.");
  const counterparty = proof.counterpartyWallet ?? null;
  if (counterparty !== null && !isSolanaAddress(counterparty)) {
    throw new DeliverableAdapterError("Invalid counterparty wallet.");
  }
  if (counterparty === creatorWallet) throw new DeliverableAdapterError("Counterparty must differ from the creator.");
  return {
    schemaVersion: DELIVERABLE_REFERENCE_SCHEMA_VERSION,
    sourceProduct,
    sourceObjectId,
    deliverableId,
    deliverableKind,
    creatorWallet,
    ppvProofId: proof.ppvProofId,
    proofHash: proof.proofHash,
    counterpartyWallet: counterparty,
  };
}

/** Marketplace anchors delivered or accepted milestones and final deliverables. */
export type MarketplaceDeliverableInput = {
  intentId: string;
  milestoneIndex: number | null;
  state: "delivered" | "accepted";
  creatorWallet: string;
  proof: DeliverableProofInput;
};

export function buildMarketplaceDeliverableReference(input: MarketplaceDeliverableInput): DeliverableDraft {
  if (input.state !== "delivered" && input.state !== "accepted") {
    throw new DeliverableAdapterError("Only delivered or accepted Marketplace work can be anchored.");
  }
  const milestone =
    input.milestoneIndex === null
      ? null
      : Number.isInteger(input.milestoneIndex) && input.milestoneIndex >= 0 && input.milestoneIndex < 1_000
        ? input.milestoneIndex
        : undefined;
  if (milestone === undefined) throw new DeliverableAdapterError("Invalid milestone index.");
  const deliverableId = milestone === null ? "deliverable" : `milestone-${milestone}`;
  return draft("marketplace", input.intentId, deliverableId, milestone === null ? "deliverable" : "milestone", input.creatorWallet, input.proof);
}

/**
 * Daily Ideas anchors finalized work only: a launched project, or a workspace
 * task marked done. Generated ideas and in-progress projects are ephemeral.
 */
export type DailyIdeasDeliverableInput =
  | { kind: "project"; projectId: string; status: string; creatorWallet: string; proof: DeliverableProofInput }
  | { kind: "task"; projectId: string; taskId: string; status: string; creatorWallet: string; proof: DeliverableProofInput };

export function buildDailyIdeasDeliverableReference(input: DailyIdeasDeliverableInput): DeliverableDraft {
  if (input.kind === "project") {
    if (input.status !== "launched") {
      throw new DeliverableAdapterError("Only a launched Daily Ideas project can be anchored.");
    }
    return draft("daily-ideas", input.projectId, "launch", "project-launch", input.creatorWallet, input.proof);
  }
  if (input.status !== "done") {
    throw new DeliverableAdapterError("Only a completed workspace task can be anchored.");
  }
  return draft("daily-ideas", input.projectId, `task-${input.taskId}`, "workspace-task", input.creatorWallet, input.proof);
}

/**
 * DIMI anchors finalized masters, accepted contributions, signed collaboration
 * deliverables and released work. Stems in progress and unaccepted
 * contributions stay off-chain.
 */
export const DIMI_DELIVERABLE_KINDS = ["master", "contribution", "collaboration-deliverable", "release"] as const;
export type DimiDeliverableKind = (typeof DIMI_DELIVERABLE_KINDS)[number];

export type DimiDeliverableInput = {
  kind: DimiDeliverableKind;
  projectId: string;
  deliverableId: string;
  status: "finalized" | "accepted" | "signed" | "released" | string;
  creatorWallet: string;
  proof: DeliverableProofInput;
};

const DIMI_REQUIRED_STATUS: Record<DimiDeliverableKind, readonly string[]> = {
  master: ["finalized", "released"],
  contribution: ["accepted"],
  "collaboration-deliverable": ["signed", "accepted"],
  release: ["released"],
};

export function buildDimiDeliverableReference(input: DimiDeliverableInput): DeliverableDraft {
  if (!(DIMI_DELIVERABLE_KINDS as readonly string[]).includes(input.kind)) {
    throw new DeliverableAdapterError("Unknown DIMI deliverable kind.");
  }
  if (!DIMI_REQUIRED_STATUS[input.kind].includes(input.status)) {
    throw new DeliverableAdapterError(`A DIMI ${input.kind} must be ${DIMI_REQUIRED_STATUS[input.kind].join(" or ")} before it is anchored.`);
  }
  return draft("dimi", input.projectId, input.deliverableId, input.kind, input.creatorWallet, input.proof);
}

/** Route a generic API body to the right adapter. Unknown products are refused. */
export function buildDeliverableReferenceFromRequest(body: Record<string, unknown>, creatorWallet: string): DeliverableDraft {
  const proofRecord = (body.proof && typeof body.proof === "object" ? body.proof : {}) as Record<string, unknown>;
  const proof: DeliverableProofInput = {
    ppvProofId: String(proofRecord.ppvProofId ?? ""),
    proofHash: String(proofRecord.proofHash ?? "").toLowerCase(),
    counterpartyWallet: typeof proofRecord.counterpartyWallet === "string" ? proofRecord.counterpartyWallet : null,
  };
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  switch (body.sourceProduct) {
    case "marketplace":
      return buildMarketplaceDeliverableReference({
        intentId: text(body.intentId),
        milestoneIndex: body.milestoneIndex === null || body.milestoneIndex === undefined ? null : Number(body.milestoneIndex),
        state: text(body.state) as "delivered" | "accepted",
        creatorWallet,
        proof,
      });
    case "daily-ideas":
      return body.taskId
        ? buildDailyIdeasDeliverableReference({ kind: "task", projectId: text(body.projectId), taskId: text(body.taskId), status: text(body.status), creatorWallet, proof })
        : buildDailyIdeasDeliverableReference({ kind: "project", projectId: text(body.projectId), status: text(body.status), creatorWallet, proof });
    case "dimi":
      return buildDimiDeliverableReference({
        kind: text(body.kind) as DimiDeliverableKind,
        projectId: text(body.projectId),
        deliverableId: text(body.deliverableId),
        status: text(body.status),
        creatorWallet,
        proof,
      });
    default:
      throw new DeliverableAdapterError("Unsupported source product.");
  }
}

export function finalizeDeliverableReference(
  draftReference: DeliverableDraft,
  creatorGnsRecord: GnsRecordSnapshotV1 | null,
  createdAt: string,
): GwapDeliverableReferenceV1 {
  return { ...draftReference, creatorGnsRecord, createdAt };
}
