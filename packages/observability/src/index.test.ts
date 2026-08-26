import { describe, expect, it, vi } from 'vitest';
import {
  consoleLogger,
  createCorrelationId,
  redact,
  serializeLogEvent,
  type LogEvent,
} from './index';

describe('privacy-safe operational logging', () => {
  it('redacts sensitive keys and sensitive-looking values even under generic keys', () => {
    const attributes = redact({
      attempt: 2,
      readiness: 'clamav_ready',
      authorization: 'Bearer top-secret',
      message: 'request failed for person@example.test',
      origin: 'https://private.example.test/path?token=secret',
      artifact: '/tmp/private/customer-recording.m4a',
      principal: '11111111-1111-4111-8111-111111111111',
      actorId: 'opaque-principal',
      detail: 'customer-recording.m4a',
      network: '10.0.0.22',
    });

    expect(attributes).toEqual({
      attempt: 2,
      readiness: 'clamav_ready',
      authorization: '[REDACTED]',
      message: '[REDACTED]',
      origin: '[REDACTED]',
      artifact: '[REDACTED]',
      principal: '[REDACTED]',
      actorId: '[REDACTED]',
      detail: '[REDACTED]',
      network: '[REDACTED]',
    });
  });

  it('bounds attribute count, key length, and string length', () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`safe_${index}`, `status_${index}`]),
    );
    const attributes = redact({
      ...many,
      ['x'.repeat(80)]: 'safe',
      longValue: 'a'.repeat(300),
    });

    expect(Object.keys(attributes ?? {})).toHaveLength(24);
    expect(JSON.stringify(attributes)).not.toContain('a'.repeat(300));
    expect(JSON.stringify(attributes)).not.toContain('x'.repeat(80));
  });

  it('serializes a bounded schema without raw error text or stack data', () => {
    const event: LogEvent = {
      level: 'error',
      event: 'mobile_error_boundary',
      correlationId: '01HZX_SAFE_CORRELATION',
      category: 'unexpected',
      durationMs: 42,
      attributes: {
        boundary: 'root',
        message: 'Bearer private-token',
        stack: 'Error at /private/source/file.ts:1:1',
      },
    };

    const serialized = serializeLogEvent(event, '2026-08-25T12:00:00.000Z');

    expect(JSON.parse(serialized)).toEqual({
      schema: 'sallah.operational-log.v1',
      timestamp: '2026-08-25T12:00:00.000Z',
      level: 'error',
      event: 'mobile_error_boundary',
      correlationId: '01HZX_SAFE_CORRELATION',
      category: 'unexpected',
      durationMs: 42,
      attributes: {
        boundary: 'root',
        message: '[REDACTED]',
        stack: '[REDACTED]',
      },
    });
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('/private/source');
  });

  it('routes errors to stderr without logging the raw event object', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    consoleLogger.write({
      level: 'error',
      event: 'web_error_boundary',
      correlationId: 'safe-correlation',
      attributes: { message: 'person@example.test' },
    });

    expect(error).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).not.toContain('person@example.test');
    error.mockRestore();
    log.mockRestore();
  });

  it('does not serialize a caller-provided invalid timestamp', () => {
    const serialized = serializeLogEvent(
      {
        level: 'warn',
        event: 'scheduler_delayed',
        correlationId: 'safe-correlation',
      },
      'person@example.test',
    );

    expect(JSON.parse(serialized) as unknown).toEqual(
      expect.objectContaining({ timestamp: 'invalid-timestamp' }),
    );
    expect(serialized).not.toContain('person@example.test');
  });

  it('creates correlation IDs without relying on caller-provided identity', () => {
    const first = createCorrelationId();
    const second = createCorrelationId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second).not.toBe(first);
  });

  it('creates safe correlation IDs when Web Crypto is unavailable at mobile startup', () => {
    vi.stubGlobal('crypto', undefined);

    try {
      const first = createCorrelationId();
      const second = createCorrelationId();

      expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
      expect(second).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
      expect(second).not.toBe(first);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
