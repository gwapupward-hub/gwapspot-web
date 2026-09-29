import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PPV_DEPLOYMENT_MANIFEST,
  PPV_KNOWN_DEVNET_REFERENCE,
} from "./deployment-manifest.ts";
import { PpvPolicyError, parsePpvConfig } from "./policy.ts";

const readinessSource = readFileSync(
  new URL("./readiness.server.ts", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../../app/ppv/page.tsx", import.meta.url),
  "utf8",
);

test("GwapOS attests the released Commerce program before enabling devnet writes", () => {
  const commerce = PPV_DEPLOYMENT_MANIFEST.programs.commerce;
  assert.equal(commerce.programId, "GmRDoFuPrBrsxnvTX751WK5rLu14JXe4sgjh6vNwHzr3");
  assert.equal(commerce.programDataAddress, "G8XpcqxCRyuASXwsE2yevjMn398f4E8Mg5ZArUg2qCT7");
  assert.equal(commerce.deploymentSlot, 505322161);
  assert.equal(commerce.upgradeAuthority, "B6tcsTrMCKTZV5vi3rRCnA3FMPeeWACSHuuTSz5XQgnX");
  assert.equal(
    commerce.binarySha256,
    "c59e208cb6d8a499d92a14ce2301f490de903b28444f953dafb1c4686e867f89",
  );
  assert.equal(
    commerce.idlSha256,
    "bd0523c1c8b14be040970cf462e6903420ae4a74c2bbb07aebb106e7be081d4b",
  );
  assert.equal(commerce.sourceCommit, "83b5e8843b5492f4c1b596cb5d4be5d997eb87e4");
  assert.equal(commerce.mutationApproved, true);
  assert.equal(PPV_KNOWN_DEVNET_REFERENCE.commerce.exists, true);
});

test("Escrow remains a separate read-only custody surface in GwapOS", () => {
  const escrow = PPV_DEPLOYMENT_MANIFEST.programs.escrow;
  assert.equal(escrow.mutationApproved, false);
  assert.equal(escrow.rr13_001FixedForBinary, false);

  assert.match(readinessSource, /layers\.includes\("escrow"\)/);
  assert.match(readinessSource, /CUSTODY_GATE_CLOSED/);
  assert.match(
    readinessSource,
    /layer === "escrow"[\s\S]*state: "disabled"[\s\S]*reasonCode: "CUSTODY_GATE_CLOSED"/,
  );
});

test("mainnet, real-value escrow and an open custody gate remain impossible configs", () => {
  const base = {
    PPV_ENABLED: "true",
    PPV_CLUSTER: "devnet",
    PPV_CORE_ENABLED: "true",
    PPV_COMMERCE_ENABLED: "true",
    PPV_ESCROW_ENABLED: "true",
    PPV_MAINNET_ENABLED: "false",
    PPV_ESCROW_REAL_VALUE: "false",
    PPV_CUSTODY_GATE: "CLOSED",
  };

  const accepted = parsePpvConfig(base);
  assert.equal(accepted.mainnet, false);
  assert.equal(accepted.realValue, false);
  assert.equal(accepted.custodyGate, "CLOSED");

  for (const env of [
    { ...base, PPV_MAINNET_ENABLED: "true" },
    { ...base, PPV_ESCROW_REAL_VALUE: "true" },
    { ...base, PPV_CUSTODY_GATE: "OPEN" },
  ]) {
    assert.throws(
      () => parsePpvConfig(env),
      (error) =>
        error instanceof PpvPolicyError && error.code === "MAINNET_DISABLED",
    );
  }
});


test("workspace labels attested Core and Commerce truthfully after release", () => {
  assert.match(readinessSource, /return "attested"/);
  assert.match(readinessSource, /expected\.programDataAddress/);
  assert.match(readinessSource, /observed\.binarySha256 === expected\.binarySha256/);
  assert.doesNotMatch(workspaceSource, /Commerce is not currently deployed/);
  assert.match(workspaceSource, /Core and Commerce are deployed, attested/);
  assert.match(workspaceSource, /custody[\s\S]*mutation stays hard-closed/);
});
