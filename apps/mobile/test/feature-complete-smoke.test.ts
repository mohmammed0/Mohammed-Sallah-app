import { readFileSync } from 'node:fs';
import {
  DeterministicAiProvider,
  assertJobTransition,
  diagnoseWithFallback,
  offerInputSchema,
  requestDraftSchema,
  scoreCandidate,
  type AiProvider,
  type JobStatus,
} from '@sallah/domain';
import { describe, expect, it } from 'vitest';
import { canEnterProductArea, productLandingRoute } from '../src/features/auth/route-policy';
import { allCompletionEvidenceViewed } from '../src/features/jobs/completion-evidence';
import {
  isRequestReadyForReview,
  nextRequestJourneyStep,
  type RequestJourneyStep,
} from '../src/features/request/request-journey';

type SmokeManifest = {
  schemaVersion: 1;
  evidence: {
    repositoryContract: 'AUTOMATED';
    physicalDevice: 'NOT RUN - EXTERNAL/RELEASE GATE';
    externalAiProvider: 'MOCKED AT ADAPTER BOUNDARY';
    liveTranscriptionAndTranslation: 'NOT RUN - CREDENTIALLED PREVIEW GATE';
    livePushReceiptAndTap: 'NOT RUN - PHYSICAL DEVICE GATE';
  };
  journeys: {
    customer: readonly string[];
    provider: readonly string[];
  };
};

const manifest = JSON.parse(
  readFileSync(
    new URL('../../../tests/e2e-mobile/feature-complete-journeys.json', import.meta.url),
    'utf8',
  ),
) as SmokeManifest;

const customerComposer = readFileSync(
  new URL('../src/features/request/request-composer.tsx', import.meta.url),
  'utf8',
);
const customerRequests = readFileSync(new URL('../app/requests.tsx', import.meta.url), 'utf8');
const offersScreen = readFileSync(new URL('../app/offers.tsx', import.meta.url), 'utf8');
const messagesScreen = readFileSync(new URL('../app/messages.tsx', import.meta.url), 'utf8');
const jobsScreen = readFileSync(new URL('../app/jobs.tsx', import.meta.url), 'utf8');
const providerOnboarding = readFileSync(
  new URL('../app/provider/onboarding.tsx', import.meta.url),
  'utf8',
);
const providerFeed = readFileSync(new URL('../app/provider/feed.tsx', import.meta.url), 'utf8');
const providerOffer = readFileSync(new URL('../app/provider/offer.tsx', import.meta.url), 'utf8');
const providerEarnings = readFileSync(
  new URL('../app/provider/earnings.tsx', import.meta.url),
  'utf8',
);
const providerTabs = readFileSync(
  new URL('../app/(provider)/_layout.tsx', import.meta.url),
  'utf8',
);
const providerHome = readFileSync(
  new URL('../app/(provider)/provider-home.tsx', import.meta.url),
  'utf8',
);
const notificationsScreen = readFileSync(
  new URL('../app/notifications.tsx', import.meta.url),
  'utf8',
);
const accountScreen = readFileSync(new URL('../app/account.tsx', import.meta.url), 'utf8');
const authScreen = readFileSync(new URL('../app/auth.tsx', import.meta.url), 'utf8');

const customerSteps = [
  'authentication',
  'service-selection',
  'ai-diagnostic',
  'image-or-voice-input',
  'location',
  'timing',
  'review',
  'publish',
  'receive-offers',
  'select-provider',
  'message',
  'completion',
  'rating',
] as const;

const providerSteps = [
  'authentication',
  'onboarding-qualification',
  'request-feed',
  'translated-brief',
  'offer',
  'selected-job',
  'message',
  'completion-evidence',
  'earnings-status',
] as const;

