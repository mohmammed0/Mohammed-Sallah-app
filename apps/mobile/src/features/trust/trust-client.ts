import { z } from 'zod';
import type { Database } from '@sallah/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  marketplaceReportIntentSchema,
  marketplaceReportResultSchema,
  marketplaceTrustContextSchema,
  userBlockResultSchema,
  userBlockStateIntentSchema,
  type MarketplaceReportIntent,
  type MarketplaceReportResult,
  type MarketplaceTrustContext,
  type UserBlockResult,
} from '@sallah/domain/trust';
import { executeJournaledMutation } from '../../lib/mutation-journal';

export type TrustErrorCategory =
  | 'auth'
  | 'validation'
  | 'rate_limited'
  | 'unavailable'
  | 'conflict'
  | 'network'
  | 'invalid_response'
  | 'unknown';

export class TrustClientError extends Error {
  readonly category: TrustErrorCategory;
  readonly code: string | undefined;

  constructor(category: TrustErrorCategory, options?: { retryCode?: string }) {
    super(`TRUST_ACTION_${category.toUpperCase()}`);
    this.name = 'TrustClientError';
    this.category = category;
    this.code = options?.retryCode;
  }
}

type DatabaseFunctions = Database['public']['Functions'];
type TrustFunctionName =
  'create_marketplace_report_v2' | 'get_marketplace_trust_context' | 'set_user_block';
type TrustFunctionArgs<Name extends TrustFunctionName> = DatabaseFunctions[Name]['Args'];
type TrustFunctionResponse<Name extends TrustFunctionName> = PromiseLike<{
  data: DatabaseFunctions[Name]['Returns'] | null;
  error: unknown;
}>;
type GeneratedContextBoundReportArgs = TrustFunctionArgs<'create_marketplace_report_v2'>;
type ContextBoundReportArgs = Omit<GeneratedContextBoundReportArgs, 'p_context_conversation_id'> & {
  p_context_conversation_id: GeneratedContextBoundReportArgs['p_context_conversation_id'] | null;
};

export interface TrustRpcClient {
  getUser: () => PromiseLike<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
  createMarketplaceReportV2: (
    args: ContextBoundReportArgs,
  ) => TrustFunctionResponse<'create_marketplace_report_v2'>;
  getMarketplaceTrustContext: (
    args: TrustFunctionArgs<'get_marketplace_trust_context'>,
  ) => TrustFunctionResponse<'get_marketplace_trust_context'>;
  setUserBlock: (
    args: TrustFunctionArgs<'set_user_block'>,
  ) => TrustFunctionResponse<'set_user_block'>;
}

type TrustSupabaseClient = {
  auth: Pick<SupabaseClient<Database>['auth'], 'getUser'>;
  rpc: SupabaseClient<Database>['rpc'];
};

export function createTrustRpcClient(client: TrustSupabaseClient): TrustRpcClient {
  return {
    getUser: () => client.auth.getUser(),
    createMarketplaceReportV2: (args) =>
      client.rpc('create_marketplace_report_v2', {
        ...args,
        // Supabase's generated RPC input type does not express nullable SQL parameters.
        p_context_conversation_id: args.p_context_conversation_id as string,
      }),
    getMarketplaceTrustContext: (args) => client.rpc('get_marketplace_trust_context', args),
    setUserBlock: (args) => client.rpc('set_user_block', args),
  };
}

function errorSignature(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    return ['code', 'message', 'details', 'hint', 'name']
      .flatMap((field) => (typeof candidate[field] === 'string' ? [candidate[field]] : []))
      .join(' ');
  }
  return String(error);
}

function safeError(error: unknown): TrustClientError {
  if (error instanceof TrustClientError) return error;
  const value = errorSignature(error).toUpperCase();
  if (/AUTH_REQUIRED|JWT|SESSION/.test(value)) return new TrustClientError('auth');
  if (/RATE_LIMITED/.test(value)) return new TrustClientError('rate_limited');
  if (/IDEMPOTENCY_COMMAND_IN_PROGRESS/.test(value)) {
    return new TrustClientError('conflict', { retryCode: 'IDEMPOTENCY_COMMAND_IN_PROGRESS' });
  }
  if (/IDEMPOTENCY|MUTATION_INTENT|COMMAND_IN_PROGRESS|CONFLICT/.test(value)) {
    return new TrustClientError('conflict');
  }
  if (/NETWORK|OFFLINE|TIMEOUT|TIMED_OUT|FETCH|CONNECTION|RESPONSE_LOST/.test(value)) {
    return new TrustClientError('network');
  }
  if (
    /NOT_AVAILABLE|ACCESS_DENIED|COMMUNICATION_NOT_ALLOWED|ACCOUNT_NOT_ACTIVE|PROVIDER_UNAVAILABLE/.test(
      value,
    )
  ) {
    return new TrustClientError('unavailable');
  }
  if (/INVALID|REQUIRED|TOO_SMALL|TOO_BIG/.test(value)) {
    return new TrustClientError('validation');
  }
  return new TrustClientError('unknown');
}

