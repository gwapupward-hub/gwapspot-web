import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  PpvDecodeError,
  accountDiscriminator,
  cancelAgreementInstruction,
  createAgreementInstruction,
  createProofInstruction,
  decodeAgreementRecord,
  decodeProofRecord,
  describePpvProgramError,
  findAgreementAddress,
  findEventAuthority,
  findProofAddress,
  instructionDiscriminator,
  ppvIdFromHex,
  ppvIdToHex,
  proposeRevisionInstruction,
  randomPpvId,
  revokeProofInstruction,
  signAgreementInstruction,
} from "./program.ts";

const CORE = new PublicKey("11111111111111111111111111111112");
const COMMERCE = new PublicKey("11111111111111111111111111111113");
const AUTHORITY = new PublicKey("11111111111111111111111111111114");
const COUNTERPARTY = new PublicKey("11111111111111111111111111111115");

const PROOF_ID = ppvIdFromHex("000102030405060708090a0b0c0d0e0f");
const CONTENT_HASH = new Uint8Array(32).fill(7);
const CONTEXT_HASH = new Uint8Array(32);
const TERMS_HASH = new Uint8Array(32).fill(9);

function anchorDiscriminator(prefix, name) {
  return new Uint8Array(
    createHash("sha256").update(`${prefix}:${name}`).digest().subarray(0, 8),
  );
}

test("instruction discriminators follow Anchor's global: rule", async () => {
  for (const name of [
    "create_proof",
    "revoke_proof",
    "create_agreement",
    "propose_revision",
    "sign_agreement",
    "cancel_agreement",
  ]) {
    assert.deepEqual(
      await instructionDiscriminator(name),
      anchorDiscriminator("global", name),
      name,
    );
  }
});

test("account discriminators follow Anchor's account: rule", async () => {
  assert.deepEqual(
    await accountDiscriminator("ProofRecord"),
    anchorDiscriminator("account", "ProofRecord"),
  );
  assert.deepEqual(
    await accountDiscriminator("Agreement"),
    anchorDiscriminator("account", "Agreement"),
  );
});

test("create_proof matches the program's account order and layout", async () => {
  const ix = await createProofInstruction({
    programId: CORE,
    authority: AUTHORITY,
    proofId: PROOF_ID,
    contentHash: CONTENT_HASH,
    contextHash: CONTEXT_HASH,
    kind: "creation",
  });

  assert.equal(ix.keys.length, 5);
  assert.deepEqual(
    ix.keys.map((key) => [key.pubkey.toBase58(), key.isSigner, key.isWritable]),
    [
      [AUTHORITY.toBase58(), true, true],
      [findProofAddress(CORE, AUTHORITY, PROOF_ID).toBase58(), false, true],
      [SystemProgram.programId.toBase58(), false, false],
      [findEventAuthority(CORE).toBase58(), false, false],
      [CORE.toBase58(), false, false],
    ],
  );

  // 8 discriminator + 16 id + 32 content + 32 context + 1 kind
  assert.equal(ix.data.length, 89);
  assert.deepEqual(
    new Uint8Array(ix.data.subarray(0, 8)),
    anchorDiscriminator("global", "create_proof"),
  );
  assert.deepEqual(new Uint8Array(ix.data.subarray(8, 24)), PROOF_ID);
  assert.deepEqual(new Uint8Array(ix.data.subarray(24, 56)), CONTENT_HASH);
  assert.equal(ix.data[88], 0, "creation is the first ProofKind discriminant");
});

test("proof kinds encode in the program's declaration order", async () => {
  const kinds = [
    "creation",
    "document",
    "agreement",
    "invoice",
    "deliverable",
    "other",
  ];
  for (const [index, kind] of kinds.entries()) {
    const ix = await createProofInstruction({
      programId: CORE,
      authority: AUTHORITY,
      proofId: PROOF_ID,
      contentHash: CONTENT_HASH,
      contextHash: CONTEXT_HASH,
      kind,
    });
    assert.equal(ix.data[88], index, kind);
  }
});

test("create_proof refuses an all-zero content hash before it reaches a wallet", async () => {
  await assert.rejects(
    () =>
      createProofInstruction({
        programId: CORE,
        authority: AUTHORITY,
        proofId: PROOF_ID,
        contentHash: new Uint8Array(32),
        contextHash: CONTEXT_HASH,
        kind: "creation",
      }),
    RangeError,
  );
});

test("revoke_proof carries no arguments and does not mark the authority writable", async () => {
  const proof = findProofAddress(CORE, AUTHORITY, PROOF_ID);
  const ix = await revokeProofInstruction({
    programId: CORE,
    authority: AUTHORITY,
    proof,
  });

  assert.equal(ix.data.length, 8);
  assert.deepEqual(
    ix.keys.map((key) => [key.isSigner, key.isWritable]),
    [
      [true, false],
      [false, true],
      [false, false],
      [false, false],
    ],
  );
});

