import { deterministic, diagnosticSchema, inputSchema, jsonSchema } from './diagnostic.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('deterministic fallback is schema-valid and flags gas safely', () => {
  const input = inputSchema.parse({
    locale: 'ar',
    messages: [{ role: 'user', text: 'هناك تسرب غاز قرب المطبخ' }],
  });
  const result = deterministic(input);
  assert(diagnosticSchema.safeParse(result).success, 'fallback output must validate');
  assert(result.metadata.fallback, 'fallback metadata required');
  assert(result.safetyFlags.includes('gas'), 'gas safety flag required');
  assert(result.urgencySuggestion === 'safety_critical', 'safety issue must be critical');
});

Deno.test('input boundary rejects empty and oversized conversations', () => {
  assert(
    !inputSchema.safeParse({ locale: 'ar', messages: [] }).success,
    'empty messages must fail',
  );
  assert(
    !inputSchema.safeParse({ locale: 'ar', messages: [{ role: 'user', text: 'x'.repeat(8001) }] })
      .success,
    'oversized message must fail',
  );
});

Deno.test('provider JSON schema is closed and contains metadata', () => {
  assert(jsonSchema.additionalProperties === false, 'root schema must reject extra properties');
  assert(jsonSchema.required.includes('metadata'), 'metadata must be required');
});
