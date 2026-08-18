import { serviceClient } from '../_shared/auth.ts';
Deno.serve(async (request) => {
  const secret = Deno.env.get('NOTIFICATION_WORKER_SECRET');
  if (!secret || request.headers.get('x-worker-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }
  const db = serviceClient();
  const { data: events, error } = await db
    .from('notification_outbox')
    .select('id,user_id,event_type,channel,payload,attempts')
    .in('status', ['pending', 'failed'])
    .lte('available_at', new Date().toISOString())
    .order('available_at')
    .limit(100);
  if (error) return new Response('query_failed', { status: 500 });
  for (const event of events ?? []) {
    if (event.channel === 'in_app') {
      await db
        .from('notification_outbox')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', event.id);
      continue;
    }
    if (event.channel === 'push' && !Deno.env.get('EXPO_ACCESS_TOKEN')) {
      await db
        .from('notification_outbox')
        .update({ status: 'disabled', last_error_category: 'push_not_configured' })
        .eq('id', event.id);
      continue;
    }
    await db
      .from('notification_outbox')
      .update({
        status: 'failed',
        attempts: event.attempts + 1,
        last_error_category: 'adapter_not_enabled',
        available_at: new Date(
          Date.now() + 60000 * Math.min(60, 2 ** event.attempts),
        ).toISOString(),
      })
      .eq('id', event.id);
  }
  return Response.json({ processed: events?.length ?? 0 });
});
