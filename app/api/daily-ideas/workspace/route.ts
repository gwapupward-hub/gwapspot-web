import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../lib/auth-config";
import {
  getDailyIdeasIdentityLinkForGwap,
  gwapDailyIdeasSubject,
} from "../../../lib/daily-ideas-identity-link";
import { resolveDailyIdeasGwapAccount } from "../../../lib/daily-ideas-gwap-account";
import { getDailyIdeasEngagement } from "../../../lib/daily-ideas-engagement";
import { getStoredDailyIdea } from "../../../lib/daily-ideas-inventory";
import { getDailyIdeasPreferences, updateDailyIdeasPreferences } from "../../../lib/daily-ideas-preferences";
import {
  archiveDailyIdeaProject,
  listDailyIdeaProjects,
  startDailyIdeaProject,
  transitionDailyIdeaProject,
  updateDailyIdeaProject,
  type DailyIdeaProjectEditablePatch,
} from "../../../lib/daily-ideas-projects";
import { listSavedDailyIdeas, saveDailyIdea, unsaveDailyIdea } from "../../../lib/daily-ideas-saves";
import { getAuthenticatedWalletIdentity } from "../../../lib/privy-server";
import { auditAuthEvent, checkRateLimit, hasValidOrigin } from "../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 16_384;

async function authenticated(request: Request) {
  if (!isWalletAuthConfigured()) return null;
  return getAuthenticatedWalletIdentity(request);
}
async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

export async function GET(request: Request) {
  const identity = await authenticated(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const account = await resolveDailyIdeasGwapAccount(identity);
    const rate = await checkRateLimit(`daily-ideas-workspace-read:${account.id}`, 90, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    const ideaId = new URL(request.url).searchParams.get("ideaId")?.trim() || "";
    if (ideaId && !/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return NextResponse.json({ error: "Invalid idea" }, { status: 400 });

    const subject = gwapDailyIdeasSubject(account.id);
    const [link, saved, projects, preferences, engagement, idea] = await Promise.all([
      getDailyIdeasIdentityLinkForGwap(account.id),
      listSavedDailyIdeas(subject, { offset: 0, limit: 50 }),
      listDailyIdeaProjects(subject, { offset: 0, limit: 50 }),
      getDailyIdeasPreferences(subject),
      getDailyIdeasEngagement(subject),
      ideaId ? getStoredDailyIdea(ideaId) : Promise.resolve(null),
    ]);
    if (ideaId && !idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    return NextResponse.json({
      linked: Boolean(link),
      gwapUserId: account.id,
      identity: link ? { telegramUserId: link.telegramUserId, gnsIdentity: link.gnsIdentity, linkedAt: link.linkedAt } : null,
      saved,
      projects,
      preferences,
      engagement,
      ...(idea ? { idea } : {}),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" } });
  } catch {
    return NextResponse.json({ error: "Daily Ideas workspace is temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const identity = await authenticated(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  let account;
  try {
    account = await resolveDailyIdeasGwapAccount(identity);
  } catch {
    return NextResponse.json({ error: "GWAP account identity could not be resolved" }, { status: 409 });
  }
  const rate = await checkRateLimit(`daily-ideas-workspace-write:${account.id}`, 90, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many updates" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const body = await readBody(request);
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const subject = gwapDailyIdeasSubject(account.id);

  try {
    if (body.action === "save" || body.action === "unsave") {
      const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : "";
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return NextResponse.json({ error: "Invalid idea" }, { status: 400 });
      if (body.action === "unsave") {
        const result = await unsaveDailyIdea(subject, ideaId);
        auditAuthEvent("daily-ideas.unsave", identity.userId, "success");
        return NextResponse.json({ saved: false, ...result });
      }
      const result = await saveDailyIdea(subject, ideaId);
      if (!result.ok) return NextResponse.json({ error: "Idea not found" }, { status: 404 });
      auditAuthEvent("daily-ideas.save", identity.userId, "success");
      return NextResponse.json({ saved: true, created: result.created, savedAt: result.saved.savedAt }, { status: result.created ? 201 : 200 });
    }
    if (body.action === "develop") {
      const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : "";
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return NextResponse.json({ error: "Invalid idea" }, { status: 400 });
      const result = await startDailyIdeaProject(subject, ideaId);
      if (!result.ok) return NextResponse.json({ error: "Idea not found" }, { status: 404 });
      auditAuthEvent("daily-ideas.develop", identity.userId, "success");
      return NextResponse.json({ created: result.created, project: result.project }, { status: result.created ? 201 : 200 });
    }
    if (body.action === "update-project") {
      const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
      if (!/^project_[a-f0-9]{20}$/.test(projectId) || !body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) return NextResponse.json({ error: "Invalid project update" }, { status: 400 });
      const result = await updateDailyIdeaProject(subject, projectId, body.patch as DailyIdeaProjectEditablePatch);
      if (!result.ok) return NextResponse.json({ error: result.reason === "not_found" ? "Project not found" : "Invalid project update" }, { status: result.reason === "not_found" ? 404 : 400 });
      auditAuthEvent("daily-ideas.project-update", identity.userId, "success");
      return NextResponse.json({ project: result.project });
    }
    if (["validate", "build", "launch", "archive"].includes(body.action)) {
      const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
      if (!/^project_[a-f0-9]{20}$/.test(projectId)) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
      const result = body.action === "archive"
        ? await archiveDailyIdeaProject(subject, projectId)
        : await transitionDailyIdeaProject(subject, projectId, body.action === "validate" ? "validating" : body.action === "build" ? "building" : "launched");
      if (!result.ok) return NextResponse.json({ error: result.reason === "invalid_transition" ? "Invalid project stage transition" : "Project not found" }, { status: result.reason === "invalid_transition" ? 409 : 404 });
      auditAuthEvent(`daily-ideas.project-${body.action}`, identity.userId, "success");
      return NextResponse.json({ project: result.project });
    }
    if (body.action === "preferences") {
      const preferences = await updateDailyIdeasPreferences(subject, { categories: body.categories, difficulty: body.difficulty, budget: body.budget });
      if (!preferences) return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
      auditAuthEvent("daily-ideas.preferences", identity.userId, "success");
      return NextResponse.json({ preferences });
    }
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch {
    auditAuthEvent("daily-ideas.workspace-write", identity.userId, "failed");
    return NextResponse.json({ error: "Daily Ideas workspace update failed" }, { status: 503 });
  }
}
