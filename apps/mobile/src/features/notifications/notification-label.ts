import type { TranslationKey } from '@sallah/i18n';

export function notificationEventLabelKey(eventType: string): TranslationKey {
  if (eventType === 'new_offer') return 'offers';
  if (eventType === 'provider_matched' || eventType === 'request_matched') {
    return 'eligibleRequests';
  }
  if (eventType === 'message_created') return 'messages';
  if (
    eventType.startsWith('job_') ||
    eventType.startsWith('change_order_') ||
    eventType.startsWith('completion_')
  ) {
    return 'jobs';
  }
  if (eventType.startsWith('support_')) return 'support';
  if (eventType.startsWith('account_') || eventType === 'moderation_action') return 'account';
  return 'notifications';
}
