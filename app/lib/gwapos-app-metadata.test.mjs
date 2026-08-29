import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GWAPOS_MANIFEST_PATH,
  gwapOsAppMetadata,
  gwapOsAppViewport,
} from "./gwapos-app-metadata.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("GwapOS metadata points at the versioned crowned-G asset set", () => {
  assert.equal(gwapOsAppMetadata.manifest, "/gwapos/manifest.webmanifest");
  assert.equal(GWAPOS_MANIFEST_PATH, "/gwapos/manifest.webmanifest");
  assert.equal(gwapOsAppMetadata.applicationName, "GwapOS");

  const iconUrls = gwapOsAppMetadata.icons.icon.map((i) => i.url);
  assert.ok(iconUrls.every((u) => u.startsWith("/gwapos/icons/v1/")));
  assert.ok(iconUrls.some((u) => u.endsWith("gwapos-icon-32.png")));
  assert.ok(iconUrls.some((u) => u.endsWith("gwapos-icon.svg")));

  // Apple home-screen icon must be the opaque black tile at 180.
  assert.equal(
    gwapOsAppMetadata.icons.apple[0].url,
    "/gwapos/icons/v1/gwapos-icon-180.png",
  );
  assert.equal(gwapOsAppMetadata.appleWebApp.title, "GwapOS");
});

test("GwapOS viewport uses the black theme color", () => {
  assert.equal(gwapOsAppViewport.themeColor, "#000000");
});

test("every app route applies the GwapOS metadata and viewport", () => {
  for (const path of [
    "../app/layout.tsx",
    "../os-entry/page.tsx",
    "../os-sign-in/page.tsx",
    "../refresh/page.tsx",
  ]) {
    const src = read(path);
    assert.match(src, /gwapOsAppMetadata/, path);
    assert.match(src, /\.\.\.gwapOsAppMetadata/, path);
    assert.match(src, /gwapOsAppViewport/, path);
  }
});

test("the public site retains its own identity (not the GwapOS icons)", () => {
  const rootLayout = read("../layout.tsx");
  // Root layout must NOT adopt the GwapOS crowned-G icons or manifest.
  assert.doesNotMatch(rootLayout, /gwapos\/icons/);
  assert.doesNotMatch(rootLayout, /gwapos\/manifest/);
  assert.match(rootLayout, /manifest: "\/manifest\.webmanifest"/);

  const publicManifest = read("./../manifest.ts");
  assert.match(publicManifest, /name: "GWAP — Grind With A Purpose"/);
  assert.doesNotMatch(publicManifest, /GwapOS/);
});

test("the GwapOS manifest file is valid and installed-app ready", () => {
  const manifest = JSON.parse(read("../../public/gwapos/manifest.webmanifest"));
  assert.equal(manifest.name, "GwapOS");
  assert.equal(manifest.short_name, "GwapOS");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#000000");
  assert.equal(manifest.theme_color, "#000000");
  const has = (size, purpose) =>
    manifest.icons.some(
      (i) => i.sizes === size && i.purpose === purpose && i.type === "image/png",
    );
  assert.ok(has("192x192", "any"), "192 any");
  assert.ok(has("512x512", "any"), "512 any");
  assert.ok(has("512x512", "maskable"), "512 maskable");
  assert.ok(
    manifest.icons.every((i) => i.src.startsWith("/gwapos/icons/v1/")),
    "all icons versioned",
  );
});

test("the GwapOS loading state uses a right-sized transparent crowned-G symbol", () => {
  const loading = read("../app/loading.tsx");
  // A properly sized transparent symbol, not the 1024 master, for a ~96px mark.
  assert.match(loading, /gwapos-icon-transparent-256\.png/);
  assert.doesNotMatch(loading, /transparent-1024/);
  assert.match(loading, /gwapos-loading/);
  // Decorative: hidden from assistive tech.
  assert.match(loading, /aria-hidden="true"/);
  assert.match(loading, /alt=""/);
});
