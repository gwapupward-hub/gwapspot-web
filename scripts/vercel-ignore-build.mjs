import {
  shouldIgnoreVercelBuild,
} from "./vercel-build-policy.mjs";

const ignore = shouldIgnoreVercelBuild({
  projectId: process.env.VERCEL_PROJECT_ID ?? "",
  environment: process.env.VERCEL_ENV ?? "",
});

if (ignore) {
  console.log(
    "[vercel] skipping duplicate gwapspot-web preview; gwapspot-app owns automatic previews",
  );
  process.exit(0);
}

console.log("[vercel] build required for this project/environment");
process.exit(1);
