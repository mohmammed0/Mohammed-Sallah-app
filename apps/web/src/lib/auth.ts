import { redirect } from 'next/navigation';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { userRoleSchema } from '@sallah/domain';
import { createSupabaseServerClient } from './supabase/server';
import {
  activeAdminRoleNames,
  hasAnyAdminPermission,
  hasRequiredAdminPermissions,
  permissionsForRoles,
  type AdminPermission,
  type AdminRoleRow,
} from './admin-permissions';

export type { AdminPermission } from './admin-permissions';

const sessionContext = z.object({
  accountStatus: z.string(),
  allowed: z.literal(true),
  authenticated: z.literal(true),
  roles: z.array(userRoleSchema),
});

export async function requireAdmin(required: readonly AdminPermission[]) {
  return requireAdminAuthorization(required, 'all');
}

export async function requireAnyAdmin(required: readonly AdminPermission[]) {
  return requireAdminAuthorization(required, 'any');
}

async function requireAdminAuthorization(
  required: readonly AdminPermission[],
  mode: 'all' | 'any',
) {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/login?next=/admin');
  let context = await client.rpc('get_session_context');
  if (context.error?.code === 'PGRST303' && context.error.message === 'JWT issued at future') {
    await delay(1_100);
    context = await client.rpc('get_session_context');
  }
  const { data, error } = context;
  const parsed = sessionContext.safeParse(data);
  const roleRows: AdminRoleRow[] = (parsed.success ? parsed.data.roles : []).map((role) => ({
    role,
    revoked_at: null,
  }));
  if (
    error ||
    !parsed.success ||
    !(mode === 'all'
      ? hasRequiredAdminPermissions(parsed.data.accountStatus, roleRows, required)
      : hasAnyAdminPermission(parsed.data.accountStatus, roleRows, required))
  ) {
    console.warn('ADMIN_AUTHORIZATION_DENIED', {
      contextError: error?.code ?? null,
      contextErrorMessage: error?.message ?? null,
      contextValid: parsed.success,
      profileStatus: parsed.success ? parsed.data.accountStatus : null,
      roles: activeAdminRoleNames(roleRows),
      required,
      mode,
    });
    redirect('/forbidden');
  }
  const roleNames = activeAdminRoleNames(roleRows);
  const permissions = permissionsForRoles(roleNames);
  return { client, user, roles: roleNames, permissions };
}
