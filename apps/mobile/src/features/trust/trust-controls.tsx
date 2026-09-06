import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  MarketplaceReportIntent,
  MarketplaceReportReason,
  MarketplaceReportTarget,
  MarketplaceUserReportTarget,
} from '@sallah/domain/trust';
import type { TranslationKey } from '@sallah/i18n';
import { logicalRowStyle, logicalTextStyle } from '../../design-system/rtl';
import { useLocale } from '../../providers/locale-provider';
import { TrustClientError, type TrustErrorCategory } from './trust-client';

const reasonOptions: ReadonlyArray<{
  value: MarketplaceReportReason;
  label: TranslationKey;
}> = [
  { value: 'harassment', label: 'trustReasonHarassment' },
  { value: 'spam', label: 'trustReasonSpam' },
  { value: 'scam', label: 'trustReasonScam' },
  { value: 'safety', label: 'trustReasonSafety' },
  { value: 'inappropriate_content', label: 'trustReasonInappropriateContent' },
  { value: 'rating_abuse', label: 'trustReasonRatingAbuse' },
  { value: 'other', label: 'trustReasonOther' },
];

const errorKeys: Readonly<Record<TrustErrorCategory, TranslationKey>> = {
  auth: 'trustErrorAuth',
  validation: 'trustErrorValidation',
  rate_limited: 'trustErrorRateLimited',
  unavailable: 'trustErrorUnavailable',
  conflict: 'trustErrorConflict',
  network: 'trustErrorNetwork',
  invalid_response: 'trustErrorInvalidResponse',
  unknown: 'trustErrorUnknown',
};

type PendingAction =
  { kind: 'report'; intent: MarketplaceReportIntent } | { kind: 'block'; blocked: boolean };

function actionErrorKey(error: unknown): TranslationKey {
  return errorKeys[error instanceof TrustClientError ? error.category : 'unknown'];
}

function reportActionKey(targetType: MarketplaceReportTarget['targetType']): TranslationKey {
  switch (targetType) {
    case 'user':
      return 'trustReportUser';
    case 'message':
      return 'trustReportMessage';
    case 'rating':
      return 'trustReportRating';
  }
}

