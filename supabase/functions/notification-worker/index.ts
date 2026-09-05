import { z } from 'npm:zod@4.4.3';
import { serviceClient } from '../_shared/auth.ts';
import {
  classifyExpoDeliveryError,
  openPushToken,
  parsePushRuntimeConfig,
  pushDestinationSchema,
  safePushMessage,
  sha256Hex,
} from '../_shared/push.ts';
import { workerSecretMatches } from '../_shared/worker-auth.ts';

const expoSendUrl = 'https://exp.host/--/api/v2/push/send';
const expoReceiptsUrl = 'https://exp.host/--/api/v2/push/getReceipts';
const expoRequestTimeoutMs = 15_000;
const maxClaimsPerInvocation = 100;

const targetSchema = z.object({
  tokenId: z.string().uuid(),
  tokenCiphertext: z.string().min(8).max(1024),
}).strict();
const ticketSchema = z.object({
  tokenId: z.string().uuid(),
  ticketId: z.string().min(1).max(200),
}).strict();
const notificationClaimSchema = z.object({
  outboxId: z.string().uuid(),
  stage: z.enum(['send', 'receipt']),
  eventType: z.string().min(1).max(100),
  locale: z.enum(['ar', 'en', 'ur', 'hi']),
  destination: pushDestinationSchema,
  attempt: z.number().int().min(1).max(5),
  targets: z.array(targetSchema).max(20),
  tickets: z.array(ticketSchema).max(20),
}).strict();

export type NotificationClaim = z.infer<typeof notificationClaimSchema>;

