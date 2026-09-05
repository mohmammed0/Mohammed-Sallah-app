export async function assertActorLegalConsent(
  check: () => PromiseLike<{ error: { message?: string } | null }>,
): Promise<void> {
  const { error } = await check();
  if (!error) return;
  const allowed = new Set([
    'LEGAL_ACCEPTANCE_REQUIRED',
    'LEGAL_DOCUMENTS_UNAVAILABLE',
    'ACCOUNT_NOT_ACTIVE',
  ]);
  throw new Error(allowed.has(error.message ?? '') ? error.message : 'LEGAL_CONSENT_CHECK_FAILED');
}
