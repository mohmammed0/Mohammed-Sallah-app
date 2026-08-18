import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('scoped admin workflow surfaces', () => {
  it('uses the minimal finance queue and preserves intent then confirmation actions', () => {
    const page = source('../app/admin/finance/page.tsx');
    expect(page).toContain("rpc('get_finance_review_queue')");
    expect(page).toContain('resolveDispute');
    expect(page).toContain('confirmFinancialAction');
    expect(page).not.toContain(".from('payments')");
    expect(page).not.toContain(".from('support_cases')");
  });

  it('exposes assignment, revocation, temporary access, and exact-location controls', () => {
    const page = source('../app/admin/support/page.tsx');
    expect(page).toContain('assignSupportCase');
    expect(page).toContain('endSupportAssignment');
    expect(page).toContain('grantSupportAccess');
    expect(page).toContain('revokeSupportAccess');
    expect(page).toContain('name="exactLocation"');
    expect(page).toContain('name="expiresAt"');
  });

  it('loads customer PII through the audited projection rather than profiles', () => {
    const page = source('../app/admin/customers/page.tsx');
    expect(page).toContain("rpc('list_customer_pii'");
    expect(page).not.toContain(".from('profiles')");
  });

  it('renders a unique command intent into every mutating form', () => {
    for (const pagePath of [
      '../app/admin/providers/page.tsx',
      '../app/admin/catalog/page.tsx',
      '../app/admin/customers/page.tsx',
      '../app/admin/finance/page.tsx',
      '../app/admin/support/page.tsx',
    ]) {
      const page = source(pagePath);
      const forms = page.match(/<form\s[\s\S]*?action=/g)?.length ?? 0;
      const intents = page.match(/name="commandIntentId"/g)?.length ?? 0;
      expect(intents).toBe(forms);
      expect(page).toContain('crypto.randomUUID()');
    }
  });

  it('normalizes support expiry before hashing and reuses that exact value', () => {
    const actions = source('../app/admin/actions.ts');
    const normalized = actions.indexOf('const expiresAt = input.expiresAt');
    const commandPayload = actions.indexOf('const commandPayload = { ...input, expiresAt }');
    const rpcValue = actions.indexOf('p_expires_at: expiresAt');
    const hash = actions.indexOf("formCommandKey('support-assignment', formData, commandPayload)");
    expect(normalized).toBeGreaterThan(-1);
    expect(commandPayload).toBeGreaterThan(normalized);
    expect(rpcValue).toBeGreaterThan(commandPayload);
    expect(hash).toBeGreaterThan(rpcValue);
  });
});
