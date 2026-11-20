import { redactDeep, redactString } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export type LogSink = (line: string) => void;

/**
 * Structured JSON-lines logger. Writes to stderr by default because stdout is
 * reserved for the MCP stdio protocol. All output is redacted.
 */
export function createLogger(
  level: LogLevel = 'info',
  sink: LogSink = (line) => process.stderr.write(line + '\n'),
): Logger {
  const emit = (
    lvl: Exclude<LogLevel, 'silent'>,
    msg: string,
    fields?: Record<string, unknown>,
  ) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      msg: redactString(msg),
      ...redactDeep(fields ?? {}),
    };
    sink(JSON.stringify(entry));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

export const silentLogger: Logger = createLogger('silent');
