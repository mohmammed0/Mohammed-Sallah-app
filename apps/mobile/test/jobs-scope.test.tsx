import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  options: {} as { queryKey: unknown[]; enabled: boolean; queryFn: () => Promise<unknown> },
  filters: [] as Array<[string, string]>,
}));
vi.mock('expo-router', () => ({ Link: 'Link', useLocalSearchParams: () => state.params }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
  useQuery: (options: typeof state.options) => {
    state.options = options;
    return { data: { jobs: [] }, isPending: false };
  },
  useMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Image: 'Image',
  Linking: {},
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-location', () => ({}));
vi.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  LoadingSkeleton: 'LoadingSkeleton',
  Screen: 'Screen',
  styles: {},
}));
vi.mock('@/design-system/customer-components', () => ({
  ProgressTimeline: 'ProgressTimeline',
  resolveTimelineIndex: () => null,
}));
vi.mock('@/lib/secure-upload', () => ({ secureUpload: vi.fn() }));
vi.mock('@/lib/mutation-journal', () => ({ executeJournaledMutation: vi.fn() }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', t: (key: string) => key }),
}));
vi.mock('@/features/jobs/location-sharing', () => ({ reduceLocationSharing: vi.fn() }));
vi.mock('@/features/jobs/job-tracking-map', () => ({ JobTrackingMap: 'JobTrackingMap' }));
vi.mock(
  '@/features/jobs/completion-evidence',
  async () => import('../src/features/jobs/completion-evidence'),
);
vi.mock('@/features/jobs/customer-job-status', () => ({ CustomerJobStatus: 'CustomerJobStatus' }));
vi.mock('@/features/connectivity/use-active-screen', () => ({ useActiveScreen: () => true }));
vi.mock('../src/features/trust/trust-controls', () => ({ TrustControls: 'TrustControls' }));
vi.mock('../src/features/trust/trust-client', () => ({
  createTrustRpcClient: () => ({}),
  submitMarketplaceReport: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }),
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: (column: string, id: string) => {
          state.filters.push([column, id]);
          return chain;
        },
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
      };
      return chain;
    },
  },
}));
import Jobs from '../app/jobs';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  state.filters.length = 0;
});
describe('job destination scoping', () => {
  it.each([
    ['jobId', 'id'],
    ['requestId', 'request_id'],
  ] as const)('loads only the destination identified by %s', async (parameter, column) => {
    const id = '22222222-2222-4222-8222-222222222222';
    state.params = { [parameter]: id };
    await act(() => {
      renderer = create(<Jobs />);
    });
    await state.options.queryFn();
    expect(state.filters).toEqual([[column, id]]);
    expect(state.options.queryKey).toContain(id);
  });
  it('does not turn a malformed destination into the complete jobs list', async () => {
    state.params = { jobId: 'not-a-job-id' };
    await act(() => {
      renderer = create(<Jobs />);
    });
    expect(state.options.enabled).toBe(false);
    await expect(state.options.queryFn()).rejects.toThrow('INVALID_JOB_ROUTE');
    expect(state.filters).toEqual([]);
  });
});
