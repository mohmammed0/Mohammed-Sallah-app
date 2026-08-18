import { z } from 'npm:zod@4.4.3';

export const reauthenticationInputSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('password'), password: z.string().min(8).max(1024) }),
  z.object({ method: z.literal('otp'), nonce: z.string().min(6).max(12) }),
]);

const jwtPayloadSchema = z.object({ session_id: z.uuid() });

export function currentSessionId(request: Request): string {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const encoded = token?.split('.')[1];
  if (!encoded) throw new Error('AUTH_REQUIRED');
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return jwtPayloadSchema.parse(JSON.parse(atob(padded))).session_id;
  } catch {
    throw new Error('AUTH_REQUIRED');
  }
}

export interface PasswordReauthenticationDependencies {
  verifyCredentials: (email: string, password: string, userId: string) => Promise<boolean>;
  recordProof: (userId: string, sessionId: string, method: 'password') => Promise<string>;
}

export async function verifyPasswordReauthentication(
  input: { userId: string; email: string; password: string; sessionId: string },
  dependencies: PasswordReauthenticationDependencies,
): Promise<string> {
  z.object({
    userId: z.uuid(),
    email: z.email(),
    password: z.string().min(8).max(1024),
    sessionId: z.uuid(),
  }).parse(input);
  if (!await dependencies.verifyCredentials(input.email, input.password, input.userId)) {
    throw new Error('WRONG_PASSWORD');
  }
  return await dependencies.recordProof(input.userId, input.sessionId, 'password');
}

export interface OtpReauthenticationProvider {
  verify: (nonce: string) => Promise<boolean>;
}

export async function verifyOtpReauthentication(
  nonce: string,
  provider?: OtpReauthenticationProvider,
): Promise<void> {
  z.string().min(6).max(12).parse(nonce);
  if (!provider) throw new Error('OTP_REAUTHENTICATION_NOT_CONFIGURED');
  if (!await provider.verify(nonce)) throw new Error('WRONG_OTP');
}
