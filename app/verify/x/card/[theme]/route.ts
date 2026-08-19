import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CARD_THEMES = new Set(["orange", "red", "green", "purple"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ theme: string }> },
) {
  const { theme: rawTheme } = await context.params;
  const theme = CARD_THEMES.has(rawTheme) ? rawTheme : "green";
  const assetUrl = new URL(`/gwapscore/proof-cards/${theme}.jpg`, request.url);
  const response = NextResponse.redirect(assetUrl, 307);
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return response;
}
