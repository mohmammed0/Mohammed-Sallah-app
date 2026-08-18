import { Link, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { Button, Card, Screen, styles } from '@/components/ui';
import type { TranslationKey } from '@sallah/i18n';
import { useLocale } from '@/providers/locale-provider';

interface FlowDefinition {
  title: TranslationKey;
  description: TranslationKey;
  steps: TranslationKey[];
}
const flows: Record<string, FlowDefinition> = {
  offers: {
    title: 'compareOffers',
    description: 'flowOffersDescription',
    steps: ['reviewProviderEligibility', 'compareWithoutBestBadge', 'selectOfferAtomically'],
  },
  job: {
    title: 'jobDetailsTitle',
    description: 'flowJobDescription',
    steps: [
      'scheduledStep',
      'enRouteStep',
      'arrivedStep',
      'diagnosisStep',
      'executionStep',
      'completionEvidenceStep',
      'acceptOrDisputeStep',
    ],
  },
  support: {
    title: 'supportCenter',
    description: 'flowSupportDescription',
    steps: ['selectTopicStep', 'describeIssueStep', 'uploadEvidenceStep', 'followDecisionStep'],
  },
  onboarding: {
    title: 'providerOnboarding',
    description: 'flowOnboardingDescription',
    steps: [
      'identityBusinessStep',
      'servicesStep',
      'serviceAreaStep',
      'availabilityStep',
      'privateDocumentsStep',
      'humanReviewStep',
    ],
  },
  feed: {
    title: 'eligibleRequests',
    description: 'flowFeedDescription',
    steps: [
      'categoryAreaStep',
      'availabilityLoadStep',
      'verificationStep',
      'blockedRelationshipsStep',
    ],
  },
  'provider-job': {
    title: 'executeJob',
    description: 'flowProviderJobDescription',
    steps: [
      'enRouteWithConsentStep',
      'arrivalDiagnosisStep',
      'formalChangeOrderStep',
      'executionStep',
      'uploadProofStep',
    ],
  },
  earnings: {
    title: 'earningsTitle',
    description: 'flowEarningsDescription',
    steps: ['approvedTotalStep', 'configurableFeesStep', 'holdsStep', 'settlementRecordStep'],
  },
};
export default function Flow() {
  const { t } = useLocale();
  const { screen } = useLocalSearchParams<{ screen: string }>();
  const flow = flows[screen] ?? {
    title: 'serviceJourneyTitle',
    description: 'serviceJourneyDescription',
    steps: ['secureUploadStep', 'authorizationStep', 'executionStep', 'auditStep'],
  };
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t(flow.title)}</Text>
        <Text style={styles.lead}>{t(flow.description)}</Text>
        {flow.steps.map((step, index) => (
          <Card key={step}>
            <Text style={styles.badge}>{index + 1}</Text>
            <Text>{t(step)}</Text>
          </Card>
        ))}
        <Link href="/home" asChild>
          <Button kind="secondary" label={t('returnHome')} />
        </Link>
      </Screen>
    </ScrollView>
  );
}
