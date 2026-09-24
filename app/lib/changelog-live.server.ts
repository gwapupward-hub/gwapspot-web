import "server-only";

import {
  buildLogEntries,
  type BuildLogEntry,
  type BuildLogKind,
} from "./changelog";

const GITHUB_REPO = "gwapupward-hub/gwapspot-web";
const GITHUB_API = "https://api.github.com";
const LIVE_ENTRY_LIMIT = 18;
const UPSTREAM_REVALIDATE_SECONDS = 30;

type GitHubCommit = {
  sha: string;
  commit: {
    committer: { date: string | null };
  };
};

type GitHubPull = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { ref: string };
  base: { ref: string };
  user?: { login?: string };
};

export type BuildLogSnapshot = {
  entries: readonly BuildLogEntry[];
  deployedRevision: string | null;
  checkedAt: string;
  source: "github-production-revision" | "static-fallback";
};

function githubHeaders() {
  const token = process.env.BUILD_LOG_GITHUB_TOKEN?.trim();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "gwapspot-build-log",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubJson<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: githubHeaders(),
    next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new Error(`BUILD_LOG_GITHUB_${response.status}`);
  }
  return (await response.json()) as T;
}

function normalizeTitle(value: string) {
  return value
    .replace(/^(feat|fix|perf|refactor|docs|style|test|ci|chore)(\([^)]+\))?:\s*/i, "")
    .replace(/^[-–—\s]+/, "")
    .trim();
}

function sentence(value: string) {
  const normalized = normalizeTitle(value);
  if (!normalized) return "Production update";
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function slugPart(value: string) {
  return normalizeTitle(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "production-update";
}

function inferKind(title: string, branch: string): BuildLogKind {
  const text = `${title} ${branch}`.toLowerCase();
  if (/brand|social|artwork|logo|identity visual/.test(text)) return "Brand";
  if (/perf|a11y|css|ui|ux|mobile|splash|transition|navigation/.test(text)) return "Experience";
  if (/ppv|gns|auth|privy|wallet|domain|api|rpc|security|telemetry|infra/.test(text)) {
    return "Infrastructure";
  }
  if (/gwap os|gwapos|shell|workspace|platform/.test(text)) return "Platform";
  return "Product";
}

function destinationFor(title: string, branch: string) {
  const text = `${title} ${branch}`.toLowerCase();
  if (/ppv/.test(text)) return "/ppv";
  if (/gwapmoji/.test(text)) return "/gwapmojis";
  if (/wallet|privy|auth|gwap os|gwapos/.test(text)) return "/app";
  if (/roadmap/.test(text)) return "/roadmap";
  if (/developer|api/.test(text)) return "/developers";
  return "/ecosystem";
}

function shouldPublish(pr: GitHubPull) {
  const text = `${pr.title} ${pr.head.ref}`.toLowerCase();
  if (pr.base.ref !== "main" || !pr.merged_at || !pr.merge_commit_sha) return false;
  if (/dependabot|chore\(deps\)|^chore: bump|^ci\(|^test\(/.test(text)) return false;
  return true;
}

function entryFromPull(pr: GitHubPull): BuildLogEntry {
  const title = normalizeTitle(pr.title);
  const releasedAt = pr.merged_at ?? new Date(0).toISOString();
  const sha = pr.merge_commit_sha ?? "";
  const kind = inferKind(pr.title, pr.head.ref);

  return {
    slug: `live-pr-${pr.number}-${slugPart(title)}`,
    releasedAt,
    kind,
    status: "Live",
    title,
    summary: `${sentence(pr.title)} This production entry was synchronized automatically after the merged revision reached the live GWAPSpot deployment.`,
    highlights: [
      `PR #${pr.number} merged into main and is included in production revision ${sha.slice(0, 7)}.`,
      "The build log now surfaces this release automatically without a manual changelog edit.",
    ],
    links: [{ label: "Open affected product", href: destinationFor(pr.title, pr.head.ref) }],
  };
}

function combineEntries(live: readonly BuildLogEntry[]) {
  const entries = [...live, ...buildLogEntries];
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      if (seen.has(entry.slug)) return false;
      seen.add(entry.slug);
      return true;
    })
    .sort(
      (left, right) =>
        Date.parse(right.releasedAt) - Date.parse(left.releasedAt),
    );
}

function deployedRevision() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    null
  );
}

export async function getLiveBuildLogEntries() {
  const revision = deployedRevision() ?? "main";
  const [commits, pulls] = await Promise.all([
    githubJson<GitHubCommit[]>(
      `/repos/${GITHUB_REPO}/commits?sha=${encodeURIComponent(revision)}&per_page=100`,
    ),
    githubJson<GitHubPull[]>(
      `/repos/${GITHUB_REPO}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=50`,
    ),
  ]);

  const reachable = new Set(commits.map((commit) => commit.sha));
  return pulls
    .filter(
      (pr) =>
        shouldPublish(pr) &&
        typeof pr.merge_commit_sha === "string" &&
        reachable.has(pr.merge_commit_sha),
    )
    .sort(
      (left, right) =>
        Date.parse(right.merged_at ?? "1970-01-01") -
        Date.parse(left.merged_at ?? "1970-01-01"),
    )
    .slice(0, LIVE_ENTRY_LIMIT)
    .map(entryFromPull);
}

export async function getBuildLogSnapshot(): Promise<BuildLogSnapshot> {
  const checkedAt = new Date().toISOString();
  const revision = deployedRevision();

  try {
    const live = await getLiveBuildLogEntries();
    return {
      entries: combineEntries(live),
      deployedRevision: revision,
      checkedAt,
      source: "github-production-revision",
    };
  } catch {
    return {
      entries: buildLogEntries,
      deployedRevision: revision,
      checkedAt,
      source: "static-fallback",
    };
  }
}
