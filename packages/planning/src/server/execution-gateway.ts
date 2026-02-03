/**
 * ExecutionGateway — single sanctioned path for planning-side world mutations.
 *
 * Every planning-side caller that wants to cause a Minecraft world mutation
 * MUST go through this gateway. It applies:
 *   1. Bot connection pre-flight
 *   2. Mode gating (shadow vs live)
 *   3. Response normalization (normalizeActionResponse)
 *   4. Structured audit emission
 *
 * The gateway delegates HTTP transport to mcPostJson, which provides:
 *   - Circuit breaker
 *   - Retry with exponential backoff
 *   - Timeout enforcement
 *
 * Invariant E0: no planning-side code may call /action directly.
 *
 * @author @darianrosebrook
 */

import {
  normalizeActionResponse,
  type NormalizedActionResponse,
} from './action-response';
import {
  mcPostJson,
  checkBotConnectionDetailed,
} from '../modules/mc-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Origin of the action request. Used for audit and policy decisions. */
export type ExecutionOrigin =
  | 'executor'       // Autonomous planning executor (primary path)
  | 'reactive'       // Reactive executor (task-specific branches)
  | 'cognition'      // Cognition-triggered (intrusive thoughts, etc.)
  | 'manual'         // Manual/API-triggered
  | 'safety';        // Safety monitor (emergency actions)

/** Priority level for the action. */
export type ExecutionPriority = 'normal' | 'high' | 'emergency';

/** Optional tracing context for audit linkage. */
export interface ExecutionContext {
  taskId?: string;
  stepId?: string;
  traceBundleHash?: string;
  episodeId?: string;
}

/** The Minecraft action payload (what gets POSTed to /action). */
export interface GatewayAction {
  type: string;
  parameters?: Record<string, any>;
  timeout?: number;
}

/** Input to the gateway. */
export interface GatewayRequest {
  origin: ExecutionOrigin;
  priority: ExecutionPriority;
  action: GatewayAction;
  context?: ExecutionContext;
}

/** Output from the gateway. Extends NormalizedActionResponse with audit fields. */
export interface GatewayResponse extends NormalizedActionResponse {
  /** Whether the action was blocked by mode gating (shadow mode). */
  shadowBlocked: boolean;
  /** The origin that submitted this request. */
  origin: ExecutionOrigin;
  /** Duration of the action in milliseconds (0 if shadow-blocked). */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Mode resolution (reads env once per call, no caching — tests can override)
// ---------------------------------------------------------------------------

function resolveMode(): 'shadow' | 'live' {
  const rawMode = (process.env.EXECUTOR_MODE || 'shadow').toLowerCase();
  if (rawMode === 'live' && process.env.EXECUTOR_LIVE_CONFIRM === 'YES') {
    return 'live';
  }
  return 'shadow';
}

// ---------------------------------------------------------------------------
// Audit emission
// ---------------------------------------------------------------------------

export type GatewayAuditListener = (entry: GatewayAuditEntry) => void;

export interface GatewayAuditEntry {
  ts: number;
  origin: ExecutionOrigin;
  priority: ExecutionPriority;
  action: { type: string };
  mode: 'shadow' | 'live';
  ok: boolean;
  error?: string;
  failureCode?: string;
  durationMs: number;
  context?: ExecutionContext;
}

const auditListeners: GatewayAuditListener[] = [];

/** Register an audit listener. Returns an unsubscribe function. */
export function onGatewayAudit(listener: GatewayAuditListener): () => void {
  auditListeners.push(listener);
  return () => {
    const idx = auditListeners.indexOf(listener);
    if (idx >= 0) auditListeners.splice(idx, 1);
  };
}

function emitAudit(entry: GatewayAuditEntry): void {
  for (const listener of auditListeners) {
    try {
      listener(entry);
    } catch {
      // Audit listeners must not break the gateway.
    }
  }
}

// ---------------------------------------------------------------------------
// Gateway implementation
// ---------------------------------------------------------------------------

/**
 * Execute a world-mutating action through the canonical gateway.
 *
 * This is the ONLY sanctioned way for planning-side code to reach /action.
 */
export async function executeViaGateway(
  req: GatewayRequest,
  signal?: AbortSignal,
): Promise<GatewayResponse> {
  const mode = resolveMode();
  const start = Date.now();

  // --- Shadow mode: log but don't execute ---
  if (mode === 'shadow') {
    const entry: GatewayAuditEntry = {
      ts: start,
      origin: req.origin,
      priority: req.priority,
      action: { type: req.action.type },
      mode: 'shadow',
      ok: false,
      error: 'Blocked by shadow mode',
      durationMs: 0,
      context: req.context,
    };
    emitAudit(entry);
    return {
      ok: false,
      error: 'Blocked by shadow mode',
      data: null,
      shadowBlocked: true,
      origin: req.origin,
      durationMs: 0,
    };
  }

  // --- Live mode: execute through the canonical path ---
  try {
    // 1. Bot connection pre-flight
    const botConnection = await checkBotConnectionDetailed();
    if (!botConnection.ok) {
      const error = botConnection.failureKind === 'timeout'
        ? 'Bot connection timed out'
        : 'Bot not connected';
      const durationMs = Date.now() - start;
      emitAudit({
        ts: start,
        origin: req.origin,
        priority: req.priority,
        action: { type: req.action.type },
        mode: 'live',
        ok: false,
        error,
        durationMs,
        context: req.context,
      });
      return {
        ok: false,
        error,
        data: null,
        shadowBlocked: false,
        origin: req.origin,
        durationMs,
      };
    }

    // 2. HTTP dispatch to MC interface /action
    const post = await mcPostJson<any>(
      '/action',
      { type: req.action.type, parameters: req.action.parameters },
      req.action.timeout || 15_000,
      signal,
    );

    if (!post.ok) {
      const durationMs = Date.now() - start;
      emitAudit({
        ts: start,
        origin: req.origin,
        priority: req.priority,
        action: { type: req.action.type },
        mode: 'live',
        ok: false,
        error: post.error || 'Action request failed',
        durationMs,
        context: req.context,
      });
      return {
        ok: false,
        error: post.error || 'Action request failed',
        data: null,
        shadowBlocked: false,
        origin: req.origin,
        durationMs,
      };
    }

    // 3. Normalize response through the single interpretation point
    const normalized = normalizeActionResponse(post.data);
    const durationMs = Date.now() - start;

    // 4. Audit
    emitAudit({
      ts: start,
      origin: req.origin,
      priority: req.priority,
      action: { type: req.action.type },
      mode: 'live',
      ok: normalized.ok,
      error: normalized.error,
      failureCode: normalized.failureCode,
      durationMs,
      context: req.context,
    });

    return {
      ...normalized,
      shadowBlocked: false,
      origin: req.origin,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : 'Network error';
    emitAudit({
      ts: start,
      origin: req.origin,
      priority: req.priority,
      action: { type: req.action.type },
      mode: 'live',
      ok: false,
      error: errorMsg,
      durationMs,
      context: req.context,
    });
    return {
      ok: false,
      error: errorMsg,
      data: null,
      shadowBlocked: false,
      origin: req.origin,
      durationMs,
    };
  }
}
