import { Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { formatStatusLabel } from '@sallah/i18n';
import { Button, Card, LoadingSkeleton, Screen, styles } from '@/components/ui';
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

export default function ProviderFeed() {
  const { locale, t } = useLocale();
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translating, setTranslating] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<Record<string, string>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({});
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('eligibleRequests')}</Text>
        <Text style={styles.lead}>{t('eligibleFeedPrivacyNotice')}</Text>
        {query.isPending && <LoadingSkeleton label={t('loadingSummaries')} />}
        {query.isError && (
          <Card>
            <Text accessibilityRole="alert" style={styles.error}>
              {t('providerFeedLoadFailed')}
            </Text>
            <Button kind="secondary" label={t('retry')} onPress={() => void query.refetch()} />
          </Card>
        )}
        {query.data?.map((match) => {
          if (!match.brief) {
            return (
              <Card key={match.id}>
                <Text style={styles.badge}>{match.service_requests.urgency}</Text>
                <Text>{match.service_requests.title}</Text>
                <Text accessibilityRole="alert" style={styles.error}>
                  {t('providerFeedLoadFailed')}
                </Text>
                <Button kind="secondary" label={t('retry')} onPress={() => void query.refetch()} />
              </Card>
            );
          }
          return (
            <Card key={match.id}>
              <Text style={styles.badge}>{match.service_requests.urgency}</Text>
              <Text>{match.service_requests.title}</Text>
              <Text style={styles.lead}>{match.brief.description}</Text>
              <Text style={styles.badge}>
                {t('originalTextLabel', { locale: match.service_requests.original_locale })}
              </Text>
              <Text style={styles.lead}>{match.service_requests.original_text}</Text>
              <Card>
                <Text style={styles.badge}>
                  {match.brief.category.slug} · {match.brief.area.city}
                  {match.brief.area.district ? ` · ${match.brief.area.district}` : ''}
                </Text>
                <Text style={styles.lead}>
                  {t('providerBriefSchedule', {
                    start:
                      match.brief.schedule.mode === 'flexible'
                        ? t('timingFlexible')
                        : (match.brief.schedule.start ?? t('timingAsap')),
                  })}
                </Text>
                <Text style={styles.lead}>
                  {t('providerBriefMediaCount', { count: match.brief.media.length })}
                </Text>
                <Text style={styles.lead}>
                  {t('providerBriefApproximateLocation', {
                    latitude: match.brief.approximateLocation.latitude,
                    longitude: match.brief.approximateLocation.longitude,
                  })}
                </Text>
                {match.brief.requiredCapabilities.map((capability) => (
                  <Text key={capability} style={styles.lead}>
                    {t('requiredCapability')}: {capability}
                  </Text>
                ))}
                <Text style={styles.lead}>
                  {t('providerBriefCapability', {
                    status: match.brief.providerCapabilities.qualified
                      ? t('qualified')
                      : t('notQualified'),
                  })}
                </Text>
                {match.brief.ai.uncertain && (
                  <Text style={styles.error}>{t('aiBriefUncertain')}</Text>
                )}
                {match.brief.safety.map((flag) => (
                  <Text key={`${flag.type}-${flag.severity}`} style={styles.error}>
                    {flag.type} · {flag.severity}
                  </Text>
                ))}
                {match.brief.answers.map((answer) => (
                  <Text key={answer.questionKey} style={styles.lead}>
                    {answer.questionKey}:{' '}
                    {answer.answerText ??
                      answer.answerNumber ??
                      answer.answerBoolean?.toString() ??
                      answer.answerOptions?.join(', ') ??
                      '—'}
                  </Text>
                ))}
                {match.brief.media
                  .filter((media) => media.uploadId)
                  .map((media) => (
                    <Card key={media.id}>
                      {media.uploadId && mediaUrls[media.uploadId] ? (
                        <Image
                          source={{ uri: mediaUrls[media.uploadId] }}
                          accessibilityLabel={t('requestMediaA11y')}
                          style={{ width: '100%', height: 180, borderRadius: 12 }}
                        />
                      ) : (
                        <Button
                          kind="secondary"
                          label={
                            media.uploadId && mediaErrors[media.uploadId]
                              ? t('retryMedia')
                              : t('loadAttachment')
                          }
                          onPress={() => media.uploadId && void loadMedia(media.uploadId)}
                        />
                      )}
                    </Card>
                  ))}
                <Text style={styles.lead}>
                  {t('translationStatusLabel')}:{' '}
                  {formatStatusLabel(
                    typeof match.brief.translation.status === 'string'
                      ? match.brief.translation.status
                      : 'not_requested',
                    locale,
                  )}
                </Text>
              </Card>
              {translations[match.service_requests.id]?.translated && (
                <Card>
                  <Text style={styles.badge}>
                    {t('translatedSummaryLabel', {
                      locale: translations[match.service_requests.id]?.targetLocale ?? '',
                    })}
                  </Text>
                  <Text>{translations[match.service_requests.id]?.translated?.title}</Text>
                  <Text style={styles.lead}>
                    {translations[match.service_requests.id]?.translated?.problemSummary}
                  </Text>
                  <Text style={styles.lead}>
                    {translations[match.service_requests.id]?.metadata.provider}
                    {translations[match.service_requests.id]?.metadata.testProvider
                      ? ` · ${t('localTestProvider')}`
                      : ''}
                    {translations[match.service_requests.id]?.metadata.cached
                      ? ` · ${t('cachedTranslation')}`
                      : ''}
                  </Text>
                </Card>
              )}
              {(translationError[match.service_requests.id] ||
                translations[match.service_requests.id]?.status === 'failed') && (
                <Text style={styles.error}>
                  {translationError[match.service_requests.id] ||
                    t('noProductionTranslationProvider')}
                </Text>
              )}
              <Button
                kind="secondary"
                disabled={translating === match.service_requests.id}
                label={
                  translating === match.service_requests.id
                    ? t('checkingSummary')
                    : translations[match.service_requests.id]
                      ? t('retryTranslation')
                      : t('showTranslationStatus')
                }
                onPress={() =>
                  void translateBrief(
                    match.service_requests.id,
                    Boolean(translations[match.service_requests.id]),
                  )
                }
              />
              <Text style={styles.lead}>
                {t('matchScore', { score: Math.round(match.score * 100) })}
              </Text>
              <Link
                href={{
                  pathname: '/provider/offer',
                  params: {
                    requestId: match.service_requests.id,
                    requestVersion: String(match.service_requests.version),
                  },
                }}
                asChild
              >
                <Button
                  label={match.status === 'offered' ? t('editOffer') : t('submitSealedOffer')}
                />
              </Link>
            </Card>
          );
        })}
        {!query.isPending && query.data?.length === 0 && (
          <Card>
            <Text style={styles.lead}>{t('noEligibleInvites')}</Text>
          </Card>
        )}
      </Screen>
    </ScrollView>
  );
}
