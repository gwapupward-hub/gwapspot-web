import { NextResponse } from "next/server";
import {
  DAILY_IDEAS_SERVICE_CONTRACT_VERSION,
  MIN_INTERNAL_API_KEY_LENGTH,
  getTelegramActor,
  isValidInternalApiKey,
  normalizeTelegramAccountInput,
} from "../../../../../lib/daily-ideas-telegram-account-core";
import { getDailyIdeasSubjectForTelegram } from "../../../../../lib/daily-ideas-identity-link";
import {
  archiveDailyIdeaProject,
  getDailyIdeaProject,
  listDailyIdeaProjects,
  startDailyIdeaProject,
  transitionDailyIdeaProject,
} from "../../../../../lib/daily-ideas-projects";
import { checkRateLimit } from "../../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 4_096;
const responseHeaders = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex", "X-Daily-Ideas-Contract-Version": DAILY_IDEAS_SERVICE_CONTRACT_VERSION };
function json(payload: unknown, status = 200, extraHeaders?: HeadersInit) { return NextResponse.json(payload, { status, headers: { ...responseHeaders, ...extraHeaders } }); }
function requestIdFrom(request: Request) { const supplied = request.headers.get("x-request-id")?.trim() || ""; return /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID(); }
function authorized(request: Request) { const key = process.env.DAILY_IDEAS_INTERNAL_API_KEY?.trim() || ""; return key.length >= MIN_INTERNAL_API_KEY_LENGTH && isValidInternalApiKey(request.headers.get("authorization"), key); }
function hasContract(request: Request) { return request.headers.get("x-daily-ideas-contract-version") === DAILY_IDEAS_SERVICE_CONTRACT_VERSION; }
function parseTelegramUserId(value: unknown) { const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value; return normalizeTelegramAccountInput({ telegramUserId: numeric }); }
async function readBody(request: Request) { const declaredLength = Number(request.headers.get("content-length") || 0); if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null; const raw = await request.text(); if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null; try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } }

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const url = new URL(request.url);
  const account = parseTelegramUserId(url.searchParams.get("telegramUserId"));
  if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  try {
    const subject = await getDailyIdeasSubjectForTelegram(account.telegramUserId);
    if (projectId) {
      if (!/^project_[a-f0-9]{20}$/.test(projectId)) return json({ error: "Invalid project", requestId }, 400);
      const project = await getDailyIdeaProject(subject, projectId);
      if (!project) return json({ error: "Project not found", requestId }, 404);
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, project });
    }
    const result = await listDailyIdeaProjects(subject, { offset: Number(url.searchParams.get("offset") || 0), limit: Number(url.searchParams.get("limit") || 5) });
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, ...result });
  } catch (error) {
    console.error("daily_ideas_telegram_projects_list_failed", { requestId, actor: getTelegramActor(account.telegramUserId), name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Projects are temporarily unavailable", requestId }, 503);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (!authorized(request)) return json({ error: "Unauthorized", requestId }, 401);
  if (!hasContract(request)) return json({ error: "Contract version mismatch", requestId }, 409);
  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request", requestId }, 400);
  const account = parseTelegramUserId(body.telegramUserId);
  if (!account) return json({ error: "Invalid Telegram account", requestId }, 400);
  const action = ["develop", "validate", "build", "launch", "archive"].includes(String(body.action)) ? String(body.action) as "develop" | "validate" | "build" | "launch" | "archive" : null;
  if (!action) return json({ error: "Invalid project action", requestId }, 400);
  try {
    const rate = await checkRateLimit(`daily-ideas-telegram-projects:${account.telegramUserId}`, 60, 60_000);
    if (!rate.allowed) return json({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": String(rate.retryAfter) });
    const subject = await getDailyIdeasSubjectForTelegram(account.telegramUserId);
    if (action === "develop") {
      const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : "";
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return json({ error: "Invalid idea", requestId }, 400);
      const result = await startDailyIdeaProject(subject, ideaId);
      if (!result.ok) return json({ error: "Idea not found", requestId }, 404);
      console.info("daily_ideas_telegram_project_started", { requestId, actor: getTelegramActor(account.telegramUserId), ideaId, projectId: result.project.id, created: result.created, status: result.project.status });
      return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, created: result.created, project: result.project }, result.created ? 201 : 200);
    }
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!/^project_[a-f0-9]{20}$/.test(projectId)) return json({ error: "Invalid project", requestId }, 400);
    const result = action === "archive" ? await archiveDailyIdeaProject(subject, projectId) : await transitionDailyIdeaProject(subject, projectId, action === "validate" ? "validating" : action === "build" ? "building" : "launched");
    if (!result.ok) return result.reason === "invalid_transition" ? json({ error: "Project stage has changed. Refresh the project and try again.", requestId }, 409) : json({ error: "Project not found", requestId }, 404);
    console.info("daily_ideas_telegram_project_updated", { requestId, actor: getTelegramActor(account.telegramUserId), projectId, action, status: result.project.status });
    return json({ contractVersion: DAILY_IDEAS_SERVICE_CONTRACT_VERSION, project: result.project });
  } catch (error) {
    console.error("daily_ideas_telegram_projects_write_failed", { requestId, actor: getTelegramActor(account.telegramUserId), action, name: error instanceof Error ? error.name : "Error" });
    return json({ error: "Projects are temporarily unavailable", requestId }, 503);
  }
}
