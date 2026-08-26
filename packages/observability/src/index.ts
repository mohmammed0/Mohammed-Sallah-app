export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEvent {
  level: LogLevel;
  event: string;
  correlationId: string;
  category?: string;
  durationMs?: number;
  attributes?: Record<string, string | number | boolean | null>;
}
export interface Logger {
  write(event: LogEvent): void;
}

const LOG_SCHEMA = 'sallah.operational-log.v1' as const;
const MAX_ATTRIBUTES = 24;
const MAX_ATTRIBUTE_STRING_LENGTH = 128;
const safeIdentifier = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const safeCorrelationId = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const sensitiveKey =
  /token|password|secret|address|authorization|cookie|document|payment|email|url|uri|path|file|location|latitude|longitude|user|customer|provider|media|content|body|payload|query|header|session|phone|principal|artifact|stack|message|actor|owner|identity|subject|identifier|id$/i;
const sensitiveValuePatterns = [
  /(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/i,
  /https?:\/\/|www\./i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:^|\s)(?:\/[A-Za-z0-9._~-]+){2,}/,
  /[A-Za-z]:\\[^\s]+/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\b[^\s/\\]+\.(?:jpe?g|png|webp|m4a|mp4|pdf|docx?|zip|ts|tsx|js|json)\b/i,
  /[?&](?:token|signature|key|secret|code)=/i,
  /[\r\n]/,
] as const;

function redactString(value: string): string {
  if (
    value.length > MAX_ATTRIBUTE_STRING_LENGTH ||
    sensitiveValuePatterns.some((pattern) => pattern.test(value))
  ) {
    return '[REDACTED]';
  }
  return value;
}

export function redact(attributes: LogEvent['attributes']): LogEvent['attributes'] {
  if (!attributes) return undefined;
  const safeAttributes: NonNullable<LogEvent['attributes']> = {};
  let accepted = 0;
  for (const [key, value] of Object.entries(attributes)) {
    if (accepted >= MAX_ATTRIBUTES) break;
    if (!safeIdentifier.test(key)) continue;
    safeAttributes[key] =
      sensitiveKey.test(key) || (typeof value === 'number' && !Number.isFinite(value))
        ? '[REDACTED]'
        : typeof value === 'string'
          ? redactString(value)
          : value;
    accepted += 1;
  }
  return safeAttributes;
}

function boundedIdentifier(value: string, fallback: string): string {
  return safeIdentifier.test(value) ? value : fallback;
}

function boundedDuration(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(Math.round(value), 86_400_000);
}

function boundedTimestamp(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
    ? value
    : 'invalid-timestamp';
}

export function serializeLogEvent(event: LogEvent, timestamp = new Date().toISOString()): string {
  const durationMs = boundedDuration(event.durationMs);
  const attributes = redact(event.attributes);
  return JSON.stringify({
    schema: LOG_SCHEMA,
    timestamp: boundedTimestamp(timestamp),
    level: event.level,
    event: boundedIdentifier(event.event, 'invalid_event'),
    correlationId: safeCorrelationId.test(event.correlationId)
      ? event.correlationId
      : 'invalid-correlation-id',
    ...(event.category ? { category: boundedIdentifier(event.category, 'unknown') } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
  });
}

export const consoleLogger: Logger = {
  write(event) {
    const line = serializeLogEvent(event);
    if (event.level === 'error') {
      console.error(line);
      return;
    }
    if (event.level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  },
};

let fallbackCorrelationSequence = 0;

function createFallbackCorrelationId(): string {
  fallbackCorrelationSequence = (fallbackCorrelationSequence + 1) % 0x1000000;
  const timestamp = Date.now().toString(36);
  const sequence = fallbackCorrelationSequence.toString(36).padStart(5, '0');
  const random = Math.floor(Math.random() * 0x100000000)
    .toString(36)
    .padStart(7, '0');
  return `corr-${timestamp}-${sequence}-${random}`;
}

export function createCorrelationId(): string {
  const cryptoApi = globalThis.crypto as typeof globalThis.crypto | undefined;
  return typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : createFallbackCorrelationId();
}
