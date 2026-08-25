'use client';

import { useEffect, useRef } from 'react';
import { createCorrelationId } from '@sallah/observability';
import { GlobalErrorView } from '@/components/global-error-view';
import { reportWebBoundaryError } from '@/lib/error-reporting';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const correlationId = useRef(createCorrelationId()).current;
  useEffect(() => {
    reportWebBoundaryError(correlationId, error);
  }, [correlationId, error]);

  return <GlobalErrorView onReset={reset} />;
}
