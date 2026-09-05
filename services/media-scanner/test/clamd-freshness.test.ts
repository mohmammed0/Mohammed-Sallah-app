import { describe, expect, it } from 'vitest';

import { parseClamdVersionEvidence } from '../src/clamd.js';

describe('ClamAV signature readiness evidence', () => {
  const now = new Date('2026-08-21T13:00:00.000Z');

  it('accepts a fresh parseable signature timestamp', () => {
    expect(
      parseClamdVersionEvidence('ClamAV 1.4.3/28000/Fri Aug 21 12:00:00 2026', now, 3_600),
    ).toEqual({
      engineVersion: '1.4.3',
      signatureVersion: '28000',
      signatureTimestamp: '2026-08-21T12:00:00.000Z',
      signatureAgeSeconds: 3_600,
    });
  });

  it.each([
    ['stale', 'ClamAV 1.4.3/28000/Fri Aug 21 11:59:59 2026', 'signature_stale'],
    ['future', 'ClamAV 1.4.3/28000/Fri Aug 21 13:00:01 2026', 'signature_future'],
    ['missing date', 'ClamAV 1.4.3/28000', 'signature_unparseable'],
    ['missing database', 'ClamAV 1.4.3//Fri Aug 21 12:00:00 2026', 'signature_unparseable'],
    ['unparseable date', 'ClamAV 1.4.3/28000/reloading', 'signature_unparseable'],
    ['reload window', 'RELOADING', 'signature_unparseable'],
  ] as const)('rejects %s readiness', (_name, response, code) => {
    expect(() => parseClamdVersionEvidence(response, now, 3_600)).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});
