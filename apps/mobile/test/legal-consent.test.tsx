import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  rpc: vi.fn(),
  push: vi.fn(),
  locale: 'en',
  userId: 'user-a' as string | null,
}));
const lifecycle = vi.hoisted(() => ({ onChange: (_state: string) => {} }));
vi.mock('react-native', () => ({
  Text: 'Text',
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      lifecycle.onChange = listener;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock('expo-router', () => ({ router: { push: fixture.push, replace: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: fixture.rpc } }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: fixture.locale,
    dir: fixture.locale === 'ar' ? 'rtl' : 'ltr',
    t: (key: string, args?: Record<string, unknown>) =>
      args?.title ? `${key}:${args.title}` : key,
  }),
}));
vi.mock('@/providers/session-provider', () => ({
  useSessionContext: () => ({
    loading: false,
    session: fixture.userId ? { user: { id: fixture.userId } } : null,
    context: { allowed: true, roles: ['customer'], activeRole: 'customer' },
  }),
}));
vi.mock('@/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  InteractivePressable: 'InteractivePressable',
  Notice: 'Notice',
  Surface: 'Surface',
  customerStyles: {},
}));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/features/auth/route-policy', async () => import('../src/features/auth/route-policy'));
vi.mock(
  '@/features/legal/legal-consent-provider',
  async () => import('../src/features/legal/legal-consent-provider'),
);
import {
  LegalConsentProvider,
  useLegalConsent,
} from '../src/features/legal/legal-consent-provider';
import LegalScreen from '../app/legal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const documents = (['privacy', 'terms', 'community'] as const).map((documentType, index) => ({
  id: `11111111-1111-4111-8111-11111111111${index}`,
  documentType,
  version: 'test-1',
  locale: 'en',
  title: `Synthetic ${documentType}`,
  body: 'Synthetic local policy body.',
  contentHash: 'a'.repeat(64),
  requiresAcceptance: true,
  accepted: false,
}));
let renderer: ReactTestRenderer;
let client: QueryClient;
function GateProbe() {
  const legal = useLegalConsent();
  return (
    <gate-probe allowed={legal.canEnter} loading={legal.loading}>
      {legal.canEnter ? <DraftProbe /> : null}
    </gate-probe>
  );
}
function DraftProbe() {
  const [draft, setDraft] = useState('');
  return <draft-input value={draft} onChangeText={setDraft} />;
}
function App() {
  return (
    <QueryClientProvider client={client}>
      <LegalConsentProvider>
        <GateProbe />
        <LegalScreen />
      </LegalConsentProvider>
    </QueryClientProvider>
  );
}
async function open() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => {
    renderer = create(<App />);
  });
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
function button(label: string) {
  return renderer.root.findAllByType('ActionButton').find((node) => node.props.label === label)!;
}
async function selectAll() {
  for (const checkbox of renderer.root.findAllByType('InteractivePressable'))
    await act(async () => checkbox.props.onPress());
}
beforeEach(() => {
  fixture.locale = 'en';
  fixture.userId = 'user-a';
  fixture.rpc.mockReset();
  fixture.push.mockReset();
  fixture.rpc.mockResolvedValue({
    data: { status: 'required', documents, missingRequiredTypes: [] },
    error: null,
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  client?.clear();
});

describe('approved policies and explicit acceptance', () => {
  it('blocks entry until every required checkbox is selected and the server confirms acceptance', async () => {
    await open();
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(false);
    expect(button('legalAcceptAndContinue').props.disabled).toBe(true);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(
      renderer.root
        .findAllByType('InteractivePressable')
        .every((node) => node.props.accessibilityState.checked === false),
    ).toBe(true);
    await selectAll();
    expect(button('legalAcceptAndContinue').props.disabled).toBe(false);
    fixture.rpc.mockResolvedValueOnce({
      data: {
        status: 'accepted',
        documents: documents.map((document) => ({ ...document, accepted: true })),
        missingRequiredTypes: [],
      },
      error: null,
    });
    await act(async () => button('legalAcceptAndContinue').props.onPress());
    await settle();
    expect(fixture.rpc).toHaveBeenLastCalledWith('accept_current_legal_documents', {
      p_locale: 'en',
      p_documents: documents.map(({ id, contentHash }) => ({ id, contentHash })),
      p_idempotency_key: expect.any(String),
    });
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(true);
  });
  it('fails closed on unavailable policies and preserves retry, support and account controls', async () => {
    fixture.rpc.mockResolvedValueOnce({
      data: {
        status: 'unavailable',
        documents: [],
        missingRequiredTypes: ['privacy', 'terms', 'community'],
      },
      error: null,
    });
    await open();
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(false);
    expect(button('legalAcceptAndContinue')).toBeUndefined();
    await act(async () => button('support').props.onPress());
    expect(fixture.push).toHaveBeenCalledWith('/support');
    expect(button('account')).toBeDefined();
    await act(async () => button('retry').props.onPress());
    await settle();
    expect(button('legalAcceptAndContinue')).toBeDefined();
  });
  it('clears selections after stale acceptance fails and never carries permission to another account', async () => {
    await open();
    await selectAll();
    fixture.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001' } });
    await act(async () => button('legalAcceptAndContinue').props.onPress());
    await settle();
    expect(button('legalAcceptAndContinue').props.disabled).toBe(true);
    fixture.rpc.mockResolvedValueOnce({
      data: {
        status: 'accepted',
        documents: documents.map((document) => ({ ...document, accepted: true })),
        missingRequiredTypes: [],
      },
      error: null,
    });
    await act(async () => button('retry').props.onPress());
    await settle();
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(true);
    fixture.userId = 'user-b';
    await act(async () => renderer.update(<App />));
    await settle();
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(false);
  });
  it('allows an anonymous reader without acceptance controls', async () => {
    fixture.userId = null;
    await open();
    expect(renderer.root.findAllByType('InteractivePressable')).toHaveLength(0);
    expect(button('signIn')).toBeDefined();
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });
  it('resets unsubmitted agreement when the account changes with the same policy set', async () => {
    await open();
    await selectAll();
    expect(button('legalAcceptAndContinue').props.disabled).toBe(false);
    fixture.userId = 'user-b';
    await act(async () => renderer.update(<App />));
    await settle();
    expect(button('legalAcceptAndContinue').props.disabled).toBe(true);
    expect(
      renderer.root
        .findAllByType('InteractivePressable')
        .every((node) => !node.props.accessibilityState.checked),
    ).toBe(true);
    expect(fixture.rpc.mock.calls.some(([name]) => name === 'accept_current_legal_documents')).toBe(
      false,
    );
  });
  it('rechecks policies on foreground and blocks entry when the current set changes', async () => {
    fixture.rpc.mockResolvedValueOnce({
      data: {
        status: 'accepted',
        documents: documents.map((document) => ({ ...document, accepted: true })),
        missingRequiredTypes: [],
      },
      error: null,
    });
    await open();
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(true);
    await act(async () => lifecycle.onChange('active'));
    await settle();
    expect(fixture.rpc).toHaveBeenCalledTimes(2);
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(false);
    expect(button('legalAcceptAndContinue').props.disabled).toBe(true);
  });
  it('preserves an accepted product draft while foreground refresh is pending and still accepted', async () => {
    const accepted = {
      data: {
        status: 'accepted',
        documents: documents.map((document) => ({ ...document, accepted: true })),
        missingRequiredTypes: [],
      },
      error: null,
    };
    fixture.rpc.mockResolvedValueOnce(accepted);
    await open();
    await act(async () =>
      renderer.root.findByType('draft-input').props.onChangeText('Unsubmitted local draft'),
    );
    let finishRefresh!: (result: typeof accepted) => void;
    fixture.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    await act(async () => lifecycle.onChange('active'));
    await settle();
    expect(renderer.root.findByType('gate-probe').props.loading).toBe(true);
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(true);
    expect(renderer.root.findByType('draft-input').props.value).toBe('Unsubmitted local draft');
    await act(async () => finishRefresh(accepted));
    await settle();
    expect(renderer.root.findByType('gate-probe').props.loading).toBe(false);
    expect(renderer.root.findByType('gate-probe').props.allowed).toBe(true);
    expect(renderer.root.findByType('draft-input').props.value).toBe('Unsubmitted local draft');
  });
  it.each(['unavailable', 'error'])(
    'blocks an accepted product after foreground refresh returns %s',
    async (outcome) => {
      fixture.rpc.mockResolvedValueOnce({
        data: {
          status: 'accepted',
          documents: documents.map((document) => ({ ...document, accepted: true })),
          missingRequiredTypes: [],
        },
        error: null,
      });
      await open();
      fixture.rpc.mockResolvedValueOnce(
        outcome === 'error'
          ? { data: null, error: { code: 'P0001' } }
          : {
              data: {
                status: 'unavailable',
                documents: [],
                missingRequiredTypes: ['privacy', 'terms', 'community'],
              },
              error: null,
            },
      );
      await act(async () => lifecycle.onChange('active'));
      await settle();
      expect(renderer.root.findByType('gate-probe').props.allowed).toBe(false);
      expect(renderer.root.findAllByType('draft-input')).toHaveLength(0);
      expect(button('account')).toBeDefined();
      expect(button('support')).toBeDefined();
    },
  );
});
