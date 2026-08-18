import type { SupabaseClient } from '@supabase/supabase-js';
import {
  offerInputSchema,
  requestDraftSchema,
  type OfferInput,
  type RequestDraft,
} from '@sallah/domain';
import { z } from 'zod';
const rpcResultSchema = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string() }).passthrough().nullable(),
});
export class MarketplaceApi {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc(command: string, args: Record<string, unknown>): Promise<unknown> {
    const raw: unknown = await this.client.rpc(command, args);
    const result = rpcResultSchema.parse(raw);
    if (result.error) throw new Error(`${command.toUpperCase()}_FAILED:${result.error.code}`);
    return result.data;
  }
  publishRequest(draft: RequestDraft): Promise<unknown> {
    return this.rpc('publish_service_request', { payload: requestDraftSchema.parse(draft) });
  }
  submitOffer(offer: OfferInput): Promise<unknown> {
    return this.rpc('submit_offer', { payload: offerInputSchema.parse(offer) });
  }
  transitionJob(
    jobId: string,
    status: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<unknown> {
    return this.rpc('transition_job', {
      p_job_id: jobId,
      p_to_status: status,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
  }
}
