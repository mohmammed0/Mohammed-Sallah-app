import { z } from 'zod';
import { Constants } from '@sallah/database/types';
import { supabase } from '@/lib/supabase';

const customerRequestSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  version: z.number().int(),
  created_at: z.string(),
  timing_mode: z.enum(['asap', 'scheduled', 'flexible']),
  jobs: z.object({ status: z.enum(Constants.public.Enums.job_status) }).nullable(),
});

export async function listCustomerRequests(customerId: string | null, limit: number) {
  if (!customerId) return [];
  const ownerId = z.uuid().parse(customerId);
  const { data, error } = await supabase
    .from('service_requests')
    .select('id,title,status,version,created_at,timing_mode,jobs(status)')
    // A dual-role identity can also read provider-matched requests through RLS.
    .eq('customer_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('CUSTOMER_REQUEST_LIST_FAILED');
  // A selected request retains its matching state. Its unique job is authoritative
  // for progress and completion; PostgREST returns this to-one relation as object/null.
  return z
    .array(customerRequestSchema)
    .parse(data ?? [])
    .map(({ jobs, ...request }) => ({
      ...request,
      status: jobs?.status ?? request.status,
    }));
}
