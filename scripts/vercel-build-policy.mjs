export const GWAPSPOT_APP_PROJECT_ID =
  "prj_n5B9Lw7Qr2lD3Qm09djLpV3TJgUn";
export const GWAPSPOT_WEB_PROJECT_ID =
  "prj_O6BbMcHq56BFCMwiE7nA9Uhv3FbC";

/**
 * Keep production builds on both Vercel projects because each owns a
 * different production hostname. For previews, gwapspot-app is the single
 * canonical build. Public-site previews can be requested manually when they
 * are actually needed.
 */
export function shouldIgnoreVercelBuild({
  projectId,
  environment,
}) {
  if (environment === "production") return false;
  return projectId === GWAPSPOT_WEB_PROJECT_ID;
}
