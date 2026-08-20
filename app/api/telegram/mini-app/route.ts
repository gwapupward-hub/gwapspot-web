import { NextResponse } from "next/server";
import {
  getTelegramActor,
  type TelegramAccountInput,
} from "../../../lib/daily-ideas-telegram-account-core";
import { upsertTelegramAccount } from "../../../lib/daily-ideas-telegram-account";
import {
  createDailyIdeasAccountLinkToken,
  getDailyIdeasIdentityLinkForTelegram,
  getDailyIdeasSubjectForTelegram,
} from "../../../lib/daily-ideas-identity-link";
import { consumeDailyIdeaHandoff } from "../../../lib/daily-ideas-handoff";
import { getNextDailyIdea } from "../../../lib/daily-ideas-inventory";
import {
  getDailyIdeasPreferences,
  updateDailyIdeasPreferences,
} from "../../../lib/daily-ideas-preferences";
import {
  archiveDailyIdeaProject,
  listDailyIdeaProjects,
  startDailyIdeaProject,
  transitionDailyIdeaProject,
} from "../../../lib/daily-ideas-projects";
import {
  listSavedDailyIdeas,
  saveDailyIdea,
  unsaveDailyIdea,
} from "../../../lib/daily-ideas-saves";
import { checkRateLimit } from "../../../lib/request-guard";
import {
  createTelegramMiniAppSession,
  TELEGRAM_MINI_APP_SESSION_COOKIE,
  TELEGRAM_MINI_APP_SESSION_MAX_AGE_SECONDS,
  verifyTelegramMiniAppRequest,
} from "../../../lib/telegram-mini-app-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 12_288;
const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(payload: unknown, status = 200, extraHeaders?: HeadersInit) {
  return NextResponse.json(payload, { status, headers: { ...headers, ...extraHeaders } });
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function authenticate(request: Request) {
  const identity = verifyTelegramMiniAppRequest(request);
  if (!identity) return null;
  const account: TelegramAccountInput = {
    telegramUserId: identity.telegramUserId,
    username: identity.username,
    firstName: identity.firstName,
    lastName: identity.lastName,
    languageCode: identity.languageCode,
  };
  await upsertTelegramAccount(account);
  return identity;
}

export async function GET(request: Request) {
  const identity = await authenticate(request);
  if (!identity) return json({ error: "Telegram session could not be verified." }, 401);

  const rate = await checkRateLimit(`telegram-mini-app-read:${identity.telegramUserId}`, 120, 60_000);
  if (!rate.allowed) {
    return json({ error: "Too many requests. Try again shortly." }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  try {
    const subject = await getDailyIdeasSubjectForTelegram(identity.telegramUserId);
    const [link, preferences, saved, projects] = await Promise.all([
      getDailyIdeasIdentityLinkForTelegram(identity.telegramUserId),
      getDailyIdeasPreferences(subject),
      listSavedDailyIdeas(subject, { limit: 10 }),
      listDailyIdeaProjects(subject, { limit: 10 }),
    ]);

    const response = json({
      user: {
        id: identity.telegramUserId,
        firstName: identity.firstName,
        lastName: identity.lastName,
        username: identity.username,
        photoUrl: identity.photoUrl,
        isPremium: identity.isPremium,
      },
      linkedIdentity: link ? { gnsIdentity: link.gnsIdentity, linkedAt: link.linkedAt } : null,
      preferences,
      saved,
      projects,
    });

    const session = createTelegramMiniAppSession(identity);
    if (session) {
      response.cookies.set(TELEGRAM_MINI_APP_SESSION_COOKIE, session, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: TELEGRAM_MINI_APP_SESSION_MAX_AGE_SECONDS,
      });
    }

    return response;
  } catch (error) {
    console.error("telegram_mini_app_bootstrap_failed", {
      actor: getTelegramActor(identity.telegramUserId),
      name: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "Daily Ideas is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const identity = await authenticate(request);
  if (!identity) return json({ error: "Telegram session could not be verified." }, 401);

  const rate = await checkRateLimit(`telegram-mini-app-write:${identity.telegramUserId}`, 90, 60_000);
  if (!rate.allowed) {
    return json({ error: "Too many updates. Try again shortly." }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const body = await readBody(request);
  const action = typeof body?.action === "string" ? body.action : "";
  if (!body || !action) return json({ error: "Invalid request." }, 400);

  try {
    const subject = await getDailyIdeasSubjectForTelegram(identity.telegramUserId);

    if (action === "next") {
      const result = await getNextDailyIdea({
        subject,
        category: body.category,
        mode: body.mode,
        focus: body.focus,
      });
      return json(result);
    }

    if (action === "consume-handoff") {
      const idea = await consumeDailyIdeaHandoff(body.token);
      return idea
        ? json({ idea })
        : json({ error: "This Daily Ideas handoff is invalid or has expired." }, 404);
    }

    if (action === "save" || action === "unsave") {
      const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : "";
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return json({ error: "Invalid idea." }, 400);
      if (action === "unsave") {
        const result = await unsaveDailyIdea(subject, ideaId);
        return json({ saved: false, ...result });
      }
      const result = await saveDailyIdea(subject, ideaId);
      if (!result.ok) return json({ error: "Idea not found." }, 404);
      return json({ saved: true, created: result.created, savedAt: result.saved.savedAt }, result.created ? 201 : 200);
    }

    if (action === "develop") {
      const ideaId = typeof body.ideaId === "string" ? body.ideaId.trim() : "";
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) return json({ error: "Invalid idea." }, 400);
      const result = await startDailyIdeaProject(subject, ideaId);
      if (!result.ok) return json({ error: "Idea not found." }, 404);
      return json({ created: result.created, project: result.project }, result.created ? 201 : 200);
    }

    if (action === "advance" || action === "archive") {
      const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
      if (!/^project_[a-f0-9]{20}$/.test(projectId)) return json({ error: "Invalid project." }, 400);
      const target = body.target;
      const result = action === "archive"
        ? await archiveDailyIdeaProject(subject, projectId)
        : target === "validating" || target === "building" || target === "launched"
          ? await transitionDailyIdeaProject(subject, projectId, target)
          : null;
      if (!result) return json({ error: "Invalid project transition." }, 400);
      if (!result.ok) {
        return json(
          { error: result.reason === "invalid_transition" ? "Project stage has changed. Refresh and try again." : "Project not found." },
          result.reason === "invalid_transition" ? 409 : 404,
        );
      }
      return json({ project: result.project });
    }

    if (action === "preferences") {
      const preferences = await updateDailyIdeasPreferences(subject, {
        categories: body.categories,
        difficulty: body.difficulty,
        budget: body.budget,
      });
      return preferences ? json({ preferences }) : json({ error: "Invalid preferences." }, 400);
    }

    if (action === "link-token") {
      const link = await getDailyIdeasIdentityLinkForTelegram(identity.telegramUserId);
      if (link) return json({ linked: true, gnsIdentity: link.gnsIdentity, linkedAt: link.linkedAt });
      const token = await createDailyIdeasAccountLinkToken(identity.telegramUserId);
      if (!token) return json({ error: "Account linking is temporarily unavailable." }, 503);
      return json({
        linked: false,
        token: token.token,
        expiresAt: token.expiresAt,
        url: `/app/ideas?link=${encodeURIComponent(token.token)}`,
      });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("telegram_mini_app_action_failed", {
      actor: getTelegramActor(identity.telegramUserId),
      action,
      name: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "That action did not finish. Try again." }, 503);
  }
}
