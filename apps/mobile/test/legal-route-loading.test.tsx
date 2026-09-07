import { createElement, type PropsWithChildren } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  segments: ['auth'] as string[],
  session: { user: { id: 'customer-a' } } as { user: { id: string } } | null,
  context: { authenticated: true, allowed: true, roles: ['customer'], activeRole: 'customer' },
  legal: {
    context: undefined as { status: 'accepted' | 'required' } | undefined,
    loading: true,
    error: false,
    canEnter: false,
  },
}));
vi.mock('react-native', () => ({ Text: 'Text' }));
vi.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
vi.mock('expo-router', () => ({
  router: { replace: state.replace },
  useSegments: () => state.segments,
  Stack: Object.assign(({ children }: PropsWithChildren) => createElement('Stack', {}, children), {
    Screen: 'StackScreen',
    Protected: ({ children, guard }: PropsWithChildren<{ guard: boolean }>) =>
      guard ? children : null,
  }),
}));
vi.mock('@/providers/query-provider', () => ({ AppQueryProvider: 'AppQueryProvider' }));
vi.mock('@/providers/locale-provider', () => ({
  LocaleProvider: 'LocaleProvider',
  useLocale: () => ({ t: (key: string) => key }),
}));
vi.mock('@/providers/session-provider', () => ({
  SessionProvider: 'SessionProvider',
  useSessionContext: () => ({
    loading: false,
    session: state.session,
    context: state.context,
    startupError: null,
    refresh: vi.fn(),
    clearLocalSession: vi.fn(),
  }),
}));
vi.mock('@/components/ui', () => ({ Screen: 'Screen', styles: {} }));
vi.mock('@/components/connectivity-banner', () => ({ ConnectivityBanner: 'ConnectivityBanner' }));
vi.mock('@/components/app-error-boundary', () => ({
  MobileAppErrorBoundary: 'MobileAppErrorBoundary',
}));
vi.mock('@/features/auth/startup-recovery-screen', () => ({
  StartupRecoveryScreen: 'StartupRecoveryScreen',
}));
vi.mock('@/features/auth/route-policy', async () => import('../src/features/auth/route-policy'));
vi.mock('@/features/location/location-provider', () => ({
  CustomerLocationProvider: 'CustomerLocationProvider',
}));
vi.mock('@/features/media/secure-upload-recovery', () => ({
  SecureUploadRecoveryCoordinator: 'SecureUploadRecoveryCoordinator',
}));
vi.mock('@/features/notifications/notification-coordinator', () => ({
  NotificationCoordinator: 'NotificationCoordinator',
}));
vi.mock('@/features/legal/legal-consent-provider', () => ({
  LegalConsentProvider: 'LegalConsentProvider',
  useLegalConsent: () => state.legal,
}));
vi.mock('@/design-system/navigation-header', () => ({ NavigationHeader: 'NavigationHeader' }));
vi.mock('@/providers/navigation-direction-provider', () => ({
  NavigationDirectionProvider: 'NavigationDirectionProvider',
}));

import RootLayout from '../app/_layout';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer | undefined;
const open = async () => {
  await act(() => {
    renderer = create(<RootLayout />);
  });
};
const update = async () => {
  await act(() => {
    renderer?.update(<RootLayout />);
  });
};
const hasProductRoutes = () =>
  renderer?.root.findAllByType('StackScreen').some((node) => node.props.name === '(customer)') ??
  false;

beforeEach(() => {
  state.replace.mockReset();
  state.segments = ['auth'];
  state.session = { user: { id: 'customer-a' } };
  state.context.allowed = true;
  state.legal = { context: undefined, loading: true, error: false, canEnter: false };
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
});

describe('session-specific legal context routing', () => {
  it('waits for initial consent and enters the product directly when already accepted', async () => {
    await open();
    expect(state.replace).not.toHaveBeenCalled();
    expect(hasProductRoutes()).toBe(false);
    expect(
      renderer?.root
        .findAllByType('Text')
        .some((node) => node.props.accessibilityRole === 'progressbar'),
    ).toBe(true);
    state.legal = { context: { status: 'accepted' }, loading: false, error: false, canEnter: true };
    await update();
    expect(state.replace.mock.calls).toEqual([['/customer-home']]);
    expect(hasProductRoutes()).toBe(true);
  });

  it('keeps consent mandatory after loading reports required documents', async () => {
    await open();
    state.legal = {
      context: { status: 'required' },
      loading: false,
      error: false,
      canEnter: false,
    };
    await update();
    expect(state.replace).toHaveBeenLastCalledWith('/legal');
    expect(hasProductRoutes()).toBe(false);
  });

  it('fails closed to the legal recovery screen when the context request fails', async () => {
    await open();
    state.legal = { context: undefined, loading: false, error: true, canEnter: false };
    await update();
    expect(state.replace).toHaveBeenLastCalledWith('/legal');
    expect(hasProductRoutes()).toBe(false);
  });

  it('does not unmount an accepted customer during a background consent refresh', async () => {
    state.segments = ['(customer)', 'customer-home'];
    state.legal = { context: { status: 'accepted' }, loading: true, error: false, canEnter: true };
    await open();
    expect(state.replace).not.toHaveBeenCalled();
    expect(hasProductRoutes()).toBe(true);
    expect(renderer?.root.findAllByType('Screen')).toHaveLength(0);
  });

  it.each(['legal', 'account', 'support', 'auth-callback', 'auth-recovery'])(
    'keeps %s available while consent loads',
    async (route) => {
      state.segments = [route];
      await open();
      expect(renderer?.root.findAllByType('Stack')).toHaveLength(1);
      expect(state.replace).not.toHaveBeenCalled();
      expect(hasProductRoutes()).toBe(false);
    },
  );

  it('keeps public entry available without a session', async () => {
    state.session = null;
    state.segments = ['index'];
    await open();
    expect(renderer?.root.findAllByType('Stack')).toHaveLength(1);
    expect(state.replace).not.toHaveBeenCalled();
    expect(hasProductRoutes()).toBe(false);
  });

  it('routes a restricted account to its account screen independently of legal loading', async () => {
    state.context.allowed = false;
    await open();
    expect(state.replace).toHaveBeenLastCalledWith('/account');
    expect(renderer?.root.findAllByType('Stack')).toHaveLength(1);
    expect(hasProductRoutes()).toBe(false);
  });
});
