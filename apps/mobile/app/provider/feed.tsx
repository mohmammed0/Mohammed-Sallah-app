import { Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

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
  const { t } = useLocale();
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translating, setTranslating] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<Record<string, string>>({});
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
      return z.array(feedSchema).parse(data ?? []);
    },
  });
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
        {query.isPending && <Text style={styles.lead}>{t('loadingSummaries')}</Text>}
        {query.isError && <Text style={styles.error}>{t('providerFeedLoadFailed')}</Text>}
        {query.data?.map((match) => (
          <Card key={match.id}>
            <Text style={styles.badge}>{match.service_requests.urgency}</Text>
            <Text>{match.service_requests.title}</Text>
            <Text style={styles.badge}>
              {t('originalTextLabel', { locale: match.service_requests.original_locale })}
            </Text>
            <Text style={styles.lead}>{match.service_requests.original_text}</Text>
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
        ))}
        {!query.isPending && query.data?.length === 0 && (
          <Card>
            <Text style={styles.lead}>{t('noEligibleInvites')}</Text>
          </Card>
        )}
      </Screen>
    </ScrollView>
  );
}
