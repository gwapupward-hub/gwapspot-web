import "server-only";

import type { WalletIdentity } from "./privy-server";
import { getOrCreateGwapAccount } from "./gwap-account";
import { migrateDailyIdeasGwapIdentity } from "./daily-ideas-identity-link";

export async function resolveDailyIdeasGwapAccount(
  identity: WalletIdentity,
  options: { primaryGnsIdentity?: string | null } = {},
) {
  const account = await getOrCreateGwapAccount(identity, options);
  const migration = await migrateDailyIdeasGwapIdentity(identity.userId, account.id);
  if (!migration.ok) {
    throw new Error("DAILY_IDEAS_IDENTITY_CONFLICT");
  }
  return account;
}
