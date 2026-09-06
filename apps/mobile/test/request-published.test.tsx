import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('expo-router', () => ({ router: { replace: fixture.replace } }));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (style: unknown) => style },
}));
vi.mock('@/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  Surface: 'Surface',
  customerStyles: {},
}));
vi.mock('@/design-system/motion', () => ({ StatusMotion: 'StatusMotion' }));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', t: (key: string) => key }),
}));
import { RequestPublished } from '../src/features/request/request-published';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  fixture.replace.mockReset();
});
describe('published request continuity', () => {
  it('opens the exact acknowledged request instead of dropping the customer into an unrelated list', async () => {
    const requestId = '22222222-2222-4222-8222-222222222222';
    await act(() => {
      renderer = create(<RequestPublished active requestId={requestId} onStartAnother={vi.fn()} />);
    });
    await act(() => renderer.root.findByProps({ label: 'viewRequestOffers' }).props.onPress());
    expect(fixture.replace).toHaveBeenCalledWith({ pathname: '/offers', params: { requestId } });
  });
  it('does not create an unscoped offer destination without an acknowledged ID', async () => {
    await act(() => {
      renderer = create(<RequestPublished active requestId={null} onStartAnother={vi.fn()} />);
    });
    expect(renderer.root.findAllByProps({ label: 'viewRequestOffers' })).toHaveLength(0);
    await act(() => renderer.root.findByProps({ label: 'viewAllRequests' }).props.onPress());
    expect(fixture.replace).toHaveBeenCalledWith('/customer-requests');
  });
});
