const allowedOrigins = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000,http://localhost:8081')
    .split(',')
    .map((value) => value.trim()),
);
export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
}
export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
export function safeError(request: Request, error: unknown, correlationId: string) {
  const code = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)
    ? error.message
    : 'unexpected';
  const status = code === 'AUTH_REQUIRED'
    ? 401
    : /ACCESS_DENIED|NOT_AUTHORIZED|REVOKED/.test(code)
    ? 403
    : /INVALID|REQUIRED|WRONG_PASSWORD|UNSUPPORTED/.test(code)
    ? 400
    : code === 'RATE_LIMIT'
    ? 429
    : 503;
  const category = status === 401
    ? 'authentication_required'
    : status === 403
    ? 'forbidden'
    : status === 400
    ? 'invalid_request'
    : status === 429
    ? 'rate_limited'
    : 'provider_unavailable';
  console.error(JSON.stringify({ event: 'edge_error', category, code, correlationId }));
  return json(request, { error: category, code, correlationId }, status);
}
