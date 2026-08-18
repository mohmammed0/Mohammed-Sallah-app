import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z.email(),
  reason: z.string().max(1000).optional(),
  confirm: z.literal('on'),
});

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const client = await createSupabaseServerClient();
  const result = parsed.data.reason
    ? await client.rpc('request_external_account_deletion', {
        p_email: parsed.data.email,
        p_reason: parsed.data.reason,
      })
    : await client.rpc('request_external_account_deletion', { p_email: parsed.data.email });
  if (result.error) return NextResponse.json({ error: 'request_not_accepted' }, { status: 400 });
  return NextResponse.json({ status: 'received' }, { status: 202 });
}
