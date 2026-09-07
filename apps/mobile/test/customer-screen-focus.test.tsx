import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeState = vi.hoisted(() => ({
  platform: { OS: 'android' },
  visible: false,
  focused: null as null | {
    getBoundingClientRect: () => { top: number; bottom: number; height: number };
  },
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Keyboard: { isVisible: () => nativeState.visible },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: nativeState.platform,
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: 'Text',
  TextInput: { State: { currentlyFocusedInput: () => nativeState.focused } },
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/providers/locale-provider', () => ({ useLocale: () => ({ locale: 'ar' }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('focused input visibility after native keyboard layout', () => {
  let renderer: ReactTestRenderer | undefined;
  let frameId: number;
  let frames: Map<number, FrameRequestCallback>;
  const scrollTo = vi.fn();
  const focused = { getBoundingClientRect: () => ({ top: 1354, bottom: 1491, height: 137 }) };
  let viewport: { top: number; bottom: number; height: number };
  const nativeScroll = {
    contains: (node: unknown) => node === focused,
    getBoundingClientRect: () => viewport,
    scrollTop: 368,
  };

  beforeEach(() => {
    frameId = 0;
    frames = new Map();
    nativeState.visible = false;
    nativeState.platform.OS = 'android';
    nativeState.focused = focused;
    viewport = { top: 210, bottom: 2337, height: 2127 };
    nativeScroll.scrollTop = 368;
    scrollTo.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
  });

  async function mount(keyboardAware = true) {
    const { CustomerScreen } = await import('../src/design-system/primitives');
    await act(() => {
      renderer = create(<CustomerScreen keyboardAware={keyboardAware}>Form</CustomerScreen>, {
        createNodeMock: (element) =>
          element.type === 'ScrollView'
            ? { getNativeScrollRef: () => nativeScroll, scrollTo }
            : element.type === 'SafeAreaView'
              ? { measureInWindow: (callback: (x: number, y: number) => void) => callback(0, 210) }
              : null,
      });
    });
  }

  async function event(name: string) {
    await act(() =>
      renderer?.root.findByType('ScrollView').props[name]?.({ nativeEvent: { layout: viewport } }),
    );
  }

  async function flushFrames() {
    const pending = [...frames.values()];
    frames.clear();
    await act(() => pending.forEach((callback) => callback(0)));
  }

  it.each(['android', 'ios'])(
    'on %s reveals the full 137-unit password after the viewport shrinks, instead of trusting its clipped 74-unit visible bounds',
    async (platform) => {
      nativeState.platform.OS = platform;
      await mount();
      await event('onFocus');
      await flushFrames();
      expect(scrollTo).not.toHaveBeenCalled();

      nativeState.visible = true;
      await event('onKeyboardDidShow');
      // Keyboard show precedes the final KAV/native layout; reconcile against that final viewport.
      viewport = { top: 210, bottom: 1428, height: 1218 };
      await event('onLayout');
      await flushFrames();

      expect(scrollTo).toHaveBeenCalledOnce();
      expect(scrollTo).toHaveBeenCalledWith({ y: 431, animated: false });
    },
  );

  it('keeps browser focus scrolling under browser control', async () => {
    nativeState.platform.OS = 'web';
    await mount();
    nativeState.visible = true;
    viewport = { top: 210, bottom: 1428, height: 1218 };
    await event('onFocus');
    await event('onLayout');
    await event('onKeyboardDidShow');
    await flushFrames();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('uses the current native scroll offset when focus changes with the keyboard already open', async () => {
    await mount();
    nativeState.visible = true;
    viewport = { top: 210, bottom: 1428, height: 1218 };
    await event('onFocus');
    nativeScroll.scrollTop = 400;
    await flushFrames();
    expect(scrollTo).toHaveBeenCalledWith({ y: 463, animated: false });
  });

  it('leaves an already visible field and keyboard opt-out undisturbed', async () => {
    await mount();
    nativeState.visible = true;
    await event('onKeyboardDidShow');
    await flushFrames();
    expect(scrollTo).not.toHaveBeenCalled();
    await act(() => renderer?.unmount());
    renderer = undefined;
    await mount(false);
    viewport = { top: 210, bottom: 1428, height: 1218 };
    await event('onKeyboardDidShow');
    await event('onLayout');
    await flushFrames();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it.each(['another pane', 'keyboard hidden', 'user drag', 'unmount'] as const)(
    'discards queued correction after %s',
    async (reason) => {
      await mount();
      nativeState.visible = true;
      viewport = { top: 210, bottom: 1428, height: 1218 };
      await event('onFocus');
      const pending = [...frames.values()];
      if (reason === 'another pane') nativeState.focused = { ...focused };
      if (reason === 'keyboard hidden') {
        nativeState.visible = false;
        await event('onKeyboardDidHide');
      }
      if (reason === 'user drag') await event('onScrollBeginDrag');
      if (reason === 'unmount') await act(() => renderer?.unmount());
      // Even an already queued callback must recheck its generation and live ownership.
      await act(() => pending.forEach((callback) => callback(0)));
      expect(scrollTo).not.toHaveBeenCalled();
    },
  );
});

vi.mock('expo-router/react-navigation', async () => ({
  HeaderShownContext: (await import('react')).createContext(false),
}));
