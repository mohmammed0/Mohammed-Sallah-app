'use client';

import { useEffect } from 'react';
import { consumeConfirmedCommandIntent } from '@/lib/confirmed-command-intent';

export function ConfirmedCommandIntentConsumer({
  confirmedIntentId,
}: {
  confirmedIntentId: string | null;
}) {
  useEffect(() => {
    consumeConfirmedCommandIntent(window.localStorage, confirmedIntentId);
  }, [confirmedIntentId]);

  return null;
}
