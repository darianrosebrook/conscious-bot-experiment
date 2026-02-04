/**
 * Server logger: consistent, tagged, colorized logs for cognition server.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  event?: string;
  tags?: string[];
  fields?: Record<string, unknown>;
  subsystem?: string;
}

interface LoggerOptions {
  subsystem: string;
}

const COLOR_ENABLED =
  process.stdout.isTTY && process.env.NO_COLOR !== '1' && !process.env.NO_COLOR;

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const MAX_FIELD_LENGTH = 500;

function colorize(text: string, color: string): string {
  if (!COLOR_ENABLED) return text;
  return `${color}${text}${COLORS.reset}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return value.length > MAX_FIELD_LENGTH
      ? `${value.slice(0, MAX_FIELD_LENGTH)}...`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > MAX_FIELD_LENGTH
      ? `${json.slice(0, MAX_FIELD_LENGTH)}...`
      : json;
  } catch {
    return String(value);
  }
}

function formatFields(fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) return '';
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .filter(Boolean)
    .join(' ');
}

export function createServerLogger(options: LoggerOptions) {
  const baseSubsystem = options.subsystem;

  function emit(level: LogLevel, message: string, context: LogContext = {}): void {
    const ts = new Date().toISOString();
    const subsystem = context.subsystem ?? baseSubsystem;
    const event = context.event ? `event=${context.event}` : '';
    const tags = context.tags?.length
      ? `tags=${context.tags.join(',')}`
      : '';
    const fields = formatFields(context.fields);
    const levelLabel = colorize(level.toUpperCase(), LEVEL_COLOR[level]);
    const subsystemLabel = colorize(subsystem, COLORS.cyan);
    const parts = [
      colorize(ts, COLORS.gray),
      levelLabel,
      subsystemLabel,
      event,
      tags,
      message,
      fields,
    ].filter(Boolean);

    const line = parts.join(' ');

    switch (level) {
      case 'error':
        console.error(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      default:
        console.log(line);
        break;
    }
  }

  return {
    debug(message: string, context?: LogContext) {
      emit('debug', message, context);
    },
    info(message: string, context?: LogContext) {
      emit('info', message, context);
    },
    warn(message: string, context?: LogContext) {
      emit('warn', message, context);
    },
    error(message: string, context?: LogContext) {
      emit('error', message, context);
    },
  };
}
