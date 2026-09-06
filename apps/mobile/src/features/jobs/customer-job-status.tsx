import { formatStatusLabel, type TranslationKey } from '@sallah/i18n';
import { Notice } from '@/design-system/primitives';
import { ProgressTimeline } from '@/design-system/customer-components';
import { MotionReveal, StatusMotion } from '@/design-system/motion';
import { useLocale } from '@/providers/locale-provider';

type Presentation = {
  variant: 'waiting' | 'working' | 'success';
  description: TranslationKey;
  title?: TranslationKey;
  milestone: number | null;
  animate: boolean;
};

/** Presentation only. Timers and local actions never advance the server lifecycle. */
export function customerJobPresentation(status: string): Presentation | null {
  switch (status) {
    case 'provider_selected':
    case 'scheduled':
      return { variant: 'waiting', description: 'serviceBookedBody', milestone: 0, animate: false };
    case 'en_route':
      return { variant: 'working', description: 'serviceEnRouteBody', milestone: 1, animate: true };
    case 'arrived':
      return {
        variant: 'working',
        description: 'serviceArrivedBody',
        milestone: 2,
        animate: false,
      };
    case 'diagnosing':
    case 'in_progress':
      return { variant: 'working', description: 'serviceWorkingBody', milestone: 2, animate: true };
    case 'completion_submitted':
      return {
        variant: 'waiting',
        description: 'serviceReviewBody',
        title: 'serviceReviewTitle',
        milestone: 3,
        animate: false,
      };
    case 'completed':
      return {
        variant: 'success',
        description: 'serviceCompletedBody',
        title: 'serviceCompletedTitle',
        milestone: 4,
        animate: true,
      };
    case 'awaiting_change_order_approval':
    case 'disputed':
      return {
        variant: 'waiting',
        description: 'servicePausedBody',
        milestone: null,
        animate: false,
      };
    default:
      return null;
  }
}

export function CustomerJobStatus({ status, active }: { status: string; active: boolean }) {
  const { locale, t } = useLocale();
  const presentation = customerJobPresentation(status);
  if (!presentation) return <Notice>{formatStatusLabel(status, locale)}</Notice>;
  const workLabel = ['arrived', 'diagnosing'].includes(status) ? status : 'in_progress';
  return (
    <>
      <MotionReveal active={active} transitionKey={status}>
        <StatusMotion
          active={active && presentation.animate}
          description={t(presentation.description)}
          label={presentation.title ? t(presentation.title) : formatStatusLabel(status, locale)}
          layout="inline"
          testID={`customer-job-state-${status}`}
          variant={presentation.variant}
        />
      </MotionReveal>
      {presentation.milestone !== null ? (
        <ProgressTimeline
          currentIndex={presentation.milestone}
          steps={[
            { id: 'selected', label: formatStatusLabel('provider_selected', locale) },
            { id: 'arrival', label: formatStatusLabel('en_route', locale) },
            { id: 'work', label: formatStatusLabel(workLabel, locale) },
            {
              id: 'review',
              label: t(status === 'completed' ? 'serviceCompletedTitle' : 'serviceReviewTitle'),
            },
          ]}
        />
      ) : null}
    </>
  );
}
