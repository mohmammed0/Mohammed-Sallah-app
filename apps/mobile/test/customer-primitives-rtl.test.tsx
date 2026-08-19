import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const localeState = vi.hoisted(() => ({ locale: 'ar' as 'ar' | 'en' }));

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
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/providers/locale-provider', () => ({
  useLocale: () => ({ locale: localeState.locale }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('customer form direction', () => {
  it('renders forms and screen content in the active locale direction without a restart', async () => {
    const { CustomerScreen, Field, StepHeader } = await import('../src/design-system/primitives');
    const content = () => (
      <CustomerScreen scroll={false}>
        <Field label="Building" value="12" />
        <StepHeader body="Details" current={1} eyebrow="Step" title="Request" total={5} />
      </CustomerScreen>
    );
    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(content());
    });

    const rtlInput = renderer?.root.findByType('TextInput');
    expect(JSON.stringify(rtlInput?.props.style)).toContain('"textAlign":"right"');
    expect(JSON.stringify(rtlInput?.props.style)).toContain('"writingDirection":"rtl"');
    expect(
      renderer?.root
        .findAllByType('View')
        .some((node) => JSON.stringify(node.props.style).includes('"direction":"rtl"')),
    ).toBe(true);

    localeState.locale = 'en';
    await act(() => {
      renderer?.update(content());
    });
    const ltrInput = renderer?.root.findByType('TextInput');
    expect(JSON.stringify(ltrInput?.props.style)).toContain('"textAlign":"left"');
    expect(JSON.stringify(ltrInput?.props.style)).toContain('"writingDirection":"ltr"');
  });
});
