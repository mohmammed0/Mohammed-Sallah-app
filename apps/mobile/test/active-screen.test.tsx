import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  focus: null as (() => () => void) | null,
  stateChange: null as ((state: string) => void) | null,
  remove: vi.fn(),
  appState: 'active',
  pendingState: null as string | null,
  windowEvents: {} as Record<string, () => void>,
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: typeof fixture.focus) => {
    fixture.focus = callback;
  },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    get currentState() {
      return fixture.appState;
    },
    addEventListener: (event: string, listener: (state: string) => void) => {
      if (event === 'change') {
        fixture.stateChange = listener;
        if (fixture.pendingState) fixture.appState = fixture.pendingState;
      } else fixture.windowEvents[event] = () => listener('');
      return { remove: fixture.remove };
    },
  },
}));
import { useActiveScreen } from '../src/features/connectivity/use-active-screen';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
let active = false;
beforeEach(() => {
  fixture.appState = 'active';
  fixture.pendingState = null;
  fixture.windowEvents = {};
});
function Probe() {
  active = useActiveScreen();
  return null;
}
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  vi.clearAllMocks();
});
describe('screen refresh and motion activity', () => {
  it('requires foreground and route focus, and stops when either is lost', async () => {
    await act(() => {
      renderer = create(<Probe />);
    });
    expect(active).toBe(false);
    let blur: (() => void) | undefined;
    await act(() => {
      blur = fixture.focus?.();
    });
    expect(active).toBe(true);
    await act(() => fixture.stateChange?.('background'));
    expect(active).toBe(false);
    await act(() => fixture.stateChange?.('active'));
    expect(active).toBe(true);
    await act(() => blur?.());
    expect(active).toBe(false);
  });
  it('removes its app-state listener when unmounted', async () => {
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => renderer.unmount());
    expect(fixture.remove).toHaveBeenCalledTimes(3);
  });
  it('observes a state change between the initial render and listener registration', async () => {
    fixture.pendingState = 'background';
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => {
      fixture.focus?.();
    });
    expect(active).toBe(false);
  });
  it('suspends polling when the Android notification shade blurs an active app', async () => {
    await act(() => {
      renderer = create(<Probe />);
    });
    await act(() => {
      fixture.focus?.();
    });
    expect(active).toBe(true);
    await act(() => fixture.windowEvents.blur?.());
    expect(active).toBe(false);
    await act(() => fixture.windowEvents.focus?.());
    expect(active).toBe(true);
  });
});
