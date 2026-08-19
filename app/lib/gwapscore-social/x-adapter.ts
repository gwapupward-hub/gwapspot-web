import "server-only";

import type { SocialPlatformAdapter } from "./platform";
import type { PlatformUser, VerificationMessage } from "./types";

const X_API_BASE = "https://api.x.com/2";
const MAX_FOLLOW_PAGES = 10;

type XUserResponse = {
  data?: { id?: string; username?: string; name?: string };
  errors?: Array<{ detail?: string; title?: string }>;
};

type XFollowResponse = {
  data?: Array<{ id?: string }>;
  meta?: { next_token?: string };
};

type XDmResponse = {
  data?: Array<{
    id?: string;
    sender_id?: string;
    text?: string;
    created_at?: string;
    event_type?: string;
  }>;
  meta?: { next_token?: string };
};

export class XPlatformError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "XPlatformError";
  }
}

function bearerToken() {
  const token = process.env.X_API_BEARER_TOKEN;
  if (!token) throw new XPlatformError("X user lookup is not configured", 503);
  return token;
}

function userAccessToken() {
  const token = process.env.X_USER_ACCESS_TOKEN;
  if (!token) throw new XPlatformError("X DM verification is not configured", 503);
  return token;
}

async function xFetch<T>(url: URL, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new XPlatformError(`X API request failed (${response.status})`, response.status);
  }
  return payload;
}

export class XAdapter implements SocialPlatformAdapter {
  async resolveUser(username: string): Promise<PlatformUser> {
    const url = new URL(`${X_API_BASE}/users/by/username/${encodeURIComponent(username)}`);
    url.searchParams.set("user.fields", "name,username");
    const payload = await xFetch<XUserResponse>(url, bearerToken());
    if (!payload.data?.id || !payload.data.username) {
      const detail = payload.errors?.[0]?.detail || payload.errors?.[0]?.title;
      throw new XPlatformError(detail || "X account not found", 404);
    }
    return {
      id: payload.data.id,
      username: payload.data.username,
      name: payload.data.name ?? null,
    };
  }

  async verifyFollow(userId: string): Promise<boolean | "unsupported"> {
    const officialUserId = process.env.X_GWAPSCORE_OFFICIAL_USER_ID;
    if (!officialUserId) return "unsupported";

    let paginationToken: string | undefined;
    for (let page = 0; page < MAX_FOLLOW_PAGES; page += 1) {
      const url = new URL(`${X_API_BASE}/users/${encodeURIComponent(userId)}/following`);
      url.searchParams.set("max_results", "1000");
      if (paginationToken) url.searchParams.set("pagination_token", paginationToken);
      const payload = await xFetch<XFollowResponse>(url, bearerToken());
      if (payload.data?.some((user) => user.id === officialUserId)) return true;
      paginationToken = payload.meta?.next_token;
      if (!paginationToken) return false;
    }

    return false;
  }

  async collectVerificationMessages(): Promise<VerificationMessage[]> {
    const messages: VerificationMessage[] = [];
    let paginationToken: string | undefined;

    for (let page = 0; page < 3; page += 1) {
      const url = new URL(`${X_API_BASE}/dm_events`);
      url.searchParams.set("dm_event.fields", "created_at,sender_id,text,event_type");
      url.searchParams.set("event_types", "MessageCreate");
      url.searchParams.set("max_results", "100");
      if (paginationToken) url.searchParams.set("pagination_token", paginationToken);
      const payload = await xFetch<XDmResponse>(url, userAccessToken());

      for (const event of payload.data ?? []) {
        if (!event.id || !event.sender_id || !event.text || !event.created_at) continue;
        messages.push({
          id: event.id,
          senderId: event.sender_id,
          text: event.text,
          createdAt: event.created_at,
        });
      }

      paginationToken = payload.meta?.next_token;
      if (!paginationToken) break;
    }

    return messages;
  }

  async getAccountSnapshot() {
    throw new XPlatformError("X observation begins in GwapScore Sprint 2", 501);
  }

  async getRecentPosts() {
    throw new XPlatformError("X observation begins in GwapScore Sprint 2", 501);
  }

  async getPostSnapshot() {
    throw new XPlatformError("X observation begins in GwapScore Sprint 2", 501);
  }

  async getPublicResponses() {
    throw new XPlatformError("X observation begins in GwapScore Sprint 2", 501);
  }
}
