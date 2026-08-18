export type TranscriptionClaim =
  | { state: 'claimed'; jobId: string; claimToken: string }
  | { state: 'completed'; jobId: string; transcript: string }
  | { state: 'in_progress'; jobId: string }
  | { state: 'media_conflict'; jobId: string };

export interface ClaimedTranscriptionDependencies {
  claim(): Promise<TranscriptionClaim>;
  transcribe(jobId: string, claimToken: string): Promise<string>;
  complete(jobId: string, claimToken: string, transcript: string): Promise<void>;
  fail(jobId: string, claimToken: string): Promise<void>;
}

export type ClaimedTranscriptionResult =
  | { state: 'completed'; transcript: string; cached: true }
  | { state: 'completed'; transcript: string; cached: false }
  | { state: 'in_progress' }
  | { state: 'media_conflict' };

/**
 * The database claim is the serialization point. Only the request receiving
 * `claimed` may invoke the external provider for a user/clientMessageId pair.
 */
export async function runClaimedTranscription(
  dependencies: ClaimedTranscriptionDependencies,
): Promise<ClaimedTranscriptionResult> {
  const claim = await dependencies.claim();
  if (claim.state === 'completed') {
    return { state: 'completed', transcript: claim.transcript, cached: true };
  }
  if (claim.state === 'in_progress') return { state: 'in_progress' };
  if (claim.state === 'media_conflict') return { state: 'media_conflict' };
  try {
    const transcript = await dependencies.transcribe(claim.jobId, claim.claimToken);
    await dependencies.complete(claim.jobId, claim.claimToken, transcript);
    return { state: 'completed', transcript, cached: false };
  } catch (error) {
    await dependencies.fail(claim.jobId, claim.claimToken);
    throw error;
  }
}
