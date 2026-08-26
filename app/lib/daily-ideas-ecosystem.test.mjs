import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(repositoryRoot, "app");
const publicRoot = resolve(repositoryRoot, "public");
const textExtensions = new Set([".css", ".html", ".js", ".jsx", ".json", ".md", ".mdx", ".mjs", ".svg", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml"]);
const retiredMarkers = [
  ["is", "nad"].join(""),
  ["sun", "nah"].join(""),
  ["ha", "dith"].join(""),
  ["the_", "is", "nad", "_bot"].join(""),
];

function activeFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const local = relative(repositoryRoot, absolute).replaceAll("\\", "/");
    if (local.includes("/changelog") || local.includes("historical")) continue;
    if (entry.isDirectory()) files.push(...activeFiles(absolute));
    else if (textExtensions.has(extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

test("Daily Ideas owns the active ecosystem product slot", () => {
  const ecosystem = readFileSync(resolve(sourceRoot, "lib/ecosystem.ts"), "utf8");
  const productPage = readFileSync(resolve(sourceRoot, "ecosystem/[slug]/page.tsx"), "utf8");

  assert.match(ecosystem, /slug: "daily-ideas"/);
  assert.match(ecosystem, /name: "Daily Ideas 2\.0"/);
  assert.match(ecosystem, /internalUrl: "\/app\/ideas"/);
  assert.match(productPage, /product\.internalUrl/);
  assert.equal(existsSync(resolve(publicRoot, "logos/daily-ideas-2-official.webp")), true);
});

test("retired product markers stay out of active GWAP source and assets", () => {
  const files = [
    ...activeFiles(sourceRoot),
    ...activeFiles(publicRoot),
    resolve(repositoryRoot, "README.md"),
    resolve(repositoryRoot, ".env.example"),
    resolve(repositoryRoot, "MOBILE_NAV_RELIABILITY_V2_ACCEPTANCE.md"),
  ];
  const violations = [];

  for (const file of files) {
    const local = relative(repositoryRoot, file).replaceAll("\\", "/");
    const searchable = `${local}\n${readFileSync(file, "utf8")}`.toLowerCase();
    for (const marker of retiredMarkers) {
      if (searchable.includes(marker)) violations.push(`${local}: ${marker}`);
    }
  }

  assert.deepEqual(violations, []);
});
