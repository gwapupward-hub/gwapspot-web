import "server-only";

import type { SocialPlatformAdapter } from "./platform";
import type {
  AccountSnapshot,
  AudienceResponse,
  PlatformPost,
  PlatformUser,
  PostSnapshot,
} from "./types";

const X_API_BASE = "https://api.x.com/2";
const MAX_FOLLOW_PAGES = 10;

type XUserResponse = {
  data?: {
    id?: string;
    username?: string;
    name?: string;
    protected?: boolean;
  };
  errors?: Array<{ detail?: string; title?: string }>;
};

type XFollowResponse = {
  data?: Array<{ id?: string }>;
  meta?: { next_token?: string };
};

type XPostsResponse = {
  data?: Array<{
    id?: string;
    author_id?: string;
    text?: string;
    created_at?: string;
  }>;
  errors?: Array<{ detail?: string; title?: string }>;
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
  if (!token) throw new XPlatformError("X public-data access is not configured", 503);
  return token;
}

async function xFetch<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken()}` },
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
    url.searchParams.set("user.fields", "name,username,protected");
    const payload = await xFetch<XUserResponse>(url);
    if (!payload.data?.id || !payload.data.username) {
      const detail = payload.errors?.[0]?.detail || payload.errors?.[0]?.title;
      throw new XPlatformError(detail || "X account not found", 404);
    }
    return {
      id: payload.data.id,
      username: payload.data.username,
      name: payload.data.name ?? null,
      protected: payload.data.protected === true,
    };
  }

  async verifyFollow(userId: string): Promise<boolean | "unsupported"> {
    const officialUserId = process.env.X_GWAPSCORE_OFFICIAL_USER_ID;
    if (!officialUserId) {
      throw new XPlatformError("X follow verification is not configured", 503);
    }

    let paginationToken: string | undefined;
    for (let page = 0; page < MAX_FOLLOW_PAGES; page += 1) {
      const url = new URL(`${X_API_BASE}/users/${encodeURIComponent(userId)}/following`);
      url.searchParams.set("max_results", "1000");
      if (paginationToken) url.searchParams.set("pagination_token", paginationToken);
      const payload = await xFetch<XFollowResponse>(url);
      if (payload.data?.some((user) => user.id === officialUserId)) return true;
      paginationToken = payload.meta?.next_token;
      if (!paginationToken) return false;
    }

    return false;
  }

  async getAccountSnapshot(_userId: string): Promise<AccountSnapshot> {
    throw new XPlatformError("X observation begins in GwapScore Sprint 2", 501);
  }

  async getRecentPosts(userId: string): Promise<PlatformPost[]> {
    const url = new URL(`${X_API_BASE}/users/${encodeURIComponent(userId)}/tweets`);
    url.searchParams.set("max_results", "20");
    url.searchParams.set("tweet.fields", "created_at,author_id");
    const payload = await xFetch<XPostsResponse>(url);

    return (payload.data ?? []).flatMap((post) => {
      if (!post.id || !post.text || !post.created_at) return [];
      return [
        {
          id: post.id,
          authorId: post.author_id ?? userId,
          text: post.text,
          createdAt: post.created_at,
        },
      ];
    });
  }

  async getPostSnapshot(_postId: string): Promise<PostSnapshot> {
    throw new XPlatformError("X observation begins in GwapScore Sprint 2", 501);
  }

  async getPublicResponses(_postId: string): Promise<AudienceResponse[]> {
    throw new XPlatformError("X observation begins in GwapScore Sprint 2", 501);
  }
}
