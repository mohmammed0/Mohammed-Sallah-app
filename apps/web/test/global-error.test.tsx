import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const observability = vi.hoisted(() => ({ write: vi.fn() }));

vi.mock('@sallah/observability', () => ({
  consoleLogger: { write: observability.write },
  createCorrelationId: () => 'web-correlation-1',
}));

describe('web root error boundary', () => {
  it('reports an unexpected category without forwarding the raw error', async () => {
    const { reportWebBoundaryError } = await import('../src/lib/error-reporting');
    const rawError = new Error('Authorization: Bearer private at /private/admin/path');

    reportWebBoundaryError('web-correlation-1', rawError);

    expect(observability.write).toHaveBeenCalledWith({
      level: 'error',
      event: 'web_error_boundary',
      correlationId: 'web-correlation-1',
      category: 'unexpected',
      attributes: { boundary: 'root' },
    });
    expect(JSON.stringify(observability.write.mock.calls)).not.toContain('private');
    expect(JSON.stringify(observability.write.mock.calls)).not.toContain('Authorization');
  });

  it('renders an Arabic-first accessible recovery action', async () => {
    const { GlobalErrorView } = await import('../src/components/global-error-view');
    const html = renderToStaticMarkup(<GlobalErrorView onReset={() => undefined} />);

    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('تعذر بدء التطبيق');
    expect(html).toContain('إعادة المحاولة');
    expect(html).not.toContain('web-correlation-1');
  });

  it('transpiles the shared operational logger in the Next build', () => {
    const nextConfig = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');

    expect(nextConfig).toContain("'@sallah/observability'");
  });
});
import { readFileSync } from 'node:fs';
