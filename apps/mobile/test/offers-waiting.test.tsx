import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  requestId: '22222222-2222-4222-8222-222222222222' as unknown,
  active: true,
  online: true,
  fetchStatus: 'idle',
  status: 'matching',
  contextError: false,
  options: [] as Array<{
    queryKey: unknown[];
    enabled?: boolean;
    refetchInterval?: unknown;
    queryFn: () => Promise<unknown>;
  }>,
  refetch: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ requestId: fixture.requestId }),
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: (typeof fixture.options)[number]) => {
    fixture.options.push(options);
    const context = options.queryKey[0] === 'customer-offer-request';
    return {
      data: context ? { id: fixture.requestId, status: fixture.status } : [],
      isPending: false,
      isError: context && fixture.contextError,
      isFetching: false,
      fetchStatus: fixture.fetchStatus,
      isSuccess: !context || !fixture.contextError,
      refetch: fixture.refetch,
    };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/features/connectivity/use-active-screen', () => ({
  useActiveScreen: () => fixture.active,
}));
vi.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: fixture.online, isInternetReachable: fixture.online }),
}));
vi.mock(
  '@/features/connectivity/network-state',
  async () => import('../src/features/connectivity/network-state'),
);
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: fixture.rpc } }));
vi.mock('@/lib/mutation-journal', () => ({ executeJournaledMutation: vi.fn() }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', t: (key: string) => key }),
}));
vi.mock('@/design-system/motion', () => ({
  StatusMotion: 'StatusMotion',
  MotionReveal: 'MotionReveal',
}));
vi.mock('@/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  EmptyState: 'EmptyState',
  LoadingBlock: 'LoadingBlock',
  Notice: 'Notice',
  Surface: 'Surface',
  customerStyles: {},
}));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
import Offers from '../app/offers';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
beforeEach(() => {
  fixture.requestId = '22222222-2222-4222-8222-222222222222';
  fixture.active = true;
  fixture.online = true;
  fixture.fetchStatus = 'idle';
  fixture.status = 'matching';
  fixture.contextError = false;
  fixture.options = [];
  fixture.rpc.mockReset();
  fixture.refetch.mockReset();
});
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
});
async function render() {
  await act(() => {
    renderer = create(<Offers />);
  });
}

describe('honest customer offer waiting', () => {
  it('keeps the waiting state attached to an active request and provides a refresh action', async () => {
    await render();
    expect(renderer.root.findByProps({ variant: 'waiting' }).props.label).toBe(
      'requestWaitingTitle',
    );
    await act(() => renderer.root.findByProps({ label: 'refreshOffers' }).props.onPress());
    expect(fixture.refetch).toHaveBeenCalledTimes(2);
  });

  it.each(['cancelled', 'completed', 'provider_selected', 'future_unknown'])(
    'does not imply matching for server state %s',
    async (status) => {
      fixture.status = status;
      await render();
      expect(renderer.root.findAllByProps({ variant: 'waiting' })).toHaveLength(0);
    },
  );

  it('does not animate stale waiting after a status refresh fails', async () => {
    fixture.contextError = true;
    await render();
    expect(renderer.root.findAllByProps({ variant: 'waiting' })).toHaveLength(0);
  });
  it.each(['offline', 'paused'])(
    'does not promise active refresh of cached data while %s',
    async (mode) => {
      fixture.online = mode !== 'offline';
      fixture.fetchStatus = mode === 'paused' ? 'paused' : 'idle';
      await render();
      expect(renderer.root.findAllByProps({ variant: 'waiting' })).toHaveLength(0);
      expect(JSON.stringify(renderer.toJSON())).not.toContain('waitingRefreshHint');
    },
  );

  it.each([undefined, 'invalid', ['22222222-2222-4222-8222-222222222222']])(
    'rejects malformed request scope before a request leaves the client (%s)',
    async (requestId) => {
      fixture.requestId = requestId;
      await render();
      expect(fixture.options.every((option) => option.enabled === false)).toBe(true);
      const offers = fixture.options.find((option) => option.queryKey[0] === 'customer-offers');
      await expect(offers?.queryFn()).rejects.toThrow('INVALID_REQUEST_ROUTE');
      expect(fixture.rpc).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'refreshes periodically only while the screen is active (%s)',
    async (active) => {
      fixture.active = active;
      await render();
      for (const option of fixture.options) {
        expect(option.refetchInterval).toBe(active ? 8_000 : false);
      }
    },
  );
});
