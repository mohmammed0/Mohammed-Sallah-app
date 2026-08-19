import { describe, expect, it } from 'vitest';
import {
  assertProductionPaymentMode,
  canTransitionJob,
  DeterministicAiProvider,
  diagnoseWithFallback,
  scoreCandidate,
  parseKnownUserRoles,
  userRoleValues,
  type AiProvider,
} from '../src';

describe('job state machine', () => {
  it('allows the controlled happy path', () =>
    expect(canTransitionJob('scheduled', 'en_route')).toBe(true));
  it('rejects skipping arrival and diagnosis', () =>
    expect(canTransitionJob('scheduled', 'in_progress')).toBe(false));
});

describe('sealed marketplace foundations', () => {
  it('parses every current database user role from the shared contract', () => {
    expect(parseKnownUserRoles(userRoleValues)).toEqual({
      roles: [...userRoleValues],
      unknownRoles: [],
    });
    expect(userRoleValues).toContain('privacy_reviewer');
  });
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
  it('preserves confirmed subcategory context in deterministic fallback', async () => {
    const result = await new DeterministicAiProvider().diagnose({
      locale: 'en',
      categoryHints: ['plumbing'],
      confirmedCategorySlug: 'plumbing',
      confirmedSubcategorySlug: 'tap-repair',
      messages: [{ role: 'user', text: 'The tap pressure has been low since today.' }],
    });
    expect(result.suggestedCategorySlug).toBe('plumbing');
    expect(result.suggestedSubcategorySlug).toBe('tap-repair');
  });
  it('offers contextual fallback replies for the current question', async () => {
    const fallback = new DeterministicAiProvider();
    const category = await fallback.diagnose({
      locale: 'en',
      categoryHints: [],
      messages: [{ role: 'user', text: 'The fixture has stopped working since this morning.' }],
    });
    const schedule = await fallback.diagnose({
      locale: 'en',
      categoryHints: ['electrical'],
      confirmedCategorySlug: 'electrical',
      messages: [{ role: 'user', text: 'The fixture has stopped working since this morning.' }],
    });
    expect(category.followUpQuestions[0]).toContain('service type');
    expect(category.quickReplies).toContain('Electrical');
    expect(schedule.followUpQuestions[0]).toContain('When');
    expect(schedule.quickReplies).toContain('Tomorrow');
    expect(category.quickReplies).not.toEqual(schedule.quickReplies);
  });
  it('detects safety wording in fallback diagnostics', async () => {
    const result = await new DeterministicAiProvider().diagnose({
      locale: 'ar',
      categoryHints: [],
      messages: [{ role: 'user', text: 'هناك ماء قرب الكهرباء' }],
    });
    expect(result.safetyFlags).toContain('water_near_electricity');
  });
  it('rejects malformed primary output and uses the validated fallback', async () => {
    const primary: AiProvider = {
      name: 'malformed-provider',
      model: 'broken-v1',
      diagnose: () => Promise.resolve({ malformed: true } as never),
    };
    const result = await diagnoseWithFallback(primary, new DeterministicAiProvider(), {
      locale: 'en',
      categoryHints: ['plumbing'],
      confirmedCategorySlug: 'plumbing',
      summaryRequested: true,
      messages: [{ role: 'user', text: 'The sink has leaked since today at noon.' }],
    });
    expect(result.metadata.fallback).toBe(true);
    expect(result.metadata.provider).toBe('deterministic');
  });
  it('recovers from a provider failure on a later retry', async () => {
    const context = {
      locale: 'en',
      categoryHints: ['plumbing'],
      confirmedCategorySlug: 'plumbing',
      summaryRequested: true,
      messages: [{ role: 'user' as const, text: 'The sink has leaked since today at noon.' }],
    };
    const base = await new DeterministicAiProvider().diagnose(context);
    let calls = 0;
    const primary: AiProvider = {
      name: 'primary-provider',
      model: 'primary-v1',
      diagnose: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('temporary failure'));
        return Promise.resolve({
          ...base,
          metadata: {
            ...base.metadata,
            provider: 'primary-provider',
            model: 'primary-v1',
            fallback: false,
          },
        });
      },
    };
    const fallback = new DeterministicAiProvider();
    expect((await diagnoseWithFallback(primary, fallback, context)).metadata.fallback).toBe(true);
    const retry = await diagnoseWithFallback(primary, fallback, context);
    expect(retry.metadata.fallback).toBe(false);
    expect(retry.metadata.provider).toBe('primary-provider');
  });
});
