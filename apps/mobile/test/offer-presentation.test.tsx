import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  params: {} as { requestId?: string; requestVersion?: string },
  offers: [] as unknown[],
  rpc: vi.fn(),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert: vi.fn() },
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
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => fixture.params,
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: fixture.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: fixture.params.requestId, status: 'receiving_offers' },
            error: null,
          }),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/mutation-journal', () => ({ executeJournaledMutation: vi.fn() }));
vi.mock('@/components/ui', () => ({ styles: {} }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'en', dir: 'ltr', t: (key: string) => key }),
}));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'en', dir: 'ltr', t: (key: string) => key }),
}));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/primitives', async () => import('../src/design-system/primitives'));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock('@/design-system/motion', () => ({ StatusMotion: 'StatusMotion' }));
vi.mock('@/features/connectivity/use-active-screen', () => ({ useActiveScreen: () => true }));
vi.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
vi.mock(
  '@/features/connectivity/network-state',
  async () => import('../src/features/connectivity/network-state'),
);

import ProviderOffer from '../app/provider/offer';
import Offers from '../app/offers';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const screens: ReactTestRenderer[] = [];
const clients: QueryClient[] = [];
async function renderScreen(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  let screen: ReactTestRenderer;
  await act(async () => {
    screen = create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
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
async function settle(expectation: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expectation();
  });
}

beforeEach(() => {
  fixture.params = { requestId: '11111111-1111-4111-8111-111111111111', requestVersion: '2' };
  fixture.offers = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      providerId: '33333333-3333-4333-8333-333333333333',
      providerName: 'Provider A',
      rating: 4.7,
      ratingCount: 12,
      completedJobs: 20,
      totalAmountMinor: 12000,
      visitFeeMinor: 2500,
      materialsIncluded: false,
      materialsEstimateMinor: null,
      estimatedArrivalMinutes: 60,
      estimatedDurationMinutes: 120,
      warrantyDays: 30,
      note: '',
      expiresAt: '2026-09-07T12:00:00Z',
      status: 'active',
      selectable: false,
      ineligibleReason: 'provider_not_verified',
    },
  ];
  fixture.rpc.mockReset().mockImplementation(async () => ({ data: fixture.offers, error: null }));
});
afterEach(async () => {
  await act(() => {
    for (const screen of screens.splice(0)) screen.unmount();
  });
  for (const client of clients.splice(0)) client.clear();
});

describe('offer presentation', () => {
  it('keeps the meaning of each prefilled provider field visible', async () => {
    const screen = await renderScreen(<ProviderOffer />);
    for (const label of ['visitFeeSar', 'arrivalMinutes', 'workDurationMinutes', 'warrantyDays']) {
      expect(textOf(screen)).toContain(label);
      expect(
        screen.root
          .findAllByType('TextInput')
          .find((input) => input.props.accessibilityLabel === label)?.props.value,
      ).not.toBe('');
    }
  });

  it('exposes the materials inclusion state as a checkable choice', async () => {
    const screen = await renderScreen(<ProviderOffer />);
    const checkbox = () =>
      screen.root
        .findAllByType('Pressable')
        .find((button) => button.props.accessibilityRole === 'checkbox');
    expect(checkbox()?.props.accessibilityState.checked).toBe(false);
    await act(() => checkbox()?.props.onPress());
    expect(checkbox()?.props.accessibilityState.checked).toBe(true);
  });

  it('shows server fees without inventing a materials estimate or replacing the quoted total', async () => {
    const screen = await renderScreen(<Offers />);
    await settle(() => expect(textOf(screen)).toContain('Provider A'));
    expect(textOf(screen)).toContain('visitFee');
    expect(textOf(screen)).toContain('25.00');
    expect(textOf(screen)).toContain('120.00');
    expect(textOf(screen)).not.toContain('materialsEstimate');
  });

  it('explains an unavailable offer without exposing internal eligibility codes', async () => {
    const screen = await renderScreen(<Offers />);
    await settle(() => expect(textOf(screen)).toContain('Provider A'));
    expect(textOf(screen)).toContain('offerUnavailable');
    expect(textOf(screen)).not.toContain('provider_not_verified');
    expect(
      screen.root
        .findAllByType('Pressable')
        .find((button) => button.props.accessibilityLabel === 'selectThisOffer')?.props.disabled,
    ).toBe(true);
  });

  it('does not show an endless loading state when the request context is missing', async () => {
    fixture.params = {};
    const screen = await renderScreen(<Offers />);
    expect(textOf(screen)).toContain('missingRequestId');
    expect(textOf(screen)).not.toContain('loadingOffers');
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});
