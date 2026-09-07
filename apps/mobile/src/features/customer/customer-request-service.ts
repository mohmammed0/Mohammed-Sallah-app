import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const customerRequestSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  version: z.number().int(),
  created_at: z.string(),
  timing_mode: z.enum(['asap', 'scheduled', 'flexible']),
});

export async function listCustomerRequests(customerId: string | null, limit: number) {
  if (!customerId) return [];
  const ownerId = z.uuid().parse(customerId);
  const { data, error } = await supabase
    .from('service_requests')
    .select('id,title,status,version,created_at,timing_mode')
    // A dual-role identity can also read provider-matched requests through RLS.
    .eq('customer_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('CUSTOMER_REQUEST_LIST_FAILED');
  return z.array(customerRequestSchema).parse(data ?? []);
}
