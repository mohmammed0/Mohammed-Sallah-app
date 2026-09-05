import { describe, expect, it, vi } from 'vitest';
import { loadProviderBriefs } from '../src/features/provider/provider-feed-resilience';

describe('provider feed resilience', () => {
  it('keeps eligible requests visible when one authorized brief fails to load', async () => {
    const matches = [
      { id: 'match-1', requestId: 'request-1' },
      { id: 'match-2', requestId: 'request-2' },
    ];
    const loadBrief = vi.fn(async (requestId: string) => {
      if (requestId === 'request-1') throw new Error('TEMPORARY_BRIEF_FAILURE');
      return { title: 'Second authorized brief' };
    });

    await expect(loadProviderBriefs(matches, loadBrief)).resolves.toEqual([
      {
        match: matches[0],
        brief: null,
        briefState: 'retryable',
      },
      {
        match: matches[1],
        brief: { title: 'Second authorized brief' },
        briefState: 'ready',
      },
    ]);
    expect(loadBrief).toHaveBeenCalledTimes(2);
  });

  it('preserves the authoritative match order', async () => {
    const matches = [
      { id: 'match-1', requestId: 'slow' },
      { id: 'match-2', requestId: 'fast' },
    ];
    const loadBrief = async (requestId: string) => {
      if (requestId === 'slow') await Promise.resolve();
      return { title: requestId };
    };

    const result = await loadProviderBriefs(matches, loadBrief);

    expect(result.map(({ match }) => match.id)).toEqual(['match-1', 'match-2']);
  });
});
