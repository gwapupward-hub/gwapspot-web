import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile navigation reliability v2 keeps product navigation isolated", () => {
  const interaction = read("../components/gwap-interaction-layer.tsx");
  const shell = read("../components/site-shell.tsx");
  const productPage = read("../ecosystem/[slug]/page.tsx");
  const wallet = read("../components/wallet-sign-in.tsx");
  const styles = read("../styles.css");
  const reliabilityCss = read("../navigation-reliability-v2.css");

  assert.doesNotMatch(interaction, /"\.premium-product-card"/);
  assert.doesNotMatch(interaction, /"\.product-card"/);
  assert.doesNotMatch(interaction, /subscribeGwapClick/);
  assert.doesNotMatch(interaction, /gwap-product-activating/);
  assert.doesNotMatch(interaction, /data-gwap-active-product/);

  assert.match(shell, /className="mobile-quick-nav"/);
  assert.match(shell, /<Link href="\/" data-native-nav>Home<\/Link>/);
  assert.match(shell, /<Link href="\/ecosystem" data-native-nav>Ecosystem<\/Link>/);
  assert.match(shell, /<Link href="\/app" data-native-nav>GWAP OS<\/Link>/);
  assert.match(shell, /data-native-product-link/);
  assert.match(shell, /prefetch=\{false\}/);

  assert.match(productPage, /className="product-route-nav"/);
  assert.match(productPage, /← Home/);
  assert.match(productPage, /Back to Ecosystem/);
  assert.match(productPage, /data-native-product-link/);

  assert.match(wallet, /src="\/logos\/occo-official\.svg"/);
  assert.match(wallet, /<Link href="\/" data-native-nav>GWAPSpot home<\/Link>/);
  assert.doesNotMatch(wallet, /from "next\/image"/);

  assert.match(reliabilityCss, /touch-action: manipulation/);
  assert.match(reliabilityCss, /\.premium-product-card > \*/);
  assert.match(reliabilityCss, /-webkit-touch-callout: none/);
  assert.match(
    reliabilityCss,
    /\.cinematic-home\.unified-cinematic-flow \.ecosystem-group-products \.premium-product-card:hover/,
  );
  assert.match(
    reliabilityCss,
    /\.cinematic-home\.unified-cinematic-flow\.scroll-directed \.ecosystem-story \.premium-product-card/,
  );
  assert.match(
    reliabilityCss,
    /\.cinematic-home\.unified-cinematic-flow \.premium-product-card:hover::after/,
  );
  assert.match(reliabilityCss, /transition: none !important/);
  assert.match(reliabilityCss, /transform: none !important/);
  assert.ok(
    styles.trim().endsWith('@import "./navigation-reliability-v2.css";'),
    "navigation reliability CSS must remain the final stylesheet import",
  );
});
