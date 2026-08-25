import { describe, expect, it, vi } from 'vitest';
import {
  bindPushTokenRotation,
  openAuthorizedPushDestination,
  resolvePushDestination,
  runPushRevocation,
  runPushRegistration,
  type PushRegistrationDependencies,
} from '../src/features/notifications/push-notifications';

const installationId = '11111111-1111-4111-8111-111111111111';
const expoToken = 'ExponentPushToken[0123456789abcdefghij]';

function dependencies(overrides: Partial<PushRegistrationDependencies> = {}) {
  const invocations: unknown[] = [];
  const value: PushRegistrationDependencies = {
    getPermission: async () => 'undetermined',
    requestPermission: async () => 'granted',
    configureAndroidChannel: async () => undefined,
    getExpoToken: async () => expoToken,
    getInstallationId: async () => installationId,
    invokeDeviceCommand: async (body) => {
      invocations.push(body);
      return { ok: true };
    },
    ...overrides,
  };
  return { value, invocations };
}

describe('push notification lifecycle', () => {
  it('does not request a token or contact the backend after permission denial', async () => {
    let tokenRequests = 0;
    const { value, invocations } = dependencies({
      requestPermission: async () => 'denied',
      getExpoToken: async () => {
        tokenRequests += 1;
        return expoToken;
      },
    });
    await expect(
      runPushRegistration(value, {
        prompt: true,
        projectId: 'project-id',
        platform: 'android',
        appVersion: '0.1.0',
      }),
    ).resolves.toBe('denied');
    expect(tokenRequests).toBe(0);
    expect(invocations).toEqual([]);
  });

  it('registers one bounded Expo token for the current installation after permission', async () => {
    const { value, invocations } = dependencies();
    await expect(
      runPushRegistration(value, {
        prompt: true,
        projectId: 'project-id',
        platform: 'android',
        appVersion: '0.1.0',
      }),
    ).resolves.toBe('registered');
    expect(invocations).toEqual([
      {
        action: 'register',
        installationId,
        platform: 'android',
        appVersion: '0.1.0',
        token: expoToken,
      },
    ]);
  });

  it('never prompts during startup synchronization', async () => {
    let prompts = 0;
    const { value } = dependencies({
      getPermission: async () => 'undetermined',
      requestPermission: async () => {
        prompts += 1;
        return 'granted';
      },
    });
    await expect(
      runPushRegistration(value, {
        prompt: false,
        projectId: 'project-id',
        platform: 'ios',
        appVersion: '0.1.0',
      }),
    ).resolves.toBe('not_requested');
    expect(prompts).toBe(0);
  });

  it('maps only fixed authorized destinations and rejects injected routes', () => {
    const customer = { authenticated: true, allowed: true, roles: ['customer'] } as const;
    const provider = { authenticated: true, allowed: true, roles: ['provider'] } as const;
    expect(
      resolvePushDestination({ schema: 'sallah.push.v1', destination: 'offers' }, customer),
    ).toBe('/offers');
    expect(
      resolvePushDestination({ schema: 'sallah.push.v1', destination: 'provider_feed' }, customer),
    ).toBeNull();
    expect(
      resolvePushDestination({ schema: 'sallah.push.v1', destination: 'provider_feed' }, provider),
    ).toBe('/provider/feed');
    expect(
      resolvePushDestination({ schema: 'sallah.push.v1', destination: '../../account' }, provider),
    ).toBeNull();
    expect(
      resolvePushDestination(
        { schema: 'sallah.push.v1', destination: 'messages', url: 'https://evil.example' },
        provider,
      ),
    ).toBeNull();
    expect(
      resolvePushDestination(
        { schema: 'sallah.push.v1', destination: 'messages' },
        { authenticated: false, allowed: false, roles: [] },
      ),
    ).toBeNull();
  });

  it('revokes only the current installation or every installation explicitly', async () => {
    const { value, invocations } = dependencies();
    await expect(runPushRevocation(value, 'current')).resolves.toBe('revoked');
    await expect(runPushRevocation(value, 'all')).resolves.toBe('revoked');
    expect(invocations).toEqual([{ action: 'revoke', installationId }, { action: 'revoke_all' }]);
  });

  it('navigates from a notification only after current server session authorization', () => {
    const navigated: string[] = [];
    const navigate = (route: string) => navigated.push(route);
    expect(
      openAuthorizedPushDestination(
        { schema: 'sallah.push.v1', destination: 'jobs' },
        { authenticated: true, allowed: true, roles: ['provider'] },
        navigate,
      ),
    ).toBe(true);
    expect(
      openAuthorizedPushDestination(
        { schema: 'sallah.push.v1', destination: 'offers' },
        { authenticated: true, allowed: false, roles: ['customer'] },
        navigate,
      ),
    ).toBe(false);
    expect(navigated).toEqual(['/jobs']);
  });

  it('synchronizes native token rotation and removes the listener on cleanup', async () => {
    let listener: ((token: unknown) => void) | undefined;
    let removed = 0;
    const synchronized: unknown[] = [];
    const cleanup = bindPushTokenRotation(
      (next) => {
        listener = next;
        return {
          remove: () => {
            removed += 1;
          },
        };
      },
      async (token) => {
        synchronized.push(token);
      },
    );
    listener?.({ type: 'android', data: 'rotated-native-token' });
    await vi.waitFor(() => expect(synchronized).toHaveLength(1));
    cleanup();
    expect(synchronized).toEqual([{ type: 'android', data: 'rotated-native-token' }]);
    expect(removed).toBe(1);
  });
});