test("create_agreement packs party_b, both hashes and a little-endian i64 expiry", async () => {
  const expiresAt = 1_800_000_000n;
  const ix = await createAgreementInstruction({
    programId: COMMERCE,
    partyA: AUTHORITY,
    partyB: COUNTERPARTY,
    agreementId: PROOF_ID,
    contentHash: CONTENT_HASH,
    termsHash: TERMS_HASH,
    expiresAt,
  });

  // 8 + 16 + 32 pubkey + 32 + 32 + 8
  assert.equal(ix.data.length, 128);
  assert.deepEqual(
    new Uint8Array(ix.data.subarray(24, 56)),
    COUNTERPARTY.toBytes(),
  );
  const view = new DataView(
    ix.data.buffer,
    ix.data.byteOffset + 120,
    8,
  );
  assert.equal(view.getBigInt64(0, true), expiresAt);
  assert.equal(
    ix.keys[1].pubkey.toBase58(),
    findAgreementAddress(COMMERCE, AUTHORITY, PROOF_ID).toBase58(),
  );
});

test("an agreement cannot be created with yourself as the counterparty", async () => {
  await assert.rejects(
    () =>
      createAgreementInstruction({
        programId: COMMERCE,
        partyA: AUTHORITY,
        partyB: AUTHORITY,
        agreementId: PROOF_ID,
        contentHash: CONTENT_HASH,
        termsHash: TERMS_HASH,
        expiresAt: 1_800_000_000n,
      }),
    RangeError,
  );
});

test("sign and revise bind an exact version plus both hashes", async () => {
  const agreement = findAgreementAddress(COMMERCE, AUTHORITY, PROOF_ID);

  for (const build of [signAgreementInstruction, proposeRevisionInstruction]) {
    const ix = await build({
      programId: COMMERCE,
      signer: AUTHORITY,
      agreement,
      expectedVersion: 3,
      expectedContentHash: CONTENT_HASH,
      expectedTermsHash: TERMS_HASH,
      newContentHash: CONTENT_HASH,
      newTermsHash: TERMS_HASH,
    });

    // 8 + 4 version + 32 + 32
    assert.equal(ix.data.length, 76);
    const version = new DataView(
      ix.data.buffer,
      ix.data.byteOffset + 8,
      4,
    ).getUint32(0, true);
    assert.equal(version, 3);
    assert.deepEqual(new Uint8Array(ix.data.subarray(12, 44)), CONTENT_HASH);
    assert.deepEqual(new Uint8Array(ix.data.subarray(44, 76)), TERMS_HASH);
  }
});

test("cancel_agreement carries no arguments", async () => {
  const ix = await cancelAgreementInstruction({
    programId: COMMERCE,
    signer: AUTHORITY,
    agreement: findAgreementAddress(COMMERCE, AUTHORITY, PROOF_ID),
  });
  assert.equal(ix.data.length, 8);
});

test("proof and agreement addresses are namespaced by wallet and id", () => {
  const other = ppvIdFromHex("ffffffffffffffffffffffffffffffff");
  assert.notEqual(
    findProofAddress(CORE, AUTHORITY, PROOF_ID).toBase58(),
    findProofAddress(CORE, COUNTERPARTY, PROOF_ID).toBase58(),
  );
  assert.notEqual(
    findProofAddress(CORE, AUTHORITY, PROOF_ID).toBase58(),
    findProofAddress(CORE, AUTHORITY, other).toBase58(),
  );
  assert.notEqual(
    findProofAddress(CORE, AUTHORITY, PROOF_ID).toBase58(),
    findAgreementAddress(CORE, AUTHORITY, PROOF_ID).toBase58(),
  );
});

test("ppv ids round-trip through hex and are 16 random bytes", () => {
  assert.equal(ppvIdToHex(PROOF_ID), "000102030405060708090a0b0c0d0e0f");
  assert.deepEqual(ppvIdFromHex(ppvIdToHex(PROOF_ID)), PROOF_ID);
  assert.equal(randomPpvId().length, 16);
  assert.throws(() => ppvIdFromHex("nothex"), RangeError);
});

async function encodeProofAccount(overrides = {}) {
  const parts = [];
  parts.push(await accountDiscriminator("ProofRecord"));
  parts.push(Uint8Array.of(overrides.schemaVersion ?? 1, 254));
  parts.push(PROOF_ID);
  parts.push(AUTHORITY.toBytes());
  parts.push(CONTENT_HASH);
  parts.push(CONTEXT_HASH);
  parts.push(Uint8Array.of(overrides.kind ?? 0, overrides.status ?? 0));
  const times = new Uint8Array(16);
  const view = new DataView(times.buffer);
  view.setBigInt64(0, overrides.createdAt ?? 1_700_000_000n, true);
  view.setBigInt64(8, overrides.revokedAt ?? 0n, true);
  parts.push(times);
  parts.push(new Uint8Array(64));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

test("a proof account decodes into the fields the program wrote", async () => {
  const record = await decodeProofRecord(await encodeProofAccount());
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.authority.toBase58(), AUTHORITY.toBase58());
  assert.deepEqual(record.contentHash, CONTENT_HASH);
  assert.equal(record.kind, "creation");
  assert.equal(record.status, "active");
  assert.equal(record.createdAt, 1_700_000_000n);
  assert.equal(record.revokedAt, 0n);
});

