import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
  auth: vi.fn(),
  media: vi.fn(),
  tasks: [] as Promise<unknown>[],
  errors: [] as unknown[],
}));
vi.mock('expo-router', () => ({
  Link: 'Link',
  useLocalSearchParams: () => ({ jobId: '22222222-2222-4222-8222-222222222222' }),
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Image: 'Image',
  Linking: { canOpenURL: async () => true, openURL: vi.fn() },
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { userId: '11111111-1111-4111-8111-111111111111', jobs: fixture.jobs },
    isPending: false,
    isFetching: false,
    refetch: async () => undefined,
  }),
  useMutation: (options: {
    mutationFn: (run: () => Promise<unknown>) => Promise<unknown>;
    onSuccess: () => Promise<unknown>;
    onError: () => void;
  }) => ({
    isPending: false,
    mutate: (run: () => Promise<unknown>) => {
      fixture.tasks.push(
        options
          .mutationFn(run)
          .then(options.onSuccess)
          .catch((error: unknown) => {
            fixture.errors.push(error);
            options.onError();
          }),
      );
    },
  }),
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
vi.mock('@/lib/mutation-journal', () => ({
  executeJournaledMutation: (options: {
    payload: unknown;
    execute: (key: string, payload: unknown) => Promise<unknown>;
  }) => options.execute('synthetic-review-key', options.payload),
}));
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
    auth: { getUser: fixture.auth },
    rpc: fixture.rpc,
    functions: { invoke: fixture.media },
  },
}));
import Jobs from '../app/jobs';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const job = {
  id: '22222222-2222-4222-8222-222222222222',
  customer_id: '11111111-1111-4111-8111-111111111111',
  provider_id: '33333333-3333-4333-8333-333333333333',
  version: 10,
  status: 'completion_submitted',
  approved_total_minor: 15000,
  payments: [],
  conversations: [],
  job_location_updates: [],
  change_orders: [],
  cancellation_requests: [],
  disputes: [],
  ratings: [],
};
function manifest(attempt: 1 | 2) {
  const completionAttemptId =
    attempt === 1 ? '44444444-4444-4444-8444-444444444444' : '55555555-5555-4555-8555-555555555555';
  return {
    completionAttemptId,
    attemptNumber: attempt,
    proofs: [
      {
        id:
          attempt === 1
            ? '66666666-6666-4666-8666-666666666666'
            : '77777777-7777-4777-8777-777777777777',
        uploadId: '88888888-8888-4888-8888-888888888888',
        mimeType: 'image/jpeg',
        description: `Synthetic attempt ${attempt}`,
        completionAttemptId,
        attemptNumber: attempt,
      },
    ],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let renderer: ReactTestRenderer | undefined;
function button(label: string) {
  return renderer!.root.findByProps({ label });
}
async function render() {
  await act(async () => {
    renderer = create(<Jobs />);
  });
}
async function update(status: string, version: number) {
  fixture.jobs = [{ ...job, status, version }];
  await act(async () => renderer!.update(<Jobs />));
}
async function press(label: string) {
  await act(async () => button(label).props.onPress());
}
async function settleTasks() {
  await act(async () => {
    await Promise.all(fixture.tasks);
  });
}
beforeEach(() => {
  fixture.jobs = [{ ...job }];
  fixture.tasks = [];
  fixture.errors = [];
  fixture.auth.mockReset().mockResolvedValue({ data: { user: { id: job.customer_id } } });
  fixture.rpc.mockReset().mockImplementation(async (name: string) => ({
    data: name === 'get_completion_proof_manifest' ? manifest(1) : null,
    error: null,
  }));
  fixture.media
    .mockReset()
    .mockResolvedValue({ data: { signedUrl: 'https://example.invalid/proof.jpg' }, error: null });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

describe('completion evidence follows the polled attempt', () => {
  it('requires new evidence after resumption and rejects an old acceptance handler', async () => {
    await render();
    await press('viewCompletionProof');
    await settleTasks();
    const oldImageOnLoad = renderer!.root.findByType('Image').props.onLoad;
    await act(async () => oldImageOnLoad());
    expect(button('acceptCompletion').props.disabled).toBe(false);
    const oldAccept = button('acceptCompletion').props.onPress;
    await update('in_progress', 11);
    await update('completion_submitted', 12);
    expect(button('acceptCompletion').props.disabled).toBe(true);
    expect(renderer!.root.findAllByType('Image')).toHaveLength(0);
    await act(async () => oldAccept());
    await settleTasks();
    expect(fixture.rpc.mock.calls.filter(([name]) => name === 'accept_completion')).toHaveLength(0);
    fixture.rpc.mockResolvedValue({ data: manifest(2), error: null });
    await press('viewCompletionProof');
    await settleTasks();
    await act(async () => oldImageOnLoad());
    expect(button('acceptCompletion').props.disabled).toBe(true);
    await act(async () => renderer!.root.findByType('Image').props.onLoad());
    expect(button('acceptCompletion').props.disabled).toBe(false);
    await press('acceptCompletion');
    await settleTasks();
    expect(fixture.rpc.mock.calls.filter(([name]) => name === 'accept_completion')).toHaveLength(1);
  });

  it('ignores a previous version manifest that resolves after corrected work is submitted', async () => {
    const pending = deferred<{ data: ReturnType<typeof manifest>; error: null }>();
    fixture.rpc.mockReturnValueOnce(pending.promise);
    await render();
    await press('viewCompletionProof');
    await update('completion_submitted', 12);
    await act(async () => pending.resolve({ data: manifest(1), error: null }));
    await settleTasks();
    expect(fixture.media).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType('Image')).toHaveLength(0);
    expect(button('acceptCompletion').props.disabled).toBe(true);
  });

  it('ignores a signed URL that resolves after the job version changes', async () => {
    const pending = deferred<{ data: { signedUrl: string }; error: null }>();
    fixture.media.mockReturnValueOnce(pending.promise);
    await render();
    await press('viewCompletionProof');
    await update('completion_submitted', 12);
    await act(async () =>
      pending.resolve({ data: { signedUrl: 'https://example.invalid/old.jpg' }, error: null }),
    );
    await settleTasks();
    expect(renderer!.root.findAllByType('Image')).toHaveLength(0);
    expect(button('acceptCompletion').props.disabled).toBe(true);
  });

  it('does not request media for a manifest that arrives after unmount', async () => {
    const pending = deferred<{ data: ReturnType<typeof manifest>; error: null }>();
    fixture.rpc.mockReturnValueOnce(pending.promise);
    await render();
    await press('viewCompletionProof');
    await act(async () => renderer!.unmount());
    renderer = undefined;
    await act(async () => pending.resolve({ data: manifest(1), error: null }));
    await settleTasks();
    expect(fixture.media).not.toHaveBeenCalled();
  });

  it('rechecks evidence after authentication if the job changes during acceptance', async () => {
    await render();
    await press('viewCompletionProof');
    await settleTasks();
    await act(async () => renderer!.root.findByType('Image').props.onLoad());
    const pending = deferred<{ data: { user: { id: string } } }>();
    fixture.auth.mockReturnValueOnce(pending.promise);
    await press('acceptCompletion');
    await update('completion_submitted', 12);
    await act(async () => pending.resolve({ data: { user: { id: job.customer_id } } }));
    await settleTasks();
    expect(fixture.rpc.mock.calls.filter(([name]) => name === 'accept_completion')).toHaveLength(0);
  });

  it('preserves rejection without requiring the customer to accept or view evidence', async () => {
    await render();
    await press('rejectAndOpenDispute');
    await settleTasks();
    expect(fixture.rpc).toHaveBeenCalledWith(
      'accept_completion',
      expect.objectContaining({
        p_job_id: job.id,
        p_accept: false,
      }),
    );
  });

  it.each([
    null,
    {},
    { ...manifest(1), proofs: [] },
    { ...manifest(1), completionAttemptId: null },
    { ...manifest(1), attemptNumber: 0 },
    { ...manifest(1), proofs: manifest(2).proofs },
  ])('does not accept an unknown, empty or mismatched manifest (%j)', async (data) => {
    fixture.rpc.mockResolvedValue({ data, error: null });
    await render();
    await press('viewCompletionProof');
    await settleTasks();
    expect(button('acceptCompletion').props.disabled).toBe(true);
    await press('acceptCompletion');
    await settleTasks();
    expect(fixture.rpc.mock.calls.filter(([name]) => name === 'accept_completion')).toHaveLength(0);
  });
});
