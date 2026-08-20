import { Buffer } from "buffer";
import bs58 from "bs58";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";

export const CANONICAL_GNS_PROGRAM_ID =
  "6cDCrNYmasd1qmnvdLf8jyt9iFa3jW9VLzJhrb7X7SEH";
export const CANONICAL_GNS_TREASURY =
  "5K2NUTEaWUmCgXzS5giBtEb11uaPqGW5h1QKDmifFcjy";
export const GNS_REGISTER_DISCRIMINATOR = Uint8Array.from([
  211, 124, 67, 15, 211, 194, 178, 240,
]);
export const GNS_MIGRATE_RESERVED_DISCRIMINATOR = Uint8Array.from([
  137, 7, 123, 70, 216, 242, 154, 204,
]);
export const GNS_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export type GnsNetwork = "devnet" | "testnet" | "mainnet-beta";
export type GnsProtocolVersion = "legacy-v1" | "rollout-v1";

export type GnsRegistrationConfig = {
  feeLamports: number;
  feeSol: number;
  network: GnsNetwork;
  onChainMode: true;
  programId: string;
  treasury: string;
  protocolVersion?: GnsProtocolVersion;
  publicRegistrationEnabled?: boolean;
  migrationEnabled?: boolean;
};

export type PendingGnsRegistration = {
  config: GnsRegistrationConfig;
  name: string;
  owner: string;
  signature: string;
  submittedAt: string;
};

export const GNS_PENDING_REGISTRATION_STORAGE_KEY =
  "gwap-gns-pending-registration-v1";
const GNS_PENDING_REGISTRATION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export function normalizeGnsName(value: string) {
  return value.trim().toLowerCase().replace(/\.gwap$/, "");
}

export function isValidGnsName(value: string) {
  return GNS_NAME_PATTERN.test(normalizeGnsName(value));
}

export function isValidSolanaSignature(value: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value)) return false;
  try {
    return bs58.decode(value).length === 64;
  } catch {
    return false;
  }
}

export function getGnsProtocolVersion(
  config: Pick<GnsRegistrationConfig, "protocolVersion">,
): GnsProtocolVersion {
  return config.protocolVersion === "rollout-v1" ? "rollout-v1" : "legacy-v1";
}

export function isGnsRegistrationConfig(
  value: unknown,
): value is GnsRegistrationConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GnsRegistrationConfig>;
  const validNetwork =
    candidate.network === "devnet" ||
    candidate.network === "testnet" ||
    candidate.network === "mainnet-beta";
  const validFee =
    typeof candidate.feeLamports === "number" &&
    Number.isSafeInteger(candidate.feeLamports) &&
    candidate.feeLamports > 0 &&
    candidate.feeLamports <= 1_000_000_000 &&
    typeof candidate.feeSol === "number" &&
    candidate.feeSol === candidate.feeLamports / 1_000_000_000;
  const validProtocol =
    candidate.protocolVersion === undefined ||
    candidate.protocolVersion === "legacy-v1" ||
    candidate.protocolVersion === "rollout-v1";
  const validRolloutFlags =
    (candidate.publicRegistrationEnabled === undefined ||
      typeof candidate.publicRegistrationEnabled === "boolean") &&
    (candidate.migrationEnabled === undefined ||
      typeof candidate.migrationEnabled === "boolean");

  try {
    return (
      validNetwork &&
      validFee &&
      validProtocol &&
      validRolloutFlags &&
      candidate.onChainMode === true &&
      typeof candidate.programId === "string" &&
      new PublicKey(candidate.programId).toBase58() === candidate.programId &&
      typeof candidate.treasury === "string" &&
      new PublicKey(candidate.treasury).toBase58() === candidate.treasury
    );
  } catch {
    return false;
  }
}

export function parsePendingGnsRegistration(
  value: unknown,
  expectedOwner: string,
): PendingGnsRegistration | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingGnsRegistration>;
  const submittedAt =
    typeof candidate.submittedAt === "string"
      ? Date.parse(candidate.submittedAt)
      : Number.NaN;
  if (
    candidate.owner !== expectedOwner ||
    typeof candidate.name !== "string" ||
    normalizeGnsName(candidate.name) !== candidate.name ||
    !isValidGnsName(candidate.name) ||
    typeof candidate.signature !== "string" ||
    !isValidSolanaSignature(candidate.signature) ||
    Number.isNaN(submittedAt) ||
    submittedAt > Date.now() + 5 * 60 * 1_000 ||
    Date.now() - submittedAt > GNS_PENDING_REGISTRATION_MAX_AGE_MS ||
    !isGnsRegistrationConfig(candidate.config)
  ) {
    return null;
  }

  return candidate as PendingGnsRegistration;
}

