export const GWAPSPOT_APP_VERCEL_PROJECT_ID =
  "prj_n5B9Lw7Qr2lD3Qm09djLpV3TJgUn";

/**
 * Both Vercel projects consume the same vercel.json, so both receive the cron
 * schedule. Only gwapspot-app should execute scheduled application workers.
 *
 * Manual/internal worker calls are still allowed on either project; this gate
 * applies only when Vercel identifies the request as a scheduled cron.
 */
export function shouldRunScheduledWorker({
  isVercelCron,
  projectId,
}: {
  isVercelCron: boolean;
  projectId: string | undefined;
}) {
  if (!isVercelCron) return true;
  return projectId === GWAPSPOT_APP_VERCEL_PROJECT_ID;
}
