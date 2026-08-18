export type AdminPermission =
  | 'dashboard.aggregate.read'
  | 'customer.pii.read'
  | 'job.exact_location.read'
  | 'support.case.read'
  | 'finance.read'
  | 'provider.document.read'
  | 'operations.mutate';

const grants: Readonly<Record<string, readonly AdminPermission[]>> = {
  operations_admin: [
    'dashboard.aggregate.read',
    'job.exact_location.read',
    'support.case.read',
    'operations.mutate',
  ],
  verification_reviewer: ['dashboard.aggregate.read', 'provider.document.read'],
  support_agent: [
    'dashboard.aggregate.read',
    'customer.pii.read',
    'job.exact_location.read',
    'support.case.read',
  ],
  finance_reviewer: ['dashboard.aggregate.read', 'finance.read'],
  analyst: ['dashboard.aggregate.read'],
  super_admin: [
    'dashboard.aggregate.read',
    'customer.pii.read',
    'job.exact_location.read',
    'support.case.read',
    'finance.read',
    'provider.document.read',
    'operations.mutate',
  ],
};

export interface AdminRoleRow {
  role: string;
  revoked_at: string | null;
}

export function activeAdminRoleNames(roles: readonly AdminRoleRow[]): string[] {
  return roles.filter((role) => role.revoked_at === null).map((role) => role.role);
}

export function permissionsForRoles(roles: readonly string[]): Set<AdminPermission> {
  return new Set(roles.flatMap((role) => grants[role] ?? []));
}

export function hasRequiredAdminPermissions(
  profileStatus: string | null | undefined,
  roles: readonly AdminRoleRow[],
  required: readonly AdminPermission[],
): boolean {
  if (profileStatus !== 'active') return false;
  const permissions = permissionsForRoles(activeAdminRoleNames(roles));
  return required.every((permission) => permissions.has(permission));
}
