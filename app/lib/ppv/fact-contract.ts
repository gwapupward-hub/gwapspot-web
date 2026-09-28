import {
  isReputationEventV1,
  type ReputationEventV1,
} from "../ppv-reputation/contracts.ts";
import {
  PPV_RUNTIME_ENVIRONMENT_SCHEMA_VERSION,
  type PpvRuntimeEnvironmentV1,
} from "./environment.ts";

export const PPV_FACT_ENVELOPE_SCHEMA_VERSION = 1 as const;

/**
 * Canonical GWAP trust boundary:
 *
 * - ReputationEventV1 is the fact.
 * - This envelope adds the Solana environment that produced the fact.
 * - PPV never embeds score deltas, trust labels, quality judgements, or legacy
 *   financial scoring in this contract.
 * - GwapScore may interpret a verified fact downstream.
 */
export type PpvFactEnvelopeV1 = Readonly<{
  schemaVersion: typeof PPV_FACT_ENVELOPE_SCHEMA_VERSION;
  environment: PpvRuntimeEnvironmentV1;
  fact: ReputationEventV1;
}>;

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isPpvRuntimeEnvironmentV1(
  value: unknown,
): value is PpvRuntimeEnvironmentV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const environment = value as Partial<PpvRuntimeEnvironmentV1>;
  if (
    environment.schemaVersion !== PPV_RUNTIME_ENVIRONMENT_SCHEMA_VERSION ||
    (environment.cluster !== "devnet" && environment.cluster !== "localnet") ||
    typeof environment.genesisHash !== "string" ||
    !ADDRESS.test(environment.genesisHash) ||
    typeof environment.rpcProfileId !== "string" ||
    environment.rpcProfileId.length === 0 ||
    !environment.programs ||
    typeof environment.programs !== "object"
  ) {
    return false;
  }

  return (["core", "commerce", "escrow"] as const).every((layer) =>
    ADDRESS.test(environment.programs?.[layer] ?? ""),
  );
}

export function createPpvFactEnvelope(input: {
  environment: PpvRuntimeEnvironmentV1;
  fact: ReputationEventV1;
}): PpvFactEnvelopeV1 {
  if (!isPpvRuntimeEnvironmentV1(input.environment)) {
    throw new TypeError("PPV fact environment is invalid");
  }
  if (!isReputationEventV1(input.fact)) {
    throw new TypeError("PPV fact is invalid");
  }
  if (!Object.values(input.environment.programs).includes(input.fact.programId)) {
    throw new TypeError("PPV fact program does not belong to the declared environment");
  }

  return Object.freeze({
    schemaVersion: PPV_FACT_ENVELOPE_SCHEMA_VERSION,
    environment: input.environment,
    fact: input.fact,
  });
}

export function isPpvFactEnvelopeV1(value: unknown): value is PpvFactEnvelopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<PpvFactEnvelopeV1>;
  if (
    envelope.schemaVersion !== PPV_FACT_ENVELOPE_SCHEMA_VERSION ||
    !isPpvRuntimeEnvironmentV1(envelope.environment) ||
    !isReputationEventV1(envelope.fact)
  ) {
    return false;
  }

  return Object.values(envelope.environment.programs).includes(
    envelope.fact.programId,
  );
}
