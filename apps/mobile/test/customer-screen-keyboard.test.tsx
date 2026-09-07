import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeState = vi.hoisted(() => ({ os: 'android', locale: 'ar' }));

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: {
    get OS() {
      return nativeState.os;
    },
  },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: nativeState.locale }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('customer screen keyboard and long-form layout', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    nativeState.os = 'android';
    nativeState.locale = 'ar';
  });

  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
  });

  it.each(['android', 'ios'])(
    'uses the measured window origin below a native header on %s',
    async (os) => {
      nativeState.os = os;
      const { CustomerScreen, Field } = await import('../src/design-system/primitives');
      let windowY = 84;
      const measureInWindow = vi.fn(
        (callback: (x: number, y: number, width: number, height: number) => void) => {
          callback(0, windowY, 432, 800);
        },
      );
      await act(() => {
        renderer = create(
          <CustomerScreen>
            <Field label="Email" value="" />
          </CustomerScreen>,
          {
            createNodeMock: (element) =>
              element.type === 'SafeAreaView' ? { measureInWindow } : null,
          },
        );
      });

      expect(measureInWindow).toHaveBeenCalled();
      expect(renderer?.root.findByType('KeyboardAvoidingView').props.keyboardVerticalOffset).toBe(
        84,
      );

      // A headerless route or resized modal has a different origin: never retain a guessed header height.
      windowY = 0;
      await act(() => {
        renderer?.root
          .findByType('SafeAreaView')
          .props.onLayout({ nativeEvent: { layout: { y: 0 } } });
      });
      expect(renderer?.root.findByType('KeyboardAvoidingView').props.keyboardVerticalOffset).toBe(
        0,
      );
    },
  );

  it('keeps each screen measurement local when another screen is mounted in a modal', async () => {
    const { CustomerScreen } = await import('../src/design-system/primitives');
    await act(() => {
      renderer = create(
        <>
          <CustomerScreen testID="page">Page</CustomerScreen>
          <CustomerScreen testID="modal">Modal</CustomerScreen>
        </>,
        {
          createNodeMock: (element) =>
            element.type === 'SafeAreaView'
              ? {
                  measureInWindow: (
                    callback: (x: number, y: number, width: number, height: number) => void,
                  ) => callback(0, element.props.testID === 'modal' ? 160 : 84, 432, 640),
                }
              : null,
        },
      );
    });
    expect(
      renderer?.root
        .findAllByType('KeyboardAvoidingView')
        .map((view) => view.props.keyboardVerticalOffset),
    ).toEqual([84, 160]);
  });

  it.each(['android', 'web'])(
    'does not measure or enable keyboard avoidance when opted out on %s',
    async (os) => {
      nativeState.os = os;
      const { CustomerScreen } = await import('../src/design-system/primitives');
      const measureInWindow = vi.fn();
      await act(() => {
        renderer = create(<CustomerScreen keyboardAware={false}>Content</CustomerScreen>, {
          createNodeMock: () => ({ measureInWindow }),
        });
      });
      expect(measureInWindow).not.toHaveBeenCalled();
      expect(renderer?.root.findByType('KeyboardAvoidingView').props.enabled).toBe(false);
    },
  );

  it.each(['ar', 'en', 'ur', 'hi'])(
    'retains intrinsic-height scroll content in %s and preserves fixed screens',
    async (locale) => {
      nativeState.locale = locale;
      const { CustomerScreen, Field } = await import('../src/design-system/primitives');
      const form = (scroll: boolean) => (
        <CustomerScreen scroll={scroll}>
          <Field label="Email" value="" />
        </CustomerScreen>
      );
      await act(() => {
        renderer = create(form(true));
      });
      const content = renderer?.root.findByType('ScrollView').findByType('View');
      const style = Object.assign({}, ...content?.props.style);
      // A positive flex shorthand gives Yoga a zero basis and clips overflowing children.
      // Scroll content must retain its intrinsic height while filling short screens.
      expect(style.flex).toBeUndefined();
      expect(style.flexGrow).toBe(1);
      expect(style.flexShrink).toBe(0);
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
      expect(style.direction).toBe(['ar', 'ur'].includes(locale) ? 'rtl' : 'ltr');

      await act(() => {
        renderer?.update(form(false));
      });
      expect(renderer?.root.findAllByType('ScrollView')).toHaveLength(0);
      const fixedStyle = Object.assign({}, ...renderer?.root.findAllByType('View')[0]?.props.style);
      expect(fixedStyle.flex).toBe(1);
    },
  );
});

vi.mock('expo-router/react-navigation', async () => ({
  HeaderShownContext: (await import('react')).createContext(false),
}));
