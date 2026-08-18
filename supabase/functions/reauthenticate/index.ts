import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import {
  currentSessionId,
  reauthenticationInputSchema,
  verifyOtpReauthentication,
  verifyPasswordReauthentication,
} from '../_shared/reauthentication.ts';

Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  try {
    const current = await authenticatedUser(request);
    const sessionId = currentSessionId(request);
    const input = reauthenticationInputSchema.parse(await request.json());
    if (input.method === 'otp') {
      await verifyOtpReauthentication(input.nonce);
      throw new Error('OTP_REAUTHENTICATION_NOT_CONFIGURED');
    }
    if (!current.email) throw new Error('EMAIL_ACCOUNT_REQUIRED');
    const url = Deno.env.get('SUPABASE_URL');
    const publishable = Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if (!url || !publishable) throw new Error('SERVER_CONFIG');
    const service = serviceClient();
    const expiresAt = await verifyPasswordReauthentication(
      { userId: current.id, email: current.email, password: input.password, sessionId },
      {
        verifyCredentials: async (email, password, userId) => {
          const verifier = createClient(url, publishable, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          try {
            const { data, error } = await verifier.auth.signInWithPassword({ email, password });
            return !error && Boolean(data.session) && data.user?.id === userId;
          } finally {
            await verifier.auth.signOut({ scope: 'local' });
          }
        },
        recordProof: async (userId, currentSession, method) => {
          const { data, error } = await service.rpc('record_account_reauthentication', {
            p_user_id: userId,
            p_session_id: currentSession,
            p_method: method,
          });
          if (error || !data) throw new Error('REAUTHENTICATION_RECORD_FAILED');
          return String(data);
        },
      },
    );
    return json(request, {
      verified: true,
      method: 'password',
      expiresAt,
      correlationId,
    });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
});
