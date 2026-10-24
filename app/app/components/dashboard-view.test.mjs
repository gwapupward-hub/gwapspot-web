import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./dashboard-view.tsx", import.meta.url), "utf8");

test("GWAP OS home leads with trust instead of wallet balance", () => {
  assert.match(source, /GWAP TRUST HOME/);
  assert.match(source, /Your Trust Foundation/);
  assert.match(source, /Next Best Action/);
  assert.match(source, /Your verified activity/);
  assert.match(source, /Supporting Infrastructure/);

  assert.doesNotMatch(source, /AVAILABLE SOL/);
  assert.doesNotMatch(source, />Send</);
  assert.doesNotMatch(source, />Receive</);
});

test("trust home keeps the core trust layers one click away", () => {
  assert.match(source, /href="\/app\/trust"/);
  assert.match(source, /href="\/app\/identity"/);
  assert.match(source, /href="\/app\/score"/);
  assert.match(source, /href="\/app\/ppv"/);
  assert.match(source, /PpvVerifiedActivity/);
});

test("wallet information is retained as supporting context", () => {
  assert.match(source, /Wallet context/);
  assert.match(source, /WalletPortfolioCard/);
  assert.match(source, /Available when you need it/);
});
