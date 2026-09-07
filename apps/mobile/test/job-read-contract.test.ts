import { describe, expect, it } from 'vitest';
import { jobSchema } from '../src/features/jobs/job-read-contract';

// Shape observed from the actual PostgREST jobs read after native offer selection.
// UNIQUE(job_id) makes conversations and ratings to-one embedded relationships.
const row = {
  id: '8c79c86c-2287-45e4-9450-0919af67f32d',
  customer_id: 'ebc69afc-93dd-4bef-be6a-af055610fcc6',
  provider_id: 'd2000000-0000-4000-8000-000000000001',
  status: 'provider_selected',
  approved_total_minor: 12500,
  version: 1,
  created_at: '2026-09-07T01:01:48.424489+00:00',
  payments: [{ status: 'offline', amount_minor: 12500, refunded_minor: 0 }],
  conversations: { id: '0e957600-f70c-467c-b473-07ba7e5b1809' },
  job_location_updates: [],
  change_orders: [],
  cancellation_requests: [],
  disputes: [],
  ratings: null,
};

describe('job reads from real to-one PostgREST relationships', () => {
  it('keeps a newly selected job and its conversation available without a rating', () => {
    const job = jobSchema.parse(row);
    expect(job.status).toBe('provider_selected');
    expect(job.conversations).toEqual([row.conversations]);
    expect(job.ratings).toEqual([]);
  });

  it('handles a hidden or absent conversation and a completed job with one rating', () => {
    const rating = {
      id: '77777777-7777-4777-8777-777777777777',
      customer_id: row.customer_id,
      provider_id: row.provider_id,
      score: 5,
      review: null,
      moderation_status: 'published',
    };
    const job = jobSchema.parse({
      ...row,
      status: 'completed',
      conversations: null,
      ratings: rating,
    });
    expect(job.conversations).toEqual([]);
    expect(job.ratings).toEqual([rating]);
  });

  it('rejects malformed related data rather than treating it as an empty relationship', () => {
    expect(jobSchema.safeParse({ ...row, conversations: { id: 'invalid' } }).success).toBe(false);
    expect(jobSchema.safeParse({ ...row, ratings: { score: 100 } }).success).toBe(false);
    expect(jobSchema.safeParse({ ...row, payments: null }).success).toBe(false);
  });
});
