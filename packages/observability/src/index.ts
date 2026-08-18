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
const sensitiveKey = /token|password|secret|address|authorization|cookie|document|payment/i;
export function redact(attributes: LogEvent['attributes']): LogEvent['attributes'] {
  if (!attributes) return undefined;
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      sensitiveKey.test(key) ? '[REDACTED]' : value,
    ]),
  );
}
export const consoleLogger: Logger = {
  write(event) {
    console.log(
      JSON.stringify({
        ...event,
        attributes: redact(event.attributes),
        timestamp: new Date().toISOString(),
      }),
    );
  },
};
export function createCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}