function TrustButton({
  label,
  disabled = false,
  danger = false,
  loading = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, danger && styles.dangerAction, disabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={danger ? '#FFFFFF' : '#075E54'} />
      ) : (
        <Text style={[styles.actionText, danger && styles.dangerActionText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TrustControls({
  target,
  userReportTarget,
  blockTargetUserId,
  blockedByMe = false,
  disabled = false,
  onSubmitReport,
  onSetBlocked,
  onCompleted,
}: {
  target: MarketplaceReportTarget;
  userReportTarget?: MarketplaceUserReportTarget;
  blockTargetUserId?: string;
  blockedByMe?: boolean;
  disabled?: boolean;
  onSubmitReport: (intent: MarketplaceReportIntent) => Promise<unknown>;
  onSetBlocked?: (blocked: boolean) => Promise<unknown>;
  onCompleted?: () => void | Promise<void>;
}) {
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const modalFocusRef = useRef<Text>(null);
  const [mode, setMode] = useState<'report' | 'block' | null>(null);
  const [reportTarget, setReportTarget] = useState<MarketplaceReportTarget | null>(null);
  const [reason, setReason] = useState<MarketplaceReportReason | null>(null);
  const [explanation, setExplanation] = useState('');
  const [pending, setPending] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState<TranslationKey | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [lastAction, setLastAction] = useState<PendingAction | null>(null);
  const textDirection = logicalTextStyle(locale);
  const desiredBlockedState = !blockedByMe;

  function dismissModal() {
    if (pending) return;
    setMode(null);
    setReportTarget(null);
    setReason(null);
    setExplanation('');
  }

  function focusModal() {
    const handle = findNodeHandle(modalFocusRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }

  async function runAction(action: PendingAction) {
    setPending(true);
    setFeedbackKey(null);
    try {
      if (action.kind === 'report') await onSubmitReport(action.intent);
      else if (onSetBlocked) await onSetBlocked(action.blocked);
    } catch (error) {
      setLastAction(action);
      setFeedbackTone('error');
      setFeedbackKey(actionErrorKey(error));
      setPending(false);
      return;
    }
    setLastAction(null);
    setFeedbackTone('success');
    setFeedbackKey(
      action.kind === 'report'
        ? 'trustReportSuccess'
        : action.blocked
          ? 'trustBlockSuccess'
          : 'trustUnblockSuccess',
    );
    setMode(null);
    setReportTarget(null);
    setReason(null);
    setExplanation('');
    try {
      await onCompleted?.();
    } catch {
      // The authoritative mutation succeeded; the screen owns refresh recovery.
    }
    setPending(false);
  }

  function submitReport() {
    if (!reason) {
      setFeedbackTone('error');
      setFeedbackKey('trustReasonRequired');
      return;
    }
    void runAction({
      kind: 'report',
      intent: {
        ...(reportTarget ?? target),
        reasonCategory: reason,
        explanation,
      },
    });
  }

  return (
    <View style={[styles.root, { direction: locale === 'ar' || locale === 'ur' ? 'rtl' : 'ltr' }]}>
      <View style={[styles.actionRow, logicalRowStyle(locale)]}>
        <TrustButton
          disabled={disabled || pending}
          label={t(reportActionKey(target.targetType))}
          onPress={() => {
            setFeedbackKey(null);
            setReportTarget(target);
            setMode('report');
          }}
        />
        {userReportTarget && target.targetType !== 'user' ? (
          <TrustButton
            disabled={disabled || pending}
            label={t('trustReportUser')}
            onPress={() => {
              setFeedbackKey(null);
              setReportTarget(userReportTarget);
              setMode('report');
            }}
          />
        ) : null}
        {blockTargetUserId && onSetBlocked ? (
          <TrustButton
            danger={!blockedByMe}
            disabled={disabled || pending}
            label={t(blockedByMe ? 'trustUnblock' : 'trustBlock')}
            onPress={() => {
              setFeedbackKey(null);
              setMode('block');
            }}
          />
        ) : null}
      </View>

      {feedbackKey && !mode ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.feedback,
            feedbackTone === 'error' ? styles.errorFeedback : styles.successFeedback,
          ]}
        >
          <Text selectable style={[styles.feedbackText, textDirection]}>
            {t(feedbackKey)}
          </Text>
          {feedbackTone === 'error' && lastAction ? (
            <TrustButton
              disabled={pending}
              label={t('retry')}
              loading={pending}
              onPress={() => void runAction(lastAction)}
            />
          ) : null}
        </View>
      ) : null}

      {mode ? (
        <Modal
          animationType="slide"
          onRequestClose={dismissModal}
          onShow={focusModal}
          presentationStyle="overFullScreen"
          transparent
          visible
        >
          <View style={styles.backdrop}>
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={dismissModal}
              style={styles.backdropDismiss}
            />
            <View
              accessibilityViewIsModal
              onAccessibilityEscape={dismissModal}
              style={styles.sheet}
            >
              <ScrollView
                contentContainerStyle={[
                  styles.sheetContent,
                  { paddingBottom: Math.max(insets.bottom, 20) },
                ]}
                contentInsetAdjustmentBehavior="automatic"
                keyboardShouldPersistTaps="handled"
              >
                {mode === 'report' ? (
                  <>
                    <Text
                      ref={modalFocusRef}
                      accessibilityRole="header"
                      selectable
                      style={[styles.title, textDirection]}
                    >
                      {t('trustReportTitle')}
                    </Text>
                    <Text selectable style={[styles.body, textDirection]}>
                      {t('trustReportBody')}
                    </Text>
                    <Text style={[styles.label, textDirection]}>{t('trustReasonLabel')}</Text>
                    <View style={styles.reasonList}>
                      {reasonOptions.map((option) => (
                        <Pressable
                          key={option.value}
                          accessibilityLabel={t(option.label)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: reason === option.value }}
                          disabled={pending}
                          onPress={() => setReason(option.value)}
                          style={[styles.reason, reason === option.value && styles.reasonSelected]}
                        >
                          <Text style={[styles.reasonText, textDirection]}>{t(option.label)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={[styles.label, textDirection]}>{t('trustExplanationLabel')}</Text>
                    <TextInput
                      accessibilityLabel={t('trustExplanationLabel')}
                      editable={!pending}
                      maxLength={1_000}
                      multiline
                      onChangeText={setExplanation}
                      placeholder={t('trustExplanationPlaceholder')}
                      style={[styles.input, textDirection]}
                      value={explanation}
                    />
                    {feedbackKey ? (
                      <View
                        accessibilityLiveRegion="polite"
                        accessibilityRole="alert"
                        style={styles.inlineFeedbackGroup}
                      >
                        <Text selectable style={[styles.inlineFeedback, textDirection]}>
                          {t(feedbackKey)}
                        </Text>
                        {feedbackTone === 'error' && lastAction ? (
                          <TrustButton
                            disabled={pending}
                            label={t('retry')}
                            loading={pending}
                            onPress={() => void runAction(lastAction)}
                          />
                        ) : null}
                      </View>
                    ) : null}
                    <View style={[styles.actionRow, logicalRowStyle(locale)]}>
                      <TrustButton disabled={pending} label={t('cancel')} onPress={dismissModal} />
                      <TrustButton
                        disabled={pending || !reason}
                        label={t('trustSubmitReport')}
                        loading={pending}
                        onPress={submitReport}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text
                      ref={modalFocusRef}
                      accessibilityRole="header"
                      selectable
                      style={[styles.title, textDirection]}
                    >
                      {t(desiredBlockedState ? 'trustBlockTitle' : 'trustUnblockTitle')}
                    </Text>
                    <Text selectable style={[styles.body, textDirection]}>
                      {t(desiredBlockedState ? 'trustBlockBody' : 'trustUnblockBody')}
                    </Text>
                    {feedbackKey ? (
                      <View
                        accessibilityLiveRegion="polite"
                        accessibilityRole="alert"
                        style={styles.inlineFeedbackGroup}
                      >
                        <Text selectable style={[styles.inlineFeedback, textDirection]}>
                          {t(feedbackKey)}
                        </Text>
                        {feedbackTone === 'error' && lastAction ? (
                          <TrustButton
                            disabled={pending}
                            label={t('retry')}
                            loading={pending}
                            onPress={() => void runAction(lastAction)}
                          />
                        ) : null}
                      </View>
                    ) : null}
                    <View style={[styles.actionRow, logicalRowStyle(locale)]}>
                      <TrustButton disabled={pending} label={t('cancel')} onPress={dismissModal} />
                      <TrustButton
                        danger={desiredBlockedState}
                        disabled={pending}
                        label={t(desiredBlockedState ? 'trustConfirmBlock' : 'trustConfirmUnblock')}
                        loading={pending}
                        onPress={() =>
                          void runAction({ kind: 'block', blocked: desiredBlockedState })
                        }
                      />
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  actionRow: { flexWrap: 'wrap', gap: 8 },
  action: {
    minHeight: 48,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0B776C',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: { color: '#075E54', fontSize: 15, fontWeight: '700' },
  dangerAction: { backgroundColor: '#A52A2A', borderColor: '#A52A2A' },
  dangerActionText: { color: '#FFFFFF' },
  disabled: { opacity: 0.55 },
  feedback: { gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  successFeedback: { backgroundColor: '#E8F5EF', borderColor: '#2F7D61' },
  errorFeedback: { backgroundColor: '#FFF0F0', borderColor: '#A52A2A' },
  feedbackText: { color: '#173B37', lineHeight: 21 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  backdropDismiss: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  sheetContent: { gap: 14, padding: 20 },
  title: { color: '#173B37', fontSize: 22, fontWeight: '800' },
  body: { color: '#526765', fontSize: 16, lineHeight: 24 },
  label: { color: '#173B37', fontSize: 15, fontWeight: '700' },
  reasonList: { gap: 8 },
  reason: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B7C8C4',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasonSelected: { borderColor: '#0B776C', backgroundColor: '#E7F5F2' },
  reasonText: { color: '#173B37', fontSize: 15 },
  input: {
    minHeight: 108,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B7C8C4',
    padding: 12,
    textAlignVertical: 'top',
  },
  inlineFeedback: { color: '#A52A2A', lineHeight: 21 },
  inlineFeedbackGroup: { gap: 8 },
});
