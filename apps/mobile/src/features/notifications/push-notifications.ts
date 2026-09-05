import { z } from 'zod';

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';
export type PushRegistrationResult = 'registered' | 'denied' | 'not_requested' | 'unavailable';

export interface PushRegistrationDependencies {
  getPermission(): Promise<PushPermissionState>;
  requestPermission(): Promise<PushPermissionState>;
  configureAndroidChannel(): Promise<void>;
  getExpoToken(projectId: string, nativeToken?: unknown): Promise<string>;
  getInstallationId(): Promise<string>;
  invokeDeviceCommand(body: Record<string, unknown>): Promise<{ ok: boolean }>;
}

interface PushRegistrationOptions {
  prompt: boolean;
  projectId: string;
  platform: 'ios' | 'android';
  appVersion: string;
  nativeToken?: unknown;
}

const expoTokenSchema = z.string().regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/);
const installationIdSchema = z.string().uuid();

export async function runPushRegistration(
  dependencies: PushRegistrationDependencies,
  options: PushRegistrationOptions,
): Promise<PushRegistrationResult> {
  let permission = await dependencies.getPermission();
  if (permission !== 'granted') {
    if (!options.prompt || permission === 'denied') {
      return permission === 'denied' ? 'denied' : 'not_requested';
    }
    permission = await dependencies.requestPermission();
  }
  if (permission !== 'granted') return 'denied';
  try {
    if (options.platform === 'android') await dependencies.configureAndroidChannel();
    const [token, installationId] = await Promise.all([
      dependencies.getExpoToken(options.projectId, options.nativeToken),
      dependencies.getInstallationId(),
    ]);
    const response = await dependencies.invokeDeviceCommand({
      action: 'register',
      installationId: installationIdSchema.parse(installationId),
      platform: options.platform,
      appVersion: options.appVersion.trim().slice(0, 64),
      token: expoTokenSchema.parse(token),
    });
    return response.ok ? 'registered' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

const envelopeSchema = z
  .object({
    schema: z.literal('sallah.push.v1'),
    destination: z.enum([
      'offers',
      'provider_feed',
      'messages',
      'jobs',
      'support',
      'account',
      'notifications',
    ]),
  })
  .strict();

interface PushSessionProjection {
  authenticated: boolean;
  allowed: boolean;
  roles: readonly string[];
}

export type PushRoute =
  '/offers' | '/provider/feed' | '/messages' | '/jobs' | '/support' | '/account' | '/notifications';

export function resolvePushDestination(
  data: unknown,
  session: PushSessionProjection,
): PushRoute | null {
  if (!session.authenticated || !session.allowed) return null;
  const parsed = envelopeSchema.safeParse(data);
  if (!parsed.success) return null;
  const customer = session.roles.includes('customer');
  const provider = session.roles.includes('provider');
  switch (parsed.data.destination) {
    case 'offers':
      return customer ? '/offers' : null;
    case 'provider_feed':
      return provider ? '/provider/feed' : null;
    case 'messages':
      return customer || provider ? '/messages' : null;
    case 'jobs':
      return customer || provider ? '/jobs' : null;
    case 'support':
      return customer || provider ? '/support' : null;
    case 'account':
      return '/account';
    case 'notifications':
      return '/notifications';
  }
}

export async function runPushRevocation(
  dependencies: Pick<PushRegistrationDependencies, 'getInstallationId' | 'invokeDeviceCommand'>,
  scope: 'current' | 'all',
): Promise<'revoked' | 'unavailable'> {
  try {
    const body =
      scope === 'all'
        ? { action: 'revoke_all' as const }
        : {
            action: 'revoke' as const,
            installationId: installationIdSchema.parse(await dependencies.getInstallationId()),
          };
    const response = await dependencies.invokeDeviceCommand(body);
    return response.ok ? 'revoked' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export function openAuthorizedPushDestination(
  data: unknown,
  session: PushSessionProjection,
  navigate: (route: PushRoute) => void,
): boolean {
  const route = resolvePushDestination(data, session);
  if (!route) return false;
  navigate(route);
  return true;
}

interface PushTokenSubscription {
  remove(): void;
}

export function bindPushTokenRotation(
  subscribe: (listener: (nativeToken: unknown) => void) => PushTokenSubscription,
  synchronize: (nativeToken: unknown) => Promise<void>,
  onFailure: () => void = () => undefined,
): () => void {
  const subscription = subscribe((nativeToken) => {
    void synchronize(nativeToken).catch(onFailure);
  });
  return () => subscription.remove();
}
