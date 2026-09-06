import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ status: 'scheduled', push: vi.fn() }));
vi.mock('expo-router', () => ({ router: { push: state.push } }));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Synthetic repair',
        status: state.status,
        version: 1,
        created_at: '2026-09-06T23:30:00Z',
        timing_mode: 'asap',
      },
    ],
    isPending: false,
    isError: false,
  }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', t: (key: string) => key }),
}));
vi.mock('@/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  EmptyState: 'EmptyState',
  InteractivePressable: 'Pressable',
  LoadingBlock: 'LoadingBlock',
  Notice: 'Notice',
  Pill: 'Pill',
  Surface: 'Surface',
  customerStyles: {},
}));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
import Requests from '../app/requests';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  state.push.mockReset();
});
describe('customer request destinations', () => {
  it.each(['scheduled', 'in_progress', 'completion_submitted', 'completed'])(
    'opens the owning job for a %s request',
    async (status) => {
      state.status = status;
      await act(() => {
        renderer = create(<Requests />);
      });
      await act(() => renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
      expect(state.push).toHaveBeenCalledWith({
        pathname: '/jobs',
        params: {
          requestId: '11111111-1111-4111-8111-111111111111',
        },
      });
    },
  );
  it('keeps private comparison attached to its request', async () => {
    state.status = 'receiving_offers';
    await act(() => {
      renderer = create(<Requests />);
    });
    await act(() => renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
    expect(state.push).toHaveBeenCalledWith({
      pathname: '/offers',
      params: {
        requestId: '11111111-1111-4111-8111-111111111111',
      },
    });
  });
});
