import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adminCommandKey } from '../src/lib/admin-command-intent';

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

  it('renders a durable command intent into every mutating form', () => {
    for (const pagePath of [
      '../app/admin/providers/page.tsx',
      '../app/admin/catalog/page.tsx',
      '../app/admin/customers/page.tsx',
      '../app/admin/finance/page.tsx',
      '../app/admin/support/page.tsx',
    ]) {
      const page = source(pagePath);
      const forms = page.match(/<form\s[\s\S]*?action=/g)?.length ?? 0;
      const intents = page.match(/<DurableCommandIntent/g)?.length ?? 0;
      expect(intents).toBe(forms);
      expect(page).toContain('crypto.randomUUID()');
    }
    const component = source('../src/components/durable-command-intent.tsx');
    expect(component).toContain('localStorage.getItem');
    expect(component).toContain('localStorage.setItem');
    expect(component).toContain('normalizedExpiresAt');
    expect(component).toContain('id: crypto.randomUUID()');
    expect(component).toContain('setIntent(nextIntent)');
  });

  it('normalizes support expiry before hashing and reuses that exact value', () => {
    const actions = source('../app/admin/actions.ts');
    const normalized = actions.indexOf("formData.get('normalizedExpiresAt')");
    const commandPayload = actions.indexOf(
      'const commandPayload = { ...input, expiresAt: input.expiresAt }',
    );
    const rpcValue = actions.indexOf('p_expires_at: input.expiresAt');
    const hash = actions.indexOf("formCommandKey('support-assignment', formData, commandPayload)");
    expect(normalized).toBeGreaterThan(-1);
    expect(commandPayload).toBeGreaterThan(normalized);
    expect(rpcValue).toBeGreaterThan(commandPayload);
    expect(hash).toBeGreaterThan(rpcValue);
    expect(actions).not.toContain('Date.now()');
  });

  it('reconstructs the same browser action after response loss with one command key', () => {
    const intentId = '11111111-1111-4111-8111-111111111111';
    const normalized = {
      caseId: '22222222-2222-4222-8222-222222222222',
      assigneeId: '33333333-3333-4333-8333-333333333333',
      reason: 'Investigate the controlled support case',
      exactLocation: false,
      expiresAt: '2026-08-19T18:00:00.000Z',
    };
    const firstKey = adminCommandKey('support-assignment', intentId, normalized);
    const reconstructedKey = adminCommandKey('support-assignment', intentId, {
      expiresAt: normalized.expiresAt,
      exactLocation: false,
      reason: normalized.reason,
      assigneeId: normalized.assigneeId,
      caseId: normalized.caseId,
    });
    expect(reconstructedKey).toBe(firstKey);
    const authoritativeAssignments = new Map<string, string>();
    authoritativeAssignments.set(firstKey, 'assignment-1');
    authoritativeAssignments.set(reconstructedKey, 'assignment-1');
    expect(authoritativeAssignments).toHaveLength(1);
    expect(
      adminCommandKey('support-assignment', '44444444-4444-4444-8444-444444444444', normalized),
    ).not.toBe(firstKey);
  });
});
