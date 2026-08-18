export const jobStatuses = [
  'provider_selected',
  'scheduled',
  'en_route',
  'arrived',
  'diagnosing',
  'awaiting_change_order_approval',
  'in_progress',
  'completion_submitted',
  'completed',
  'cancelled',
  'disputed',
] as const;

export type JobStatus = (typeof jobStatuses)[number];

const allowedTransitions: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  provider_selected: ['scheduled', 'cancelled'],
  scheduled: ['en_route', 'cancelled'],
  en_route: ['arrived', 'cancelled'],
  arrived: ['diagnosing', 'cancelled'],
  diagnosing: ['awaiting_change_order_approval', 'in_progress', 'cancelled'],
  awaiting_change_order_approval: ['in_progress', 'diagnosing', 'cancelled', 'disputed'],
  in_progress: ['completion_submitted', 'disputed', 'cancelled'],
  completion_submitted: ['completed', 'in_progress', 'disputed'],
  completed: ['disputed'],
  cancelled: ['disputed'],
  disputed: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) throw new Error(`INVALID_JOB_TRANSITION:${from}:${to}`);
}
