import type { SupabaseClient } from '@supabase/supabase-js';
import {
  legalLocaleSchema,
  legalAcceptanceSchema,
  legalConsentContextSchema,
  type LegalConsentContext,
  offerInputSchema,
  requestDraftSchema,
  type OfferInput,
  type RequestDraft,
} from '@sallah/domain';
import { z } from 'zod';
export {
  legalDocumentSchema,
  legalConsentContextSchema,
  type LegalDocument,
  type LegalConsentContext,
} from '@sallah/domain';
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
  async getLegalConsentContext(locale: string): Promise<LegalConsentContext> {
    return legalConsentContextSchema.parse(
      await this.rpc('get_legal_consent_context', {
        p_locale: legalLocaleSchema.parse(locale),
      }),
    );
  }
  async acceptCurrentLegalDocuments(
    input: z.infer<typeof legalAcceptanceSchema>,
  ): Promise<LegalConsentContext> {
    const parsed = legalAcceptanceSchema.parse(input);
    return legalConsentContextSchema.parse(
      await this.rpc('accept_current_legal_documents', {
        p_locale: parsed.locale,
        p_documents: parsed.documents,
        p_idempotency_key: parsed.idempotencyKey,
      }),
    );
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