test("a revoked proof decodes as revoked, not as a missing value", async () => {
  const record = await decodeProofRecord(
    await encodeProofAccount({ status: 1, revokedAt: 1_700_000_500n }),
  );
  assert.equal(record.status, "revoked");
  assert.equal(record.revokedAt, 1_700_000_500n);
});

test("an account from another program is rejected rather than misread", async () => {
  const foreign = await encodeProofAccount();
  foreign[0] ^= 0xff;
  await assert.rejects(() => decodeProofRecord(foreign), PpvDecodeError);
});

test("truncated account data is rejected rather than read as zeroes", async () => {
  const truncated = (await encodeProofAccount()).slice(0, 40);
  await assert.rejects(() => decodeProofRecord(truncated), PpvDecodeError);
});

async function encodeAgreementAccount({ sigA = null, sigB = null, state = 0, version = 1 } = {}) {
  const parts = [];
  parts.push(await accountDiscriminator("Agreement"));
  parts.push(Uint8Array.of(1, 253));
  parts.push(PROOF_ID);
  parts.push(AUTHORITY.toBytes());
  parts.push(COUNTERPARTY.toBytes());
  const versionBytes = new Uint8Array(4);
  new DataView(versionBytes.buffer).setUint32(0, version, true);
  parts.push(versionBytes);
  parts.push(CONTENT_HASH);
  parts.push(TERMS_HASH);

  for (const signature of [sigA, sigB]) {
    if (!signature) {
      parts.push(Uint8Array.of(0));
      continue;
    }
    parts.push(Uint8Array.of(1));
    parts.push(signature.signer.toBytes());
    const signedVersion = new Uint8Array(4);
    new DataView(signedVersion.buffer).setUint32(0, signature.version, true);
    parts.push(signedVersion);
    parts.push(CONTENT_HASH);
    parts.push(TERMS_HASH);
    const signedAt = new Uint8Array(8);
    new DataView(signedAt.buffer).setBigInt64(0, signature.signedAt, true);
    parts.push(signedAt);
  }

  parts.push(Uint8Array.of(state));
  const times = new Uint8Array(32);
  const view = new DataView(times.buffer);
  view.setBigInt64(0, 1_700_000_000n, true);
  view.setBigInt64(8, 1_800_000_000n, true);
  view.setBigInt64(16, 0n, true);
  view.setBigInt64(24, 0n, true);
  parts.push(times);
  parts.push(new Uint8Array(64));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

test("an unsigned agreement decodes both signature slots as absent", async () => {
  const record = await decodeAgreementRecord(await encodeAgreementAccount());
  assert.equal(record.sigA, null);
  assert.equal(record.sigB, null);
  assert.equal(record.state, "pending");
  assert.equal(record.version, 1);
  assert.equal(record.expiresAt, 1_800_000_000n);
});

test("a one-sided signature decodes without shifting the fields after it", async () => {
  const record = await decodeAgreementRecord(
    await encodeAgreementAccount({
      sigA: { signer: AUTHORITY, version: 2, signedAt: 1_700_000_900n },
      state: 0,
      version: 2,
    }),
  );
  assert.equal(record.sigA?.signer.toBase58(), AUTHORITY.toBase58());
  assert.equal(record.sigA?.versionSigned, 2);
  assert.equal(record.sigA?.signedAt, 1_700_000_900n);
  assert.equal(record.sigB, null);
  assert.equal(record.state, "pending");
  assert.equal(record.version, 2);
});

test("a fully executed agreement decodes both signatures and the executed state", async () => {
  const record = await decodeAgreementRecord(
    await encodeAgreementAccount({
      sigA: { signer: AUTHORITY, version: 1, signedAt: 1_700_000_900n },
      sigB: { signer: COUNTERPARTY, version: 1, signedAt: 1_700_000_950n },
      state: 1,
    }),
  );
  assert.equal(record.state, "executed");
  assert.equal(record.sigA?.signer.toBase58(), AUTHORITY.toBase58());
  assert.equal(record.sigB?.signer.toBase58(), COUNTERPARTY.toBase58());
});

test("program errors map to their declared meaning, and unknown ones stay unknown", () => {
  const stale = { logs: ["Program log: AnchorError ... Error Number: 6005."] };
  assert.match(
    describePpvProgramError(stale, "commerce") ?? "",
    /older version/i,
  );
  assert.match(
    describePpvProgramError(
      new Error("... custom program error: 0x1772"),
      "core",
    ) ?? "",
    /already revoked/i,
  );
  assert.equal(describePpvProgramError(new Error("network timeout"), "core"), null);
  assert.equal(
    describePpvProgramError({ logs: ["Error Number: 9999."] }, "commerce"),
    null,
  );
});
