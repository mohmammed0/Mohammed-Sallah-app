import { buildServerPrompt } from './ai-provider.ts';
import { inputSchema } from './diagnostic.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('confirmed category and subcategory survive the diagnostic trust boundary', () => {
  const input = inputSchema.parse({
    locale: 'ar',
    messages: [{ role: 'user', text: 'وصف اصطناعي لمشكلة صيانة' }],
    categoryHints: ['plumbing'],
    confirmedCategorySlug: 'plumbing',
    confirmedSubcategorySlug: 'tap-repair',
    summaryRequested: false,
  });
  assert(input.confirmedCategorySlug === 'plumbing', 'category context was not preserved');
  assert(input.confirmedSubcategorySlug === 'tap-repair', 'subcategory context was not preserved');
  const prompt = buildServerPrompt(input);
  assert(prompt.includes('Confirmed category slug: plumbing'), 'category prompt context missing');
  assert(
    prompt.includes('Confirmed subcategory slug: tap-repair'),
    'subcategory prompt context missing',
  );
});
