import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  recoverPendingSecureUploads,
  retryPendingSecureUpload,
  type PendingSecureUpload,
} from '../../lib/secure-upload';
import { useLocale } from '../../providers/locale-provider';

export function SecureUploadRecoveryCoordinator({ ownerId }: { ownerId: string | null }) {
  const { t } = useLocale();
  const generation = useRef(0);
  const owner = useRef(ownerId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualRecords, setManualRecords] = useState<PendingSecureUpload[]>([]);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  owner.current = ownerId;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(async function pollOwner(
    activeOwner: string,
    activeGeneration: number,
    attempt: number,
  ): Promise<void> {
    const current = () => owner.current === activeOwner && generation.current === activeGeneration;
    try {
      const result = await recoverPendingSecureUploads(activeOwner, { maxAttempts: 1 });
      if (!current()) return;
      setFailed(false);
      if (!result.active.length) {
        setManualRecords(result.ambiguous);
        return;
      }
      if (attempt + 1 >= 8) {
        setManualRecords([...result.ambiguous, ...result.active]);
        return;
      }
      setManualRecords(result.ambiguous);
      timer.current = setTimeout(
        () => void pollOwner(activeOwner, activeGeneration, attempt + 1),
        Math.min(500 * 2 ** attempt, 8_000),
      );
    } catch {
      if (!current()) return;
      setFailed(true);
    }
  }, []);

  const startPolling = useCallback(
    (activeOwner: string) => {
      clearTimer();
      const activeGeneration = ++generation.current;
      setManualRecords([]);
      setFailed(false);
      void poll(activeOwner, activeGeneration, 0);
    },
    [clearTimer, poll],
  );

  useEffect(() => {
    setRetrying(null);
    if (ownerId) startPolling(ownerId);
    else {
      clearTimer();
      generation.current += 1;
      setManualRecords([]);
      setFailed(false);
    }
    return () => {
      clearTimer();
      generation.current += 1;
    };
  }, [clearTimer, ownerId, startPolling]);

  const retry = (record: PendingSecureUpload) => {
    if (!ownerId) return;
    clearTimer();
    const retryOwner = ownerId;
    const retryGeneration = ++generation.current;
    setRetrying(record.uploadId);
    void (async () => {
      try {
        await retryPendingSecureUpload(retryOwner, record.uploadId, {
          consumeClean: false,
          maxAttempts: 1,
        });
      } catch {
        // A safe generic recovery state is refreshed below; scanner details stay private.
      } finally {
        if (owner.current === retryOwner && generation.current === retryGeneration) {
          setRetrying(null);
          void poll(retryOwner, retryGeneration, 0);
        }
      }
    })();
  };

  if (!ownerId || (!manualRecords.length && !failed)) return null;
  return (
    <View accessibilityLiveRegion="polite" style={recoveryStyles.container}>
      <Text style={failed ? recoveryStyles.error : recoveryStyles.message}>
        {t('publishOrUploadFailed')}
      </Text>
      {manualRecords.map((record) => (
        <Pressable
          accessibilityLabel={t('retry')}
          accessibilityRole="button"
          disabled={retrying !== null}
          key={record.uploadId}
          onPress={() => retry(record)}
          style={recoveryStyles.button}
        >
          <Text style={recoveryStyles.buttonText}>{t('retry')}</Text>
        </Pressable>
      ))}
      {failed && !manualRecords.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => startPolling(ownerId)}
          style={recoveryStyles.button}
        >
          <Text style={recoveryStyles.buttonText}>{t('retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const recoveryStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8E8',
    borderColor: '#B87600',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 16,
    padding: 12,
  },
  message: { color: '#5E4600', textAlign: 'left' },
  error: { color: '#9A2B21', textAlign: 'left' },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#0B6E69',
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
});
