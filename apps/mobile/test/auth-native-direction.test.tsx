import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { direction, translate, type SupportedLocale } from '@sallah/i18n';

const localeState = vi.hoisted(() => ({ locale: 'ar' as SupportedLocale }));

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/primitives', async () => import('../src/design-system/primitives'));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `sallah://${path}` }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: localeState.locale,
    dir: direction(localeState.locale),
    t: (key: Parameters<typeof translate>[1]) => translate(localeState.locale, key),
  }),
}));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: localeState.locale }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function flatten(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function yogaDirection(node: ReactTestInstance | null): 'ltr' | 'rtl' {
  if (!node) return 'ltr';
  const own = typeof node.type === 'string' ? flatten(node.props.style).direction : undefined;
  return own === 'ltr' || own === 'rtl' ? own : yogaDirection(node.parent);
}

// Boundary characterization of pinned RN 0.86.3, not a native rendering test:
// Yoga algorithm/FlexDirection.h swaps row/row-reverse under RTL. Android
// TextLayoutManager.kt resolves left/right relative to the Yoga paragraph.
function leadingSide(row: ReactTestInstance): 'left' | 'right' {
  const reversed = flatten(row.props.style).flexDirection === 'row-reverse';
  return reversed !== (yogaDirection(row) === 'rtl') ? 'right' : 'left';
}

function textSide(text: ReactTestInstance): 'left' | 'right' | 'center' {
  const alignment = flatten(text.props.style).textAlign;
  if (alignment === 'center') return 'center';
  const opposite = alignment === 'right';
  return opposite !== (yogaDirection(text) === 'rtl') ? 'right' : 'left';
}

const sequence = [
  ['ar', 'right'],
  ['en', 'left'],
  ['ur', 'right'],
  ['hi', 'left'],
  ['ar', 'right'],
] as const;

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
});

async function renderLocale(locale: SupportedLocale) {
  localeState.locale = locale;
  const Auth = (await import('../app/auth')).default;
  await act(() => {
    if (renderer) renderer.update(<Auth />);
    else renderer = create(<Auth />);
  });
  return renderer!.root;
}

describe('auth native direction boundaries', () => {
  it('keeps field labels at the locale edge after warm language changes', async () => {
    for (const [locale, edge] of sequence) {
      const root = await renderLocale(locale);
      for (const key of ['email', 'password'] as const) {
        const label = root
          .findAllByType('Text')
          .find((node) => node.props.children === translate(locale, key));
        expect(label, `${locale} ${key} label`).toBeDefined();
        expect(textSide(label!), `${locale} ${key} physical alignment`).toBe(edge);
      }
    }
  });

  it('keeps the first auth tab and field icons at the locale start edge', async () => {
    for (const [locale, edge] of sequence) {
      const root = await renderLocale(locale);
      const mode = root.findByProps({ accessibilityRole: 'tablist' });
      expect(leadingSide(mode), `${locale} sign-in tab`).toBe(edge);
      for (const field of root.findAllByType('TextInput')) {
        expect(leadingSide(field.parent!), `${locale} field icon`).toBe(edge);
      }
    }
  });

  it('preserves explicit LTR email entry and entered values through warm locale changes', async () => {
    const initial = await renderLocale('ar');
    await act(() => {
      initial
        .findAllByType('TextInput')
        .find((node) => node.props.keyboardType === 'email-address')!
        .props.onChangeText('customer@example.com');
      initial
        .findAllByType('TextInput')
        .find((node) => node.props.secureTextEntry)!
        .props.onChangeText('keep-this-password');
    });
    for (const [locale] of sequence) {
      const root = await renderLocale(locale);
      const email = root
        .findAllByType('TextInput')
        .find((node) => node.props.keyboardType === 'email-address')!;
      expect(textSide(email), `${locale} email physical alignment`).toBe('left');
      expect(flatten(email.props.style).writingDirection).toBe('ltr');
      expect(email.props.value).toBe('customer@example.com');
      expect(
        root.findAllByType('TextInput').find((node) => node.props.secureTextEntry)!.props.value,
      ).toBe('keep-this-password');
    }
  });
});
