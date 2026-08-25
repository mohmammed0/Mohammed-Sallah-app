import { beforeEach, describe, expect, it, vi } from 'vitest';

const notificationMock = vi.hoisted(() => ({
  permission: 'undetermined',
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  addPushTokenListener: vi.fn(),
}));
const secureStoreMock = vi.hoisted(() => ({
  values: new Map<string, string>(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  getPermissionsAsync: notificationMock.getPermissionsAsync,
  requestPermissionsAsync: notificationMock.requestPermissionsAsync,
  setNotificationChannelAsync: notificationMock.setNotificationChannelAsync,
  getExpoPushTokenAsync: notificationMock.getExpoPushTokenAsync,
  addPushTokenListener: notificationMock.addPushTokenListener,
}));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
}));
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      version: '0.1.0',
      extra: { eas: { projectId: 'f098f941-ae73-4007-b582-ba6fb1b8aa7a' } },
    },
    easConfig: null,
  },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  revokeExpoPushDevice,
  subscribeToExpoPushTokenRotation,
  synchronizeExpoPushDevice,
} from '../src/features/notifications/expo-push-runtime';

const expoToken = 'ExponentPushToken[0123456789abcdefghij]';
const installationId = '11111111-1111-4111-8111-111111111111';

describe('Expo push runtime', () => {
  beforeEach(() => {
    notificationMock.permission = 'undetermined';
    secureStoreMock.values.clear();
    secureStoreMock.values.set('sallah.push.installation.v1', installationId);
    notificationMock.getPermissionsAsync.mockReset().mockImplementation(async () => ({
      status: notificationMock.permission,
    }));
    notificationMock.requestPermissionsAsync.mockReset().mockImplementation(async () => ({
      status: notificationMock.permission,
    }));
    notificationMock.setNotificationChannelAsync.mockReset().mockResolvedValue(null);
    notificationMock.getExpoPushTokenAsync.mockReset().mockResolvedValue({ data: expoToken });
    notificationMock.addPushTokenListener.mockReset();
    secureStoreMock.getItemAsync
      .mockReset()
      .mockImplementation(async (key: string) => secureStoreMock.values.get(key) ?? null);
    secureStoreMock.setItemAsync
      .mockReset()
      .mockImplementation(async (key: string, value: string) => {
        secureStoreMock.values.set(key, value);
      });
    invokeMock.mockReset().mockResolvedValue({ data: { status: 'registered' }, error: null });
  });

  it('prompts only on an explicit user action and stops after denial', async () => {
    notificationMock.permission = 'denied';
    await expect(
      synchronizeExpoPushDevice({ prompt: true, channelName: 'Device notifications' }),
    ).resolves.toBe('denied');
    expect(notificationMock.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('registers the Expo project token for one stable installation', async () => {
    notificationMock.permission = 'granted';
    await expect(
      synchronizeExpoPushDevice({ prompt: false, channelName: 'Device notifications' }),
    ).resolves.toBe('registered');
    expect(notificationMock.setNotificationChannelAsync).toHaveBeenCalledWith(
      'service-updates',
      expect.objectContaining({ name: 'Device notifications' }),
    );
    expect(notificationMock.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'f098f941-ae73-4007-b582-ba6fb1b8aa7a',
    });
    expect(invokeMock).toHaveBeenCalledWith('push-devices', {
      body: {
        action: 'register',
        installationId,
        platform: 'android',
        appVersion: '0.1.0',
        token: expoToken,
      },
    });
  });

  it('rotates through the Expo token listener and unregisters the listener', async () => {
    notificationMock.permission = 'granted';
    let listener: ((token: unknown) => void) | undefined;
    const remove = vi.fn();
    notificationMock.addPushTokenListener.mockImplementation((next) => {
      listener = next;
      return { remove };
    });
    const cleanup = subscribeToExpoPushTokenRotation('Device notifications');
    listener?.({ type: 'android', data: 'native-rotated-token' });
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledOnce());
    expect(notificationMock.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'f098f941-ae73-4007-b582-ba6fb1b8aa7a',
      devicePushToken: { type: 'android', data: 'native-rotated-token' },
    });
    cleanup();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('revokes the current installation and supports explicit global revocation', async () => {
    await expect(revokeExpoPushDevice('current', 'Device notifications')).resolves.toBe('revoked');
    await expect(revokeExpoPushDevice('all', 'Device notifications')).resolves.toBe('revoked');
    expect(invokeMock.mock.calls.map(([, options]) => options.body)).toEqual([
      { action: 'revoke', installationId },
      { action: 'revoke_all' },
    ]);
  });
});
