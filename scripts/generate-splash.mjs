import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "app", "components", "splash-data");
const outputDirectory = path.join(root, "public");
const outputPath = path.join(outputDirectory, "gwap-splash.webp");

const parts = [];
for (let index = 1; index <= 14; index += 1) {
  const source = await readFile(path.join(sourceDirectory, `part-${index}.ts`), "utf8");
  const match = source.match(/const part = "([A-Za-z0-9+/=]+)";/);
  if (!match) throw new Error(`Invalid splash data in part-${index}.ts`);
  parts.push(match[1]);
}

const image = Buffer.from(parts.join(""), "base64");
if (image.subarray(0, 4).toString("ascii") !== "RIFF" || image.subarray(8, 12).toString("ascii") !== "WEBP") {
  throw new Error("Generated splash asset is not a valid WebP file");
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, image);
console.log(`Generated public/gwap-splash.webp (${image.length} bytes)`);
