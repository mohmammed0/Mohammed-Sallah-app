import { z } from 'zod';

const changeOrderSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
  description: z.string(),
  revised_total_minor: z.number().int(),
  status: z.string(),
  expires_at: z.string(),
});
const ratingSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  provider_id: z.uuid(),
  score: z.number().int().min(1).max(5),
  review: z.string().nullable(),
  moderation_status: z.string(),
});
export const jobSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  provider_id: z.uuid(),
  status: z.string(),
  approved_total_minor: z.number().int(),
  version: z.number().int(),
  created_at: z.string(),
  payments: z
    .array(
      z.object({
        amount_minor: z.number().int(),
        refunded_minor: z.number().int().default(0),
        status: z.string(),
      }),
    )
    .default([]),
  conversations: z
    .object({ id: z.uuid() })
    .nullable()
    .transform((conversation) => (conversation ? [conversation] : [])),
  job_location_updates: z
    .array(z.object({ captured_at: z.string(), expires_at: z.string() }))
    .default([]),
  change_orders: z.array(changeOrderSchema),
  cancellation_requests: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.string(),
        reason: z.string(),
        created_at: z.string(),
      }),
    )
    .default([]),
  disputes: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.string(),
        reason: z.string(),
        created_at: z.string(),
        resolved_at: z.string().nullable(),
      }),
    )
    .default([]),
  ratings: ratingSchema.nullable().transform((rating) => (rating ? [rating] : [])),
});
export type Job = z.infer<typeof jobSchema>;
