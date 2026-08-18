import { describe, expect, it } from 'vitest';
import {
  activeAdminRoleNames,
  canReadSupportLinkedResource,
  hasActiveSupportCaseCapability,
  hasRequiredAdminPermissions,
  permissionsForRoles,
} from '../src/lib/admin-permissions';

describe('admin permission evaluation', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  const supportRoles = [{ role: 'support_agent', revoked_at: null }];
  const assigned = [
    {
      caseId: 'case-1',
      permissions: ['read', 'internal_note'] as const,
      startsAt: '2026-08-18T10:00:00Z',
      expiresAt: null,
      revokedAt: null,
    },
  ];

  it('drops revoked assignments immediately', () => {
    const roles = activeAdminRoleNames([
      { role: 'support_agent', revoked_at: '2026-08-18T12:00:00Z' },
      { role: 'analyst', revoked_at: null },
    ]);
    expect(roles).toEqual(['analyst']);
    expect(permissionsForRoles(roles).has('customer.pii.read')).toBe(false);
  });

  it('keeps analysts restricted to aggregate dashboards', () => {
    const roles = [{ role: 'analyst', revoked_at: null }];
    expect(hasRequiredAdminPermissions('active', roles, ['dashboard.aggregate.read'])).toBe(true);
    expect(hasRequiredAdminPermissions('active', roles, ['finance.read'])).toBe(false);
  });

  it('denies inactive administrators even when a role grants the permission', () => {
    const roles = [{ role: 'super_admin', revoked_at: null }];
    expect(hasRequiredAdminPermissions('suspended', roles, ['finance.read'])).toBe(false);
  });

  it('allows an assigned support agent to read only linked marketplace resources', () => {
    const links = [{ caseId: 'case-1', requestId: 'request-1', jobId: 'job-1' }];
    expect(
      canReadSupportLinkedResource(
        'active',
        supportRoles,
        assigned,
        links,
        { jobId: 'job-1' },
        now,
      ),
    ).toBe(true);
    expect(
      canReadSupportLinkedResource(
        'active',
        supportRoles,
        assigned,
        links,
        { requestId: 'unrelated-request' },
        now,
      ),
    ).toBe(false);
  });

  it('denies unassigned, expired, and revoked support access immediately', () => {
    expect(hasActiveSupportCaseCapability('active', supportRoles, [], 'case-1', 'read', now)).toBe(
      false,
    );
    expect(
      hasActiveSupportCaseCapability(
        'active',
        supportRoles,
        [{ ...assigned[0]!, expiresAt: '2026-08-18T11:59:59Z' }],
        'case-1',
        'read',
        now,
      ),
    ).toBe(false);
    expect(
      hasActiveSupportCaseCapability(
        'active',
        supportRoles,
        [{ ...assigned[0]!, revokedAt: '2026-08-18T11:00:00Z' }],
        'case-1',
        'read',
        now,
      ),
    ).toBe(false);
    expect(
      hasActiveSupportCaseCapability(
        'active',
        [{ role: 'support_agent', revoked_at: '2026-08-18T11:00:00Z' }],
        assigned,
        'case-1',
        'read',
        now,
      ),
    ).toBe(false);
  });

  it('requires independent capabilities for exact locations and internal notes', () => {
    expect(
      hasActiveSupportCaseCapability(
        'active',
        supportRoles,
        assigned,
        'case-1',
        'internal_note',
        now,
      ),
    ).toBe(true);
    expect(
      hasActiveSupportCaseCapability(
        'active',
        supportRoles,
        assigned,
        'case-1',
        'exact_location',
        now,
      ),
    ).toBe(false);
  });

  it('keeps analysts aggregate-only and gives operations its distinct marketplace scope', () => {
    const links = [{ caseId: 'case-1', requestId: 'request-1', jobId: 'job-1' }];
    expect(
      canReadSupportLinkedResource(
        'active',
        [{ role: 'analyst', revoked_at: null }],
        [],
        links,
        { jobId: 'job-1' },
        now,
      ),
    ).toBe(false);
    expect(
      canReadSupportLinkedResource(
        'active',
        [{ role: 'operations_admin', revoked_at: null }],
        [],
        [],
        { jobId: 'job-1' },
        now,
      ),
    ).toBe(true);
  });
});
