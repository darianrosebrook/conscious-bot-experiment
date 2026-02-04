/**
 * Server logger: consistent, tagged, colorized logs for cognition server.
 *
 * Tiered logging system:
 * - ROUTINE: Health checks, state polling, SSE connections (suppressed by default)
 * - LIFECYCLE: Server start/stop, LLM health, endpoint registration (always shown)
 * - RESEARCH: Thought generation, social cognition, LLM calls (always shown)
 * - ERROR: All errors and warnings (always shown)
 *
 * Set COGNITION_LOG_LEVEL=verbose to see all logs including routine.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Event tier classification for filtering
type EventTier = 'routine' | 'lifecycle' | 'research' | 'error';

interface LogContext {
  event?: string;
  tags?: string[];
  fields?: Record<string, unknown>;
  subsystem?: string;
}

interface LoggerOptions {
  subsystem: string;
}

// Environment-based log level
const LOG_LEVEL = process.env.COGNITION_LOG_LEVEL || 'normal';
const VERBOSE_MODE = LOG_LEVEL === 'verbose' || LOG_LEVEL === 'debug';

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

// Events that are routine and can be suppressed in normal mode
const ROUTINE_EVENTS = new Set([
  'middleware_request',
  'observation_log',
  'thought_stream_send_ok',
]);

// Paths that are routine health/polling requests
const ROUTINE_PATHS = new Set([
  '/health',
  '/state',
  '/events',
  '/notes',
  '/api/cognitive-stream/recent',
  '/api/cognitive-stream/actionable',
]);

// Research-critical events that should always be logged prominently
const RESEARCH_EVENTS = new Set([
  'thought_generation_started',
  'thought_generation_stopped',
  'thought_generation_error',
  'event_thought_generated',
  'intrusive_thought_recorded',
  'intrusive_thought_processing_error',
  'agency_counters',
  'llm_generate_error',
  'social_consideration_log_failed',
  'chat_consideration_log_failed',
]);

// Lifecycle events (startup/shutdown)
const LIFECYCLE_EVENTS = new Set([
  'server_started',
  'server_endpoints_registered',
  'llm_health_ok',
  'llm_health_non_ok',
  'llm_health_unreachable',
  'intero_history_loaded',
  'intero_history_load_failed',
  'social_memory_init_failed',
  'process_uncaught_exception',
  'process_unhandled_rejection',
]);

/**
 * Classify an event into a tier for filtering
 */
function classifyEvent(event: string | undefined, context: LogContext): EventTier {
  if (!event) return 'lifecycle';

  // Check if it's a routine middleware request
  if (event === 'middleware_request') {
    const path = context.fields?.path as string | undefined;
    // Suppress health checks and polling in normal mode
    if (path && ROUTINE_PATHS.has(path)) {
      return 'routine';
    }
    // Non-routine API requests are still research-relevant
    return 'research';
  }

  if (ROUTINE_EVENTS.has(event)) return 'routine';
  if (RESEARCH_EVENTS.has(event)) return 'research';
  if (LIFECYCLE_EVENTS.has(event)) return 'lifecycle';

  // Default: treat unknown events as lifecycle (show them)
  return 'lifecycle';
}

/**
 * Determine if a log should be emitted based on tier and log level
 */
function shouldEmit(tier: EventTier, level: LogLevel): boolean {
  // Always emit errors and warnings
  if (level === 'error' || level === 'warn') return true;

  // In verbose mode, emit everything
  if (VERBOSE_MODE) return true;

  // In normal mode, suppress routine events
  if (tier === 'routine') return false;

  return true;
}

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
    // Classify and filter
    const tier = classifyEvent(context.event, context);
    if (!shouldEmit(tier, level)) return;

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
