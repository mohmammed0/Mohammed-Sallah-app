import { describe, expect, it } from 'vitest';
import {
  assertProductionPaymentMode,
  canTransitionJob,
  DeterministicAiProvider,
  scoreCandidate,
} from '../src';

describe('job state machine', () => {
  it('allows the controlled happy path', () =>
    expect(canTransitionJob('scheduled', 'en_route')).toBe(true));
  it('rejects skipping arrival and diagnosis', () =>
    expect(canTransitionJob('scheduled', 'in_progress')).toBe(false));
});

describe('sealed marketplace foundations', () => {
  it('hard excludes suspended providers', () =>
    expect(
      scoreCandidate({
        providerId: 'p',
        verified: true,
        suspended: true,
        supportsCategory: true,
        supportsRestrictedService: true,
        restrictedService: false,
        available: true,
        insideServiceArea: true,
        blocked: false,
        distanceScore: 1,
        ratingScore: 1,
        responseScore: 1,
        workloadScore: 1,
        completedJobsScore: 1,
      }),
    ).toEqual({ eligible: false, providerId: 'p', exclusionReason: 'provider_suspended' }));
  it('rejects sandbox payments in production', () =>
    expect(() => assertProductionPaymentMode('production', 'sandbox')).toThrow());
  it('detects safety wording in fallback diagnostics', async () => {
    const result = await new DeterministicAiProvider().diagnose({
      locale: 'ar',
      categoryHints: [],
      messages: [{ role: 'user', text: 'هناك ماء قرب الكهرباء' }],
    });
    expect(result.safetyFlags).toContain('water_near_electricity');
  });
});
