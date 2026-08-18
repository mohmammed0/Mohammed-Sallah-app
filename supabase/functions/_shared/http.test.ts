import { corsHeaders, json } from './http.ts';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}

Deno.test('CORS reflects only configured local origins', () => {
  const allowed = new Request('http://localhost', { headers: { origin: 'http://localhost:3000' } });
  const denied = new Request('http://localhost', {
    headers: { origin: 'https://attacker.invalid' },
  });
  const allowedHeaders = new Headers(corsHeaders(allowed));
  const deniedHeaders = new Headers(corsHeaders(denied));
  assertEqual(
    allowedHeaders.get('Access-Control-Allow-Origin'),
    'http://localhost:3000',
    'allowed origin',
  );
  assertEqual(deniedHeaders.get('Access-Control-Allow-Origin'), 'null', 'denied origin');
});

Deno.test('JSON responses are no-store and typed', async () => {
  const request = new Request('http://localhost');
  const response = json(request, { ok: true }, 202);
  assertEqual(response.status, 202, 'status');
  assertEqual(response.headers.get('Cache-Control'), 'no-store', 'cache policy');
  const body = await response.json();
  assertEqual(body.ok, true, 'body');
});
