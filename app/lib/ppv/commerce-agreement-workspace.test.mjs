import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Agreements route uses the consumer workspace instead of the raw JSON workbench", () => {
  const page = read("../../app/ppv/agreements/page.tsx");
  assert.match(page, /PpvAgreementWorkspace/);
  assert.doesNotMatch(page, /<PpvAgreementActions/);
  assert.match(page, /without writing protocol JSON/i);
});

test("consumer agreement workspace generates canonical documents behind the human form", () => {
  const workspace = read("../../app/ppv/agreements/agreement-workspace.tsx");
  assert.match(workspace, /function canonicalDocuments/);
  assert.match(workspace, /type: "ppv-commerce-agreement"/);
  assert.match(workspace, /hashDocumentHexV1\(generatedDocuments\.content\)/);
  assert.match(workspace, /hashDocumentHexV1\(generatedDocuments\.terms\)/);
  assert.match(workspace, /Advanced · structured agreement & protocol details/);
  assert.match(workspace, /Normal users never need to write JSON/);
});

test("agreement approval stays version-bound and payment remains non-custodial", () => {
  const workspace = read("../../app/ppv/agreements/agreement-workspace.tsx");
  assert.match(workspace, /reviewedVersion !== record\.version/);
  assert.match(workspace, /Approve & sign agreement/);
  assert.match(workspace, /Payment is terms-only in this pilot/);
  assert.match(workspace, /PPV Escrow remains read-only with the custody gate closed/);
  assert.match(workspace, /result\.signature\.length !== 64/);
});
