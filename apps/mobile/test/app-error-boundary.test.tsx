import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const observability = vi.hoisted(() => ({
  write: vi.fn(),
}));

vi.mock('@sallah/observability', () => ({
  consoleLogger: { write: observability.write },
  createCorrelationId: () => 'mobile-correlation',
}));

vi.mock('react-native', () => ({
  Text: 'Text',
}));

vi.mock('@sallah/i18n', () => ({
  translate: (_locale: string, key: string) => key,
}));

vi.mock('@/components/ui', () => ({
  Button: 'Button',
  Screen: 'Screen',
  styles: { error: {}, lead: {}, title: {} },
}));

vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => {
    throw new Error('LocaleProvider missing');
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('mobile root error boundary', () => {
  beforeEach(() => {
    observability.write.mockReset();
  });

  it('renders a root-safe retry state before LocaleProvider is available', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReset = vi.fn();
    let crash = true;
    function Child() {
      if (crash) {
        throw new Error('Bearer private-token at /private/customer/file.m4a');
      }
      return <Text>healthy</Text>;
    }
    const { MobileAppErrorBoundary } = await import('../src/components/app-error-boundary');

    let renderer: ReturnType<typeof create> | undefined;
    await act(() => {
      renderer = create(
        <MobileAppErrorBoundary onReset={onReset}>
          <Child />
        </MobileAppErrorBoundary>,
      );
    });

    expect(renderer?.root.findAllByType('Screen')).toHaveLength(1);
    expect(
      renderer?.root.findAll((node) => node.props.accessibilityLiveRegion === 'assertive'),
    ).toHaveLength(1);
    const button = renderer?.root.findByType('Button');
    expect(button?.props.label).toBe('retry');
    expect(observability.write).toHaveBeenCalledWith({
      level: 'error',
      event: 'mobile_error_boundary',
      correlationId: 'mobile-correlation',
      category: 'unexpected',
      attributes: { boundary: 'root' },
    });
    expect(JSON.stringify(observability.write.mock.calls)).not.toContain('private-token');
    expect(JSON.stringify(observability.write.mock.calls)).not.toContain('/private/customer');

    crash = false;
    await act(() => {
      button?.props.onPress();
    });
    expect(onReset).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('wraps the provider tree at the application root', () => {
    const rootLayout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');

    expect(rootLayout).toMatch(
      /<MobileAppErrorBoundary>[\s\S]*<AppQueryProvider>[\s\S]*<\/MobileAppErrorBoundary>/,
    );
  });
});
import { readFileSync } from 'node:fs';
