import { describe, expect, it } from 'vitest';
import { notificationEventLabelKey } from '../src/features/notifications/notification-label';

describe('notification event labels', () => {
  it.each([
    ['new_offer', 'offers'],
    ['provider_matched', 'eligibleRequests'],
    ['request_matched', 'eligibleRequests'],
    ['message_created', 'messages'],
    ['job_provider_selected', 'jobs'],
    ['change_order_requested', 'jobs'],
    ['completion_submitted', 'jobs'],
    ['support_case_updated', 'support'],
    ['account_export_ready', 'account'],
    ['moderation_action', 'account'],
    ['future_event', 'notifications'],
  ] as const)('maps %s to localized key %s', (eventType, expected) => {
    expect(notificationEventLabelKey(eventType)).toBe(expected);
  });
});
