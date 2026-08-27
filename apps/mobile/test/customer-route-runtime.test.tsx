import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({
  context: {
    authenticated: true,
    allowed: true,
    roles: ['customer', 'provider'],
    activeRole: 'customer',
    providerVerificationStatus: 'verified',
  },
}));

vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => createElement('Redirect', { href }),
}));

vi.mock('@/providers/session-provider', () => ({
  useSessionContext: () => ({ context: sessionState.context }),
}));

vi.mock('@/features/auth/route-policy', async () => import('../src/features/auth/route-policy'));

vi.mock('@/features/customer/customer-home', () => ({
  CustomerHome: () => createElement('CustomerHomeScreen', { testID: 'customer-home-screen' }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('authenticated customer route ownership', () => {
  beforeEach(() => {
    sessionState.context = {
      authenticated: true,
      allowed: true,
      roles: ['customer', 'provider'],
      activeRole: 'customer',
      providerVerificationStatus: 'verified',
    };
  });

  it('mounts the customer product screen instead of redirecting the active tab to itself', async () => {
    const CustomerHomeRoute = (await import('../app/(customer)/customer-home')).default;
    let renderer: ReturnType<typeof create> | undefined;

    await act(() => {
      renderer = create(<CustomerHomeRoute />);
    });

    expect(renderer?.root.findAllByType('CustomerHomeScreen')).toHaveLength(1);
    expect(renderer?.root.findAllByType('Redirect')).toHaveLength(0);
  });

  it('keeps the legacy home path as a single policy redirect for a dual-role customer', async () => {
    const HomeRoute = (await import('../app/home')).default;
    let renderer: ReturnType<typeof create> | undefined;

    await act(() => {
      renderer = create(<HomeRoute />);
    });

    const redirects = renderer?.root.findAllByType('Redirect') ?? [];
    expect(redirects).toHaveLength(1);
    expect(redirects[0]?.props.href).toBe('/customer-home');
  });
});
