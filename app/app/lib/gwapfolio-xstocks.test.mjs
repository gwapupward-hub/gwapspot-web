import assert from "node:assert/strict";
import { test } from "node:test";
import { assertResolvedXStocks, parseSolanaXStocks } from "./gwapfolio-xstocks.ts";

const payload = {
  nodes: [
    {
      symbol: "NVDAx",
      name: "NVIDIA xStock",
      deployments: [
        { network: "ethereum", address: "0xdead", decimals: 18 },
        { network: "solana", address: "solana:NvdaMintFixture111111111111111111111111111", decimals: 8 },
      ],
    },
    {
      symbol: "MSFTx",
      name: "Microsoft xStock",
      deployments: [
        { network: "Solana", address: "MsftMintFixture111111111111111111111111111", decimals: "6" },
      ],
    },
    {
      symbol: "AAPLx",
      name: "Apple xStock",
      deployments: [{ network: "solana", address: "AppleMintFixture", decimals: 6 }],
    },
  ],
};

test("maps requested underlying tickers to their Solana xStock deployment", () => {
  const assets = parseSolanaXStocks(payload, ["NVDA", "MSFT"]);
  assert.deepEqual(assets, [
    {
      symbol: "NVDA",
      mint: "NvdaMintFixture111111111111111111111111111",
      decimals: 8,
      name: "NVIDIA xStock",
    },
    {
      symbol: "MSFT",
      mint: "MsftMintFixture111111111111111111111111111",
      decimals: 6,
      name: "Microsoft xStock",
    },
  ]);
});

test("does not silently substitute an unrequested xStock", () => {
  const assets = parseSolanaXStocks(payload, ["META"]);
  assert.deepEqual(assets, []);
});

test("fails closed when a requested xStock is missing", () => {
  const assets = parseSolanaXStocks(payload, ["NVDA"]);
  assert.throws(() => assertResolvedXStocks(["NVDA", "META"], assets), /META/);
});

test("requires decimals before execution instead of guessing token precision", () => {
  const noDecimals = {
    nodes: [
      {
        symbol: "METAx",
        deployments: [{ network: "solana", address: "MetaMintFixture" }],
      },
    ],
  };
  const assets = parseSolanaXStocks(noDecimals, ["META"]);
  assert.equal(assets[0].decimals, -1);
  assert.throws(() => assertResolvedXStocks(["META"], assets), /decimals required/);
});
