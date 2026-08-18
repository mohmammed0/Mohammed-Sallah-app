import { createServerClient } from '@supabase/ssr';
import type { Database } from '@sallah/database';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'local-anon-key';
  if (/secret|service_role/i.test(key)) throw new Error('SERVER_SECRET_REJECTED_IN_PUBLIC_CLIENT');
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          for (const value of values) cookieStore.set(value.name, value.value, value.options);
        } catch {
          // Server Components cannot set cookies; middleware/auth actions refresh them.
        }
      },
    },
  });
}
