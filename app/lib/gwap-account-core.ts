export type GwapAccountWallet = {
  address: string;
  kind: "embedded" | "external";
  linkedAt: string;
};

export type GwapAccountRecord = {
  id: string;
  privyUserIds: string[];
  telegramUserId: string | null;
  wallets: GwapAccountWallet[];
  primaryWallet: string;
  primaryGnsIdentity: string | null;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
};

const GWAP_ACCOUNT_ID_PATTERN = /^gwap_[A-Za-z0-9_-]{20,64}$/;
const TELEGRAM_USER_ID_PATTERN = /^[1-9]\d{0,19}$/;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function safeString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function isGwapAccountId(value: unknown): value is string {
  return typeof value === "string" && GWAP_ACCOUNT_ID_PATTERN.test(value);
}

export function isTelegramUserId(value: unknown): value is string {
  return typeof value === "string" && TELEGRAM_USER_ID_PATTERN.test(value);
}

export function isSolanaAddress(value: unknown): value is string {
  return typeof value === "string" && SOLANA_ADDRESS_PATTERN.test(value);
}

export function normalizeGwapAccountRecord(value: unknown): GwapAccountRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<GwapAccountRecord>;
  if (!isGwapAccountId(candidate.id) || !isSolanaAddress(candidate.primaryWallet)) return null;

  const privyUserIds = Array.isArray(candidate.privyUserIds)
    ? [...new Set(candidate.privyUserIds.map((item) => safeString(item, 160)).filter(Boolean))].slice(0, 8)
    : [];
  if (!privyUserIds.length) return null;

  const wallets: GwapAccountWallet[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(candidate.wallets) ? candidate.wallets : []) {
    if (!entry || typeof entry !== "object") continue;
    const wallet = entry as Partial<GwapAccountWallet>;
    if (!isSolanaAddress(wallet.address) || seen.has(wallet.address)) continue;
    seen.add(wallet.address);
    wallets.push({
      address: wallet.address,
      kind: wallet.kind === "embedded" ? "embedded" : "external",
      linkedAt: typeof wallet.linkedAt === "string" && !Number.isNaN(Date.parse(wallet.linkedAt))
        ? wallet.linkedAt
        : new Date(0).toISOString(),
    });
  }
  if (!seen.has(candidate.primaryWallet)) {
    wallets.unshift({
      address: candidate.primaryWallet,
      kind: "external",
      linkedAt: new Date(0).toISOString(),
    });
  }

  const createdAt = typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt))
    ? candidate.createdAt
    : new Date(0).toISOString();
  const updatedAt = typeof candidate.updatedAt === "string" && !Number.isNaN(Date.parse(candidate.updatedAt))
    ? candidate.updatedAt
    : createdAt;

  return {
    id: candidate.id,
    privyUserIds,
    telegramUserId: isTelegramUserId(candidate.telegramUserId) ? candidate.telegramUserId : null,
    wallets,
    primaryWallet: candidate.primaryWallet,
    primaryGnsIdentity: safeString(candidate.primaryGnsIdentity, 128) || null,
    createdAt,
    updatedAt,
    schemaVersion: 1,
  };
}

export function mergeGwapAccountIdentity(
  record: GwapAccountRecord,
  input: {
    privyUserId: string;
    verifiedWallet: string;
    embeddedWallet?: string | null;
    primaryGnsIdentity?: string | null;
    now?: string;
  },
): GwapAccountRecord {
  const now = input.now || new Date().toISOString();
  const privyUserIds = [...new Set([...record.privyUserIds, input.privyUserId])].slice(0, 8);
  const walletMap = new Map(record.wallets.map((wallet) => [wallet.address, wallet]));
  if (isSolanaAddress(input.verifiedWallet)) {
    walletMap.set(input.verifiedWallet, {
      address: input.verifiedWallet,
      kind: input.embeddedWallet === input.verifiedWallet ? "embedded" : "external",
      linkedAt: walletMap.get(input.verifiedWallet)?.linkedAt || now,
    });
  }
  if (isSolanaAddress(input.embeddedWallet)) {
    walletMap.set(input.embeddedWallet, {
      address: input.embeddedWallet,
      kind: "embedded",
      linkedAt: walletMap.get(input.embeddedWallet)?.linkedAt || now,
    });
  }

  return {
    ...record,
    privyUserIds,
    wallets: [...walletMap.values()].slice(0, 12),
    primaryWallet: isSolanaAddress(input.verifiedWallet) ? input.verifiedWallet : record.primaryWallet,
    primaryGnsIdentity: safeString(input.primaryGnsIdentity, 128) || record.primaryGnsIdentity,
    updatedAt: now,
  };
}
