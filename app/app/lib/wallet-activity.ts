export type WalletActivityRecord = {
  id: string;
  kind: "send";
  sender: string;
  signature: string;
  recipient: string;
  recipientLabel: string;
  amountSol: string;
  createdAt: string;
};

const WALLET_ACTIVITY_STORAGE_KEY = "gwap-wallet-activity-v1";
const WALLET_ACTIVITY_EVENT = "gwap-wallet-activity";
const MAX_RECORDS = 40;

function normalizeRecord(value: unknown): WalletActivityRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WalletActivityRecord>;
  if (candidate.kind !== "send") return null;
  if (typeof candidate.sender !== "string" || candidate.sender.length < 32) return null;
  if (typeof candidate.signature !== "string" || candidate.signature.length < 32) return null;
  if (typeof candidate.recipient !== "string" || candidate.recipient.length < 32) return null;
  if (typeof candidate.amountSol !== "string" || !candidate.amountSol) return null;
  if (typeof candidate.createdAt !== "string" || Number.isNaN(Date.parse(candidate.createdAt))) return null;

  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id.slice(0, 120) : candidate.signature,
    kind: "send",
    sender: candidate.sender.slice(0, 80),
    signature: candidate.signature.slice(0, 120),
    recipient: candidate.recipient.slice(0, 80),
    recipientLabel:
      typeof candidate.recipientLabel === "string" && candidate.recipientLabel
        ? candidate.recipientLabel.slice(0, 80)
        : candidate.recipient.slice(0, 80),
    amountSol: candidate.amountSol.slice(0, 32),
    createdAt: candidate.createdAt.slice(0, 40),
  };
}

function readAllWalletActivity(): WalletActivityRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WALLET_ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeRecord)
      .filter((record): record is WalletActivityRecord => Boolean(record))
      .slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

export function readWalletActivity(sender: string): WalletActivityRecord[] {
  return readAllWalletActivity().filter((record) => record.sender === sender).slice(0, 20);
}

export function recordWalletActivity(record: WalletActivityRecord) {
  if (typeof window === "undefined") return;
  try {
    const next = [record, ...readAllWalletActivity().filter((item) => item.signature !== record.signature)].slice(
      0,
      MAX_RECORDS,
    );
    window.localStorage.setItem(WALLET_ACTIVITY_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(WALLET_ACTIVITY_EVENT));
  } catch {
    // On-chain confirmation remains authoritative even if the local activity cache is unavailable.
  }
}

export function subscribeWalletActivity(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(WALLET_ACTIVITY_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(WALLET_ACTIVITY_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
