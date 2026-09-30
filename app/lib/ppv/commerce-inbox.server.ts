import "server-only";

import { randomUUID } from "node:crypto";
import { getPrivateStorageKey, getWorkspaceRedis } from "../redis";
import { hashDocumentHexV1 } from "../ppv-sdk/canonical";
import { readCommerceAgreement } from "./commerce.server";

const SCHEMA_VERSION = 1 as const;
const MAX_ITEMS_PER_WALLET = 64;
const LOCK_TTL_SECONDS = 8;
const LOCK_ATTEMPTS = 24;
const LOCK_DELAY_MS = 40;
const MAX_DOCUMENT_CHARS = 20_000;

export class PpvCommerceInboxError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400, message = code) {
    super(message);
    this.name = "PpvCommerceInboxError";
    this.code = code;
    this.status = status;
  }
}

export type CommerceInboxSignature = Readonly<{
  signer: string;
  versionSigned: number;
  contentHashSigned: string;
  termsHashSigned: string;
  signedAt: number;
}>;

export type CommerceInboxItem = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION;
  agreementAddress: string;
  agreementIdHex: string;
  partyA: string;
  partyB: string;
  version: number;
  state: "pending" | "executed" | "cancelled";
  sigA: CommerceInboxSignature | null;
  sigB: CommerceInboxSignature | null;
  contentHash: string;
  termsHash: string;
  content: string;
  terms: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  executedAt: number;
  cancelledAt: number;
  inboxUpdatedAt: string;
}>;

type WalletIndex = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION;
  addresses: readonly string[];
}>;

function enabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    env.PPV_CLUSTER?.trim().toLowerCase() === "devnet" &&
    env.PPV_COMMERCE_INBOX_ENABLED?.trim().toLowerCase() === "true"
  );
}

export function isCommerceInboxEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return enabled(env);
}

function requireEnabled() {
  if (!enabled()) {
    throw new PpvCommerceInboxError(
      "COMMERCE_INBOX_DISABLED",
      404,
      "The PPV Commerce devnet inbox is disabled.",
    );
  }
}

function envelopeKey(agreementAddress: string) {
  return getPrivateStorageKey("ppv-commerce-inbox-envelope", agreementAddress);
}

function walletIndexKey(wallet: string) {
  return getPrivateStorageKey("ppv-commerce-inbox-index", wallet);
}

function walletLockKey(wallet: string) {
  return getPrivateStorageKey("ppv-commerce-inbox-lock", wallet);
}

