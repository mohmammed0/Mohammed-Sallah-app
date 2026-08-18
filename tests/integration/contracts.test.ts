import { describe, expect, it } from 'vitest';
import { aiDiagnosticSchema, offerInputSchema } from '@sallah/domain';
describe('cross-package contracts', () => {
  it('rejects floating or negative offer money', () =>
    expect(offerInputSchema.safeParse({ totalAmountMinor: -1 }).success).toBe(false));
  it('rejects unexpected AI output fields', () =>
    expect(aiDiagnosticSchema.safeParse({ schemaVersion: '1.0', unexpected: true }).success).toBe(
      false,
    ));
});
