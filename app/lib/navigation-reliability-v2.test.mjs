import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isAllowedGwapAppPath,
  isGwapAppHostname,
  normalizeHostname,
} from "./app-domain-routing.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile navigation reliability v2 keeps product navigation isolated", () => {
  const interaction = read("../components/gwap-interaction-layer.tsx");
  const touchNavigation = read("../components/gwap-touch-product-navigation-layer.tsx");
  const publicExperience = read("../components/public-experience-layers.tsx");
  const splash = read("../components/premium-splash.tsx");
  const layout = read("../layout.tsx");
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

  assert.match(layout, /<PublicExperienceLayers \/>/);
  assert.match(publicExperience, /<GwapTouchProductNavigationLayer \/>/);
  assert.match(publicExperience, /pathname === "\/telegram"/);
  assert.match(publicExperience, /pathname\.startsWith\("\/telegram\/"\)/);
  assert.match(publicExperience, /pathname === "\/os-entry"/);
  assert.match(publicExperience, /pathname === "\/os-sign-in"/);
  assert.match(publicExperience, /pathname === "\/app"/);
  assert.match(publicExperience, /pathname\.startsWith\("\/app\/"\)/);
  assert.match(touchNavigation, /a\.premium-product-card\[data-gwap-product\]/);
  assert.match(touchNavigation, /event\.pointerType === "mouse"/);
  assert.match(touchNavigation, /pointerover/);
  assert.match(touchNavigation, /focusin/);
  assert.match(touchNavigation, /event\.stopPropagation\(\)/);
  assert.match(touchNavigation, /window\.location\.assign\(current\.link\.href\)/);
  assert.match(touchNavigation, /TAP_MAX_DISTANCE = 10/);

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

  assert.match(splash, /const skipNextRouteTransition = useRef\(false\)/);
  assert.match(splash, /anchor\.hasAttribute\("data-native-nav"\)/);
  assert.match(splash, /if \(skipNextRouteTransition\.current\)/);
  assert.match(splash, /skipNextRouteTransition\.current = false/);
  assert.match(splash, /setMode\(null\)/);

  assert.match(wallet, /src="\/logos\/occo-official\.svg"/);
  assert.match(wallet, /<Link href="\/" data-native-nav>GWAPSpot home<\/Link>/);
  assert.match(wallet, /variant = "public"/);
  assert.match(wallet, /variant="app"|WalletSignInVariant/);
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

test("app.gwapspot.com routing stays inside the GWAP OS application boundary", () => {
  assert.equal(normalizeHostname("app.gwapspot.com:443"), "app.gwapspot.com");
  assert.equal(
    normalizeHostname("APP.GWAPSPOT.COM:443, internal.vercel"),
    "app.gwapspot.com",
  );
  assert.equal(isGwapAppHostname("app.gwapspot.com"), true);
  assert.equal(isGwapAppHostname("www.gwapspot.com"), false);

  for (const pathname of [
    "/",
    "/os-entry",
    "/os-sign-in",
    "/refresh",
    "/sign-in",
    "/app",
    "/app/profile",
  ]) {
    assert.equal(isAllowedGwapAppPath(pathname), true, `${pathname} should be allowed`);
  }

  for (const pathname of ["/about", "/ecosystem", "/community", "/telegram", "/terms"]) {
    assert.equal(isAllowedGwapAppPath(pathname), false, `${pathname} should remain public-site only`);
  }
});
