import { consoleLogger } from '@sallah/observability';

export function reportWebBoundaryError(correlationId: string, _error: unknown): void {
  void _error;
  consoleLogger.write({
    level: 'error',
    event: 'web_error_boundary',
    correlationId,
    category: 'unexpected',
    attributes: { boundary: 'root' },
  });
}
