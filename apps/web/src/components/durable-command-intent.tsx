'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

interface StoredIntent {
  id: string;
  normalizedExpiresAt?: string;
}

function storageKey(intentKey: string): string {
  return `sallah:admin-command-intent:v1:${intentKey}`;
}

export function DurableCommandIntent({
  intentKey,
  initialIntentId,
  defaultExpiresAt,
}: {
  intentKey: string;
  initialIntentId: string;
  defaultExpiresAt?: string;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const initialIntent = useRef<StoredIntent>({
    id: initialIntentId,
    ...(defaultExpiresAt ? { normalizedExpiresAt: defaultExpiresAt } : {}),
  });
  const [intent, setIntent] = useState<StoredIntent>(initialIntent.current);

  useEffect(() => {
    const key = storageKey(intentKey);
    try {
      const existing = localStorage.getItem(key);
      if (existing) {
        const parsed = JSON.parse(existing) as Partial<StoredIntent>;
        if (typeof parsed.id === 'string') {
          setIntent({
            id: parsed.id,
            ...(typeof parsed.normalizedExpiresAt === 'string'
              ? { normalizedExpiresAt: parsed.normalizedExpiresAt }
              : {}),
          });
          return;
        }
      }
      localStorage.setItem(key, JSON.stringify(initialIntent.current));
    } catch {
      // Storage can be unavailable in hardened browsers. The server still
      // enforces idempotency for the submitted form instance.
    }
  }, [intentKey]);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    const nextIntent: StoredIntent = {
      id: crypto.randomUUID(),
      ...(defaultExpiresAt ? { normalizedExpiresAt: defaultExpiresAt } : {}),
    };
    setIntent(nextIntent);
    try {
      localStorage.setItem(storageKey(intentKey), JSON.stringify(nextIntent));
    } catch {
      // No customer or secret data is stored. The fresh in-memory intent still
      // prevents a completed or terminal command from trapping later input.
    }
  }, [defaultExpiresAt, intentKey, pending]);

  return (
    <>
      <input type="hidden" name="commandIntentId" value={intent.id} />
      {intent.normalizedExpiresAt && (
        <input type="hidden" name="normalizedExpiresAt" value={intent.normalizedExpiresAt} />
      )}
    </>
  );
}
