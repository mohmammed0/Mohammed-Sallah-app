import { describe, expect, it } from 'vitest';
import { reduceLocationSharing } from '../src/features/jobs/location-sharing';

describe('bounded foreground location sharing state', () => {
  it('requires an explicit request before sharing and stops explicitly', () => {
    const requesting = reduceLocationSharing({ state: 'idle' }, { type: 'REQUEST' });
    expect(requesting).toEqual({ state: 'requesting' });
    const sharing = reduceLocationSharing(requesting, {
      type: 'STARTED',
      sessionId: 'session',
      expiresAt: '2026-08-18T10:30:00Z',
    });
    expect(sharing.state).toBe('sharing');
    const stopping = reduceLocationSharing(sharing, { type: 'STOP' });
    expect(stopping).toEqual({ state: 'stopping', sessionId: 'session' });
    expect(reduceLocationSharing(stopping, { type: 'STOPPED' })).toEqual({ state: 'stopped' });
  });

  it('expires a live share and ignores invalid transitions', () => {
    const idle = { state: 'idle' } as const;
    expect(reduceLocationSharing(idle, { type: 'STOP' })).toBe(idle);
    const sharing = {
      state: 'sharing',
      sessionId: 'session',
      expiresAt: '2026-08-18T10:30:00Z',
    } as const;
    expect(reduceLocationSharing(sharing, { type: 'EXPIRED' })).toEqual({ state: 'stopped' });
  });
});
