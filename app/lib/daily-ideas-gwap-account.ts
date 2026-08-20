import "server-only";

import type { WalletIdentity } from "./privy-server";
import {
  getDailyIdeasIdentityLinkForGwap,
  migrateDailyIdeasGwapIdentity,
} from "./daily-ideas-identity-link";
import {
  getOrCreateGwapAccount,
  linkTelegramToGwapAccount,
} from "./gwap-account";

export async function resolveDailyIdeasGwapAccount(
  identity: WalletIdentity,
  options: { primaryGnsIdentity?: string | null } = {},
) {
  let account = await getOrCreateGwapAccount(identity, options);
  const migration = await migrateDailyIdeasGwapIdentity(identity.userId, account.id);
  if (!migration.ok) {
    throw new Error("DAILY_IDEAS_IDENTITY_CONFLICT");
  }

  const link = migration.link || (await getDailyIdeasIdentityLinkForGwap(account.id));
  if (link && account.telegramUserId !== link.telegramUserId) {
    const canonical = await linkTelegramToGwapAccount(account.id, link.telegramUserId, {
      primaryGnsIdentity: options.primaryGnsIdentity || link.gnsIdentity,
    });
    if (!canonical.ok) throw new Error("GWAP_ACCOUNT_LINK_CONFLICT");
    account = canonical.account;
  }

  return account;
}
