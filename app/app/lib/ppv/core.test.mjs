import test from "node:test";
import assert from "node:assert/strict";
import { bytesToHex, hexToBytes } from "./core.ts";

test("PPV hex conversion is exact", () => {
  const bytes = Uint8Array.from([0, 1, 15, 16, 254, 255]);
  const hex = bytesToHex(bytes);
  assert.equal(hex, "00010f10feff");
  assert.deepEqual([...hexToBytes(hex)], [...bytes]);
});

test("PPV proof IDs reject wrong byte length", () => {
  assert.throws(() => hexToBytes("ab", 16));
});
