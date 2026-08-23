import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgreementDraftError,
  PPV_AGREEMENT_MAX_TTL_SECONDS,
  buildAgreementDocument,
  buildTermsDocument,
  hashAgreementDraft,
  previewCanonicalBytes,
  resolveExpiry,
} from "./agreements.ts";

const CONTENT = {
  title: "Brand identity refresh",
  summary: "Deliver a refreshed brand identity for GWAP OS.",
  deliverables: ["Logo set", "Type scale", "  ", "Motion guide"],
};

const TERMS = {
  scope: "Two revision rounds included.",
  compensationNote: "Settled outside PPV. Foundation holds no funds.",
  completionDate: "2026-11-30",
};

test("blank deliverables are dropped rather than committed as empty strings", () => {
  const document = buildAgreementDocument(CONTENT);
  assert.deepEqual(document.deliverables, ["Logo set", "Type scale", "Motion guide"]);
});

test("required fields are rejected with the field that is wrong", () => {
  assert.throws(
    () => buildAgreementDocument({ ...CONTENT, title: "   " }),
    (error) => error instanceof AgreementDraftError && error.field === "title",
  );
  assert.throws(
    () => buildTermsDocument({ ...TERMS, scope: "" }),
    (error) => error instanceof AgreementDraftError && error.field === "scope",
  );
});

test("a completion date must be a calendar date, not free text", () => {
  assert.throws(
    () => buildTermsDocument({ ...TERMS, completionDate: "next November" }),
    (error) =>
      error instanceof AgreementDraftError && error.field === "completionDate",
  );
});

test("hashing is stable across key order and whitespace-equivalent drafts", async () => {
  const first = await hashAgreementDraft(CONTENT, TERMS);
  const reordered = await hashAgreementDraft(
    {
      deliverables: ["Logo set", "Type scale", "Motion guide"],
      summary: CONTENT.summary,
      title: `  ${CONTENT.title}  `,
    },
    {
      completionDate: TERMS.completionDate,
      compensationNote: TERMS.compensationNote,
      scope: TERMS.scope,
    },
  );

  assert.equal(first.contentHashHex, reordered.contentHashHex);
  assert.equal(first.termsHashHex, reordered.termsHashHex);
  assert.match(first.contentHashHex, /^[0-9a-f]{64}$/);
});

test("content and terms hash independently, so revising one does not move the other", async () => {
  const base = await hashAgreementDraft(CONTENT, TERMS);
  const revisedContent = await hashAgreementDraft(
    { ...CONTENT, summary: "Deliver a refreshed identity and a motion system." },
    TERMS,
  );
  const revisedTerms = await hashAgreementDraft(CONTENT, {
    ...TERMS,
    scope: "Three revision rounds included.",
  });

  assert.notEqual(base.contentHashHex, revisedContent.contentHashHex);
  assert.equal(base.termsHashHex, revisedContent.termsHashHex);

  assert.equal(base.contentHashHex, revisedTerms.contentHashHex);
  assert.notEqual(base.termsHashHex, revisedTerms.termsHashHex);
});

test("content and terms never collide even with identical text", async () => {
  const identical = { title: "x", summary: "x", deliverables: [] };
  const content = buildAgreementDocument(identical);
  const terms = buildTermsDocument({
    scope: "x",
    compensationNote: "x",
    completionDate: "2026-01-01",
  });
  assert.notEqual(content.documentType, terms.documentType);
});

test("the canonical preview is the exact byte string that gets hashed", async () => {
  const document = buildAgreementDocument(CONTENT);
  const preview = previewCanonicalBytes(document);
  assert.match(preview, /^\{"deliverables":/);
  assert.match(preview, /"specVersion":"1"/);
});

test("expiry must be in the future and inside the program's one-year ceiling", () => {
  const now = Math.floor(Date.parse("2026-08-23T00:00:00Z") / 1000);

  assert.equal(typeof resolveExpiry("2026-09-30", now), "bigint");

  assert.throws(
    () => resolveExpiry("2026-08-22", now),
    (error) => error instanceof AgreementDraftError && /future/.test(error.message),
  );

  const tooFar = new Date((now + PPV_AGREEMENT_MAX_TTL_SECONDS + 86_400) * 1000)
    .toISOString()
    .slice(0, 10);
  assert.throws(
    () => resolveExpiry(tooFar, now),
    (error) => error instanceof AgreementDraftError && /one year/.test(error.message),
  );

  assert.throws(
    () => resolveExpiry("not-a-date", now),
    (error) => error instanceof AgreementDraftError,
  );
});
