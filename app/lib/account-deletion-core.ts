export type AccountDeletionSteps = {
  deleteIdentity: () => Promise<void>;
  purgeApplicationData: () => Promise<void>;
};

export async function deleteAccountInRecoverableOrder(
  steps: AccountDeletionSteps,
) {
  // Keep the identity valid until every application-owned record has been
  // purged so a transient storage failure can be retried by the same user.
  await steps.purgeApplicationData();
  await steps.deleteIdentity();
}
