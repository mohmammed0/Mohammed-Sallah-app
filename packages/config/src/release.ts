import { z } from 'zod';

const placeholder = /example\.|\.invalid|REQUIRES_[A-Z_]+|changeme|placeholder/i;

export function isReleasePlaceholder(value: string): boolean {
  return placeholder.test(value);
}

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, '');
  return (
    host.includes('.') &&
    !host.includes(':') &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) &&
    !/(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/u.test(host) &&
    !isReleasePlaceholder(host)
  );
}

const publicReleaseUrl = z.url().refine((value) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.search === '' &&
    url.hash === '' &&
    isPublicHostname(url.hostname)
  );
}, 'Use a public HTTPS URL without credentials, query, fragment or custom port');

export const nativeReleaseIdentitySchema = z.object({
  EAS_PROJECT_ID: z.uuid(),
  SALLAH_IOS_BUNDLE_ID: z
    .string()
    .max(255)
    .regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u)
    .refine((value) => !isReleasePlaceholder(value)),
  SALLAH_ANDROID_PACKAGE: z
    .string()
    .max(255)
    .regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u)
    .refine((value) => !isReleasePlaceholder(value)),
});

export const releaseIdentitySchema = nativeReleaseIdentitySchema.extend({
  SUPABASE_URL: publicReleaseUrl.refine(
    (value) => URL.canParse(value) && new URL(value).pathname === '/',
    'Use the project origin without a path',
  ),
  SALLAH_PUBLIC_URL: publicReleaseUrl,
  SALLAH_PRIVACY_URL: publicReleaseUrl,
  SALLAH_TERMS_URL: publicReleaseUrl,
  SALLAH_SUPPORT_EMAIL: z
    .email()
    .refine((value) => isPublicHostname(value.slice(value.lastIndexOf('@') + 1))),
  SALLAH_LEGAL_ENTITY: z
    .string()
    .trim()
    .min(2)
    .max(240)
    .refine((value) => !isReleasePlaceholder(value)),
});

// Errors carry field names only. A malformed URL or credential must never be echoed by CI.
export function validateReleaseIdentity(input: Record<string, string | undefined>): void {
  const result = releaseIdentitySchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid release identity: ${fields.join(', ')}`);
  }
}

export const productionBackendEnvironmentSchema = releaseIdentitySchema
  .pick({ SUPABASE_URL: true })
  .extend({
    SUPABASE_SECRET_KEY: z
      .string()
      .trim()
      .min(16)
      .refine((value) => !isReleasePlaceholder(value)),
  });

export function validateProductionBackendEnvironment(input: Record<string, string | undefined>) {
  const result = productionBackendEnvironmentSchema.safeParse(input);
  if (!result.success)
    throw new Error('Production backend requires SUPABASE_URL and SUPABASE_SECRET_KEY');
  return result.data;
}

export const legalReleaseReadinessSchema = z
  .object({
    ready: z.boolean(),
    consentEnabled: z.boolean(),
    missingDocuments: z
      .array(
        z
          .object({
            locale: z.enum(['ar', 'en', 'ur', 'hi']),
            documentType: z.enum(['privacy', 'terms', 'community']),
          })
          .strict(),
      )
      .max(12),
    versionsAligned: z.boolean(),
  })
  .strict();

const firebaseClientSchema = z
  .object({
    project_info: z
      .object({ project_id: z.string().min(1), project_number: z.string().regex(/^\d+$/u) })
      .passthrough(),
    client: z
      .array(
        z
          .object({
            client_info: z
              .object({
                mobilesdk_app_id: z.string().min(1),
                android_client_info: z.object({ package_name: z.string().min(1) }).passthrough(),
              })
              .passthrough(),
            api_key: z.array(z.object({ current_key: z.string().min(1) }).passthrough()).min(1),
          })
          .passthrough(),
      )
      .min(1),
    configuration_version: z.string().optional(),
  })
  .strict();

export function validateGoogleServicesConfiguration(
  content: string | undefined,
  androidPackage: string | undefined,
): string {
  const error =
    'GOOGLE_SERVICES_JSON must be a Firebase client configuration matching SALLAH_ANDROID_PACKAGE';
  if (!content || content.length > 262_144 || !androidPackage) throw new Error(error);
  let input: unknown;
  try {
    input = JSON.parse(content);
  } catch {
    throw new Error(error);
  }
  const containsServerFields = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(containsServerFields);
    if (value === null || typeof value !== 'object') return false;
    return Object.entries(value).some(
      ([key, child]) =>
        /^(?:private_key(?:_id)?|client_secret|service_role_key|secret_key|access_token|refresh_token)$/iu.test(
          key,
        ) || containsServerFields(child),
    );
  };
  if (containsServerFields(input)) throw new Error(error);
  const parsed = firebaseClientSchema.safeParse(input);
  if (
    !parsed.success ||
    !parsed.data.client.some(
      (client) => client.client_info.android_client_info.package_name === androidPackage,
    )
  ) {
    throw new Error(error);
  }
  return JSON.stringify(parsed.data);
}