export interface NotificationWorkerDatabase {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

interface ProcessDependencies {
  encryptionKey: string;
  accessToken: string;
  fetch: typeof fetch;
  workerId: string;
  leaseToken: string;
}

interface ProcessingSummary {
  delivered: number;
  deferred: number;
  disabled: number;
  failed: number;
}

function authorizationHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function summary(outcome: 'delivered' | 'deferred' | 'disabled' | 'failed'): ProcessingSummary {
  return {
    delivered: outcome === 'delivered' ? 1 : 0,
    deferred: outcome === 'deferred' ? 1 : 0,
    disabled: outcome === 'disabled' ? 1 : 0,
    failed: outcome === 'failed' ? 1 : 0,
  };
}

async function complete(
  db: NotificationWorkerDatabase,
  name: 'complete_notification_delivery' | 'complete_notification_receipts',
  claim: NotificationClaim,
  dependencies: ProcessDependencies,
  result: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.rpc(name, {
    p_outbox_id: claim.outboxId,
    p_worker_id: dependencies.workerId,
    p_lease_token: dependencies.leaseToken,
    p_result: result,
  });
  if (error) throw new Error('NOTIFICATION_COMPLETION_FAILED');
}

async function processSend(
  claim: NotificationClaim,
  db: NotificationWorkerDatabase,
  dependencies: ProcessDependencies,
): Promise<ProcessingSummary> {
  if (claim.targets.length === 0) {
    await complete(db, 'complete_notification_delivery', claim, dependencies, {
      outcome: 'disabled',
      category: 'no_eligible_device',
      tickets: [],
    });
    return summary('disabled');
  }
  const message = safePushMessage(claim.eventType, claim.locale, claim.destination);
  const valid: Array<{ tokenId: string; token: string }> = [];
  const results: Array<Record<string, unknown>> = [];
  for (const target of claim.targets) {
    try {
      valid.push({
        tokenId: target.tokenId,
        token: await openPushToken(target.tokenCiphertext, dependencies.encryptionKey),
      });
    } catch {
      results.push({
        tokenId: target.tokenId,
        status: 'terminal_failure',
        category: 'token_decryption_failed',
        disableToken: true,
      });
    }
  }
  if (valid.length > 0) {
    const response = await dependencies.fetch(expoSendUrl, {
      method: 'POST',
      headers: authorizationHeaders(dependencies.accessToken),
      signal: AbortSignal.timeout(expoRequestTimeoutMs),
      body: JSON.stringify(
        valid.map(({ token }) => ({
          to: token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
          channelId: 'service-updates',
        })),
      ),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 429 || response.status >= 500
          ? 'EXPO_TEMPORARY_FAILURE'
          : 'EXPO_REQUEST_REJECTED',
      );
    }
    const payload = z.object({ data: z.array(z.unknown()) }).parse(await response.json());
    if (payload.data.length !== valid.length) throw new Error('EXPO_RESPONSE_INVALID');
    for (let index = 0; index < valid.length; index += 1) {
      const target = valid[index];
      const parsed = z.object({
        status: z.enum(['ok', 'error']),
        id: z.string().optional(),
        details: z.object({ error: z.string().optional() }).optional(),
      }).safeParse(payload.data[index]);
      if (!target || !parsed.success) throw new Error('EXPO_RESPONSE_INVALID');
      if (parsed.data.status === 'ok' && parsed.data.id) {
        results.push({ tokenId: target.tokenId, status: 'ticketed', ticketId: parsed.data.id });
      } else {
        const disposition = classifyExpoDeliveryError(parsed.data.details?.error);
        results.push({
          tokenId: target.tokenId,
          status: disposition.retryable ? 'retryable_failure' : 'terminal_failure',
          category: disposition.category,
          disableToken: disposition.disableToken,
        });
      }
    }
  }
  const hasTicket = results.some((result) => result.status === 'ticketed');
  const hasRetry = results.some((result) => result.status === 'retryable_failure');
  const hasTerminal = results.some((result) => result.status === 'terminal_failure');
  const allDisabled = results.length > 0 && results.every((result) => result.disableToken === true);
  const outcome = hasTicket
    ? 'deferred'
    : hasRetry
    ? 'failed'
    : allDisabled
    ? 'disabled'
    : hasTerminal
    ? 'terminal'
    : 'failed';
  await complete(db, 'complete_notification_delivery', claim, dependencies, {
    outcome,
    category: hasTicket
      ? 'receipt_pending'
      : allDisabled
      ? 'no_eligible_device'
      : 'delivery_failed',
    tickets: results,
  });
  return summary(outcome === 'terminal' ? 'failed' : outcome);
}

async function processReceipts(
  claim: NotificationClaim,
  db: NotificationWorkerDatabase,
  dependencies: ProcessDependencies,
): Promise<ProcessingSummary> {
  if (claim.tickets.length === 0) throw new Error('NOTIFICATION_CLAIM_INVALID');
  const response = await dependencies.fetch(expoReceiptsUrl, {
    method: 'POST',
    headers: authorizationHeaders(dependencies.accessToken),
    signal: AbortSignal.timeout(expoRequestTimeoutMs),
    body: JSON.stringify({ ids: claim.tickets.map((ticket) => ticket.ticketId) }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429 || response.status >= 500
        ? 'EXPO_TEMPORARY_FAILURE'
        : 'EXPO_REQUEST_REJECTED',
    );
  }
  const payload = z.object({ data: z.record(z.string(), z.unknown()) }).parse(
    await response.json(),
  );
  const receipts = claim.tickets.map((ticket) => {
    const raw = payload.data[ticket.ticketId];
    if (raw === undefined) {
      return { tokenId: ticket.tokenId, ticketId: ticket.ticketId, status: 'pending' };
    }
    const parsed = z.object({
      status: z.enum(['ok', 'error']),
      details: z.object({ error: z.string().optional() }).optional(),
    }).safeParse(raw);
    if (!parsed.success) throw new Error('EXPO_RESPONSE_INVALID');
    if (parsed.data.status === 'ok') {
      return { tokenId: ticket.tokenId, ticketId: ticket.ticketId, status: 'delivered' };
    }
    const disposition = classifyExpoDeliveryError(parsed.data.details?.error);
    return {
      tokenId: ticket.tokenId,
      ticketId: ticket.ticketId,
      status: disposition.retryable ? 'retryable_failure' : 'terminal_failure',
      category: disposition.category,
      disableToken: disposition.disableToken,
    };
  });
  const delivered = receipts.some((receipt) => receipt.status === 'delivered');
  const retryable = receipts.some((receipt) =>
    receipt.status === 'pending' || receipt.status === 'retryable_failure'
  );
  const allDisabled = receipts.every((receipt) =>
    'disableToken' in receipt && receipt.disableToken === true
  );
  const outcome = retryable
    ? 'deferred'
    : delivered
    ? 'delivered'
    : allDisabled
    ? 'disabled'
    : 'failed';
  await complete(db, 'complete_notification_receipts', claim, dependencies, {
    outcome,
    category: retryable
      ? 'receipt_pending'
      : delivered
      ? 'delivered'
      : allDisabled
      ? 'no_eligible_device'
      : 'receipt_failed',
    receipts,
  });
  return summary(outcome);
}

export function processNotificationClaim(
  rawClaim: NotificationClaim,
  db: NotificationWorkerDatabase,
  dependencies: ProcessDependencies,
): Promise<ProcessingSummary> {
  const claim = notificationClaimSchema.parse(rawClaim);
  return claim.stage === 'send'
    ? processSend(claim, db, dependencies)
    : processReceipts(claim, db, dependencies);
}

export const handleNotificationWorker = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  let config: ReturnType<typeof parsePushRuntimeConfig>;
  try {
    config = parsePushRuntimeConfig({
      APP_ENV: Deno.env.get('APP_ENV'),
      PUSH_TOKEN_ENCRYPTION_KEY: Deno.env.get('PUSH_TOKEN_ENCRYPTION_KEY'),
      NOTIFICATION_WORKER_SECRET: Deno.env.get('NOTIFICATION_WORKER_SECRET'),
      EXPO_ACCESS_TOKEN: Deno.env.get('EXPO_ACCESS_TOKEN'),
    });
  } catch {
    return Response.json({ error: 'worker_configuration_invalid' }, { status: 503 });
  }
  if (!(await workerSecretMatches(request.headers.get('x-worker-secret'), config.workerSecret))) {
    return new Response('unauthorized', { status: 401 });
  }
  const db = serviceClient() as unknown as NotificationWorkerDatabase;
  const workerId = crypto.randomUUID();
  const total: ProcessingSummary = { delivered: 0, deferred: 0, disabled: 0, failed: 0 };
  for (let index = 0; index < maxClaimsPerInvocation; index += 1) {
    const leaseToken = crypto.randomUUID();
    const { data, error } = await db.rpc('claim_notification_delivery', {
      p_worker_id: workerId,
      p_lease_token_hash: await sha256Hex(leaseToken),
    });
    if (error) {
      console.error(JSON.stringify({ event: 'notification_claim_failed', category: 'rpc_failed' }));
      break;
    }
    if (!data) break;
    const parsed = notificationClaimSchema.safeParse(data);
    if (!parsed.success) {
      console.error(
        JSON.stringify({ event: 'notification_claim_invalid', category: 'invalid_contract' }),
      );
      break;
    }
    try {
      const outcome = await processNotificationClaim(parsed.data, db, {
        encryptionKey: config.encryptionKey,
        accessToken: config.accessToken,
        fetch,
        workerId,
        leaseToken,
      });
      total.delivered += outcome.delivered;
      total.deferred += outcome.deferred;
      total.disabled += outcome.disabled;
      total.failed += outcome.failed;
    } catch (error) {
      const category = error instanceof Error && error.message === 'EXPO_TEMPORARY_FAILURE'
        ? 'provider_unavailable'
        : 'delivery_processing_failed';
      await db.rpc('fail_notification_delivery', {
        p_outbox_id: parsed.data.outboxId,
        p_worker_id: workerId,
        p_lease_token: leaseToken,
        p_error_category: category,
      });
      total.failed += 1;
      console.error(JSON.stringify({ event: 'notification_delivery_failed', category }));
    }
  }
  return Response.json(total);
};

if (import.meta.main) Deno.serve(handleNotificationWorker);
