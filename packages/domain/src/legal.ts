import { z } from 'zod';

export const legalLocaleSchema = z.enum(['ar', 'en', 'ur', 'hi']);
const legalDocumentTypeSchema = z.enum(['privacy', 'terms', 'community']);
export const legalDocumentSchema = z.object({
  id: z.string().uuid(),
  documentType: legalDocumentTypeSchema,
  version: z.string().trim().min(1).max(100),
  locale: legalLocaleSchema,
  title: z.string().trim().min(1).max(500),
  body: z
    .string()
    .min(1)
    .max(200_000)
    .refine((body) => body.trim().length > 0),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  requiresAcceptance: z.boolean(),
  accepted: z.boolean(),
});
export const legalConsentContextSchema = z
  .object({
    status: z.enum(['not_required', 'required', 'accepted', 'unavailable']),
    documents: z.array(legalDocumentSchema).max(3),
    missingRequiredTypes: z.array(legalDocumentTypeSchema).max(3),
  })
  .superRefine((context, ctx) => {
    if (
      new Set(context.documents.map((document) => document.documentType)).size !==
      context.documents.length
    ) {
      ctx.addIssue({ code: 'custom', message: 'DUPLICATE_LEGAL_DOCUMENT_TYPE' });
    }
    if (
      context.status === 'accepted' &&
      (context.missingRequiredTypes.length > 0 ||
        context.documents.length !== 3 ||
        context.documents.some((document) => document.requiresAcceptance && !document.accepted))
    ) {
      ctx.addIssue({ code: 'custom', message: 'INCOMPLETE_LEGAL_ACCEPTANCE' });
    }
  });
export type LegalDocument = z.infer<typeof legalDocumentSchema>;
export type LegalConsentContext = z.infer<typeof legalConsentContextSchema>;
export const legalAcceptanceSchema = z.object({
  locale: legalLocaleSchema,
  documents: z.array(legalDocumentSchema.pick({ id: true, contentHash: true })).length(3),
  idempotencyKey: z.string().uuid(),
});
