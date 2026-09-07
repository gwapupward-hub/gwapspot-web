import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const ASSETS = [
  "telegram",
  "complete_zip",
  "static_zip",
  "animated_zip",
  "emoji_zip",
] as const;

type ClaimAsset = (typeof ASSETS)[number];

const CAMPAIGN_KEY = "gwapmojis:gwapmode33:claims";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;
  return new Redis({ url, token });
}

function keyFor(asset: ClaimAsset) {
  return `${CAMPAIGN_KEY}:${asset}`;
}

function emptyAssetCounts(): Record<ClaimAsset, number> {
  return {
    telegram: 0,
    complete_zip: 0,
    static_zip: 0,
    animated_zip: 0,
    emoji_zip: 0,
  };
}

async function readCounts(redis: Redis) {
  const values = await redis.mget<(number | string | null)[]>(...ASSETS.map(keyFor));
  const assets = emptyAssetCounts();

  ASSETS.forEach((asset, index) => {
    const value = values[index];
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    assets[asset] = Number.isFinite(parsed) ? parsed : 0;
  });

  return {
    assets,
    total: Object.values(assets).reduce((sum, value) => sum + value, 0),
  };
}

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { available: false, total: 0, assets: emptyAssetCounts() },
      { headers: NO_STORE_HEADERS },
    );
  }

  try {
    const counts = await readCounts(redis);
    return NextResponse.json(
      { available: true, ...counts },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { available: false, total: 0, assets: emptyAssetCounts() },
      { headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { available: false, error: "Claim counter storage is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  let body: { asset?: string };
  try {
    body = (await request.json()) as { asset?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!body.asset || !ASSETS.includes(body.asset as ClaimAsset)) {
    return NextResponse.json(
      { error: "Unknown claim asset." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const asset = body.asset as ClaimAsset;

  try {
    await redis.incr(keyFor(asset));
    const counts = await readCounts(redis);
    return NextResponse.json(
      { available: true, ...counts },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { available: false, error: "Claim counter is temporarily unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
