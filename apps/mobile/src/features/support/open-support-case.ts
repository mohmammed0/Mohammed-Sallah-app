import { z } from 'zod';

export const supportCaseInputSchema = z
  .object({
    subject: z.string().trim().min(5).max(200),
    body: z.string().trim().min(10).max(4000),
  })
  .strict();

const supportCaseResultSchema = z
  .object({
    caseId: z.uuid(),
    status: z.literal('open'),
  })
  .strict();

export type SupportRpc = {
  rpc: (
    name: 'open_support_case',
    args: {
      p_subject: string;
      p_body: string;
      p_topic: 'general';
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

export async function openSupportCaseCommand(
  client: SupportRpc,
  input: unknown,
  idempotencyKey: string,
): Promise<z.infer<typeof supportCaseResultSchema>> {
  const valid = supportCaseInputSchema.parse(input);
  const key = z.uuid().parse(idempotencyKey);
  let response: Awaited<ReturnType<SupportRpc['rpc']>>;
  try {
    response = await client.rpc('open_support_case', {
      p_subject: valid.subject,
      p_body: valid.body,
      p_topic: 'general',
      p_idempotency_key: key,
    });
  } catch (error) {
    throw new Error(
      isRetryableTransportFailure(error)
        ? 'SUPPORT_CASE_NETWORK_UNAVAILABLE'
        : 'SUPPORT_CASE_UNAVAILABLE',
      { cause: error },
    );
  }
  if (response.error) {
    throw new Error(
      isRetryableTransportFailure(response.error)
        ? 'SUPPORT_CASE_NETWORK_UNAVAILABLE'
        : 'SUPPORT_CASE_UNAVAILABLE',
    );
  }
  try {
    return supportCaseResultSchema.parse(response.data);
  } catch {
    throw new Error('SUPPORT_CASE_UNAVAILABLE');
  }
}
