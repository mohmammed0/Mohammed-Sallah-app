import { describe, expect, it } from 'vitest';
import { pendingCustomerTurnSchema } from '../src/features/request/conversation-recovery';

describe('AI draft category context', () => {
  it('preserves customer-confirmed category and subcategory through offline replay', () => {
    const turn = pendingCustomerTurnSchema.parse({
      clientMessageId: 'customer-message-0001',
      text: 'Synthetic maintenance description',
      inputKind: 'text',
      mediaUploadIds: [],
      localMediaIds: [],
      mediaBindings: [],
      transcript: null,
      transcriptionStatus: 'none',
      confirmedCategorySlug: 'plumbing',
      confirmedSubcategorySlug: 'tap-repair',
      summaryRequested: false,
      createdAt: '2026-08-19T12:00:00.000Z',
    });
    const restored = pendingCustomerTurnSchema.parse(JSON.parse(JSON.stringify(turn)));
    expect(restored).toMatchObject({
      clientMessageId: 'customer-message-0001',
      confirmedCategorySlug: 'plumbing',
      confirmedSubcategorySlug: 'tap-repair',
    });
  });

  it('restores legacy queued turns without inventing a subcategory', () => {
    const turn = pendingCustomerTurnSchema.parse({
      clientMessageId: 'customer-message-0002',
      text: 'Legacy synthetic description',
      inputKind: 'text',
      mediaUploadIds: [],
      localMediaIds: [],
      confirmedCategorySlug: 'plumbing',
      summaryRequested: false,
      createdAt: '2026-08-19T12:01:00.000Z',
    });
    expect(turn.confirmedSubcategorySlug).toBeNull();
  });
});
