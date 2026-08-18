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
});
