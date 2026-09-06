import { describe, expect, it, vi } from 'vitest';
vi.mock('@/design-system/primitives', () => ({ Notice: 'Notice' }));
vi.mock('@/design-system/customer-components', () => ({ ProgressTimeline: 'ProgressTimeline' }));
vi.mock('@/design-system/motion', () => ({
  MotionReveal: 'MotionReveal',
  StatusMotion: 'StatusMotion',
}));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', t: (key: string) => key }),
}));
import { customerJobPresentation } from '../src/features/jobs/customer-job-status';

describe('customer lifecycle feedback', () => {
  it('asks for evidence review when the provider submits completion instead of celebrating', () => {
    expect(customerJobPresentation('completion_submitted')).toMatchObject({
      title: 'serviceReviewTitle',
      variant: 'waiting',
      animate: false,
    });
    expect(customerJobPresentation('completed')).toMatchObject({
      title: 'serviceCompletedTitle',
      variant: 'success',
    });
  });
  it.each(['awaiting_change_order_approval', 'disputed'])(
    'does not imply normal forward progress during %s',
    (status) => {
      expect(customerJobPresentation(status)).toMatchObject({
        milestone: null,
        animate: false,
        description: 'servicePausedBody',
      });
    },
  );
  it.each(['cancelled', 'future_unknown', ''])(
    'never celebrates an unsupported state %s',
    (status) => {
      expect(customerJobPresentation(status)).toBeNull();
    },
  );
});
