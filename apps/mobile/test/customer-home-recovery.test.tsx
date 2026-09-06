import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  read: vi.fn(),
  push: vi.fn(),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
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
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
          Promise.resolve(fixture.read(table)).then(resolve, reject),
      };
      return query;
    },
  },
}));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'en', dir: 'ltr', t: (key: string) => key }),
}));
vi.mock('@/features/location/location-provider', () => ({
  useCustomerLocation: () => ({ activeLocation: null }),
}));
vi.mock('@/design-system/icon', () => ({
  AppIcon: 'AppIcon',
  categoryIconName: () => 'tools',
}));
vi.mock('../src/design-system/icon', () => ({
  AppIcon: 'AppIcon',
  categoryIconName: () => 'tools',
}));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'en', dir: 'ltr', t: (key: string) => key }),
}));
vi.mock('@/design-system/primitives', async () => import('../src/design-system/primitives'));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock(
  '@/design-system/customer-components',
  async () => import('../src/design-system/customer-components'),
);

import { CustomerHome } from '../src/features/customer/customer-home';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const category = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'plumbing',
  icon_key: 'plumbing',
  service_category_translations: [{ name: 'Plumbing', description: 'Pipes and leaks' }],
};
const clients: QueryClient[] = [];
const screens: ReactTestRenderer[] = [];

async function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  let screen: ReactTestRenderer;
  await act(async () => {
    screen = create(
      <QueryClientProvider client={client}>
        <CustomerHome />
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
  fixture.read.mockImplementation((table: string) => ({
    data: table === 'service_categories' ? [category] : [],
    error: null,
    count: 0,
  }));
});

afterEach(async () => {
  await act(() => {
    for (const screen of screens.splice(0)) screen.unmount();
  });
  for (const client of clients.splice(0)) client.clear();
});

describe('customer home recovery', () => {
  it('explains an unmatched search and lets the customer restore service choices', async () => {
    const screen = await renderHome();
    await settle(() => expect(textOf(screen)).toContain('Plumbing'));
    await act(() => screen.root.findByType('TextInput').props.onChangeText('no-such-service'));
    expect(textOf(screen)).toContain('homeSearchEmptyTitle');
    expect(textOf(screen)).not.toContain('Plumbing');
    await act(() => screen.root.findByProps({ testID: 'home-clear-search' }).props.onPress());
    expect(screen.root.findByType('TextInput').props.value).toBe('');
    expect(textOf(screen)).toContain('Plumbing');
    await act(() => screen.root.findByProps({ testID: 'home-category-plumbing' }).props.onPress());
    expect(fixture.push).toHaveBeenCalledWith({
      pathname: '/request/new',
      params: { category: 'plumbing' },
    });
  });

  it('retries a failed catalogue without restarting or showing a false empty state', async () => {
    let failing = true;
    fixture.read.mockImplementation((table: string) => ({
      data: table === 'service_categories' ? (failing ? null : [category]) : [],
      error: table === 'service_categories' && failing ? new Error('offline') : null,
      count: 0,
    }));
    const screen = await renderHome();
    await settle(() => expect(textOf(screen)).toContain('catalogLoadFailed'));
    expect(textOf(screen)).not.toContain('homeCatalogEmptyTitle');
    failing = false;
    await act(() => screen.root.findByProps({ testID: 'home-retry-catalog' }).props.onPress());
    await settle(() => expect(textOf(screen)).toContain('Plumbing'));
    expect(textOf(screen)).not.toContain('catalogLoadFailed');
  });

  it('does not describe requests as empty while they are loading or unavailable', async () => {
    let resolveRequests: ((value: unknown) => void) | undefined;
    const pending = new Promise((resolve) => {
      resolveRequests = resolve;
    });
    fixture.read.mockImplementation((table: string) =>
      table === 'service_requests' ? pending : { data: [category], error: null, count: 0 },
    );
    const screen = await renderHome();
    expect(textOf(screen)).not.toContain('noRecentRequests');
    expect(textOf(screen)).not.toContain('noActiveRequests');
    await act(() => resolveRequests?.({ data: null, error: new Error('offline') }));
    await settle(() => expect(textOf(screen)).toContain('loadRequestsFailed'));
    expect(textOf(screen)).not.toContain('noRecentRequests');
    expect(screen.root.findAllByProps({ testID: 'home-retry-requests' }).length).toBeGreaterThan(0);
  });

  it('distinguishes an empty catalogue from an unmatched search', async () => {
    fixture.read.mockResolvedValue({ data: [], error: null, count: 0 });
    const screen = await renderHome();
    await settle(() => expect(textOf(screen)).toContain('homeCatalogEmptyTitle'));
    expect(textOf(screen)).not.toContain('homeSearchEmptyTitle');
  });

  it('displays active request dates in Riyadh regardless of the device time zone', async () => {
    fixture.read.mockImplementation((table: string) => ({
      data:
        table === 'service_categories'
          ? [category]
          : [
              {
                id: '22222222-2222-4222-8222-222222222222',
                title: 'Leaking tap',
                status: 'published',
                created_at: '2026-09-05T23:30:00.000Z',
                timing_mode: 'flexible',
              },
            ],
      error: null,
      count: 0,
    }));
    const screen = await renderHome();
    await settle(() => expect(textOf(screen)).toContain('Leaking tap'));
    expect(textOf(screen)).toContain('Sep 6, 2026');
  });
});