function parseJsonObject(value: string, label: string) {
  if (!value.trim() || value.length > MAX_DOCUMENT_CHARS) {
    throw new PpvCommerceInboxError(
      "INVALID_COMMERCE_DOCUMENT",
      400,
      `${label} must be between 1 and ${MAX_DOCUMENT_CHARS} characters.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PpvCommerceInboxError(
      "INVALID_COMMERCE_DOCUMENT",
      400,
      `${label} must be valid JSON.`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PpvCommerceInboxError(
      "INVALID_COMMERCE_DOCUMENT",
      400,
      `${label} must be a JSON object.`,
    );
  }
  return parsed as Record<string, unknown>;
}

function titleFromContent(content: Record<string, unknown>) {
  const candidate = content.title;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().slice(0, 120)
    : "PPV Commerce agreement";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withWalletIndexLock<T>(wallet: string, work: () => Promise<T>) {
  const redis = getWorkspaceRedis();
  const lockKey = walletLockKey(wallet);
  const token = randomUUID();

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    const acquired = await redis.setIfAbsent(lockKey, token, LOCK_TTL_SECONDS);
    if (acquired) {
      try {
        return await work();
      } finally {
        await redis.deleteIfValue(lockKey, token).catch(() => false);
      }
    }
    await sleep(LOCK_DELAY_MS);
  }

  throw new PpvCommerceInboxError(
    "COMMERCE_INBOX_BUSY",
    409,
    "The Commerce inbox is busy. Retry shortly.",
  );
}

async function addToWalletIndex(wallet: string, agreementAddress: string) {
  const redis = getWorkspaceRedis();
  await withWalletIndexLock(wallet, async () => {
    const key = walletIndexKey(wallet);
    const current = await redis.get<WalletIndex>(key);
    const existing =
      current?.schemaVersion === SCHEMA_VERSION && Array.isArray(current.addresses)
        ? current.addresses.filter((value) => typeof value === "string")
        : [];
    const next = [
      agreementAddress,
      ...existing.filter((value) => value !== agreementAddress),
    ].slice(0, MAX_ITEMS_PER_WALLET);
    await redis.set<WalletIndex>(key, {
      schemaVersion: SCHEMA_VERSION,
      addresses: next,
    });
  });
}

function sameHash(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export async function syncCommerceInboxAgreement(input: {
  authority: string;
  partyA: string;
  agreementIdHex: string;
  content: string;
  terms: string;
}) {
  requireEnabled();

  const [contentDocument, termsDocument] = [
    parseJsonObject(input.content, "Content"),
    parseJsonObject(input.terms, "Terms"),
  ];

  const agreement = await readCommerceAgreement({
    authority: input.authority,
    partyA: input.partyA,
    agreementIdHex: input.agreementIdHex,
  });

  const [contentHash, termsHash] = await Promise.all([
    hashDocumentHexV1(contentDocument),
    hashDocumentHexV1(termsDocument),
  ]);

  if (
    !sameHash(contentHash, agreement.contentHash) ||
    !sameHash(termsHash, agreement.termsHash)
  ) {
    throw new PpvCommerceInboxError(
      "COMMERCE_INBOX_DOCUMENT_MISMATCH",
      409,
      "The supplied documents do not match the finalized Commerce agreement.",
    );
  }

  const item: CommerceInboxItem = {
    schemaVersion: SCHEMA_VERSION,
    agreementAddress: agreement.agreementAddress,
    agreementIdHex: agreement.agreementId,
    partyA: agreement.partyA,
    partyB: agreement.partyB,
    version: agreement.version,
    state: agreement.state,
    sigA: agreement.sigA,
    sigB: agreement.sigB,
    contentHash: agreement.contentHash,
    termsHash: agreement.termsHash,
    content: input.content,
    terms: input.terms,
    title: titleFromContent(contentDocument),
    createdAt: agreement.createdAt,
    expiresAt: agreement.expiresAt,
    executedAt: agreement.executedAt,
    cancelledAt: agreement.cancelledAt,
    inboxUpdatedAt: new Date().toISOString(),
  };

  const redis = getWorkspaceRedis();
  await redis.set(envelopeKey(item.agreementAddress), item);
  await Promise.all([
    addToWalletIndex(item.partyA, item.agreementAddress),
    addToWalletIndex(item.partyB, item.agreementAddress),
  ]);

  return item;
}

export async function listCommerceInbox(authority: string) {
  requireEnabled();
  const redis = getWorkspaceRedis();
  const index = await redis.get<WalletIndex>(walletIndexKey(authority));
  if (
    !index ||
    index.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(index.addresses)
  ) {
    return [] as CommerceInboxItem[];
  }

  const addresses = index.addresses
    .filter((value): value is string => typeof value === "string")
    .slice(0, MAX_ITEMS_PER_WALLET);

  const items = await Promise.all(
    addresses.map((address) =>
      redis.get<CommerceInboxItem>(envelopeKey(address)).catch(() => null),
    ),
  );

  return items
    .filter((item): item is CommerceInboxItem => {
      if (!item || item.schemaVersion !== SCHEMA_VERSION) return false;
      return item.partyA === authority || item.partyB === authority;
    })
    .sort((left, right) =>
      right.inboxUpdatedAt.localeCompare(left.inboxUpdatedAt),
    );
}

export function pendingIncomingCommerceCount(
  authority: string,
  items: readonly CommerceInboxItem[],
) {
  return items.filter(
    (item) =>
      item.partyB === authority &&
      item.state === "pending" &&
      item.sigB === null,
  ).length;
}
