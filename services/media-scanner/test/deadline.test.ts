import { describe, expect, it, vi } from 'vitest';

import { AttemptDeadline, type DeadlineError } from '../src/deadline.js';

describe('one immutable scanner attempt deadline', () => {
  it('uses the earlier of the authoritative wall deadline and one 120 second monotonic budget', () => {
    let wall = Date.parse('2026-08-21T12:00:00.000Z');
    let monotonic = 5_000;
    const deadline = new AttemptDeadline({
      processingDeadline: '2026-08-21T12:02:00.000Z',
      nowMs: () => wall,
      monotonicMs: () => monotonic,
      setTimer: () => ({}) as NodeJS.Timeout,
      clearTimer: () => undefined,
    });

    expect(deadline.remainingMs()).toBe(120_000);
    wall += 30_000;
    monotonic += 30_000;
    expect(deadline.remainingMs()).toBe(90_000);
    monotonic += 90_000;
    expect(() => deadline.assertActive()).toThrowError(
      expect.objectContaining<Partial<DeadlineError>>({ code: 'attempt_deadline_expired' }),
    );
  });

  it('aborts in-flight work and never extends when wall time moves backwards', () => {
    let wall = Date.parse('2026-08-21T12:00:00.000Z');
    let monotonic = 10_000;
    let callback: (() => void) | undefined;
    const deadline = new AttemptDeadline({
      processingDeadline: '2026-08-21T12:02:00.000Z',
      nowMs: () => wall,
      monotonicMs: () => monotonic,
      setTimer: (handler) => {
        callback = handler;
        return {} as NodeJS.Timeout;
      },
      clearTimer: vi.fn(),
    });

    wall -= 60_000;
    monotonic += 5_000;
    expect(deadline.remainingMs()).toBe(115_000);
    callback?.();
    expect(deadline.signal.aborted).toBe(true);
    expect(() => deadline.assertActive()).toThrowError('attempt_deadline_expired');
  });

  it('freezes a partially elapsed claim to its accepted monotonic remainder', () => {
    let wall = Date.parse('2026-08-21T12:01:50.000Z');
    let monotonic = 20_000;
    const deadline = new AttemptDeadline({
      processingDeadline: '2026-08-21T12:02:00.000Z',
      nowMs: () => wall,
      monotonicMs: () => monotonic,
      setTimer: () => ({}) as NodeJS.Timeout,
      clearTimer: () => undefined,
    });

    wall -= 60_000;
    monotonic += 1_000;
    expect(deadline.remainingMs()).toBe(9_000);
    monotonic += 9_000;
    expect(() => deadline.assertActive()).toThrowError('attempt_deadline_expired');
  });

  it('rejects already-expired, malformed, or overlong deadline contracts', () => {
    const now = Date.parse('2026-08-21T12:00:00.000Z');
    const create = (processingDeadline: string) =>
      new AttemptDeadline({
        processingDeadline,
        nowMs: () => now,
        monotonicMs: () => 1,
        setTimer: () => ({}) as NodeJS.Timeout,
        clearTimer: () => undefined,
      });

    expect(() => create('invalid')).toThrowError('invalid_attempt_deadline');
    expect(() => create('2026-08-21T12:00:00.000Z')).toThrowError('attempt_deadline_expired');
    expect(() => create('2026-08-21T12:02:00.001Z')).toThrowError('invalid_attempt_deadline');
  });
});
