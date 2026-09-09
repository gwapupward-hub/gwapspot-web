import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const assets = [
  {
    filename: "GwapMojis_GwapMode33_Complete_Telegram_Pack.zip",
    sourceUrl:
      "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788522411/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Complete_Telegram_Pack.zip",
    bytes: 7_261_448,
    md5: "ff0d3d97cf5d7b3a625e151cc38b1ca1",
  },
  {
    filename: "GwapMojis_GwapMode33_Telegram_Static_33.zip",
    sourceUrl:
      "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788521185/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Telegram_Static_33.zip",
    bytes: 2_486_052,
    md5: "7341421b9ac0104672473f0064da0487",
  },
  {
    filename: "GwapMojis_GwapMode33_Animated_Full33_WEBM.zip",
    sourceUrl:
      "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788522251/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Animated_Full33_WEBM.zip",
    bytes: 4_539_048,
    md5: "0037f86f867dc28fcc0b2aaaa19d84a3",
  },
  {
    filename: "GwapMojis_GwapMode33_Core12_Custom_Emoji.zip",
    sourceUrl:
      "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788522264/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Core12_Custom_Emoji.zip",
    bytes: 234_714,
    md5: "efb08ad98742860ea5c244d9a87c75b1",
  },
];

const outputDir = path.join(
  process.cwd(),
  "public",
  "downloads",
  "gwapmode33",
);

await mkdir(outputDir, { recursive: true });

for (const asset of assets) {
  const response = await fetch(asset.sourceUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Accept: "application/zip, application/octet-stream;q=0.9, */*;q=0.1",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${asset.filename}: ${response.status} ${response.statusText}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength !== asset.bytes) {
    throw new Error(
      `Unexpected size for ${asset.filename}: expected ${asset.bytes}, got ${buffer.byteLength}`,
    );
  }

  const digest = createHash("md5").update(buffer).digest("hex");
  if (digest !== asset.md5) {
    throw new Error(
      `Integrity check failed for ${asset.filename}: expected ${asset.md5}, got ${digest}`,
    );
  }

  await writeFile(path.join(outputDir, asset.filename), buffer);
  console.log(`Vendored ${asset.filename} (${buffer.byteLength} bytes)`);
}
