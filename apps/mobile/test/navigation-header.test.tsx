import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { translate, type SupportedLocale } from '@sallah/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  locale: 'ar' as SupportedLocale,
  insets: { top: 24, bottom: 12, left: 30, right: 4 },
  back: vi.fn(),
}));

vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => state.insets }));
vi.mock('expo-router', () => ({ router: { back: state.back } }));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: state.locale, t: (key: 'back') => translate(state.locale, key) }),
}));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/design-system/primitives', () => ({
  InteractivePressable: 'InteractivePressable',
}));

import { NavigationHeader } from '../src/design-system/navigation-header';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function flatten(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

describe('shared navigation header', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    state.locale = 'ar';
    state.insets = { top: 24, bottom: 12, left: 30, right: 4 };
    state.back.mockClear();
  });
  afterEach(async () => {
    await act(() => renderer?.unmount());
    renderer = undefined;
  });

  it.each([
    ['ar', 'right', 'rtl'],
    ['en', 'left', 'ltr'],
    ['ur', 'right', 'rtl'],
    ['hi', 'left', 'ltr'],
  ] as const)(
    'shows the complete %s route title with a localized back action',
    async (locale, edge, writingDirection) => {
      state.locale = locale;
      const title = translate(locale, 'legalDocuments');
      await act(() => {
        renderer = create(<NavigationHeader title={title} canGoBack />);
      });
      const heading = renderer!.root.findByProps({ testID: 'navigation-title' });
      expect(heading.props.children).toBe(title);
      expect(heading.props.accessibilityLabel).toBe(title);
      expect(heading.props.accessibilityRole).toBe('header');
      expect(flatten(heading.props.style)).toMatchObject({ textAlign: 'center', writingDirection });

      const row = flatten(
        renderer!.root.findByProps({ testID: 'navigation-header-content' }).props.style,
      );
      // Pinned Yoga reverses row/row-reverse when the row's direction is RTL.
      const physicalStart =
        (row.flexDirection === 'row-reverse') !== (row.direction === 'rtl') ? 'right' : 'left';
      expect(physicalStart).toBe(edge);
      const button = renderer!.root.findByProps({ testID: 'navigation-back' });
      expect(button.props.accessibilityLabel).toBe(translate(locale, 'back'));
      await act(() => button.props.onPress());
      expect(state.back).toHaveBeenCalledOnce();
    },
  );

  it('reserves equal back and trailing space even when there is no previous route', async () => {
    await act(() => {
      renderer = create(<NavigationHeader title="Account" canGoBack={false} />);
    });
    expect(renderer!.root.findAllByProps({ testID: 'navigation-back' })).toHaveLength(0);
    const backSlot = flatten(
      renderer!.root.findByProps({ testID: 'navigation-back-slot' }).props.style,
    );
    const spacer = flatten(
      renderer!.root.findByProps({ testID: 'navigation-header-spacer' }).props.style,
    );
    expect(backSlot.width).toBe(48);
    expect(spacer.width).toBe(48);
    expect(backSlot.flexShrink).toBe(0);
    expect(spacer.flexShrink).toBe(0);
    expect(state.back).not.toHaveBeenCalled();
  });

  it('respects physical safe-area insets and leaves long titles free to grow with dynamic text', async () => {
    await act(() => {
      renderer = create(<NavigationHeader title={translate('ar', 'legalDocuments')} canGoBack />);
    });
    const header = flatten(renderer!.root.findByProps({ testID: 'navigation-header' }).props.style);
    expect(header).toMatchObject({
      direction: 'ltr',
      paddingTop: 24,
      paddingLeft: 30,
      paddingRight: 4,
    });
    const title = renderer!.root.findByProps({ testID: 'navigation-title' });
    expect(title.props.allowFontScaling).toBe(true);
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
    expect(flatten(title.props.style).flex).toBe(1);
    for (const id of ['navigation-header', 'navigation-header-content', 'navigation-title']) {
      const style = flatten(renderer!.root.findByProps({ testID: id }).props.style);
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
      expect(style.overflow).not.toBe('hidden');
    }
  });

  it('updates the title, writing direction and insets through warm locale changes', async () => {
    for (const [locale, writingDirection] of [
      ['ar', 'rtl'],
      ['en', 'ltr'],
      ['ur', 'rtl'],
      ['hi', 'ltr'],
      ['ar', 'rtl'],
    ] as const) {
      state.locale = locale;
      state.insets = { top: 32, bottom: 0, left: 4, right: 30 };
      const title = translate(locale, 'account');
      await act(() => {
        const header = <NavigationHeader title={title} canGoBack />;
        if (renderer) renderer.update(header);
        else renderer = create(header);
      });
      const heading = renderer!.root.findByProps({ testID: 'navigation-title' });
      expect(heading.props.children).toBe(title);
      expect(flatten(heading.props.style).writingDirection).toBe(writingDirection);
      expect(
        flatten(renderer!.root.findByProps({ testID: 'navigation-header' }).props.style),
      ).toMatchObject({ paddingTop: 32, paddingLeft: 4, paddingRight: 30 });
    }
  });
});
