import "server-only";

import {
  ENGAGEMENT_WINDOW_HOURS,
  emptyMetrics,
  observed,
  unavailable,
  type MetricValue,
  type SnapshotCollectionStatus,
  type SnapshotMetric,
  type SnapshotUnavailableReason,
  type SnapshotWindow,
} from "./gwapscore-snapshot-core";
import { classifyXLookupStatus, type XPublicProofDiagnostic } from "./x-public-proof-diagnostics";

const X_API_TIMEOUT_MS = 8_000;
const USER_ENDPOINT = "/2/users/:id";
const POSTS_ENDPOINT = "/2/users/:id/tweets";
const MAX_POSTS_PER_SNAPSHOT = 100;

export type XSnapshotObservation = {
  socialHandle: string | null;
  metrics: Record<SnapshotMetric, MetricValue>;
  window: SnapshotWindow | null;
  endpoints: string[];
  status: SnapshotCollectionStatus;
  diagnostic: XPublicProofDiagnostic | null;
};

type XUserPayload = {
  data?: {
    id?: string;
    username?: string;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
    };
  };
};

type XPostsPayload = {
  data?: Array<{
    id?: string;
    created_at?: string;
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
      quote_count?: number;
    };
  }>;
};

type EndpointResult<T> =
  | { ok: true; payload: T }
  | { ok: false; diagnostic: XPublicProofDiagnostic };

/**
 * X API failures map onto the same diagnostic vocabulary Public Proof already
 * speaks, then onto a metric-level reason. A failed read is recorded as
 * "GWAP could not observe this", never as an account with zero reach.
 */
function reasonFor(diagnostic: XPublicProofDiagnostic): SnapshotUnavailableReason {
  if (diagnostic === "x_rate_limited") return "rate_limited";
  if (diagnostic === "x_auth_failed" || diagnostic === "x_api_access_denied") return "not_authorized";
  return "source_error";
}

function asCount(value: unknown): MetricValue | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? observed(value) : null;
}

async function readXEndpoint<T>(url: URL, bearer: string): Promise<EndpointResult<T>> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(X_API_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, diagnostic: classifyXLookupStatus(response.status) };
    const payload = (await response.json().catch(() => null)) as T | null;
    if (!payload) return { ok: false, diagnostic: "x_api_error" };
    return { ok: true, payload };
  } catch {
    return { ok: false, diagnostic: "x_api_error" };
  }
}

function collectFailure(diagnostic: XPublicProofDiagnostic): XSnapshotObservation {
  const metrics = emptyMetrics(reasonFor(diagnostic));
  return {
    socialHandle: null,
    // Impressions are never readable with an app-only bearer, whatever else failed.
    metrics: { ...metrics, impressions: unavailable("not_authorized") },
    window: null,
    endpoints: [],
    status: "failed",
    diagnostic,
  };
}

/**
 * Reads one account's public evidence from the X API. Only public metrics are
 * requested: non-public metrics (impressions) need OAuth 2.0 user context, so
 * they are recorded as explicitly unauthorized without issuing a request.
 */
export async function collectXSnapshotObservation(input: {
  externalAccountId: string;
  windowHours?: number;
}): Promise<XSnapshotObservation> {
  const bearer = process.env.GWAPSCORE_X_BEARER_TOKEN?.trim();
  if (!bearer) return collectFailure("x_auth_failed");

  const accountId = input.externalAccountId.trim();
  if (!/^\d{1,32}$/.test(accountId)) return collectFailure("post_unavailable");

  const windowHours = input.windowHours ?? ENGAGEMENT_WINDOW_HOURS;
  const windowStart = Date.now() - windowHours * 60 * 60 * 1_000;

  const userUrl = new URL(`https://api.x.com/2/users/${accountId}`);
  userUrl.searchParams.set("user.fields", "public_metrics,username");

  const postsUrl = new URL(`https://api.x.com/2/users/${accountId}/tweets`);
  postsUrl.searchParams.set("max_results", String(MAX_POSTS_PER_SNAPSHOT));
  postsUrl.searchParams.set("exclude", "retweets,replies");
  postsUrl.searchParams.set("tweet.fields", "public_metrics,created_at");

  const [user, posts] = await Promise.all([
    readXEndpoint<XUserPayload>(userUrl, bearer),
    readXEndpoint<XPostsPayload>(postsUrl, bearer),
  ]);

  const metrics = emptyMetrics("not_returned");
  metrics.impressions = unavailable("not_authorized");

  let socialHandle: string | null = null;
  const endpoints: string[] = [];

  if (user.ok) {
    endpoints.push(USER_ENDPOINT);
    const profile = user.payload.data;
    const publicMetrics = profile?.public_metrics;
    socialHandle = profile?.username?.trim().toLowerCase() || null;
    metrics.followers = asCount(publicMetrics?.followers_count) ?? unavailable("not_returned");
    metrics.following = asCount(publicMetrics?.following_count) ?? unavailable("not_returned");
    metrics.lifetimePosts = asCount(publicMetrics?.tweet_count) ?? unavailable("not_returned");
  } else {
    const reason = reasonFor(user.diagnostic);
    metrics.followers = unavailable(reason);
    metrics.following = unavailable(reason);
    metrics.lifetimePosts = unavailable(reason);
  }

  let window: SnapshotWindow | null = null;

  if (posts.ok) {
    endpoints.push(POSTS_ENDPOINT);
    const inWindow = (posts.payload.data || []).filter((post) => {
      const createdAt = Date.parse(post.created_at || "");
      return Number.isFinite(createdAt) && createdAt >= windowStart;
    });

    const timestamps = inWindow
      .map((post) => Date.parse(post.created_at || ""))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    metrics.recentPosts = observed(inWindow.length);
    window = {
      hours: windowHours,
      postCount: inWindow.length,
      oldestPostAt: timestamps.length ? new Date(timestamps[0]).toISOString() : null,
      newestPostAt: timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
    };

    if (inWindow.length === 0) {
      // The account was readable and simply did not post in the window. That is
      // an observed zero for post count, but engagement has no denominator, so
      // it stays unavailable rather than becoming a zero-engagement record.
      metrics.likes = unavailable("no_posts_in_window");
      metrics.replies = unavailable("no_posts_in_window");
      metrics.reposts = unavailable("no_posts_in_window");
      metrics.quotes = unavailable("no_posts_in_window");
    } else {
      const sum = (pick: (post: NonNullable<XPostsPayload["data"]>[number]) => unknown) =>
        inWindow.reduce((total, post) => {
          const value = pick(post);
          return total + (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
        }, 0);
      metrics.likes = observed(sum((post) => post.public_metrics?.like_count));
      metrics.replies = observed(sum((post) => post.public_metrics?.reply_count));
      metrics.reposts = observed(sum((post) => post.public_metrics?.retweet_count));
      metrics.quotes = observed(sum((post) => post.public_metrics?.quote_count));
    }
  } else {
    const reason = reasonFor(posts.diagnostic);
    metrics.recentPosts = unavailable(reason);
    metrics.likes = unavailable(reason);
    metrics.replies = unavailable(reason);
    metrics.reposts = unavailable(reason);
    metrics.quotes = unavailable(reason);
  }

  const status: SnapshotCollectionStatus =
    user.ok && posts.ok ? "ok" : !user.ok && !posts.ok ? "failed" : "partial";
  const diagnostic = user.ok ? (posts.ok ? null : posts.diagnostic) : user.diagnostic;

  return { socialHandle, metrics, window, endpoints, status, diagnostic };
}
