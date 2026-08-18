import { describe, expect, it } from 'vitest';
import {
  activeAdminRoleNames,
  hasRequiredAdminPermissions,
  permissionsForRoles,
} from '../src/lib/admin-permissions';

describe('admin permission evaluation', () => {
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
});
