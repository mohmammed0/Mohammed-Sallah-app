import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase/server';

const adminRoles = new Set([
  'operations_admin',
  'verification_reviewer',
  'support_agent',
  'finance_reviewer',
  'analyst',
  'super_admin',
]);
export async function requireAdmin(allowed?: readonly string[]) {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/login?next=/admin');
  const { data: roles, error } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  if (error) redirect('/forbidden');
  const roleNames = (roles ?? []).map((row) => String(row.role));
  const permitted = allowed
    ? roleNames.some((role) => allowed.includes(role))
    : roleNames.some((role) => adminRoles.has(role));
  if (!permitted) redirect('/forbidden');
  return { client, user, roles: roleNames };
}
