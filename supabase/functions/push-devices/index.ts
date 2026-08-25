import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { parseAppEnvironment } from '../_shared/scanner-control.ts';
import { pushDeviceRequestSchema, sealPushToken, sha256Hex } from '../_shared/push.ts';

export interface PushDeviceDatabase {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

export async function applyPushDeviceCommand(
  rawInput: unknown,
  userId: string,
  db: PushDeviceDatabase,
  encryptionKey: string,
): Promise<{ status: 'registered' | 'revoked' }> {
  const input = pushDeviceRequestSchema.parse(rawInput);
  if (input.action === 'register') {
    const [tokenHash, tokenCiphertext] = await Promise.all([
      sha256Hex(input.token),
      sealPushToken(input.token, encryptionKey),
    ]);
    const { error } = await db.rpc('register_push_device', {
      p_user_id: userId,
      p_installation_id: input.installationId,
      p_platform: input.platform,
      p_app_version: input.appVersion,
      p_token_hash: tokenHash,
      p_token_ciphertext: tokenCiphertext,
      p_token_key_version: 1,
    });
    if (error) throw new Error('PUSH_DEVICE_COMMAND_FAILED');
    return { status: 'registered' };
  }
  const { error } = await db.rpc('revoke_push_devices', {
    p_user_id: userId,
    p_installation_id: input.action === 'revoke' ? input.installationId : null,
  });
  if (error) throw new Error('PUSH_DEVICE_COMMAND_FAILED');
  return { status: 'revoked' };
}

export const handlePushDevices = async (request: Request): Promise<Response> => {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  try {
    parseAppEnvironment(Deno.env.get('APP_ENV'));
    const encryptionKey = Deno.env.get('PUSH_TOKEN_ENCRYPTION_KEY');
    if (!encryptionKey) throw new Error('SERVER_CONFIG');
    const user = await authenticatedUser(request);
    const result = await applyPushDeviceCommand(
      await request.json(),
      user.id,
      serviceClient() as unknown as PushDeviceDatabase,
      encryptionKey,
    );
    return json(request, { ...result, correlationId });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
};

if (import.meta.main) Deno.serve(handlePushDevices);
