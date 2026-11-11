// Browser-side recovery for GNS registry lookups. The registry can be asleep;
// a 503 marked `retryable` is retried on a bounded schedule. Anything else —
// including the final failure — is returned unchanged so the caller can show
// the real error. Nothing here ever turns a failure into an answer.

export const GNS_RECOVERY_DELAYS_MS = [2_000, 4_000, 8_000, 12_000];
export const GNS_RECOVERY_DEADLINE_MS = 45_000;

async function isRetryable(response: Response) {
  if (response.status !== 503) return false;
  try {
    const payload = (await response.clone().json()) as { retryable?: unknown };
    return payload?.retryable === true;
  } catch {
    return false;
  }
}

export async function fetchGnsWithRecovery(
  request: () => Promise<Response>,
  {
    onRetry,
    isCancelled = () => false,
    delaysMs = GNS_RECOVERY_DELAYS_MS,
    deadlineMs = GNS_RECOVERY_DEADLINE_MS,
    wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: {
    onRetry?: (attempt: number) => void;
    isCancelled?: () => boolean;
    delaysMs?: number[];
    deadlineMs?: number;
    wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<Response> {
  const started = Date.now();
  let response = await request();
  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    if (isCancelled() || !(await isRetryable(response))) return response;
    if (Date.now() - started + delaysMs[attempt] > deadlineMs) return response;
    onRetry?.(attempt + 1);
    await wait(delaysMs[attempt]);
    if (isCancelled()) return response;
    response = await request();
  }
  return response;
}

/** Fire-and-forget: start waking the registry before the user submits a name. */
export function warmGnsRegistry(init?: RequestInit) {
  void fetch("/api/gns/warm", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  }).catch(() => undefined);
}
