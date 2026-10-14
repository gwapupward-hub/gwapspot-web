import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(
  path.join(process.cwd(), "app/app/marketplace/page.tsx"),
  "utf8",
);
const policy = fs.readFileSync(
  path.join(process.cwd(), "app/lib/marketplace-collaboration-packet.ts"),
  "utf8",
);

test("Marketplace exposes explicit collaboration packet preview, copy, and share actions", () => {
  assert.match(page, /COLLABORATION PACKET/);
  assert.match(page, /Preview exact packet text/);
  assert.match(page, /Copy collaboration packet/);
  assert.match(page, /Share collaboration packet/);
  assert.match(page, /navigator\.clipboard/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /buildMarketplaceCollaborationPacket/);
});

test("the preview renders the exact same bounded packet text used by copy and share", () => {
  assert.match(page, /aria-label="Collaboration packet preview"/);
  assert.match(page, /value=\{collaborationPacket\.text\}/);
  assert.match(page, /readOnly/);
  assert.match(page, /This is the exact text Copy and Share use/);
  assert.match(page, /navigator\.clipboard\.writeText\(collaborationPacket\.text\)/);
  assert.match(page, /text: collaborationPacket\.text/);
});

test("previewing, copying, or sharing a packet never becomes Marketplace publishing or matching", () => {
  assert.match(page, /Nothing is published or matched by these actions/);
  assert.match(policy, /does not publish or match this brief in GWAP Marketplace/);
  assert.doesNotMatch(page, /publishMarketplace|matchProvider|createListing/);
  assert.doesNotMatch(policy, /Published|Matched|Funded|Escrow/);
});

test("the packet attaches only canonical public trust context", () => {
  assert.match(policy, /https:\/\/www\.gwapspot\.com/);
  assert.match(policy, /\/profile\//);
  assert.match(page, /gnsIdentity\.status === "found"/);
  assert.match(page, /Preview attached public Trust Profile/);
  assert.doesNotMatch(policy, /wallet|score|email|signature/i);
});

test("private brief content leaves the app only after explicit copy or share interaction", () => {
  assert.match(page, /onClick=\{\(\) => void copyCollaborationPacket\(\)\}/);
  assert.match(page, /onClick=\{\(\) => void shareCollaborationPacket\(\)\}/);
  assert.match(page, /<details>/);
  assert.doesNotMatch(page, /useEffect\([^)]*(?:copy|share)CollaborationPacket/);
  assert.doesNotMatch(page, /track\s*\(|safeTrack\s*\(/);
  assert.doesNotMatch(page, /fetch\s*\(/);
});

test("native share cancellation does not silently copy private content", () => {
  assert.match(page, /function isShareCancellation\(error: unknown\)/);
  assert.match(page, /\(error as \{ name\?: unknown \}\)\.name === "AbortError"/);
  assert.match(page, /if \(isShareCancellation\(error\)\) \{\s*setPacketActionStatus\("idle"\);\s*return;/);
});

test("unsupported native sharing falls back to the existing copy path", () => {
  assert.match(page, /typeof navigator\.share !== "function"/);
  assert.match(page, /await copyCollaborationPacket\(\);\s*return;/);
});

test("unresolved workspace migration fails closed before private preview, copy, or share", () => {
  assert.match(page, /migrationAvailable/);
  assert.match(page, /!migrationAvailable && selected/);
  assert.match(page, /Resolve workspace authority in the banner above before previewing, copying, or sharing private brief details/);
});

test("Draft and empty-scope states remain visibly gated", () => {
  assert.match(page, /Mark this brief Ready before creating a collaboration packet/);
  assert.match(page, /Add a non-empty scope before creating a collaboration packet/);
});
