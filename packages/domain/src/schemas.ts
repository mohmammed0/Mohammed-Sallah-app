import { z } from 'zod';

export const uuidSchema = z.uuid();
export const localeSchema = z.enum(['ar', 'en', 'ur', 'hi']);
export const moneySchema = z.object({
  amountMinor: z.int().nonnegative(),
  currency: z.literal('SAR'),
});
export const urgencySchema = z.enum(['flexible', 'normal', 'urgent', 'safety_critical']);

export const requestDraftSchema = z.object({
  categoryId: uuidSchema.nullable(),
  subcategoryId: uuidSchema.nullable(),
  title: z.string().trim().min(3).max(120),
  originalText: z.string().trim().min(10).max(8000),
  structuredDescription: z.string().trim().min(10).max(8000),
  urgency: urgencySchema,
  requestedStart: z.iso.datetime().nullable(),
  cityId: uuidSchema,
  districtId: uuidSchema.nullable(),
  customerApproved: z.boolean(),
  version: z.int().positive(),
});

export const offerInputSchema = z.object({
  requestId: uuidSchema,
  totalAmountMinor: z.int().min(0).max(100_000_000),
  visitFeeMinor: z.int().min(0).max(10_000_000).default(0),
  laborAmountMinor: z.int().min(0).max(100_000_000).nullable(),
  materialsIncluded: z.boolean(),
  materialsEstimateMinor: z.int().min(0).max(100_000_000).nullable(),
  estimatedArrivalMinutes: z.int().min(5).max(10_080),
  estimatedDurationMinutes: z.int().min(15).max(43_200),
  warrantyDays: z.int().min(0).max(3650),
  note: z.string().trim().max(2000),
  expiresAt: z.iso.datetime(),
  expectedRequestVersion: z.int().positive(),
  idempotencyKey: z.string().min(16).max(200),
});

export const changeOrderSchema = z.object({
  jobId: uuidSchema,
  reason: z.string().trim().min(5).max(500),
  description: z.string().trim().min(5).max(2000),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(2).max(200),
        quantity: z.number().positive(),
        amountMinor: z.int().nonnegative(),
      }),
    )
    .min(1)
    .max(50),
  expiresAt: z.iso.datetime(),
  idempotencyKey: z.string().min(16).max(200),
});

export const aiDiagnosticSchema = z.object({
  schemaVersion: z.literal('1.0'),
  suggestedCategorySlug: z.string().nullable(),
  suggestedSubcategorySlug: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  customerSummary: z.string().min(1).max(4000).nullable(),
  providerBrief: z.string().min(1).max(4000).nullable(),
  observedSymptoms: z.array(z.string().max(300)).max(30),
  possibleCauses: z.array(z.string().max(300)).max(20),
  followUpQuestions: z.array(z.string().max(500)).max(5),
  quickReplies: z.array(z.string().min(1).max(120)).max(4).default([]),
  safetyFlags: z
    .array(
      z.enum([
        'gas',
        'fire',
        'exposed_electricity',
        'water_near_electricity',
        'structural',
        'trapped_person',
        'other',
      ]),
    )
    .max(10),
  urgencySuggestion: urgencySchema,
  recommendedCapabilities: z.array(z.string().max(100)).max(20),
  tentativeToolsMaterials: z.array(z.string().max(100)).max(30),
  missingInformation: z.array(z.string().max(300)).max(20),
  enoughInformation: z.boolean(),
  confirmationQuestion: z.string().min(1).max(500),
  metadata: z.object({
    provider: z.string(),
    model: z.string(),
    promptVersion: z.string(),
    fallback: z.boolean(),
    sessionId: z.uuid().optional(),
    turnNumber: z.number().int().positive().optional(),
    historyPreserved: z.boolean().default(true),
    categoryConfirmed: z.boolean().default(false),
  }),
});

export type RequestDraft = z.infer<typeof requestDraftSchema>;
export type OfferInput = z.infer<typeof offerInputSchema>;
export type AiDiagnostic = z.infer<typeof aiDiagnosticSchema>;
