import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import {
  bindPushTokenRotation,
  runPushRegistration,
  runPushRevocation,
  type PushRegistrationDependencies,
  type PushRegistrationResult,
} from './push-notifications';

const installationKey = 'sallah.push.installation.v1';
const uuidSchema = z.string().uuid();
const projectIdSchema = z.string().uuid();
const devicePushTokenSchema = z
  .object({
    type: z.enum(['ios', 'android']),
    data: z.string().min(1).max(16_384),
  })
  .strict();

interface ExpoExtra {
  eas?: { projectId?: unknown };
}

function projectId(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
  return projectIdSchema.parse(extra.eas?.projectId);
}

async function installationId(): Promise<string> {
  const current = await SecureStore.getItemAsync(installationKey);
  const parsed = uuidSchema.safeParse(current);
  if (parsed.success) return parsed.data;
  const created = globalThis.crypto.randomUUID();
  await SecureStore.setItemAsync(installationKey, created, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return created;
}

function permissionState(status: string): 'granted' | 'denied' | 'undetermined' {
  if (status === 'granted' || status === 'denied') return status;
  return 'undetermined';
}

function createDependencies(channelName: string): PushRegistrationDependencies {
  return {
    getPermission: async () => permissionState((await Notifications.getPermissionsAsync()).status),
    requestPermission: async () =>
      permissionState(
        (
          await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          })
        ).status,
      ),
    configureAndroidChannel: async () => {
      await Notifications.setNotificationChannelAsync('service-updates', {
        name: channelName,
        importance: Notifications.AndroidImportance.HIGH,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        vibrationPattern: [0, 250],
      });
    },
    getExpoToken: async (easProjectId, nativeToken) => {
      const parsedNativeToken =
        nativeToken === undefined ? undefined : devicePushTokenSchema.parse(nativeToken);
      return (
        await Notifications.getExpoPushTokenAsync({
          projectId: easProjectId,
          ...(parsedNativeToken ? { devicePushToken: parsedNativeToken } : {}),
        })
      ).data;
    },
    getInstallationId: installationId,
    invokeDeviceCommand: async (body) => {
      const response = await supabase.functions.invoke('push-devices', { body });
      return { ok: !response.error };
    },
  };
}

function nativePlatform(): 'ios' | 'android' | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

export async function synchronizeExpoPushDevice(input: {
  prompt: boolean;
  channelName: string;
  nativeToken?: unknown;
}): Promise<PushRegistrationResult> {
  const platform = nativePlatform();
  if (!platform) return 'unavailable';
  return runPushRegistration(createDependencies(input.channelName), {
    prompt: input.prompt,
    projectId: projectId(),
    platform,
    appVersion: Constants.expoConfig?.version ?? '0.1.0',
    nativeToken: input.nativeToken,
  });
}

export async function revokeExpoPushDevice(
  scope: 'current' | 'all',
  channelName: string,
): Promise<'revoked' | 'unavailable'> {
  return runPushRevocation(createDependencies(channelName), scope);
}

export function subscribeToExpoPushTokenRotation(
  channelName: string,
  onFailure: () => void = () => undefined,
): () => void {
  return bindPushTokenRotation(
    (listener) => Notifications.addPushTokenListener(listener),
    async (nativeToken) => {
      const outcome = await synchronizeExpoPushDevice({
        prompt: false,
        channelName,
        nativeToken,
      });
      if (outcome !== 'registered') throw new Error('PUSH_ROTATION_FAILED');
    },
    onFailure,
  );
}
