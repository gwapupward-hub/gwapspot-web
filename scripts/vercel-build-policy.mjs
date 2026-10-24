export const GWAPSPOT_APP_PROJECT_ID =
  "prj_n5B9Lw7Qr2lD3Qm09djLpV3TJgUn";
export const GWAPSPOT_DEV_PROJECT_ID =
  "prj_XmkEQiuims9d9cl14kvUBwdgF09U";
export const GWAPSPOT_WEB_PROJECT_ID =
  "prj_O6BbMcHq56BFCMwiE7nA9Uhv3FbC";
export const LIL_GWAPZ_PREVIEW_BRANCH = "feat/lil-gwapz-mobile-hub";

/**
 * Keep production behavior unchanged across the linked Vercel projects.
 * Existing previews continue to use gwapspot-app as the canonical build,
 * except Lil Gwapz: that public-site feature belongs to gwapspot-web only.
 */
export function shouldIgnoreVercelBuild({
  projectId,
  environment,
  branch = "",
}) {
  if (environment === "production") return false;

  if (branch === LIL_GWAPZ_PREVIEW_BRANCH) {
    if (projectId === GWAPSPOT_WEB_PROJECT_ID) return false;
    if (
      projectId === GWAPSPOT_APP_PROJECT_ID ||
      projectId === GWAPSPOT_DEV_PROJECT_ID
    ) {
      return true;
    }
    return false;
  }

  return projectId === GWAPSPOT_WEB_PROJECT_ID;
}
