import { describe, expect, it } from 'vitest';
import { allCompletionEvidenceViewed } from '../src/features/jobs/completion-evidence';

describe('completion evidence acknowledgement', () => {
  it('requires every proof to be viewed and never accepts an empty manifest', () => {
    expect(allCompletionEvidenceViewed([], {})).toBe(false);
    expect(allCompletionEvidenceViewed(['proof-1', 'proof-2'], { 'proof-1': true })).toBe(false);
    expect(
      allCompletionEvidenceViewed(['proof-1', 'proof-2'], {
        'proof-1': true,
        'proof-2': true,
      }),
    ).toBe(true);
  });
});