async function authenticatedUserId(client: TrustRpcClient): Promise<string> {
  let response: Awaited<ReturnType<TrustRpcClient['getUser']>>;
  try {
    response = await client.getUser();
  } catch (error) {
    throw safeError(error);
  }
  if (response.error) throw safeError(response.error);
  const parsed = z.uuid().safeParse(response.data.user?.id);
  if (!parsed.success) throw new TrustClientError('auth');
  return parsed.data;
}

export async function loadMarketplaceTrustContext(
  client: TrustRpcClient,
  conversationId: string,
): Promise<MarketplaceTrustContext> {
  const parsedConversationId = z.uuid().safeParse(conversationId);
  if (!parsedConversationId.success) throw new TrustClientError('validation');
  await authenticatedUserId(client);
  let response: Awaited<ReturnType<TrustRpcClient['getMarketplaceTrustContext']>>;
  try {
    response = await client.getMarketplaceTrustContext({
      p_conversation_id: parsedConversationId.data,
    });
  } catch (error) {
    throw safeError(error);
  }
  if (response.error) throw safeError(response.error);
  const parsed = marketplaceTrustContextSchema.safeParse(response.data);
  if (!parsed.success) throw new TrustClientError('invalid_response');
  return parsed.data;
}

export async function submitMarketplaceReport(
  client: TrustRpcClient,
  input: MarketplaceReportIntent,
): Promise<MarketplaceReportResult> {
  const parsedInput = marketplaceReportIntentSchema.safeParse(input);
  if (!parsedInput.success) throw new TrustClientError('validation');
  const userId = await authenticatedUserId(client);
  try {
    return await executeJournaledMutation({
      userId,
      operation: 'marketplace_report',
      entityKey:
        parsedInput.data.targetType === 'user'
          ? `${parsedInput.data.targetType}:${parsedInput.data.targetId}:${parsedInput.data.contextConversationId}`
          : `${parsedInput.data.targetType}:${parsedInput.data.targetId}`,
      payload: parsedInput.data,
      execute: async (idempotencyKey, persistedPayload) => {
        const persisted = marketplaceReportIntentSchema.safeParse(persistedPayload);
        if (!persisted.success) throw new TrustClientError('invalid_response');
        let response: Awaited<ReturnType<TrustRpcClient['createMarketplaceReportV2']>>;
        try {
          response = await client.createMarketplaceReportV2({
            p_target_type: persisted.data.targetType,
            p_target_id: persisted.data.targetId,
            p_context_conversation_id:
              persisted.data.targetType === 'user' ? persisted.data.contextConversationId : null,
            p_reason_category: persisted.data.reasonCategory,
            p_explanation: persisted.data.explanation,
            p_idempotency_key: idempotencyKey,
          });
        } catch (error) {
          throw safeError(error);
        }
        if (response.error) throw safeError(response.error);
        const result = marketplaceReportResultSchema.safeParse(response.data);
        if (!result.success) throw new TrustClientError('invalid_response');
        return result.data;
      },
    });
  } catch (error) {
    throw safeError(error);
  }
}

export async function setMarketplaceUserBlocked(
  client: TrustRpcClient,
  input: { targetUserId: string; blocked: boolean },
): Promise<UserBlockResult> {
  const parsedInput = userBlockStateIntentSchema.safeParse({
    ...input,
    reason: input.blocked ? 'user_requested_block' : 'user_requested_unblock',
  });
  if (!parsedInput.success) throw new TrustClientError('validation');
  const userId = await authenticatedUserId(client);
  try {
    return await executeJournaledMutation({
      userId,
      operation: 'user_block_state',
      entityKey: parsedInput.data.targetUserId,
      payload: parsedInput.data,
      execute: async (idempotencyKey, persistedPayload) => {
        const persisted = userBlockStateIntentSchema.safeParse(persistedPayload);
        if (!persisted.success) throw new TrustClientError('invalid_response');
        let response: Awaited<ReturnType<TrustRpcClient['setUserBlock']>>;
        try {
          response = await client.setUserBlock({
            p_target_user_id: persisted.data.targetUserId,
            p_blocked: persisted.data.blocked,
            p_reason: persisted.data.reason,
            p_idempotency_key: idempotencyKey,
          });
        } catch (error) {
          throw safeError(error);
        }
        if (response.error) throw safeError(response.error);
        const result = userBlockResultSchema.safeParse(response.data);
        if (!result.success) throw new TrustClientError('invalid_response');
        return result.data;
      },
    });
  } catch (error) {
    throw safeError(error);
  }
}
