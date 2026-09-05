import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { localeNativeNames } from '@sallah/i18n';
import {
  ActionButton,
  CustomerScreen,
  InteractivePressable,
  Notice,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';
import { useLegalConsent } from '@/features/legal/legal-consent-provider';
import { productLandingRoute } from '@/features/auth/route-policy';
import { customerTokens as tokens } from '@/design-system/tokens';

export default function LegalScreen() {
  const { t, dir, locale } = useLocale();
  const { session, context: sessionContext } = useSessionContext();
  const legal = useLegalConsent();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const documents = legal.context?.documents ?? [];
  const required = documents.filter(
    (document) => document.requiresAcceptance && !document.accepted,
  );
  const unavailable = legal.error || legal.context?.status === 'unavailable';
  const selectable = Boolean(session) && legal.context?.status === 'required' && !unavailable;
  const fingerprint = JSON.stringify(documents.map(({ id, contentHash }) => ({ id, contentHash })));
  useEffect(() => {
    setSelected([]);
    setFailed(false);
    attempt.current = null;
  }, [session?.user.id, locale, fingerprint]);
  const ready =
    selectable &&
    required.length > 0 &&
    required.every(({ id, contentHash }) => selected.includes(`${id}:${contentHash}`));
  async function accept() {
    if (!ready || pending) return;
    setPending(true);
    setFailed(false);
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      await legal.accept(
        documents.map(({ id, contentHash }) => ({ id, contentHash })),
        attempt.current.key,
      );
      setSelected([]);
    } catch {
      setFailed(true);
      setSelected([]);
      await legal.refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <CustomerScreen>
      <Text accessibilityRole="header" style={customerStyles.title}>
        {t('legalDocuments')}
      </Text>
      <Text style={customerStyles.bodyMuted}>{t('legalDocumentsLead')}</Text>
      {legal.loading ? <Notice live>{t('loading')}</Notice> : null}
      {unavailable || (!legal.loading && documents.length === 0) ? (
        <Notice live tone="warning">
          {t('legalUnavailable')}
        </Notice>
      ) : null}
      {selectable ? <Notice>{t('legalAcceptanceRequired')}</Notice> : null}
      {legal.context?.status === 'accepted' ? (
        <Notice live tone="success">
          {t('legalAccepted')}
        </Notice>
      ) : null}
      {documents.map((document) => {
        const selectionKey = `${document.id}:${document.contentHash}`;
        const checked = selected.includes(selectionKey);
        return (
          <Surface key={selectionKey}>
            <Text accessibilityRole="header" style={customerStyles.section}>
              {document.title}
            </Text>
            <Text style={customerStyles.caption}>
              {t('legalDocumentVersion', {
                version: document.version,
                language: localeNativeNames[document.locale],
              })}
            </Text>
            <Text
              selectable
              style={[
                customerStyles.body,
                { writingDirection: dir, textAlign: dir === 'rtl' ? 'right' : 'left' },
              ]}
            >
              {document.body}
            </Text>
            {selectable && document.requiresAcceptance && !document.accepted ? (
              <InteractivePressable
                accessibilityRole="checkbox"
                accessibilityLabel={t('legalAcceptDocument', { title: document.title })}
                accessibilityState={{ checked, disabled: pending }}
                disabled={pending}
                onPress={() =>
                  setSelected((current) =>
                    checked
                      ? current.filter((key) => key !== selectionKey)
                      : [...current, selectionKey],
                  )
                }
                style={{
                  minHeight: tokens.touchTarget,
                  padding: tokens.spacing.md,
                  borderWidth: checked ? 2 : 1,
                  borderColor: checked ? tokens.colors.primary : tokens.colors.borderStrong,
                  borderRadius: tokens.radius.md,
                }}
              >
                <Text style={customerStyles.body}>
                  {checked ? '☑ ' : '☐ '}
                  {t('legalAcceptDocument', { title: document.title })}
                </Text>
              </InteractivePressable>
            ) : null}
          </Surface>
        );
      })}
      {failed ? (
        <Notice live tone="danger">
          {t('legalAcceptanceFailed')}
        </Notice>
      ) : null}
      {selectable ? (
        <ActionButton
          disabled={!ready || pending}
          loading={pending}
          label={t('legalAcceptAndContinue')}
          onPress={() => void accept()}
        />
      ) : null}
      <ActionButton
        disabled={pending || legal.loading}
        label={t('retry')}
        onPress={() => {
          setSelected([]);
          void legal.refresh();
        }}
        variant="ghost"
      />
      {session ? (
        <>
          {legal.canEnter && sessionContext?.allowed ? (
            <ActionButton
              label={t('continueAction')}
              onPress={() => router.replace(productLandingRoute(sessionContext))}
            />
          ) : null}
          <ActionButton
            label={t('account')}
            onPress={() => router.push('/account')}
            variant="secondary"
          />
          <ActionButton
            label={t('support')}
            onPress={() => router.push('/support')}
            variant="ghost"
          />
        </>
      ) : (
        <ActionButton
          label={t('signIn')}
          onPress={() => router.push('/auth')}
          variant="secondary"
        />
      )}
    </CustomerScreen>
  );
}
