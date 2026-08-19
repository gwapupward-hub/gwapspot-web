import { NextResponse } from "next/server";
import { isWalletAuthConfigured } from "../../../../lib/auth-config";
import {
  assistDailyIdeasModule,
  isDailyIdeasLabModule,
  reviewDailyIdeasProject,
} from "../../../../lib/daily-ideas-lab-assistant";
import {
  DailyIdeasConfigurationError,
  DailyIdeasProviderError,
} from "../../../../lib/daily-ideas-generator";
import { gwapDailyIdeasSubject } from "../../../../lib/daily-ideas-identity-link";
import { getDailyIdeaProject } from "../../../../lib/daily-ideas-projects";
import { getAuthenticatedWalletIdentity } from "../../../../lib/privy-server";
import { checkRateLimit, hasValidOrigin } from "../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 4_096;

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

export async function POST(request: Request) {
  if (!isWalletAuthConfigured()) {
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  }

  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const rate = await checkRateLimit(`idea-lab-assist:${identity.userId}`, 8, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Idea Lab intelligence limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!/^project_[a-f0-9]{20}$/.test(projectId)) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  const mode = body.mode === "module" || body.mode === "review" ? body.mode : null;
  if (!mode) return NextResponse.json({ error: "Invalid assist mode" }, { status: 400 });
  if (mode === "module" && !isDailyIdeasLabModule(body.module)) {
    return NextResponse.json({ error: "Invalid project module" }, { status: 400 });
  }

  try {
    const subject = gwapDailyIdeasSubject(identity.userId);
    const project = await getDailyIdeaProject(subject, projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const result = mode === "module"
      ? await assistDailyIdeasModule(project, body.module)
      : await reviewDailyIdeasProject(project);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    if (error instanceof DailyIdeasConfigurationError) {
      console.error("idea_lab_assist_configuration_error", { message: error.message });
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof DailyIdeasProviderError) {
      console.error("idea_lab_assist_provider_error", {
        message: error.message,
        providerStatus: error.providerStatus,
        providerCode: error.providerCode,
      });
      return NextResponse.json({ error: "Idea Lab intelligence is temporarily unavailable." }, { status: 502 });
    }

    console.error("idea_lab_assist_failed", {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Idea Lab intelligence is temporarily unavailable." }, { status: 503 });
  }
}