describe('feature-complete beta smoke contracts', () => {
  it('keeps provider navigation branded, directional, and separate from marketplace data', () => {
    expect(providerTabs).toContain("from '@/design-system/icon'");
    expect(providerTabs).toContain("from '@/design-system/tokens'");
    expect(providerTabs).toContain('tabBarActiveTintColor');
    expect(providerTabs).toContain('writingDirection: dir');
    expect(providerTabs).not.toContain('exact_location');
    expect(providerTabs).not.toContain('offer_amount');
  });

  it('keeps dual-role switching and provider support destinations reachable', () => {
    expect(providerHome).toContain('setActiveRole');
    expect(providerHome).toContain("setActiveRole('customer')");
    expect(providerHome).toContain("route: '/provider/onboarding'");
    expect(providerHome).toContain("route: '/notifications'");
    expect(providerHome).toContain("route: '/provider/earnings'");
    expect(providerHome).toContain("route: '/support'");
    expect(providerHome).not.toContain('<Notice tone="success">{t(\'qualified\')}</Notice>');
  });

  it('keeps long account controls reachable and permits an authorized provider-role switch', () => {
    expect(accountScreen).toContain('ScrollView');
    expect(accountScreen).toContain('styles.scrollScreen');
    expect(accountScreen).toContain("setActiveRole('provider')");
    expect(accountScreen).toContain("? '/provider-home'");
    expect(accountScreen).toContain(": '/provider/onboarding'");
    expect(accountScreen).toContain('requestAnimationFrame');
    expect(providerHome).toContain('requestAnimationFrame');
  });

  it('lets the authoritative session context select the post-sign-in landing route', () => {
    expect(authScreen).not.toContain("router.replace('/home')");
    expect(authScreen).not.toContain("from 'expo-router'");
  });

  it('never presents raw notification event identifiers as customer copy', () => {
    expect(notificationsScreen).toContain('notificationEventLabelKey');
    expect(notificationsScreen).not.toContain('{item.event_type}');
  });

  it('keeps the customer journey connected from authentication through completion and rating', async () => {
    expect(manifest.journeys.customer).toEqual(customerSteps);
    expect(
      productLandingRoute({ allowed: true, roles: ['customer'], activeRole: 'customer' }),
    ).toBe('/customer-home');

    const primaryProvider: AiProvider = {
      name: 'external-provider-boundary',
      model: 'unavailable-in-repository-smoke',
      diagnose: () => Promise.reject(new Error('EXTERNAL_PROVIDER_NOT_AVAILABLE')),
    };
    const diagnostic = await diagnoseWithFallback(primaryProvider, new DeterministicAiProvider(), {
      locale: 'ar',
      categoryHints: ['plumbing'],
      confirmedCategorySlug: 'plumbing',
      confirmedSubcategorySlug: 'tap-repair',
      summaryRequested: true,
      messages: [{ role: 'user', text: 'The kitchen tap started leaking today and needs repair.' }],
    });
    expect(diagnostic.metadata).toMatchObject({
      fallback: true,
      promptVersion: 'diagnostic-v4',
      categoryConfirmed: true,
    });
    expect(diagnostic.customerSummary).toBeTruthy();

    const requestSteps: RequestJourneyStep[] = ['category'];
    for (let transition = 0; transition < 5; transition += 1) {
      requestSteps.push(nextRequestJourneyStep(requestSteps.at(-1) ?? 'category'));
    }
    expect(requestSteps).toEqual(['category', 'chat', 'location', 'timing', 'review', 'success']);
    expect(
      isRequestReadyForReview({
        selectedCategorySlug: 'plumbing',
        categoryConfirmedByUser: true,
        title: 'Kitchen tap leak',
        summary: diagnostic.customerSummary ?? '',
        coordinates: { latitude: 24.7136, longitude: 46.6753 },
        cityCode: 'riyadh',
        timingMode: 'asap',
        requestedStart: null,
        requestedEnd: null,
        pendingTurnCount: 0,
      }),
    ).toBe(true);
    expect(
      requestDraftSchema.parse({
        categoryId: '10000000-0000-4000-8000-000000000001',
        subcategoryId: '10000000-0000-4000-8000-000000000002',
        title: 'Kitchen tap leak',
        originalText: 'The kitchen tap started leaking today and needs repair.',
        structuredDescription: diagnostic.customerSummary,
        urgency: 'normal',
        requestedStart: null,
        cityId: '10000000-0000-4000-8000-000000000003',
        districtId: null,
        customerApproved: true,
        version: 1,
      }).customerApproved,
    ).toBe(true);

    const offer = offerInputSchema.parse({
      requestId: '10000000-0000-4000-8000-000000000004',
      totalAmountMinor: 25_000,
      visitFeeMinor: 5_000,
      laborAmountMinor: 20_000,
      materialsIncluded: false,
      materialsEstimateMinor: null,
      estimatedArrivalMinutes: 30,
      estimatedDurationMinutes: 60,
      warrantyDays: 30,
      note: 'Contract smoke offer without an external provider',
      expiresAt: '2026-08-26T12:00:00.000Z',
      expectedRequestVersion: 1,
      idempotencyKey: 'customer-smoke-offer-selection-001',
    });
    expect(offer.expectedRequestVersion).toBe(1);

    const lifecycle: JobStatus[] = [
      'provider_selected',
      'scheduled',
      'en_route',
      'arrived',
      'diagnosing',
      'in_progress',
      'completion_submitted',
      'completed',
    ];
    lifecycle.slice(1).forEach((to, index) => assertJobTransition(lifecycle[index]!, to));
    expect(allCompletionEvidenceViewed(['proof-1'], { 'proof-1': true })).toBe(true);

    expect(customerComposer).toContain("functions.invoke<unknown>('transcribe'");
    expect(customerComposer).toContain(
      "media.kind === 'image' ? 'request_media' : 'request_audio'",
    );
    expect(customerComposer).toContain("supabase.rpc('publish_service_request'");
    expect(customerRequests).toContain("pathname: '/offers'");
    expect(offersScreen).toContain("supabase.rpc('select_offer'");
    expect(messagesScreen).toContain("supabase.rpc('send_message_with_attachments'");
    expect(jobsScreen).toContain("supabase.rpc('submit_completion'");
    expect(jobsScreen).toContain("supabase.rpc('accept_completion'");
    expect(jobsScreen).toContain("placeholder={t('ratingPlaceholder')}");
  });

  it('keeps provider operations verification-gated through feed, offer, work, and earnings', () => {
    expect(manifest.journeys.provider).toEqual(providerSteps);
    const underReview = {
      allowed: true,
      roles: ['customer', 'provider'],
      activeRole: 'provider',
      providerVerificationStatus: 'under_review',
    };
    expect(productLandingRoute(underReview)).toBe('/provider/onboarding');
    expect(canEnterProductArea(underReview, 'provider-operations')).toBe(false);
    expect(
      canEnterProductArea(
        { ...underReview, providerVerificationStatus: 'verified' },
        'provider-operations',
      ),
    ).toBe(true);

    const eligible = scoreCandidate({
      providerId: 'provider-smoke',
      verified: true,
      suspended: false,
      supportsCategory: true,
      supportsRestrictedService: true,
      restrictedService: false,
      available: true,
      insideServiceArea: true,
      blocked: false,
      distanceScore: 0.9,
      ratingScore: 0.8,
      responseScore: 0.9,
      workloadScore: 0.7,
      completedJobsScore: 0.8,
    });
    expect(eligible.eligible).toBe(true);
    expect(
      scoreCandidate({
        providerId: 'unverified-provider-smoke',
        verified: false,
        suspended: false,
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
    ).toMatchObject({ eligible: false, exclusionReason: 'provider_not_verified' });

    expect(providerOnboarding).toContain("supabase.rpc('upsert_provider_onboarding'");
    expect(providerFeed).toContain("('get_provider_request_brief'");
    expect(providerFeed).toContain("functions.invoke('translate-provider-brief'");
    expect(providerFeed).toContain('original_text');
    expect(providerFeed).toContain('approximateLocation');
    expect(providerFeed).not.toContain('exact_address');
    expect(providerOffer).toContain("operation: 'submit_offer'");
    expect(jobsScreen).toContain("pathname: '/messages'");
    expect(jobsScreen).toMatch(/journaled\(\s*'submit_completion'/);
    expect(jobsScreen).toContain("('get_authorized_job_location'");
    expect(providerEarnings).toContain("queryKey: ['provider-settlements']");
  });

  it('labels repository-only and live-device evidence without promoting mocks to live PASS', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.evidence).toEqual({
      repositoryContract: 'AUTOMATED',
      physicalDevice: 'NOT RUN - EXTERNAL/RELEASE GATE',
      externalAiProvider: 'MOCKED AT ADAPTER BOUNDARY',
      liveTranscriptionAndTranslation: 'NOT RUN - CREDENTIALLED PREVIEW GATE',
      livePushReceiptAndTap: 'NOT RUN - PHYSICAL DEVICE GATE',
    });
  });
});
