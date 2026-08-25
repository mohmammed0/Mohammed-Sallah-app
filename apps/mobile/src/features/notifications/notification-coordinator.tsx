import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';
import { openAuthorizedPushDestination } from './push-notifications';
import { subscribeToExpoPushTokenRotation, synchronizeExpoPushDevice } from './expo-push-runtime';

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

export function NotificationCoordinator() {
  const { t } = useLocale();
  const { session, context } = useSessionContext();

  useEffect(() => {
    if (!session || !context?.authenticated) return;
    const projection = {
      authenticated: context.authenticated,
      allowed: context.allowed,
      roles: context.roles,
    };
    const handleResponse = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      openAuthorizedPushDestination(
        response.notification.request.content.data,
        projection,
        (destination) => router.push(destination),
      );
    };
    void synchronizeExpoPushDevice({
      prompt: false,
      channelName: t('notificationPush'),
    });
    const stopRotation = subscribeToExpoPushTokenRotation(t('notificationPush'));
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleResponse(response);
      return Notifications.clearLastNotificationResponseAsync();
    });
    return () => {
      stopRotation();
      responseSubscription.remove();
    };
  }, [context, session, t]);

  return null;
}
