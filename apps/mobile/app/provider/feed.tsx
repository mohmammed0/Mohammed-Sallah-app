import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { formatStatusLabel } from '@sallah/i18n';
import {
  ActionButton,
  CustomerScreen,
  EmptyState,
  InteractivePressable,
  LoadingBlock,
  Notice,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { logicalRowStyle, logicalTextStyle } from '@/design-system/rtl';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { loadProviderBriefs } from '@/features/provider/provider-feed-resilience';

const feedSchema = z.object({
  id: z.uuid(),
  score: z.coerce.number(),
  status: z.string(),
  expires_at: z.string().nullable(),
  service_requests: z.object({
    id: z.uuid(),
    title: z.string(),
    structured_description: z.string(),
    original_text: z.string(),
    original_locale: z.string(),
    urgency: z.string(),
    version: z.number().int(),
    published_at: z.string().nullable(),
  }),
});
const briefSchema = z.object({
  requestId: z.uuid(),
  title: z.string(),
  description: z.string(),
  original: z.object({ locale: z.string(), text: z.string() }),
  category: z.object({ id: z.uuid(), slug: z.string() }),
  subcategory: z.object({ id: z.uuid().nullable(), slug: z.string().nullable() }),
  area: z.object({ city: z.string(), district: z.string().nullable() }),
  approximateLocation: z.object({ latitude: z.coerce.number(), longitude: z.coerce.number() }),
  schedule: z.object({
    mode: z.enum(['asap', 'scheduled', 'flexible']),
    start: z.string().nullable(),
    end: z.string().nullable(),
  }),
  urgency: z.string(),
  answers: z.array(
    z.object({
      questionKey: z.string(),
      answerText: z.string().nullable(),
      answerNumber: z.number().nullable(),
      answerBoolean: z.boolean().nullable(),
      answerOptions: z.array(z.string()).nullable(),
      safetyRelevant: z.boolean(),
    }),
  ),
  media: z.array(
    z.object({
      id: z.uuid(),
      uploadId: z.uuid().nullable(),
      kind: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      status: z.string(),
    }),
  ),
  safety: z.array(z.object({ type: z.string(), severity: z.string() })),
  translation: z.record(z.string(), z.unknown()),
  ai: z.object({ uncertain: z.boolean(), customerApproved: z.boolean() }),
  requiredCapabilities: z.array(z.string()),
  providerCapabilities: z.object({ qualified: z.boolean(), restrictedCategory: z.boolean() }),
});
const translationSchema = z.object({
  translationId: z.uuid(),
  status: z.enum(['completed', 'not_required', 'failed']),
  sourceLocale: z.string(),
  targetLocale: z.string(),
  translated: z
    .object({
      title: z.string(),
      problemSummary: z.string(),
      originalText: z.string(),
      categoryName: z.string(),
      cityName: z.string(),
      safetyNotes: z.array(z.string()),
    })
    .nullable(),
  metadata: z.object({
    provider: z.string(),
    model: z.string(),
    testProvider: z.boolean(),
    cached: z.boolean(),
  }),
});
type Translation = z.infer<typeof translationSchema>;
const categoryLabelSchema = z.object({
  id: z.uuid(),
  service_category_translations: z.array(z.object({ name: z.string() })),
});
const questionLabelSchema = z.object({
  category_id: z.uuid(),
  key: z.string(),
  service_question_translations: z.array(z.object({ prompt: z.string() })),
});

export default function ProviderFeed() {
  const { locale, t } = useLocale();
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translating, setTranslating] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<Record<string, string>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const rowDirection = logicalRowStyle(locale);
  const textDirection = logicalTextStyle(locale);
  const labels = useQuery({
    queryKey: ['provider-brief-labels', locale],
    queryFn: async () => {
      const [categories, questions] = await Promise.all([
        supabase
          .from('service_categories')
          .select('id,service_category_translations(name)')
          .eq('service_category_translations.locale', locale)
          .eq('enabled', true),
        supabase
          .from('service_questions')
          .select('category_id,key,service_question_translations(prompt)')
          .eq('service_question_translations.locale', locale)
          .eq('enabled', true),
      ]);
      if (categories.error) throw categories.error;
      if (questions.error) throw questions.error;
      return {
        categories: z.array(categoryLabelSchema).parse(categories.data ?? []),
        questions: z.array(questionLabelSchema).parse(questions.data ?? []),
      };
    },
  });
  const query = useQuery({
    queryKey: ['provider-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('request_provider_matches')
        .select(
          'id,score,status,expires_at,service_requests!inner(id,title,structured_description,original_text,original_locale,urgency,version,published_at)',
        )
        .in('status', ['invited', 'viewed', 'offered'])
        .gt('expires_at', new Date().toISOString())
        .order('score', { ascending: false });
      if (error) throw error;
      const matches = z.array(feedSchema).parse(data ?? []);
      const loaded = await loadProviderBriefs(
        matches.map((match) => ({ match, requestId: match.service_requests.id })),
        async (requestId) => {
          const response = await (
            supabase.rpc as unknown as (
              name: string,
              args: Record<string, unknown>,
            ) => Promise<{ data: unknown; error: unknown }>
          )('get_provider_request_brief', {
            p_request_id: requestId,
          });
          if (response.error) throw new Error('PROVIDER_BRIEF_ACCESS_DENIED');
          return briefSchema.parse(response.data);
        },
      );
      return loaded.map(({ match: envelope, brief, briefState }) => ({
        ...envelope.match,
        brief,
        briefState,
      }));
    },
  });
  async function loadMedia(uploadId: string) {
    setMediaErrors((current) => ({ ...current, [uploadId]: false }));
    const response = await supabase.functions.invoke('media-access', {
      body: { uploadId, expiresInSeconds: 300 },
    });
    const parsed = z.object({ signedUrl: z.string().url() }).safeParse(response.data);
    if (response.error || !parsed.success) {
      setMediaErrors((current) => ({ ...current, [uploadId]: true }));
      return;
    }
    setMediaUrls((current) => ({ ...current, [uploadId]: parsed.data.signedUrl }));
  }
  async function translateBrief(requestId: string, force: boolean) {
    setTranslating(requestId);
    setTranslationError((current) => ({ ...current, [requestId]: '' }));
    try {
      const invocation = await supabase.functions.invoke('translate-provider-brief', {
        body: { requestId, force },
      });
      if (invocation.error) throw invocation.error;
      const parsed = translationSchema.parse(invocation.data as unknown);
      setTranslations((current) => ({ ...current, [requestId]: parsed }));
    } catch {
      setTranslationError((current) => ({
        ...current,
        [requestId]: t('translationFailedOriginalPreserved'),
      }));
    } finally {
      setTranslating(null);
    }
  }
  return (
    <CustomerScreen testID="provider-feed">
      <Text accessibilityRole="header" style={[customerStyles.title, textDirection]}>
        {t('eligibleRequests')}
      </Text>
      <Text style={[customerStyles.bodyMuted, textDirection]}>
        {t('eligibleFeedPrivacyNotice')}
      </Text>
      {query.isPending ? <LoadingBlock label={t('loadingSummaries')} /> : null}
      {query.isError ? (
        <Surface>
          <Notice tone="danger" live>
            {t('providerFeedLoadFailed')}
          </Notice>
          <ActionButton
            label={t('retry')}
            icon="refresh"
            variant="secondary"
            loading={query.isFetching}
            onPress={() => void query.refetch()}
          />
        </Surface>
      ) : null}
      {labels.isError ? (
        <Surface>
          <Notice tone="warning">{t('catalogLoadFailed')}</Notice>
          <ActionButton
            label={t('retry')}
            icon="refresh"
            variant="secondary"
            loading={labels.isFetching}
            onPress={() => void labels.refetch()}
          />
        </Surface>
      ) : null}
      {query.data?.map((match) => {
        const priorityLabel = t(
          match.service_requests.urgency === 'flexible'
            ? 'priorityFlexible'
            : match.service_requests.urgency === 'normal'
              ? 'priorityNormal'
              : match.service_requests.urgency === 'urgent'
                ? 'priorityUrgent'
                : 'safetyTitle',
        );
        if (!match.brief) {
          return (
            <Surface key={match.id}>
              <Text style={[styles.priority, textDirection]}>{priorityLabel}</Text>
              <Text style={[customerStyles.section, textDirection]}>
                {match.service_requests.title}
              </Text>
              <Notice tone="danger" live>
                {t('providerFeedLoadFailed')}
              </Notice>
              <ActionButton
                label={t('retry')}
                icon="refresh"
                variant="secondary"
                onPress={() => void query.refetch()}
              />
            </Surface>
          );
        }
        const brief = match.brief;
        const translation = translations[match.service_requests.id];
        const categoryName =
          labels.data?.categories.find((category) => category.id === brief.category.id)
            ?.service_category_translations[0]?.name ?? brief.category.slug;
        const scheduledDate = brief.schedule.start ? new Date(brief.schedule.start) : null;
        const schedule =
          brief.schedule.mode === 'flexible'
            ? t('timingFlexible')
            : scheduledDate && Number.isFinite(scheduledDate.getTime())
              ? scheduledDate.toLocaleString(locale === 'ar' ? 'ar-SA' : locale, {
                  timeZone: 'Asia/Riyadh',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : t('timingAsap');
        return (
          <Surface key={match.id}>
            <View style={styles.heading}>
              <Text style={[styles.priority, textDirection]}>{priorityLabel}</Text>
              <Text accessibilityRole="header" style={[customerStyles.section, textDirection]}>
                {match.service_requests.title}
              </Text>
              <Text style={[customerStyles.bodyMuted, textDirection]}>{brief.description}</Text>
            </View>
            <View style={styles.summary}>
              <View style={[styles.metaRow, rowDirection]}>
                <AppIcon color={tokens.colors.primaryStrong} name="location" size={19} />
                <Text style={[styles.metaText, textDirection]}>
                  {categoryName} · {brief.area.city}
                  {brief.area.district ? ` · ${brief.area.district}` : ''}
                </Text>
              </View>
              <View style={[styles.metaRow, rowDirection]}>
                <AppIcon color={tokens.colors.primaryStrong} name="calendar" size={19} />
                <Text style={[styles.metaText, textDirection]}>
                  {t('providerBriefSchedule', { start: schedule })}
                </Text>
              </View>
              <Text style={[customerStyles.caption, textDirection]}>
                {t('providerBriefMediaCount', { count: brief.media.length })}
              </Text>
            </View>
            <Notice tone={brief.providerCapabilities.qualified ? 'success' : 'warning'}>
              {t('providerBriefCapability', {
                status: brief.providerCapabilities.qualified ? t('qualified') : t('notQualified'),
              })}
            </Notice>
            {brief.ai.uncertain ? <Notice tone="warning">{t('aiBriefUncertain')}</Notice> : null}
            {brief.safety.map((flag) => (
              <Notice key={`${flag.type}-${flag.severity}`} tone="danger">
                {t('safetyTitle')}: {flag.type} · {flag.severity}
              </Notice>
            ))}
            <InteractivePressable
              accessibilityRole="button"
              accessibilityLabel={t(
                expanded[match.id] ? 'hideRequestDetails' : 'showRequestDetails',
              )}
              accessibilityState={{ expanded: Boolean(expanded[match.id]) }}
              onPress={() =>
                setExpanded((current) => ({ ...current, [match.id]: !current[match.id] }))
              }
              style={[styles.detailsToggle, rowDirection]}
            >
              <AppIcon
                color={tokens.colors.primaryStrong}
                name={expanded[match.id] ? 'close' : 'requests'}
                size={20}
              />
              <Text style={[styles.detailsLabel, textDirection]}>
                {t(expanded[match.id] ? 'hideRequestDetails' : 'showRequestDetails')}
              </Text>
            </InteractivePressable>
            {expanded[match.id] ? (
              <View style={styles.details}>
                <View style={styles.heading}>
                  <Text style={[customerStyles.section, textDirection]}>
                    {t('originalTextLabel', { locale: match.service_requests.original_locale })}
                  </Text>
                  <Text style={styles.originalText}>{match.service_requests.original_text}</Text>
                </View>
                {brief.requiredCapabilities.map((capability) => (
                  <Text key={capability} style={[customerStyles.body, textDirection]}>
                    {t('requiredCapability')}: {capability}
                  </Text>
                ))}
                {brief.answers.map((answer) => {
                  const prompt =
                    labels.data?.questions.find(
                      (question) =>
                        question.category_id === brief.category.id &&
                        question.key === answer.questionKey,
                    )?.service_question_translations[0]?.prompt ?? answer.questionKey;
                  const value =
                    answer.answerText ??
                    answer.answerNumber ??
                    (answer.answerBoolean === null
                      ? null
                      : t(answer.answerBoolean ? 'yes' : 'no')) ??
                    answer.answerOptions?.join(', ') ??
                    '—';
                  return (
                    <View key={answer.questionKey} style={styles.answer}>
                      <Text style={[customerStyles.caption, textDirection]}>{prompt}</Text>
                      <Text style={customerStyles.body}>{value}</Text>
                    </View>
                  );
                })}
                {brief.media
                  .filter((media) => media.uploadId)
                  .map((media) => (
                    <View key={media.id}>
                      {media.uploadId && mediaUrls[media.uploadId] ? (
                        <Image
                          source={{ uri: mediaUrls[media.uploadId] }}
                          accessibilityLabel={t('requestMediaA11y')}
                          style={styles.attachment}
                        />
                      ) : (
                        <ActionButton
                          variant="secondary"
                          icon="image"
                          label={
                            media.uploadId && mediaErrors[media.uploadId]
                              ? t('retryMedia')
                              : t('loadAttachment')
                          }
                          onPress={() => media.uploadId && void loadMedia(media.uploadId)}
                        />
                      )}
                    </View>
                  ))}
                <Text style={[customerStyles.caption, textDirection]}>
                  {t('translationStatusLabel')}:{' '}
                  {formatStatusLabel(
                    translation?.status ??
                      (typeof brief.translation.status === 'string'
                        ? brief.translation.status
                        : 'not_requested'),
                    locale,
                  )}
                </Text>
                {translation?.translated ? (
                  <Surface tone="muted">
                    <Text style={[customerStyles.section, textDirection]}>
                      {t('translatedSummaryLabel', { locale: translation.targetLocale })}
                    </Text>
                    <Text style={[customerStyles.body, textDirection]}>
                      {translation.translated.title}
                    </Text>
                    <Text style={[customerStyles.bodyMuted, textDirection]}>
                      {translation.translated.problemSummary}
                    </Text>
                    <Text style={[customerStyles.caption, textDirection]}>
                      {translation.metadata.provider}
                      {translation.metadata.testProvider ? ` · ${t('localTestProvider')}` : ''}
                      {translation.metadata.cached ? ` · ${t('cachedTranslation')}` : ''}
                    </Text>
                  </Surface>
                ) : null}
                {translationError[match.service_requests.id] || translation?.status === 'failed' ? (
                  <Notice tone="warning" live>
                    {translationError[match.service_requests.id] ||
                      t('noProductionTranslationProvider')}
                  </Notice>
                ) : null}
                <ActionButton
                  variant="secondary"
                  loading={translating === match.service_requests.id}
                  label={
                    translating === match.service_requests.id
                      ? t('checkingSummary')
                      : translation
                        ? t('retryTranslation')
                        : t('showTranslationStatus')
                  }
                  onPress={() =>
                    void translateBrief(match.service_requests.id, Boolean(translation))
                  }
                />
                <Text style={[customerStyles.caption, textDirection]}>
                  {t('matchScore', { score: Math.round(match.score * 100) })}
                </Text>
              </View>
            ) : null}
            <ActionButton
              label={match.status === 'offered' ? t('editOffer') : t('submitSealedOffer')}
              onPress={() =>
                router.push({
                  pathname: '/provider/offer',
                  params: {
                    requestId: match.service_requests.id,
                    requestVersion: String(match.service_requests.version),
                  },
                })
              }
            />
          </Surface>
        );
      })}
      {query.isSuccess && query.data.length === 0 ? (
        <EmptyState
          icon="requests"
          title={t('noEligibleInvites')}
          body={t('eligibleFeedPrivacyNotice')}
        />
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: tokens.spacing.xs },
  priority: { ...tokens.type.caption, color: tokens.colors.primaryStrong },
  summary: {
    backgroundColor: tokens.colors.surfaceMuted,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  metaRow: { alignItems: 'center', gap: tokens.spacing.xs },
  metaText: { ...tokens.type.caption, color: tokens.colors.ink, flex: 1 },
  detailsToggle: { alignItems: 'center', gap: tokens.spacing.xs, minHeight: tokens.touchTarget },
  detailsLabel: {
    ...tokens.type.label,
    color: tokens.colors.primaryStrong,
    flexGrow: 1,
    flexShrink: 1,
  },
  details: {
    gap: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    paddingTop: tokens.spacing.md,
  },
  answer: { gap: tokens.spacing.xxs },
  originalText: { ...tokens.type.body, color: tokens.colors.ink, textAlign: 'auto' },
  attachment: { width: '100%', height: 180, borderRadius: tokens.radius.md },
});
