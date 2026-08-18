import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
export async function authenticatedUser(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth) throw new Error('AUTH_REQUIRED');
  const url = Deno.env.get('SUPABASE_URL');
  const publishable = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !publishable) throw new Error('SERVER_CONFIG');
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: publishable },
  });
  if (!response.ok) throw new Error('AUTH_REQUIRED');
  const payload: unknown = await response.json();
  if (
    !payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string'
  ) {
    throw new Error('AUTH_REQUIRED');
  }
  return {
    id: payload.id,
    email: 'email' in payload && typeof payload.email === 'string' ? payload.email : null,
  };
}
export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (!url || !secret) throw new Error('SERVER_CONFIG');
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
