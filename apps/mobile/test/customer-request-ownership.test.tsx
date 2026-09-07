import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  ownStatus: 'receiving_offers',
  job: null as unknown,
  customerId: '11111111-1111-4111-8111-111111111111',
  requests: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      customer_id: '11111111-1111-4111-8111-111111111111',
      title: 'My leaking tap',
      status: 'receiving_offers',
      version: 1,
      created_at: '2026-09-05T10:00:00Z',
      timing_mode: 'flexible',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      customer_id: '44444444-4444-4444-8444-444444444444',
      title: 'Another customer matched to my provider account',
      status: 'receiving_offers',
      version: 1,
      created_at: '2026-09-06T10:00:00Z',
      timing_mode: 'asap',
    },
  ],
}));

vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('@/features/connectivity/use-active-screen', () => ({ useActiveScreen: () => true }));
vi.mock('@/providers/session-provider', () => ({
  useSessionContext: () => ({
    session: { user: { id: fixture.customerId } },
    context: { activeRole: 'customer', roles: ['customer', 'provider'] },
  }),
}));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'en', t: (key: string) => key }),
}));
vi.mock('@/features/location/location-provider', () => ({
  useCustomerLocation: () => ({ activeLocation: null }),
}));
vi.mock('@/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  EmptyState: 'EmptyState',
  Field: 'Field',
  InteractivePressable: 'Pressable',
  LoadingBlock: 'LoadingBlock',
  Notice: 'Notice',
  Pill: 'Pill',
  SectionHeader: 'SectionHeader',
  Surface: 'Surface',
  customerStyles: {},
}));
vi.mock('@/design-system/customer-components', () => ({ LocationHeader: 'LocationHeader' }));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon', categoryIconName: () => 'tools' }));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock(
  '@/features/customer/customer-request-service',
  async () => import('../src/features/customer/customer-request-service'),
);
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      // RLS can legitimately return both owned and provider-matched requests for one identity.
      let rows: Record<string, unknown>[] =
        table === 'service_requests' ? [...fixture.requests] : [];
      const query = {
        select: (columns: string) => {
          if (table === 'service_requests') {
            rows = rows.map((row) => ({
              ...row,
              status: row.customer_id === fixture.customerId ? fixture.ownStatus : row.status,
              ...(columns.includes('jobs(status)')
                ? { jobs: row.customer_id === fixture.customerId ? fixture.job : null }
                : {}),
            }));
          }
          return query;
        },
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          rows.sort((a, b) =>
            options?.ascending === false
              ? String(b[column]).localeCompare(String(a[column]))
              : String(a[column]).localeCompare(String(b[column])),
          );
          return query;
        },
        limit: (count: number) => {
          rows = rows.slice(0, count);
          return query;
        },
        then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
          Promise.resolve({ data: rows, error: null, count: 0 }).then(resolve, reject),
      };
      return query;
    },
  },
}));

import { CustomerHome } from '../src/features/customer/customer-home';
import Requests from '../app/requests';
import { listCustomerRequests } from '../src/features/customer/customer-request-service';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let screen: ReactTestRenderer | undefined;
let client: QueryClient | undefined;

beforeEach(() => {
  fixture.ownStatus = 'receiving_offers';
  fixture.job = null;
});

async function render(Screen: typeof CustomerHome | typeof Requests) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(() => {
    screen = create(
      <QueryClientProvider client={client!}>
        <Screen />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(
      screen!.root
        .findAllByType('Text')
        .flatMap((node) => node.props.children)
        .join(' '),
    ).toContain('My leaking tap');
  });
}

afterEach(async () => {
  await act(() => screen?.unmount());
  client?.clear();
});

describe('customer request ownership for dual-role accounts', () => {
  it('moves a finished job from active requests into completed history', async () => {
    fixture.ownStatus = 'provider_selected';
    fixture.job = { status: 'completed' };
    await render(Requests);
    await act(() =>
      screen!.root
        .findAllByType('Pill')
        .find((node) => node.props.label === 'Completed')!
        .props.onPress(),
    );
    expect(
      screen!.root
        .findAllByType('Text')
        .flatMap((node) => node.props.children)
        .join(' '),
    ).toContain('My leaking tap');
    await act(() =>
      screen!.root
        .findAllByType('Pill')
        .find((node) => node.props.label === 'activeRequest')!
        .props.onPress(),
    );
    expect(
      screen!.root
        .findAllByType('Text')
        .flatMap((node) => node.props.children)
        .join(' '),
    ).not.toContain('My leaking tap');
  });

  it('removes a completed job from the home active request section', async () => {
    fixture.ownStatus = 'provider_selected';
    fixture.job = { status: 'completed' };
    await render(CustomerHome);
    expect(
      screen!.root.findAllByType('SectionHeader').map((node) => node.props.title),
    ).not.toContain('activeRequest');
    expect(
      screen!.root
        .findAllByType('Text')
        .flatMap((node) => node.props.children)
        .join(' '),
    ).toContain('Completed');
  });

  it.each(['scheduled', 'in_progress', 'completion_submitted', 'completed', 'cancelled'])(
    'reads the authoritative %s job state after provider selection',
    async (status) => {
      fixture.ownStatus = 'provider_selected';
      fixture.job = { status };
      expect((await listCustomerRequests(fixture.customerId, 50))[0]?.status).toBe(status);
    },
  );

  it.each([[{ status: 'completed' }], { status: 'unrecognized_state' }, undefined])(
    'rejects a malformed to-one job relation: %j',
    async (job) => {
      fixture.job = job;
      await expect(listCustomerRequests(fixture.customerId, 50)).rejects.toThrow();
    },
  );

  it.each([
    ['home', CustomerHome],
    ['request list', Requests],
  ] as const)('shows only my customer requests in the %s', async (_name, Screen) => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(() => {
      screen = create(
        <QueryClientProvider client={client!}>
          <Screen />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const text = screen!.root
        .findAllByType('Text')
        .flatMap((node) => node.props.children)
        .join(' ');
      expect(text).toContain('My leaking tap');
      expect(text).not.toContain('Another customer matched to my provider account');
    });
  });
});
