import bs58 from "bs58";
import { NextResponse } from "next/server";
import { getGnsApiBase } from "../../../../app/lib/gns";
import {
  GNS_PROFILE_MAX_BYTES,
  GnsProfileValidationError,
  assertAuthorizedGnsProfileUpdate,
  isAuthorizedProfileOwner,
  isValidGnsProfileName,
  normalizeGnsProfileName,
  normalizeGnsProfilePayload,
  normalizeGnsPublicProfile,
} from "../../../../app/lib/gns-profile";
import { getAuthenticatedWalletIdentity } from "../../../../lib/privy-server";
import {
  auditAuthEvent,
  checkRateLimit,
  hasValidOrigin,
} from "../../../../lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const PROFILE_TIMEOUT_MS = 12_000;

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

function profileName(rawName: string) {
  const name = normalizeGnsProfileName(rawName);
  return isValidGnsProfileName(name) ? name : null;
}

function isBase58Signature(value: unknown) {
  if (typeof value !== "string" || value.length < 64 || value.length > 128) {
    return false;
  }
  try {
    return bs58.decode(value).length === 64;
  } catch {
    return false;
  }
}

async function upstreamMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { detail?: unknown; error?: unknown };
    if (typeof payload.detail === "string") return payload.detail;
    if (typeof payload.error === "string") return payload.error;
  } catch {
    // Fall through to the bounded, user-safe message.
  }
  return fallback;
}

async function fetchProfile(name: string, signal: AbortSignal) {
  const response = await fetch(
    `${getGnsApiBase()}/profile/${encodeURIComponent(name)}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    },
  );
  if (!response.ok) return { response, profile: null };
  return { response, profile: normalizeGnsPublicProfile(await response.json()) };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);

  const name = profileName((await context.params).name);
  if (!name) return json({ error: "Invalid .gwap name." }, 400);

  try {
    const rate = await checkRateLimit(`gns-profile-read:${identity.userId}`, 30, 60_000);
    if (!rate.allowed) {
      return json(
        { error: "Too many profile requests. Try again shortly." },
        429,
        { "Retry-After": String(rate.retryAfter) },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
    try {
      const { response, profile } = await fetchProfile(name, controller.signal);
      if (response.status === 404) return json({ error: "Profile not found." }, 404);
      if (!response.ok) {
        return json({ error: "GNS profile service is temporarily unavailable." }, 502);
      }
      if (!profile) return json({ error: "GNS returned an invalid profile." }, 502);
      if (!isAuthorizedProfileOwner(profile, identity.verifiedWallet)) {
        auditAuthEvent("gns.profile.read", identity.userId, "rejected");
        return json({ error: "This wallet does not own that profile." }, 403);
      }
      return json(profile);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "The GNS profile request timed out."
            : "GNS profile service is temporarily unavailable.",
      },
      503,
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const identity = await getAuthenticatedWalletIdentity(request);
  if (!identity) return json({ error: "Unauthorized" }, 401);
  if (!hasValidOrigin(request)) {
    auditAuthEvent("gns.profile.update", identity.userId, "rejected");
    return json({ error: "Invalid origin" }, 403);
  }

  const name = profileName((await context.params).name);
  if (!name) return json({ error: "Invalid .gwap name." }, 400);

  try {
    const rate = await checkRateLimit(`gns-profile-update:${identity.userId}`, 10, 600_000);
    if (!rate.allowed) {
      auditAuthEvent("gns.profile.update", identity.userId, "rejected");
      return json(
        { error: "Too many profile updates. Try again later." },
        429,
        { "Retry-After": String(rate.retryAfter) },
      );
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > GNS_PROFILE_MAX_BYTES) {
      return json({ error: "Profile payload is too large." }, 413);
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > GNS_PROFILE_MAX_BYTES) {
      return json({ error: "Profile payload is too large." }, 413);
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const payload = normalizeGnsProfilePayload(body.payload);
    const publicKey = typeof body.public_key === "string" ? body.public_key : "";
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const ts = typeof body.ts === "number" && Number.isInteger(body.ts) ? body.ts : 0;

    if (publicKey !== identity.verifiedWallet) {
      auditAuthEvent("gns.profile.update", identity.userId, "rejected");
      return json({ error: "Reconnect the wallet that authenticated this session." }, 403);
    }
    if (!isBase58Signature(body.signature)) {
      return json({ error: "A valid wallet signature is required." }, 400);
    }
    if (!/^[a-f0-9]{16,64}$/.test(nonce) || Math.abs(Date.now() / 1_000 - ts) > 300) {
      return json({ error: "The signed profile update is stale or invalid." }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
    try {
      const current = await fetchProfile(name, controller.signal);
      if (current.response.status === 404) return json({ error: "Profile not found." }, 404);
      if (!current.response.ok || !current.profile) {
        return json({ error: "GNS could not verify profile ownership." }, 502);
      }
      try {
        assertAuthorizedGnsProfileUpdate({
          profile: current.profile,
          verifiedWallet: identity.verifiedWallet,
          signer: publicKey,
          payload,
        });
      } catch (error) {
        auditAuthEvent("gns.profile.update", identity.userId, "rejected");
        return json(
          {
            error:
              error instanceof Error ? error.message : "Profile update is unauthorized.",
          },
          403,
        );
      }

      const response = await fetch(
        `${getGnsApiBase()}/profile/${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payload,
            public_key: publicKey,
            signature: body.signature,
            nonce,
            ts,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const status = response.status >= 400 && response.status < 500 ? response.status : 502;
        auditAuthEvent("gns.profile.update", identity.userId, "failed");
        return json(
          { error: await upstreamMessage(response, "GNS rejected the profile update.") },
          status,
        );
      }

      const profile = normalizeGnsPublicProfile(await response.json());
      if (!profile || !isAuthorizedProfileOwner(profile, identity.verifiedWallet)) {
        auditAuthEvent("gns.profile.update", identity.userId, "failed");
        return json({ error: "GNS returned an invalid profile." }, 502);
      }
      auditAuthEvent("gns.profile.update", identity.userId, "success");
      return json(profile);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    auditAuthEvent("gns.profile.update", identity.userId, "failed");
    if (error instanceof GnsProfileValidationError) {
      return json({ error: error.message }, 400);
    }
    if (error instanceof SyntaxError) {
      return json({ error: "Profile payload must be valid JSON." }, 400);
    }
    return json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "The GNS profile update timed out. Your changes were not confirmed."
            : "The profile update could not be processed.",
      },
      503,
    );
  }
}
