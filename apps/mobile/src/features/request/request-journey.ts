import type { Coordinates } from '@/features/location/location-model';

export const requestJourneySteps = [
  'category',
  'chat',
  'location',
  'timing',
  'review',
  'success',
] as const;
export type RequestJourneyStep = (typeof requestJourneySteps)[number];

export function requestJourneyStepNumber(step: RequestJourneyStep): number {
  const index = requestJourneySteps.indexOf(step);
  return Math.min(index + 1, 5);
}

export function nextRequestJourneyStep(step: RequestJourneyStep): RequestJourneyStep {
  const index = requestJourneySteps.indexOf(step);
  return requestJourneySteps[Math.min(index + 1, requestJourneySteps.length - 1)] ?? 'category';
}

export function previousRequestJourneyStep(step: RequestJourneyStep): RequestJourneyStep {
  const index = requestJourneySteps.indexOf(step);
  return requestJourneySteps[Math.max(0, index - 1)] ?? 'category';
}

export interface ReviewReadiness {
  selectedCategorySlug: string;
  categoryConfirmedByUser: boolean;
  title: string;
  summary: string;
  coordinates: Coordinates | null;
  cityCode: string;
  timingMode: 'asap' | 'scheduled' | 'flexible';
  requestedStart: string | null;
  requestedEnd: string | null;
  pendingTurnCount: number;
}

export function isRequestReadyForReview(input: ReviewReadiness): boolean {
  const scheduledWindowValid =
    input.timingMode !== 'scheduled' ||
    (input.requestedStart !== null &&
      input.requestedEnd !== null &&
      Date.parse(input.requestedEnd) > Date.parse(input.requestedStart));
  return (
    input.selectedCategorySlug.length > 0 &&
    input.categoryConfirmedByUser &&
    input.title.trim().length >= 3 &&
    input.summary.trim().length >= 10 &&
    input.coordinates !== null &&
    input.cityCode.length > 0 &&
    scheduledWindowValid &&
    input.pendingTurnCount === 0
  );
}

export function buildRiyadhScheduleWindow(
  preset: 'morning' | 'afternoon' | 'evening',
  from = new Date(),
): { requestedStart: string; requestedEnd: string } {
  const riyadhDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(from);
  const [year, month, day] = riyadhDate.split('-').map(Number);
  const tomorrowUtcMidnight = Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1);
  const startHour = preset === 'morning' ? 6 : preset === 'afternoon' ? 11 : 15;
  const start = new Date(tomorrowUtcMidnight + startHour * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { requestedStart: start.toISOString(), requestedEnd: end.toISOString() };
}

export function publicationWindow(
  timingMode: 'asap' | 'scheduled' | 'flexible',
  requestedStart: string | null,
  requestedEnd: string | null,
): { requestedStart: string | null; requestedEnd: string | null } {
  if (timingMode === 'flexible' || timingMode === 'asap') {
    return { requestedStart: null, requestedEnd: null };
  }
  if (
    requestedStart === null ||
    requestedEnd === null ||
    Date.parse(requestedEnd) <= Date.parse(requestedStart)
  ) {
    throw new Error('VALID_SCHEDULED_WINDOW_REQUIRED');
  }
  return { requestedStart, requestedEnd };
}
