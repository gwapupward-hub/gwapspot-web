import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("settings exposes a copy-address action on the wallet identity surface", () => {
  const settings = read("./settings-view.tsx");
  assert.match(settings, /CopyAddressButton/);
  assert.match(settings, /address=\{account\.verifiedWallet\}/);
  // Uses the shared formatter instead of an inline slice.
  assert.match(settings, /shortenWalletAddress\(account\.verifiedWallet\)/);
  assert.doesNotMatch(settings, /account\.verifiedWallet\.slice\(0, 4\)/);
});

test("the copy-address button copies with a resilient clipboard fallback", () => {
  const button = read("./copy-address-button.tsx");
  assert.match(button, /navigator\.clipboard\?\.writeText/);
  assert.match(button, /execCommand\("copy"\)/);
  assert.match(button, /Copied/);
});

test("the OS shell renders wallet identity distinct from public marketing chrome", () => {
  const shell = read("./os-shell.tsx");
  // Wallet identity + shortened address live in the shell menubar.
  assert.match(shell, /shortenWalletAddress\(account\.verifiedWallet\)/);
  assert.match(shell, /Wallet identity status/);
  // The app shell must not embed public marketing site chrome or email onboarding.
  assert.doesNotMatch(shell, /SiteHeader|SiteFooter/);
  assert.doesNotMatch(shell, /loginMethods: \["email"\]/);
  assert.doesNotMatch(shell, /Create a Solana wallet with email/);
});

test("narrow screens keep wallet identity and settings in the shell", () => {
  const shell = read("./os-shell.tsx");
  const walletCss = read("../gwapos-wallet.css");
  const actions = read("./gwap-action-sheet.tsx");
  const home = read("./dashboard-view.tsx");

  assert.match(shell, /aria-label="Wallet identity status"/);
  assert.match(shell, /href="\/app\/settings"/);
  assert.doesNotMatch(shell, /gwapos-mobile-signout/);
  assert.match(walletCss, /\.gwapos-wallet-mode \.os-menubar-status \{[^}]*display:\s*flex;/);
  assert.match(walletCss, /\.os-menubar-actions > \.os-sign-out-control \{\s*display:\s*inline-grid;/);
  assert.doesNotMatch(walletCss, /\.os-menubar-actions > a \{\s*display:\s*none/);
  assert.match(actions, /href: "\/app\/settings"/);
  assert.match(home, /href="\/app\/settings"/);
});

test("sign-out terminates the Privy session, not a dead wallet-adapter connection", () => {
  const signOut = read("./sign-out-button.tsx");
  // GwapOS sign-out terminates the Privy session (auth); the wallet-adapter
  // stack it used to also disconnect never connected to anything and is gone.
  assert.match(signOut, /logout\(\)/);
  assert.doesNotMatch(signOut, /from ["']@solana\/wallet-adapter-react(-ui)?["']/);
});
