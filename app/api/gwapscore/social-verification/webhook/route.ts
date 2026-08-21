import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Private/DM Proof-of-Control is not active. Public Proof verifies directly from a submitted X post URL.",
    },
    { status: 410 },
  );
}
