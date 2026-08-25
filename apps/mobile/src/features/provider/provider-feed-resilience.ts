export type ProviderBriefResult<Match, Brief> =
  | { match: Match; brief: Brief; briefState: 'ready' }
  | { match: Match; brief: null; briefState: 'retryable' };

export async function loadProviderBriefs<Match extends { requestId: string }, Brief>(
  matches: readonly Match[],
  loadBrief: (requestId: string) => Promise<Brief>,
): Promise<Array<ProviderBriefResult<Match, Brief>>> {
  return Promise.all(
    matches.map(async (match) => {
      try {
        return {
          match,
          brief: await loadBrief(match.requestId),
          briefState: 'ready' as const,
        };
      } catch {
        return { match, brief: null, briefState: 'retryable' as const };
      }
    }),
  );
}
