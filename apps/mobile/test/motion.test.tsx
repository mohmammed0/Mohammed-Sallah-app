import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Subscription = { event: string; listener: (value?: unknown) => void; remove: () => void };
type Animation = { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
type Timing = { config: Record<string, unknown>; animation: Animation };

const native = vi.hoisted(() => ({
  locale: 'ar' as 'ar' | 'en' | 'ur' | 'hi',
  platform: 'android',
  appState: 'active' as string | null,
  resolvePreference: undefined as ((value: boolean) => void) | undefined,
  rejectPreference: undefined as (() => void) | undefined,
  subscriptions: [] as Subscription[],
  timings: [] as Timing[],
  loops: [] as Animation[],
}));

vi.mock('react-native', () => {
  class Interpolation {
    constructor(
      public source: unknown,
      public config: unknown,
    ) {}
    interpolate(config: unknown): Interpolation {
      return new Interpolation(this, config);
    }
  }
  function subscribe(event: string, listener: Subscription['listener']) {
    const subscription = {
      event,
      listener,
      remove: vi.fn(() => {
        native.subscriptions = native.subscriptions.filter((entry) => entry !== subscription);
      }),
    };
    native.subscriptions.push(subscription);
    return subscription;
  }
  return {
    AccessibilityInfo: {
      addEventListener: subscribe,
      isReduceMotionEnabled: () =>
        new Promise<boolean>((resolve, reject) => {
          native.resolvePreference = resolve;
          native.rejectPreference = () => reject(new Error('unavailable'));
        }),
    },
    AppState: {
      get currentState() {
        return native.appState;
      },
      addEventListener: subscribe,
    },
    Platform: {
      get OS() {
        return native.platform;
      },
    },
    Animated: {
      Value: class {
        constructor(public value: number) {}
        setValue(value: number) {
          this.value = value;
        }
        stopAnimation = vi.fn();
        interpolate(config: unknown) {
          return new Interpolation(this, config);
        }
      },
      timing: (_value: unknown, config: Record<string, unknown>) => {
        const animation = { start: vi.fn(), stop: vi.fn() };
        native.timings.push({ config, animation });
        return animation;
      },
      loop: () => {
        const animation = { start: vi.fn(), stop: vi.fn() };
        native.loops.push(animation);
        return animation;
      },
      View: 'AnimatedView',
    },
    Easing: { linear: vi.fn(), cubic: vi.fn(), out: (value: unknown) => value },
    StyleSheet: { create: (value: unknown) => value },
    Text: 'Text',
    View: 'View',
  };
});
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: native.locale }),
}));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));

