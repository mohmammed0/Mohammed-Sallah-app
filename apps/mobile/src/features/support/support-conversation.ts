import { z } from 'zod';

export const supportCaseStatusSchema = z.enum([
  'open',
  'waiting_customer',
  'waiting_provider',
  'waiting_operations',
  'resolved',
  'closed',
]);

export const supportMessageInputSchema = z
  .object({
    caseId: z.uuid(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

const supportMessageSchema = z
  .object({
    id: z.uuid(),
    case_id: z.uuid(),
    body: z.string().min(1).max(4000),
    visible_to_user: z.literal(true),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

const supportMessageListSchema = z.array(supportMessageSchema).max(50);

const supportMessageResultSchema = z
  .object({
    caseId: z.uuid(),
    messageId: z.uuid(),
    status: z.enum(['waiting_customer', 'waiting_operations']),
  })
  .strict();

export type SupportMessageRpc = {
  rpc: (
    name: 'send_support_case_message',
    args: {
      p_case_id: string;
      p_body: string;
      p_idempotency_key: string;
    },
  ) => Promise<{ data: unknown; error: unknown }>;
};

function isRetryableTransportFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  const safeSignature = ['name', 'code', 'message']
    .flatMap((key) => (typeof candidate[key] === 'string' ? [candidate[key]] : []))
    .join(' ');
  return /NETWORK|OFFLINE|TIMEOUT|TIMED_OUT|FETCH|CONNECTION/i.test(safeSignature);
}

export function parseSupportMessages(value: unknown, expectedCaseId: string) {
  const caseId = z.uuid().parse(expectedCaseId);
  const messages = supportMessageListSchema.parse(value);
  if (messages.some((message) => message.case_id !== caseId)) {
    throw new Error('SUPPORT_MESSAGE_CASE_MISMATCH');
  }
  return messages.slice().reverse();
}

export function canReplyToSupportCase(status: unknown): boolean {
  const parsed = supportCaseStatusSchema.safeParse(status);
  return parsed.success && parsed.data !== 'resolved' && parsed.data !== 'closed';
}

export async function sendSupportCaseMessageCommand(
  client: SupportMessageRpc,
  input: unknown,
  idempotencyKey: string,
): Promise<z.infer<typeof supportMessageResultSchema>> {
  const valid = supportMessageInputSchema.parse(input);
  const key = z.uuid().parse(idempotencyKey);
  let response: Awaited<ReturnType<SupportMessageRpc['rpc']>>;
  try {
    response = await client.rpc('send_support_case_message', {
      p_case_id: valid.caseId,
      p_body: valid.body,
      p_idempotency_key: key,
    });
  } catch (error) {
    throw new Error(
      isRetryableTransportFailure(error)
        ? 'SUPPORT_MESSAGE_NETWORK_UNAVAILABLE'
        : 'SUPPORT_MESSAGE_UNAVAILABLE',
      { cause: error },
    );
  }
  if (response.error) {
    throw new Error(
      isRetryableTransportFailure(response.error)
        ? 'SUPPORT_MESSAGE_NETWORK_UNAVAILABLE'
        : 'SUPPORT_MESSAGE_UNAVAILABLE',
    );
  }
  const parsed = supportMessageResultSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.caseId !== valid.caseId) {
    throw new Error('SUPPORT_MESSAGE_UNAVAILABLE');
  }
  return parsed.data;
}
