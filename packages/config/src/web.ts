import { z } from 'zod';
import { appEnvironmentSchema } from './env';
import { releaseIdentitySchema } from './release';

export interface PublicLegalConnection {
  readonly url: string;
  readonly key: string;
}

function isPublishableKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/u.test(value)) return true;
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replace(/-/gu, '+').replace(/_/gu, '/')));
    return z.object({ role: z.literal('anon') }).safeParse(payload).success;
  } catch {
    return false;
  }
}

const connectionSchema = z.object({
  NEXT_PUBLIC_APP_ENV: appEnvironmentSchema,
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).max(4096).refine(isPublishableKey),
});

export function readPublicLegalConnection(
  environment: Record<string, string | undefined> = process.env,
): PublicLegalConnection | null {
  const parsed = connectionSchema.safeParse(environment);
  if (!parsed.success) return null;
  const input = parsed.data;
  const url = new URL(input.NEXT_PUBLIC_SUPABASE_URL);
  const local = input.NEXT_PUBLIC_APP_ENV === 'local' || input.NEXT_PUBLIC_APP_ENV === 'test';
  const localOrigin =
    local &&
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    url.pathname === '/' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash;
  if (!localOrigin && !releaseIdentitySchema.shape.SUPABASE_URL.safeParse(url.href).success)
    return null;
  return { url: url.origin, key: input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}

export function readPublicSupportEmail(
  environment: Record<string, string | undefined> = process.env,
): string | null {
  const parsed = releaseIdentitySchema.shape.SALLAH_SUPPORT_EMAIL.safeParse(
    environment.SALLAH_SUPPORT_EMAIL,
  );
  return parsed.success ? parsed.data : null;
}
