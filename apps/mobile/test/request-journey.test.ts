import { describe, expect, it } from 'vitest';
import {
  buildRiyadhScheduleWindow,
  isRequestReadyForReview,
  nextRequestJourneyStep,
  previousRequestJourneyStep,
  publicationWindow,
} from '../src/features/request/request-journey';

const complete = {
  selectedCategorySlug: 'plumbing',
  categoryConfirmedByUser: true,
  title: 'Low water pressure',
  summary: 'Water pressure is low in the kitchen tap.',
  coordinates: { latitude: 24.7136, longitude: 46.6753 },
  cityCode: 'riyadh',
  timingMode: 'flexible' as const,
  requestedStart: null,
  requestedEnd: null,
  pendingTurnCount: 0,
};

describe('customer request journey', () => {
  it('moves category first through a separate review state', () => {
    expect(nextRequestJourneyStep('category')).toBe('chat');
    expect(nextRequestJourneyStep('chat')).toBe('location');
    expect(nextRequestJourneyStep('location')).toBe('timing');
    expect(nextRequestJourneyStep('timing')).toBe('review');
    expect(previousRequestJourneyStep('review')).toBe('timing');
  });

  it('requires an explicit category, confirmed location and settled AI turns', () => {
    expect(isRequestReadyForReview(complete)).toBe(true);
    expect(isRequestReadyForReview({ ...complete, selectedCategorySlug: '' })).toBe(false);
    expect(isRequestReadyForReview({ ...complete, coordinates: null })).toBe(false);
    expect(isRequestReadyForReview({ ...complete, pendingTurnCount: 1 })).toBe(false);
  });

  it('keeps flexible and ASAP windows empty in the publication payload', () => {
    expect(publicationWindow('flexible', 'stale', 'stale')).toEqual({
      requestedStart: null,
      requestedEnd: null,
    });
    expect(publicationWindow('asap', 'stale', 'stale')).toEqual({
      requestedStart: null,
      requestedEnd: null,
    });
  });

  it('creates a bounded future Riyadh window for scheduled requests', () => {
    const window = buildRiyadhScheduleWindow('morning', new Date('2026-08-19T12:00:00.000Z'));
    expect(window).toEqual({
      requestedStart: '2026-08-20T06:00:00.000Z',
      requestedEnd: '2026-08-20T08:00:00.000Z',
    });
    expect(publicationWindow('scheduled', window.requestedStart, window.requestedEnd)).toEqual(
      window,
    );
  });
});
