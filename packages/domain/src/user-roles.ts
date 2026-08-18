import { z } from 'zod';

export const userRoleValues = [
  'customer',
  'provider',
  'operations_admin',
  'verification_reviewer',
  'support_agent',
  'finance_reviewer',
  'analyst',
  'super_admin',
  'privacy_reviewer',
] as const;

export const userRoleSchema = z.enum(userRoleValues);
export type UserRole = z.infer<typeof userRoleSchema>;
export const marketplaceRoleSchema = z.enum(['customer', 'provider']);
export type MarketplaceRole = z.infer<typeof marketplaceRoleSchema>;

export function parseKnownUserRoles(values: readonly string[]): {
  roles: UserRole[];
  unknownRoles: string[];
} {
  const roles: UserRole[] = [];
  const unknownRoles: string[] = [];
  for (const value of values) {
    const parsed = userRoleSchema.safeParse(value);
    if (parsed.success) roles.push(parsed.data);
    else unknownRoles.push(value);
  }
  return { roles, unknownRoles };
}
