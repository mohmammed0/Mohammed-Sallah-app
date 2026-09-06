import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ userId: 'account-a' as string | null }));
vi.mock('@/providers/session-provider', () => ({
  useSessionContext: () => ({ session: session.userId ? { user: { id: session.userId } } : null }),
}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: () => ({ remove: vi.fn() }),
}));
vi.mock(
  '@/features/connectivity/network-state',
  async () => import('../src/features/connectivity/network-state'),
);
import { AppQueryProvider } from '../src/providers/query-provider';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
let activeClient: QueryClient;
let load: (owner: string) => Promise<string>;
const observed: Array<string | undefined> = [];

function PrivateScreen() {
  activeClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const owner = session.userId;
  const query = useQuery({
    queryKey: ['private-records'],
    enabled: Boolean(owner),
    queryFn: () => load(owner!),
  });
  observed.push(query.data);
  return <private-screen value={query.data} draft={draft} onChange={setDraft} />;
}
function App() {
  return (
    <AppQueryProvider>
      <PrivateScreen />
    </AppQueryProvider>
  );
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function open() {
  await act(async () => {
    renderer = create(<App />);
  });
  await settle();
}
async function switchTo(owner: string | null) {
  session.userId = owner;
  observed.length = 0;
  await act(async () => {
    renderer.update(<App />);
  });
  await settle();
}
beforeEach(() => {
  session.userId = 'account-a';
  observed.length = 0;
  load = async (owner) => `${owner}-private-value`;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

describe('authenticated query identity boundary', () => {
  it('never displays a previous account fresh cache to the next account', async () => {
    await open();
    expect(renderer.root.findByType('private-screen').props.value).toBe('account-a-private-value');
    await switchTo('account-b');
    expect(observed).not.toContain('account-a-private-value');
    expect(renderer.root.findByType('private-screen').props.value).toBe('account-b-private-value');
  });
  it('drops private data on logout and starts a fresh cache even when the same account returns', async () => {
    await open();
    const old = activeClient;
    await switchTo(null);
    expect(observed).not.toContain('account-a-private-value');
    expect(old.getQueryData(['private-records'])).toBeUndefined();
    load = async () => 'account-a-new-server-value';
    await switchTo('account-a');
    expect(renderer.root.findByType('private-screen').props.value).toBe(
      'account-a-new-server-value',
    );
  });
  it('isolates a response that arrives after the original account has left', async () => {
    let finish!: (value: string) => void;
    const delayed = new Promise<string>((resolve) => {
      finish = resolve;
    });
    load = (owner) =>
      owner === 'account-a' ? delayed : Promise.resolve('account-b-private-value');
    await open();
    const old = activeClient;
    await switchTo('account-b');
    await act(async () => finish('account-a-delayed-private-value'));
    await settle();
    expect(observed).not.toContain('account-a-delayed-private-value');
    expect(renderer.root.findByType('private-screen').props.value).toBe('account-b-private-value');
    expect(old.getQueryData(['private-records'])).toBeUndefined();
  });
  it('preserves the same account cache and local edits during a context refresh', async () => {
    await open();
    const previous = activeClient;
    await act(async () =>
      renderer.root.findByType('private-screen').props.onChange('unsaved edit'),
    );
    await switchTo('account-a');
    expect(activeClient).toBe(previous);
    expect(renderer.root.findByType('private-screen').props).toMatchObject({
      value: 'account-a-private-value',
      draft: 'unsaved edit',
    });
  });
});