import { MotionReveal, StatusMotion } from '../src/design-system/motion';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function flatten(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function emit(event: string, value?: unknown) {
  await act(() => {
    for (const subscription of native.subscriptions.filter((entry) => entry.event === event)) {
      subscription.listener(value);
    }
  });
}

describe('customer status motion lifecycle', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    native.locale = 'ar';
    native.platform = 'android';
    native.appState = 'active';
    native.resolvePreference = undefined;
    native.rejectPreference = undefined;
    native.subscriptions = [];
    native.timings = [];
    native.loops = [];
  });
  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
  });

  async function mountStatus(active = true) {
    await act(() => {
      renderer = create(
        <StatusMotion
          variant="waiting"
          label="Waiting for offers"
          description="Details"
          active={active}
        />,
      );
    });
  }

  it('keeps a readable static graphic until the preference is known, then starts one native loop', async () => {
    await mountStatus();
    expect(native.timings).toHaveLength(0);
    expect(native.loops).toHaveLength(0);
    const graphic = renderer!.root.findByProps({ testID: 'status-motion-graphic' });
    expect(graphic.props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    const label = renderer!.root.findByProps({ testID: 'status-motion-label' });
    expect(label.props.children).toBe('Waiting for offers');
    expect(graphic.findAllByProps({ testID: 'status-motion-label' })).toHaveLength(0);
    expect(label.props.allowFontScaling).toBe(true);
    expect(label.props.numberOfLines).toBeUndefined();
    await act(() => native.resolvePreference?.(false));
    expect(native.loops).toHaveLength(1);
    expect(native.loops[0]!.start).toHaveBeenCalledOnce();
    expect(native.timings).toHaveLength(1);
    expect(native.timings[0]!.config).toMatchObject({
      useNativeDriver: true,
      isInteraction: false,
    });
    expect(native.timings[0]!.config.delay).toBeUndefined();
  });

  it('lets a newer accessibility event win over the initial asynchronous response', async () => {
    await mountStatus();
    await emit('reduceMotionChanged', true);
    await act(() => native.resolvePreference?.(false));
    expect(native.loops).toHaveLength(0);
    await emit('reduceMotionChanged', false);
    expect(native.loops).toHaveLength(1);
    await emit('reduceMotionChanged', true);
    expect(native.loops[0]!.stop).toHaveBeenCalledOnce();
    expect(renderer!.root.findByProps({ testID: 'status-motion-label' }).props.children).toBe(
      'Waiting for offers',
    );
  });

  it('stays static if preference lookup fails or the initial app state is unknown', async () => {
    native.appState = null;
    await mountStatus();
    await act(() => native.rejectPreference?.());
    expect(native.loops).toHaveLength(0);
    await emit('reduceMotionChanged', false);
    expect(native.loops).toHaveLength(0);
    await emit('change', 'active');
    expect(native.loops).toHaveLength(1);
  });

  it('pauses for background and Android blur, and only resumes when both are active', async () => {
    await mountStatus();
    await act(() => native.resolvePreference?.(false));
    await emit('change', 'background');
    expect(native.loops[0]!.stop).toHaveBeenCalledOnce();
    await emit('blur');
    await emit('change', 'active');
    expect(native.loops).toHaveLength(1);
    await emit('focus');
    expect(native.loops).toHaveLength(2);
    await emit('blur');
    expect(native.loops[1]!.stop).toHaveBeenCalledOnce();
  });

  it.each(['ios', 'web'])(
    'uses caller focus without subscribing to Android-only events on %s',
    async (platform) => {
      native.platform = platform;
      await mountStatus();
      expect(native.subscriptions.map((entry) => entry.event).sort()).toEqual([
        'change',
        'reduceMotionChanged',
      ]);
      await act(() => native.resolvePreference?.(true));
      expect(native.loops).toHaveLength(0);
    },
  );

  it('honors caller focus and stops the previous loop when the status becomes success', async () => {
    await mountStatus(false);
    await act(() => native.resolvePreference?.(false));
    expect(native.loops).toHaveLength(0);
    await act(() => renderer!.update(<StatusMotion variant="sending" label="Sending" />));
    expect(native.loops).toHaveLength(1);
    await act(() => renderer!.update(<StatusMotion variant="success" label="Request sent" />));
    expect(native.loops[0]!.stop).toHaveBeenCalledOnce();
    expect(native.loops).toHaveLength(1);
    expect(native.timings).toHaveLength(2);
    expect(native.timings[1]!.animation.start).toHaveBeenCalledOnce();
    expect(native.timings[1]!.config).toMatchObject({
      useNativeDriver: true,
      isInteraction: false,
    });
    expect(renderer!.root.findByProps({ testID: 'status-motion-icon' }).props.name).toBe('check');
    expect(renderer!.root.findAllByProps({ testID: 'status-motion-dots' })).toHaveLength(0);
    await act(() =>
      renderer!.update(<StatusMotion variant="success" label="Request sent" active={false} />),
    );
    expect(native.timings[1]!.animation.stop).toHaveBeenCalledOnce();
  });

  it('settles a success only once, even after refocus, foreground return or preference toggles', async () => {
    await act(() => {
      renderer = create(<StatusMotion variant="success" label="Request sent" />);
    });
    expect(native.timings).toHaveLength(0);
    // The initial preference result can permit the first settle while still active.
    await act(() => native.resolvePreference?.(false));
    expect(native.timings).toHaveLength(1);
    await emit('change', 'background');
    await emit('change', 'active');
    await emit('blur');
    await emit('focus');
    await emit('reduceMotionChanged', true);
    await emit('reduceMotionChanged', false);
    await act(() =>
      renderer!.update(<StatusMotion variant="success" label="Request sent" active={false} />),
    );
    await act(() => renderer!.update(<StatusMotion variant="success" label="Request sent" />));
    expect(native.timings).toHaveLength(1);
    // A real transition out of and back into success is a new confirmation.
    await act(() => renderer!.update(<StatusMotion variant="waiting" label="Waiting" />));
    await act(() => renderer!.update(<StatusMotion variant="success" label="Service complete" />));
    expect(native.timings).toHaveLength(3);
    expect(native.loops).toHaveLength(1);
    expect(native.timings[2]!.animation.start).toHaveBeenCalledOnce();
  });

  it.each(['unfocused', 'background', 'reduced'] as const)(
    'does not replay a success first observed while %s',
    async (condition) => {
      if (condition === 'background') native.appState = 'background';
      await act(() => {
        renderer = create(
          <StatusMotion
            variant="success"
            label="Request sent"
            active={condition !== 'unfocused'}
          />,
        );
      });
      await act(() => native.resolvePreference?.(condition === 'reduced'));
      expect(native.timings).toHaveLength(0);
      await act(() => renderer!.update(<StatusMotion variant="success" label="Request sent" />));
      await emit('change', 'active');
      await emit('reduceMotionChanged', false);
      expect(native.timings).toHaveLength(0);
      expect(renderer!.root.findByProps({ testID: 'status-motion-icon' }).props.name).toBe('check');
    },
  );

  it('exposes status changes as a visible polite heading while decoration stays hidden', async () => {
    await mountStatus();
    for (const label of ['Waiting for offers', 'Request sent']) {
      if (label === 'Request sent') {
        await act(() => renderer!.update(<StatusMotion variant="success" label={label} />));
      }
      const heading = renderer!.root.findByProps({ testID: 'status-motion-label' });
      expect(heading.props).toMatchObject({
        children: label,
        accessible: true,
        accessibilityRole: 'header',
        accessibilityLiveRegion: 'polite',
        accessibilityLabel: label,
      });
      const graphic = renderer!.root.findByProps({ testID: 'status-motion-graphic' });
      expect(graphic.findAllByProps({ accessibilityLiveRegion: 'polite' })).toHaveLength(0);
      expect(graphic.props.importantForAccessibility).toBe('no-hide-descendants');
    }
    expect(native.timings).toHaveLength(0);
  });

  it('removes every listener and stops motion on unmount, ignoring a late initial response', async () => {
    await mountStatus();
    const subscriptions = [...native.subscriptions];
    expect(subscriptions).toHaveLength(4);
    await emit('reduceMotionChanged', false);
    await act(() => renderer!.unmount());
    renderer = undefined;
    expect(native.loops[0]!.stop).toHaveBeenCalledOnce();
    expect(native.subscriptions).toHaveLength(0);
    for (const subscription of subscriptions) expect(subscription.remove).toHaveBeenCalledOnce();
    await act(() => native.resolvePreference?.(false));
    expect(native.loops).toHaveLength(1);
  });

  it.each([
    ['ar', 'right', 'rtl'],
    ['en', 'left', 'ltr'],
    ['ur', 'right', 'rtl'],
    ['hi', 'left', 'ltr'],
  ] as const)(
    'keeps inline %s text and decoration on the correct physical sides',
    async (locale, edge, writingDirection) => {
      native.locale = locale;
      await act(() => {
        renderer = create(
          <StatusMotion variant="working" label="Localized label" layout="inline" />,
        );
      });
      const row = flatten(renderer!.root.findByProps({ testID: 'status-motion' }).props.style);
      const physicalStart =
        (row.flexDirection === 'row-reverse') !== (row.direction === 'rtl') ? 'right' : 'left';
      expect(physicalStart).toBe(edge);
      const text = renderer!.root.findByProps({ testID: 'status-motion-label' });
      expect(flatten(text.props.style)).toMatchObject({
        direction: 'ltr',
        textAlign: edge,
        writingDirection,
      });
      expect(text.props.numberOfLines).toBeUndefined();
    },
  );

  it('reveals only a new keyed state, without blinking when preference or focus resolves', async () => {
    await act(() => {
      renderer = create(
        <MotionReveal transitionKey="details" testID="reveal">
          <span>Content</span>
        </MotionReveal>,
      );
    });
    const initialStyle = flatten(renderer!.root.findByType('AnimatedView').props.style);
    expect(initialStyle.opacity).toMatchObject({ value: 1 });
    await act(() => native.resolvePreference?.(false));
    expect(native.timings).toHaveLength(0);
    await act(() =>
      renderer!.update(
        <MotionReveal transitionKey="review" testID="reveal">
          <span>Review</span>
        </MotionReveal>,
      ),
    );
    expect(native.timings).toHaveLength(1);
    expect(native.timings[0]!.animation.start).toHaveBeenCalledOnce();
    expect(native.timings[0]!.config).toMatchObject({
      toValue: 1,
      useNativeDriver: true,
      isInteraction: false,
    });
    expect(flatten(renderer!.root.findByType('AnimatedView').props.style).transform).toEqual([
      {
        translateY: {
          source: expect.anything(),
          config: { inputRange: [0, 1], outputRange: [8, 0] },
        },
      },
    ]);
    await act(() =>
      renderer!.update(
        <MotionReveal transitionKey="sent" active={false}>
          <span>Sent</span>
        </MotionReveal>,
      ),
    );
    expect(native.timings[0]!.animation.stop).toHaveBeenCalledOnce();
    await act(() =>
      renderer!.update(
        <MotionReveal transitionKey="sent">
          <span>Sent</span>
        </MotionReveal>,
      ),
    );
    expect(native.timings).toHaveLength(1);
    await act(() =>
      renderer!.update(
        <MotionReveal transitionKey="offers">
          <span>Offers</span>
        </MotionReveal>,
      ),
    );
    expect(native.timings).toHaveLength(2);
    await act(() => renderer!.unmount());
    renderer = undefined;
    expect(native.timings[1]!.animation.stop).toHaveBeenCalledOnce();
  });
});
