import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORT_BYTES = 32 * 1024;
const MAX_TEXT_LENGTH = 512;

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : undefined;
}

function sanitizeUri(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (value === "inline" || value === "eval" || value.startsWith("data:") || value.startsWith("blob:")) {
    return value.slice(0, MAX_TEXT_LENGTH);
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, MAX_TEXT_LENGTH);
  } catch {
    return value.slice(0, MAX_TEXT_LENGTH);
  }
}

function sanitizeReport(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const body =
    raw["csp-report"] && typeof raw["csp-report"] === "object"
      ? (raw["csp-report"] as Record<string, unknown>)
      : raw.body && typeof raw.body === "object"
        ? (raw.body as Record<string, unknown>)
        : raw;

  return {
    documentUri: sanitizeUri(body["document-uri"] ?? body.documentURL),
    violatedDirective: sanitizeText(body["violated-directive"] ?? body.effectiveDirective),
    blockedUri: sanitizeUri(body["blocked-uri"] ?? body.blockedURL),
    sourceFile: sanitizeUri(body["source-file"] ?? body.sourceFile),
    lineNumber: typeof body["line-number"] === "number" ? body["line-number"] : body.lineNumber,
    columnNumber: typeof body["column-number"] === "number" ? body["column-number"] : body.columnNumber,
    disposition: sanitizeText(body.disposition),
  };
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const text = await request.text();
  if (text.length > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const reports = Array.isArray(payload) ? payload : [payload];
  for (const report of reports.slice(0, 20)) {
    const sanitized = sanitizeReport(report);
    if (sanitized) {
      console.warn("[csp-report]", JSON.stringify(sanitized));
    }
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
