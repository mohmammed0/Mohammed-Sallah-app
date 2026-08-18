export type AdminPermission =
  | 'dashboard.aggregate.read'
  | 'customer.pii.read'
  | 'job.exact_location.read'
  | 'support.case.read'
  | 'finance.read'
  | 'provider.document.read'
  | 'operations.mutate'
  | 'operations.marketplace.read'
  | 'operations.notifications.read'
  | 'operations.exact_location.read';

const grants: Readonly<Record<string, readonly AdminPermission[]>> = {
  operations_admin: [
    'dashboard.aggregate.read',
    'operations.mutate',
    'operations.marketplace.read',
    'operations.notifications.read',
    'operations.exact_location.read',
  ],
  verification_reviewer: ['dashboard.aggregate.read', 'provider.document.read'],
  support_agent: ['dashboard.aggregate.read', 'support.case.read'],
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
    'operations.marketplace.read',
    'operations.notifications.read',
    'operations.exact_location.read',
  ],
};

export type SupportCapability = 'read' | 'internal_note' | 'evidence' | 'exact_location';

export interface SupportCaseGrant {
  caseId: string;
  permissions: readonly SupportCapability[];
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface SupportResourceLink {
  caseId: string;
  requestId: string | null;
  jobId: string | null;
}

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

export function hasAnyAdminPermission(
  profileStatus: string | null | undefined,
  roles: readonly AdminRoleRow[],
  required: readonly AdminPermission[],
): boolean {
  if (profileStatus !== 'active') return false;
  const permissions = permissionsForRoles(activeAdminRoleNames(roles));
  return required.some((permission) => permissions.has(permission));
}

export function hasActiveSupportCaseCapability(
  profileStatus: string | null | undefined,
  roles: readonly AdminRoleRow[],
  grants: readonly SupportCaseGrant[],
  caseId: string,
  capability: SupportCapability,
  now: Date,
): boolean {
  if (profileStatus !== 'active' || !activeAdminRoleNames(roles).includes('support_agent')) {
    return false;
  }
  const timestamp = now.getTime();
  return grants.some(
    (grant) =>
      grant.caseId === caseId &&
      grant.revokedAt === null &&
      Date.parse(grant.startsAt) <= timestamp &&
      (grant.expiresAt === null || Date.parse(grant.expiresAt) > timestamp) &&
      grant.permissions.includes(capability),
  );
}

export function canReadSupportLinkedResource(
  profileStatus: string | null | undefined,
  roles: readonly AdminRoleRow[],
  grants: readonly SupportCaseGrant[],
  links: readonly SupportResourceLink[],
  resource: { requestId?: string; jobId?: string },
  now: Date,
): boolean {
  if (hasAnyAdminPermission(profileStatus, roles, ['operations.marketplace.read'])) {
    return true;
  }
  return links.some(
    (link) =>
      ((resource.requestId !== undefined && link.requestId === resource.requestId) ||
        (resource.jobId !== undefined && link.jobId === resource.jobId)) &&
      hasActiveSupportCaseCapability(profileStatus, roles, grants, link.caseId, 'read', now),
  );
}