export function deriveGnsRegistrationAccounts(
  name: string,
  config: Pick<GnsRegistrationConfig, "programId">,
) {
  const normalizedName = normalizeGnsName(name);
  if (!isValidGnsName(normalizedName)) {
    throw new Error("Use 1–32 lowercase letters, numbers, or internal hyphens.");
  }

  const programId = new PublicKey(config.programId);
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  );
  const [rolloutPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("rollout")],
    programId,
  );
  const [legacyReservationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("legacy"), Buffer.from(normalizedName)],
    programId,
  );
  const [namePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("name"), Buffer.from(normalizedName)],
    programId,
  );

  return {
    configPda,
    rolloutPda,
    legacyReservationPda,
    namePda,
    programId,
  };
}

function encodeNameInstruction(discriminator: Uint8Array, name: string) {
  const normalizedName = normalizeGnsName(name);
  if (!isValidGnsName(normalizedName)) {
    throw new Error("Use 1–32 lowercase letters, numbers, or internal hyphens.");
  }
  const nameBytes = Buffer.from(normalizedName, "utf8");
  const stringLength = Buffer.alloc(4);
  stringLength.writeUInt32LE(nameBytes.length, 0);
  return Buffer.concat([Buffer.from(discriminator), stringLength, nameBytes]);
}

export function buildGnsRegistrationTransaction({
  config,
  name,
  owner,
}: {
  config: GnsRegistrationConfig;
  name: string;
  owner: PublicKey;
}) {
  const normalizedName = normalizeGnsName(name);
  const {
    configPda,
    rolloutPda,
    legacyReservationPda,
    namePda,
    programId,
  } = deriveGnsRegistrationAccounts(normalizedName, config);
  const treasury = new PublicKey(config.treasury);
  const rolloutProtocol = getGnsProtocolVersion(config) === "rollout-v1";

  if (rolloutProtocol && config.publicRegistrationEnabled !== true) {
    throw new Error("GNS public registration is not enabled on this deployment.");
  }

  const keys = rolloutProtocol
    ? [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: rolloutPda, isSigner: false, isWritable: false },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: legacyReservationPda, isSigner: false, isWritable: false },
        { pubkey: namePda, isSigner: false, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ]
    : [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: namePda, isSigner: false, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ];

  const transaction = new Transaction().add(
    new TransactionInstruction({
      programId,
      keys,
      data: encodeNameInstruction(GNS_REGISTER_DISCRIMINATOR, normalizedName),
    }),
  );
  transaction.feePayer = owner;
  return transaction;
}

export function buildGnsReservedMigrationTransaction({
  config,
  name,
  owner,
}: {
  config: GnsRegistrationConfig;
  name: string;
  owner: PublicKey;
}) {
  if (getGnsProtocolVersion(config) !== "rollout-v1") {
    throw new Error("This GNS deployment does not support protected migrations.");
  }
  if (config.migrationEnabled !== true) {
    throw new Error("GNS legacy-name migration is not enabled yet.");
  }

  const normalizedName = normalizeGnsName(name);
  const {
    configPda,
    rolloutPda,
    legacyReservationPda,
    namePda,
    programId,
  } = deriveGnsRegistrationAccounts(normalizedName, config);
  const treasury = new PublicKey(config.treasury);

  const transaction = new Transaction().add(
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: true },
        { pubkey: rolloutPda, isSigner: false, isWritable: false },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: legacyReservationPda, isSigner: false, isWritable: true },
        { pubkey: namePda, isSigner: false, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      data: encodeNameInstruction(
        GNS_MIGRATE_RESERVED_DISCRIMINATOR,
        normalizedName,
      ),
    }),
  );
  transaction.feePayer = owner;
  return transaction;
}

export function getGnsRpcUrl(network: GnsNetwork) {
  const configured = process.env.NEXT_PUBLIC_GNS_SOLANA_RPC_URL?.trim();
  return configured || clusterApiUrl(network);
}

export function getGnsPrivyChain(
  network: GnsNetwork,
): "solana:mainnet" | "solana:devnet" | "solana:testnet" {
  if (network === "mainnet-beta") return "solana:mainnet";
  return network === "devnet" ? "solana:devnet" : "solana:testnet";
}

export function encodeGnsSignature(signature: Uint8Array) {
  return bs58.encode(signature);
}

export function getGnsExplorerUrl(
  signature: string,
  network: GnsNetwork,
) {
  const url = new URL(`https://explorer.solana.com/tx/${signature}`);
  if (network !== "mainnet-beta") url.searchParams.set("cluster", network);
  return url.toString();
}
