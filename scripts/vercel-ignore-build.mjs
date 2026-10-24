import {
  shouldIgnoreVercelBuild,
} from "./vercel-build-policy.mjs";

const projectId = process.env.VERCEL_PROJECT_ID ?? "";
const environment = process.env.VERCEL_ENV ?? "";
const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "";

const ignore = shouldIgnoreVercelBuild({
  projectId,
  environment,
  branch,
});

if (ignore) {
  console.log(
    `[vercel] skipping project ${projectId || "unknown"} for ${branch || "unknown branch"}`,
  );
  process.exit(0);
}

console.log(
  `[vercel] build required for ${projectId || "unknown project"} in ${environment || "unknown environment"}`,
);
process.exit(1);
