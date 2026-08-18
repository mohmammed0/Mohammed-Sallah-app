import { runClaimedTranscription, type TranscriptionClaim } from './transcription-claim.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('simultaneous transcription requests invoke the provider once', async () => {
  let claimed = false;
  let providerCalls = 0;
  let completedTranscript: string | null = null;
  const claim = (): Promise<TranscriptionClaim> => {
    if (completedTranscript) {
      return Promise.resolve({
        state: 'completed',
        jobId: 'job-1',
        transcript: completedTranscript,
      });
    }
    if (claimed) return Promise.resolve({ state: 'in_progress', jobId: 'job-1' });
    claimed = true;
    return Promise.resolve({ state: 'claimed', jobId: 'job-1', claimToken: 'claim-1' });
  };
  const dependencies = {
    claim,
    async transcribe() {
      providerCalls += 1;
      await Promise.resolve();
      return 'transcribed complaint';
    },
    complete(_jobId: string, _claimToken: string, transcript: string) {
      completedTranscript = transcript;
      return Promise.resolve();
    },
    fail() {
      claimed = false;
      return Promise.resolve();
    },
  };
  const results = await Promise.all([
    runClaimedTranscription(dependencies),
    runClaimedTranscription(dependencies),
  ]);
  assert(providerCalls === 1, 'only the database claim owner may invoke the provider');
  assert(
    results.filter((result) => result.state === 'completed').length === 1,
    'one request must complete',
  );
  assert(
    results.filter((result) => result.state === 'in_progress').length === 1,
    'the duplicate must observe the in-progress claim',
  );
  const replay = await runClaimedTranscription(dependencies);
  assert(replay.state === 'completed' && replay.cached, 'restart/retry must reuse the transcript');
  assert(providerCalls === 1, 'cached replay must not invoke the provider');
});

Deno.test('failed transcription releases the job for an explicit retry', async () => {
  let processing = false;
  let failed = false;
  let calls = 0;
  const dependencies = {
    claim(): Promise<TranscriptionClaim> {
      if (processing) return Promise.resolve({ state: 'in_progress', jobId: 'job-2' });
      processing = true;
      return Promise.resolve({ state: 'claimed', jobId: 'job-2', claimToken: 'claim-2' });
    },
    transcribe() {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('PROVIDER_TIMEOUT'));
      return Promise.resolve('retry transcript');
    },
    complete() {
      processing = false;
      return Promise.resolve();
    },
    fail() {
      processing = false;
      failed = true;
      return Promise.resolve();
    },
  };
  let rejected = false;
  try {
    await runClaimedTranscription(dependencies);
  } catch {
    rejected = true;
  }
  assert(rejected && failed, 'failed provider work must mark the claim retryable');
  const retry = await runClaimedTranscription(dependencies);
  assert(retry.state === 'completed', 'retry must complete without a process restart');
  assert(calls === 2, 'retry must invoke the provider exactly once more');
});
