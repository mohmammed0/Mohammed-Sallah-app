import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
export type { Database } from './database.types';
export function createBrowserDatabaseClient(
  url: string,
  publishableKey: string,
): SupabaseClient<Database> {
  if (/secret|service_role/i.test(publishableKey))
    throw new Error('SERVER_SECRET_REJECTED_IN_CLIENT');
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}
