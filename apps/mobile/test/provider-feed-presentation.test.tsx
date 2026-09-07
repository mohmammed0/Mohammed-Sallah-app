import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  read: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  push: vi.fn(),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (value: unknown) => value },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-router', () => ({ router: { push: fixture.push } }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: fixture.rpc,
    functions: { invoke: fixture.invoke },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        gt: () => query,
        order: () => query,
        then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
          Promise.resolve(fixture.read(table)).then(resolve, reject),
      };
      return query;
    },
  },
}));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: 'en',
    dir: 'ltr',
    t: (key: string, variables?: unknown) =>
      variables ? `${key}: ${JSON.stringify(variables)}` : key,
  }),
}));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'en', dir: 'ltr', t: (key: string) => key }),
}));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/primitives', async () => import('../src/design-system/primitives'));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock(
  '@/features/provider/provider-feed-resilience',
  async () => import('../src/features/provider/provider-feed-resilience'),
);

import ProviderFeed from '../app/provider/feed';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const requestId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const match = {
  id: '33333333-3333-4333-8333-333333333333',
  score: 0.82,
  status: 'invited',
  expires_at: '2026-09-07T12:00:00Z',
  service_requests: {
    id: requestId,
    title: 'Boiler repair',
    structured_description: 'Repair brief',
    original_text: 'Original customer words',
    original_locale: 'ar',
    urgency: 'normal',
    version: 3,
    published_at: '2026-09-05T12:00:00Z',
  },
};
const brief = {
  requestId,
  title: 'Boiler repair',
  description: 'Authorized summary',
  original: { locale: 'ar', text: 'Original customer words' },
  category: { id: categoryId, slug: 'plumbing' },
  subcategory: { id: null, slug: null },
  area: { city: 'Riyadh', district: 'North' },
  approximateLocation: { latitude: 24.7, longitude: 46.6 },
  schedule: { mode: 'scheduled', start: '2026-09-05T23:30:00Z', end: null },
  urgency: 'normal',
  answers: [
    {
      questionKey: 'water_shut_off',
      answerText: null,
      answerNumber: null,
      answerBoolean: false,
      answerOptions: null,
      safetyRelevant: true,
    },
  ],
  media: [],
  safety: [{ type: 'gas', severity: 'high' }],
  translation: { status: 'not_requested' },
  ai: { uncertain: true, customerApproved: true },
  requiredCapabilities: ['gas_work'],
  providerCapabilities: { qualified: true, restrictedCategory: true },
};
const screens: ReactTestRenderer[] = [];
const clients: QueryClient[] = [];
async function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  let screen: ReactTestRenderer;
  await act(async () => {
    screen = create(
      <QueryClientProvider client={client}>
        <ProviderFeed />
      </QueryClientProvider>,
    );
  });
  screens.push(screen!);
  return screen!;
}
function textOf(screen: ReactTestRenderer) {
  return screen.root
    .findAllByType('Text')
    .map((node) => node.props.children)
    .flat()
    .join(' ');
}
function button(screen: ReactTestRenderer, label: string) {
  return screen.root
    .findAllByType('Pressable')
    .find((node) => node.props.accessibilityLabel === label);
}
async function settle(expectation: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expectation();
  });
}
beforeEach(() => {
  fixture.push.mockReset();
  fixture.rpc.mockReset().mockResolvedValue({ data: brief, error: null });
  fixture.invoke.mockReset();
  fixture.read.mockReset().mockImplementation((table: string) => ({
    data:
      table === 'request_provider_matches'
        ? [match]
        : table === 'service_categories'
          ? [{ id: categoryId, service_category_translations: [{ name: 'Plumbing services' }] }]
          : [
              {
                category_id: categoryId,
                key: 'water_shut_off',
                service_question_translations: [{ prompt: 'Is the water shut off?' }],
              },
            ],
    error: null,
  }));
});
afterEach(async () => {
  await act(() => {
    for (const screen of screens.splice(0)) screen.unmount();
  });
  for (const client of clients.splice(0)) client.clear();
});

describe('provider brief presentation', () => {
  it('shows translated catalogue labels and Riyadh timing while keeping safety visible before expansion', async () => {
    const screen = await renderFeed();
    await settle(() => expect(textOf(screen)).toContain('Plumbing services'));
    expect(textOf(screen)).toContain('priorityNormal');
    expect(textOf(screen)).toContain('Sep 6, 2026');
    expect(textOf(screen)).not.toContain('2026-09-05T23:30');
    expect(textOf(screen)).toContain('safetyTitle');
    expect(textOf(screen)).toContain('gas');
    expect(textOf(screen)).toContain('aiBriefUncertain');
    expect(textOf(screen)).not.toContain('Original customer words');
    await act(() => button(screen, 'submitSealedOffer')?.props.onPress());
    expect(fixture.push).toHaveBeenCalledWith({
      pathname: '/provider/offer',
      params: { requestId, requestVersion: '3' },
    });
  });

  it('expands original content and translated questions without losing a false answer', async () => {
    const screen = await renderFeed();
    await settle(() => expect(button(screen, 'showRequestDetails')).toBeDefined());
    await act(() => button(screen, 'showRequestDetails')?.props.onPress());
    expect(button(screen, 'hideRequestDetails')?.props.accessibilityState.expanded).toBe(true);
    expect(textOf(screen)).toContain('Original customer words');
    expect(textOf(screen)).toContain('Is the water shut off?');
    expect(textOf(screen)).toContain('no');
    expect(textOf(screen)).not.toContain('false');
    expect(textOf(screen)).toContain('gas_work');
  });

  it('keeps a missing authorized brief retryable and provides no offer action for it', async () => {
    fixture.rpc.mockResolvedValue({ data: null, error: new Error('brief unavailable') });
    const screen = await renderFeed();
    await settle(() => expect(textOf(screen)).toContain('providerFeedLoadFailed'));
    expect(button(screen, 'submitSealedOffer')).toBeUndefined();
    expect(button(screen, 'retry')).toBeDefined();
  });

  it('preserves the original alongside translated content and truthful test-provider metadata', async () => {
    fixture.invoke.mockResolvedValue({
      data: {
        translationId: '44444444-4444-4444-8444-444444444444',
        status: 'completed',
        sourceLocale: 'ar',
        targetLocale: 'en',
        translated: {
          title: 'Translated title',
          problemSummary: 'Translated summary',
          originalText: 'Original customer words',
          categoryName: 'Plumbing services',
          cityName: 'Riyadh',
          safetyNotes: [],
        },
        metadata: { provider: 'deterministic', model: 'fixture', testProvider: true, cached: true },
      },
      error: null,
    });
    const screen = await renderFeed();
    await settle(() => expect(button(screen, 'showRequestDetails')).toBeDefined());
    await act(() => button(screen, 'showRequestDetails')?.props.onPress());
    await act(() => button(screen, 'showTranslationStatus')?.props.onPress());
    await settle(() => expect(textOf(screen)).toContain('Translated summary'));
    expect(textOf(screen)).toContain('Original customer words');
    expect(textOf(screen)).toContain('localTestProvider');
    expect(textOf(screen)).toContain('cachedTranslation');
  });
});

vi.mock('expo-router/react-navigation', async () => ({
  HeaderShownContext: (await import('react')).createContext(false),
}));
