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
  assert(
    jsonSchema.required.includes('quickReplies'),
    'quick replies must use the strict contract',
  );
});

Deno.test('quick replies are localized and correspond to the current question', () => {
  const schedule = deterministic(inputSchema.parse({
    locale: 'en',
    confirmedCategorySlug: 'plumbing',
    messages: [{ role: 'user', text: 'The kitchen pipe has leaked under the sink for two days.' }],
  }));
  const area = deterministic(inputSchema.parse({
    locale: 'en',
    confirmedCategorySlug: 'plumbing',
    messages: [{
      role: 'user',
      text: 'The kitchen pipe has leaked under the sink for two days. Tomorrow morning works.',
    }],
  }));
  assert(
    schedule.followUpQuestions[0]?.includes('date and time') === true,
    'schedule question expected',
  );
  assert(schedule.quickReplies.includes('Tomorrow'), 'schedule choices must answer timing');
  assert(
    area.followUpQuestions[0]?.includes('city and district') === true,
    'area question expected',
  );
  assert(area.quickReplies.includes('Riyadh'), 'area choices must answer location');
  assert(
    JSON.stringify(schedule.quickReplies) !== JSON.stringify(area.quickReplies),
    'different questions need different choices',
  );
});

Deno.test('multi-turn fallback preserves answers and stops when the intake is sufficient', () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const input = inputSchema.parse({
    locale: 'en',
    sessionId,
    confirmedCategorySlug: 'plumbing',
    messages: [
      { role: 'user', text: 'The kitchen sink has leaked under the cabinet since last night.' },
      { role: 'assistant', text: 'What date and time window works for the visit?' },
      { role: 'user', text: 'Tomorrow morning in Riyadh, Al Malqa district.' },
    ],
  });
  const result = deterministic(input);
  assert(result.enoughInformation, 'complete multi-turn answers must be sufficient');
  assert(result.customerSummary?.includes('kitchen sink'), 'the first answer must be preserved');
  assert(result.customerSummary?.includes('Al Malqa'), 'the later answer must be preserved');
  assert(result.followUpQuestions.length === 0, 'no more question is needed');
  assert(result.quickReplies.length === 0, 'no choices are shown when no question remains');
  assert(result.metadata.sessionId === sessionId, 'session metadata must be preserved');
  assert(result.metadata.turnNumber === 2, 'user turns must be counted without a short limit');
});

Deno.test('fallback does not repeat a question already present in assistant history', () => {
  const result = deterministic(inputSchema.parse({
    locale: 'en',
    messages: [
      { role: 'assistant', text: 'Please confirm the service category.' },
      { role: 'user', text: 'I need some help.' },
    ],
  }));
  assert(
    result.followUpQuestions[0] !== 'Please confirm the service category.',
    'the same category question must not repeat',
  );
  assert(
    result.followUpQuestions[0]?.startsWith('Please describe') === true,
    'the next unanswered field should be requested',
  );
});

Deno.test('category correction is authoritative and explicit summary remains best effort', () => {
  const result = deterministic(inputSchema.parse({
    locale: 'ar',
    categoryHints: ['electrical', 'plumbing'],
    confirmedCategorySlug: 'electrical',
    summaryRequested: true,
    messages: [{ role: 'user', text: 'أصحح الفئة: المشكلة كهربائية في المطبخ.' }],
  }));
  assert(result.suggestedCategorySlug === 'electrical', 'confirmed correction must win');
  assert(result.metadata.categoryConfirmed, 'category confirmation must be recorded');
  assert(!result.enoughInformation, 'missing schedule and area remain explicit');
  assert(result.customerSummary !== null, 'explicit best-effort summary must be returned');
});
