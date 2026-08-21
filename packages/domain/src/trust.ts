import { z } from 'zod';

const marketplaceTargetIdSchema = z.uuid();

export const marketplaceReportReasonSchema = z.enum([
  'harassment',
  'spam',
  'scam',
  'safety',
  'inappropriate_content',
  'rating_abuse',
  'other',
]);
export type MarketplaceReportReason = z.infer<typeof marketplaceReportReasonSchema>;

const reportFields = {
  targetId: marketplaceTargetIdSchema,
  reasonCategory: marketplaceReportReasonSchema,
  explanation: z.string().trim().max(1_000),
} as const;

export const marketplaceReportIntentSchema = z.discriminatedUnion('targetType', [
  z
    .object({
      targetType: z.literal('user'),
      contextConversationId: z.uuid(),
      ...reportFields,
    })
    .strict(),
  z.object({ targetType: z.literal('message'), ...reportFields }).strict(),
  z.object({ targetType: z.literal('rating'), ...reportFields }).strict(),
]);
export type MarketplaceReportIntent = z.infer<typeof marketplaceReportIntentSchema>;
export type MarketplaceUserReportTarget = Pick<
  Extract<MarketplaceReportIntent, { targetType: 'user' }>,
  'targetType' | 'targetId' | 'contextConversationId'
>;
export type MarketplaceReportTarget =
  | MarketplaceUserReportTarget
  | Pick<
      Extract<MarketplaceReportIntent, { targetType: 'message' | 'rating' }>,
      'targetType' | 'targetId'
    >;

export const marketplaceReportResultSchema = z
  .object({
    reportId: z.uuid(),
    status: z.enum(['submitted', 'triaged', 'escalated']),
    createdAt: z.iso.datetime({ offset: true }),
    deduplicated: z.boolean(),
  })
  .strict();
export type MarketplaceReportResult = z.infer<typeof marketplaceReportResultSchema>;

export const marketplaceTrustRestrictionSchema = z
  .enum(['blocked', 'communication_unavailable'])
  .nullable();

export const marketplaceTrustContextSchema = z
  .object({
    conversationId: z.uuid(),
    counterpartyUserId: z.uuid(),
    blockedByMe: z.boolean(),
    canCommunicate: z.boolean(),
    restriction: marketplaceTrustRestrictionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!(
      (value.blockedByMe && !value.canCommunicate && value.restriction === 'blocked') ||
      (!value.blockedByMe && value.canCommunicate && value.restriction === null) ||
      (!value.blockedByMe &&
        !value.canCommunicate &&
        value.restriction === 'communication_unavailable')
    )) {
      context.addIssue({
        code: 'custom',
        message: 'Trust context communication state is inconsistent',
        path: ['canCommunicate'],
      });
    }
  });
export type MarketplaceTrustContext = z.infer<typeof marketplaceTrustContextSchema>;

export const userBlockStateIntentSchema = z
  .object({
    targetUserId: z.uuid(),
    blocked: z.boolean(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type UserBlockStateIntent = z.infer<typeof userBlockStateIntentSchema>;

export const userBlockResultSchema = z
  .object({
    targetUserId: z.uuid(),
    blocked: z.boolean(),
    changed: z.boolean(),
    canCommunicate: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.blocked && value.canCommunicate) {
      context.addIssue({
        code: 'custom',
        message: 'Block result communication state is inconsistent',
        path: ['canCommunicate'],
      });
    }
  });
export type UserBlockResult = z.infer<typeof userBlockResultSchema>;
