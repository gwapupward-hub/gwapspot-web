import { bytesToHex } from "./core.ts";
import { canonicalizeBytesV1, hashDocumentV1 } from "./canonical.ts";

/**
 * A PPV agreement commits to two separate hashes: the content the parties are
 * agreeing about, and the terms they are agreeing to. Keeping them separate is
 * what lets a revision change one without silently carrying the other forward,
 * and what lets a signature name exactly which pair it endorses.
 *
 * Both are canonicalized and hashed on this device. Neither document is sent to
 * an API or written to storage — only the resulting 32-byte hashes reach the
 * chain, and only the hashes are what a counterparty can check.
 */

export type AgreementDraft = {
  title: string;
  summary: string;
  deliverables: readonly string[];
};

export type TermsDraft = {
  scope: string;
  compensationNote: string;
  /** ISO-8601 date, e.g. "2026-09-30". Display and commitment only. */
  completionDate: string;
};

export class AgreementDraftError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "AgreementDraftError";
    this.field = field;
  }
}

const MAX_FIELD_LENGTH = 4000;
const MAX_DELIVERABLES = 20;

function requireText(value: string, field: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AgreementDraftError(field, `${label} is required.`);
  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new AgreementDraftError(
      field,
      `${label} must be ${MAX_FIELD_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

/**
 * The exact document the content hash commits to. The shape is frozen: adding,
 * removing or renaming a key changes every hash this app has ever produced, so
 * it is versioned explicitly rather than evolved in place.
 */
export function buildAgreementDocument(draft: AgreementDraft) {
  const deliverables = draft.deliverables
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (deliverables.length > MAX_DELIVERABLES) {
    throw new AgreementDraftError(
      "deliverables",
      `List ${MAX_DELIVERABLES} deliverables or fewer.`,
    );
  }
  for (const deliverable of deliverables) {
    if (deliverable.length > MAX_FIELD_LENGTH) {
      throw new AgreementDraftError(
        "deliverables",
        `Each deliverable must be ${MAX_FIELD_LENGTH} characters or fewer.`,
      );
    }
  }

  return {
    documentType: "ppv.agreement.content",
    title: requireText(draft.title, "title", "A title"),
    summary: requireText(draft.summary, "summary", "A summary"),
    deliverables,
  } as const;
}

/** The exact document the terms hash commits to. Frozen for the same reason. */
export function buildTermsDocument(draft: TermsDraft) {
  const completionDate = requireText(
    draft.completionDate,
    "completionDate",
    "A completion date",
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completionDate)) {
    throw new AgreementDraftError(
      "completionDate",
      "Use a calendar date in YYYY-MM-DD form.",
    );
  }

  return {
    documentType: "ppv.agreement.terms",
    scope: requireText(draft.scope, "scope", "A scope"),
    compensationNote: requireText(
      draft.compensationNote,
      "compensationNote",
      "A compensation note",
    ),
    completionDate,
  } as const;
}

export async function hashAgreementDraft(
  content: AgreementDraft,
  terms: TermsDraft,
) {
  const contentDocument = buildAgreementDocument(content);
  const termsDocument = buildTermsDocument(terms);

  const [contentHash, termsHash] = await Promise.all([
    hashDocumentV1(contentDocument),
    hashDocumentV1(termsDocument),
  ]);

  return {
    contentDocument,
    termsDocument,
    contentHashHex: bytesToHex(contentHash),
    termsHashHex: bytesToHex(termsHash),
  };
}

/** Exposed so a party can show exactly which bytes they are about to endorse. */
export function previewCanonicalBytes(document: unknown) {
  return new TextDecoder().decode(canonicalizeBytesV1(document));
}

export const PPV_AGREEMENT_MAX_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * The program requires `now < expires_at <= now + 1 year`, measured against the
 * cluster clock. Validate here so a wallet is never asked to sign a transaction
 * that cannot succeed.
 */
export function resolveExpiry(
  isoDate: string,
  nowSeconds: number,
): bigint {
  const parsed = Date.parse(`${isoDate}T23:59:59Z`);
  if (Number.isNaN(parsed)) {
    throw new AgreementDraftError("expiresAt", "Use a valid expiry date.");
  }
  const seconds = Math.floor(parsed / 1000);
  if (seconds <= nowSeconds) {
    throw new AgreementDraftError(
      "expiresAt",
      "The expiry has to be in the future.",
    );
  }
  if (seconds > nowSeconds + PPV_AGREEMENT_MAX_TTL_SECONDS) {
    throw new AgreementDraftError(
      "expiresAt",
      "An agreement can run for at most one year.",
    );
  }
  return BigInt(seconds);
}
