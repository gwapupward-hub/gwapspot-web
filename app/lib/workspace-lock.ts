import { randomBytes } from "node:crypto";

type WorkspaceLeaseStore = {
  deleteIfValue(key: string, value: string): Promise<boolean>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
};

export class WorkspaceLockBusyError extends Error {
  constructor() {
    super("WORKSPACE_LOCK_BUSY");
    this.name = "WorkspaceLockBusyError";
  }
}

export async function withWorkspaceLock<T>(
  store: WorkspaceLeaseStore,
  key: string,
  operation: () => Promise<T>,
  options: { ttlSeconds?: number; token?: string } = {},
) {
  const ttlSeconds = Math.max(5, Math.floor(options.ttlSeconds ?? 30));
  const token = options.token ?? randomBytes(18).toString("base64url");
  const acquired = await store.setIfAbsent(key, token, ttlSeconds);
  if (!acquired) throw new WorkspaceLockBusyError();

  try {
    return await operation();
  } finally {
    // The lease expires on its own. A failed release must not hide a successful
    // operation, and the value check prevents an expired holder from deleting a
    // newer lease.
    await store.deleteIfValue(key, token).catch(() => false);
  }
}
