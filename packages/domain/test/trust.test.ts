import { describe, expect, it } from 'vitest';
import {
  marketplaceReportIntentSchema,
  marketplaceReportResultSchema,
  marketplaceTrustContextSchema,
  userBlockResultSchema,
  userBlockStateIntentSchema,
} from '../src/trust';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';

describe('marketplace trust contracts', () => {
  it.each([
    { targetType: 'user', targetId: firstId, contextConversationId: conversationId },
    { targetType: 'message', targetId: firstId },
    { targetType: 'rating', targetId: firstId },
  ] as const)('accepts a bounded $targetType report intent', (target) => {
    expect(
      marketplaceReportIntentSchema.parse({
        ...target,
        reasonCategory: target.targetType === 'rating' ? 'rating_abuse' : 'harassment',
        explanation: '  A concise explanation.  ',
      }),
    ).toEqual({
      ...target,
      reasonCategory: target.targetType === 'rating' ? 'rating_abuse' : 'harassment',
      explanation: 'A concise explanation.',
    });
  });

  it('requires exact conversation context only for user reports', () => {
    const fields = {
      targetId: firstId,
      reasonCategory: 'harassment',
      explanation: 'Bounded context',
    } as const;
    expect(marketplaceReportIntentSchema.safeParse({ targetType: 'user', ...fields }).success).toBe(
      false,
    );
    expect(
      marketplaceReportIntentSchema.safeParse({
        targetType: 'message',
        contextConversationId: conversationId,
        ...fields,
      }).success,
    ).toBe(false);
    expect(
      marketplaceReportIntentSchema.safeParse({
        targetType: 'rating',
        contextConversationId: conversationId,
        ...fields,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown reason, malformed target, or oversized explanation', () => {
    expect(
      marketplaceReportIntentSchema.safeParse({
        targetType: 'message',
        targetId: 'raw-message-id',
        reasonCategory: 'invented_reason',
        explanation: 'x'.repeat(1_001),
      }).success,
    ).toBe(false);
  });

  it('rejects contradictory server-derived trust state', () => {
    const valid = {
      conversationId: firstId,
      counterpartyUserId: secondId,
      blockedByMe: true,
      canCommunicate: false,
      restriction: 'blocked',
    } as const;
    expect(marketplaceTrustContextSchema.parse(valid)).toEqual(valid);
    expect(
      marketplaceTrustContextSchema.safeParse({
        ...valid,
        blockedByMe: false,
        canCommunicate: true,
      }).success,
    ).toBe(false);
    expect(
      marketplaceTrustContextSchema.safeParse({
        ...valid,
        blockedByMe: false,
        canCommunicate: false,
        restriction: null,
      }).success,
    ).toBe(false);
    expect(
      marketplaceTrustContextSchema.safeParse({
        ...valid,
        blockedByMe: false,
        canCommunicate: false,
        restriction: 'communication_unavailable',
      }).success,
    ).toBe(true);
    expect(
      marketplaceTrustContextSchema.safeParse({
        ...valid,
        blockedByMe: false,
        canCommunicate: true,
        restriction: null,
      }).success,
    ).toBe(true);
    expect(
      marketplaceTrustContextSchema.safeParse({
        ...valid,
        restriction: 'communication_unavailable',
      }).success,
    ).toBe(false);
  });

  it('rejects privacy-sensitive legacy block fields from strict server results', () => {
    const context = {
      conversationId: firstId,
      counterpartyUserId: secondId,
      blockedByMe: false,
      canCommunicate: false,
      restriction: 'communication_unavailable',
    } as const;
    expect(marketplaceTrustContextSchema.parse(context)).toEqual(context);
    expect(
      marketplaceTrustContextSchema.safeParse({ ...context, blockedByThem: true }).success,
    ).toBe(false);
    expect(marketplaceTrustContextSchema.safeParse({ ...context, isBlocked: true }).success).toBe(
      false,
    );

    const block = {
      targetUserId: secondId,
      blocked: false,
      changed: true,
      canCommunicate: false,
    } as const;
    expect(userBlockResultSchema.parse(block)).toEqual(block);
    expect(userBlockResultSchema.safeParse({ ...block, mutualBlocked: true }).success).toBe(false);
    expect(
      userBlockResultSchema.safeParse({
        ...block,
        blocked: true,
        canCommunicate: true,
      }).success,
    ).toBe(false);
  });

  it('accepts only explicit block state and bounded audit reason', () => {
    expect(
      userBlockStateIntentSchema.parse({
        targetUserId: secondId,
        blocked: true,
        reason: 'user_requested_block',
      }),
    ).toEqual({
      targetUserId: secondId,
      blocked: true,
      reason: 'user_requested_block',
    });
    expect(
      userBlockStateIntentSchema.safeParse({
        targetUserId: secondId,
        reason: 'toggle',
      }).success,
    ).toBe(false);
  });

  it('rejects internal moderation and audit metadata from server results', () => {
    const report = {
      reportId: firstId,
      status: 'submitted',
      createdAt: '2026-08-20T12:00:00.123456+00:00',
      deduplicated: false,
    } as const;
    expect(marketplaceReportResultSchema.parse(report)).toEqual(report);
    expect(
      marketplaceReportResultSchema.safeParse({ ...report, supportCaseId: secondId }).success,
    ).toBe(false);

    const block = {
      targetUserId: secondId,
      blocked: true,
      changed: true,
      canCommunicate: false,
    } as const;
    expect(userBlockResultSchema.parse(block)).toEqual(block);
    expect(userBlockResultSchema.safeParse({ ...block, auditEventId: firstId }).success).toBe(
      false,
    );
  });
});
