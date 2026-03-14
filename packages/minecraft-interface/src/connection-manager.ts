/**
 * ConnectionManager: Single authority for Minecraft connection lifecycle.
 *
 * Phase 0 of the runtime restructure. This module is the ONLY place that
 * may schedule connect, disconnect, or reconnect transitions. All other
 * modules (BotAdapter, server.ts, PlanExecutor) must go through this
 * manager or subscribe to its events.
 *
 * Lifecycle states:
 *   disconnected → connecting → connected → disconnecting → disconnected
 *                                       ↘ reconnecting → connecting
 *                                       ↘ blocked (fatal)
 *
 * Disconnect reasons are classified to prevent reconnecting into fatal loops
 * (e.g., duplicate-login, auth failure, version mismatch, ban).
 */

import { EventEmitter } from 'events';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'reconnecting'
  | 'blocked';

export type DisconnectReason =
  | 'clean'           // operator-requested disconnect
  | 'transient'       // network blip, timeout, server restart
  | 'duplicate_login' // "logged in from another location"
  | 'auth_failure'    // invalid credentials, expired token
  | 'version_mismatch'// protocol version incompatibility
  | 'kicked_fatal'    // ban, whitelist denial
  | 'kicked_unknown'  // unclassified kick
  | 'error'           // connection error
  | 'unknown';

export interface ConnectionManagerConfig {
  maxReconnectAttempts: number;    // default 5
  baseReconnectDelayMs: number;    // default 2000
  maxReconnectDelayMs: number;     // default 30000
  reconnectJitterMs: number;       // default 1000
}

export interface ConnectionEvent {
  state: ConnectionState;
  previousState: ConnectionState;
  reason?: DisconnectReason;
  detail?: string;
  attemptNumber?: number;
  timestamp: number;
}

const DEFAULT_CONFIG: ConnectionManagerConfig = {
  maxReconnectAttempts: 5,
  baseReconnectDelayMs: 2000,
  maxReconnectDelayMs: 30000,
  reconnectJitterMs: 1000,
};

// ─── Reason Classification ──────────────────────────────────────────────────

/** Reasons that should NEVER trigger reconnect. */
const FATAL_REASONS: Set<DisconnectReason> = new Set([
  'clean',
  'duplicate_login',
  'auth_failure',
  'version_mismatch',
  'kicked_fatal',
]);

/**
 * Classify a raw disconnect/kick reason string from mineflayer into a
 * structured DisconnectReason. This is the central place to add new
 * patterns as we encounter them.
 */
export function classifyDisconnectReason(
  rawReason: unknown,
  wasKicked: boolean,
): DisconnectReason {
  const str = typeof rawReason === 'string'
    ? rawReason
    : typeof rawReason === 'object' && rawReason !== null
      ? JSON.stringify(rawReason)
      : String(rawReason ?? '');

  const lower = str.toLowerCase();

  // Duplicate login — the #1 cause of reconnect storms
  if (lower.includes('another location') || lower.includes('logged in from')) {
    return 'duplicate_login';
  }

  // Auth failures
  if (lower.includes('invalid_grant') || lower.includes('unverified_username') ||
      lower.includes('authentication') || lower.includes('not authenticated')) {
    return 'auth_failure';
  }

  // Version mismatch
  if (lower.includes('protocol version') || lower.includes('outdated client') ||
      lower.includes('outdated server')) {
    return 'version_mismatch';
  }

  // Ban / whitelist
  if (lower.includes('banned') || lower.includes('whitelist') ||
      lower.includes('not whitelisted') || lower.includes('blacklisted')) {
    return 'kicked_fatal';
  }

  // Flying kick (transient — often from pathfinder movement during lag)
  if (lower.includes('flying') || lower.includes('moved too quickly')) {
    return 'transient';
  }

  // Generic kick with no recognized pattern
  if (wasKicked) {
    return 'kicked_unknown';
  }

  // Connection error or timeout without a kick
  if (lower.includes('timeout') || lower.includes('econnreset') ||
      lower.includes('econnrefused') || lower.includes('epipe')) {
    return 'transient';
  }

  return 'unknown';
}

// ─── ConnectionManager ──────────────────────────────────────────────────────

export class ConnectionManager extends EventEmitter {
  private _state: ConnectionState = 'disconnected';
  private _lastReason: DisconnectReason = 'unknown';
  private _reconnectAttempts = 0;
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _config: ConnectionManagerConfig;
  private _connectFn: (() => Promise<void>) | null = null;
  private _disconnectFn: (() => Promise<void>) | null = null;

  constructor(config: Partial<ConnectionManagerConfig> = {}) {
    super();
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── State queries ────────────────────────────────────────────────────────

  get state(): ConnectionState {
    return this._state;
  }

  get lastReason(): DisconnectReason {
    return this._lastReason;
  }

  get reconnectAttempts(): number {
    return this._reconnectAttempts;
  }

  get isConnected(): boolean {
    return this._state === 'connected';
  }

  get isReconnecting(): boolean {
    return this._state === 'reconnecting';
  }

  /**
   * Full lifecycle snapshot for logging and diagnostics.
   */
  getStatus(): {
    state: ConnectionState;
    lastReason: DisconnectReason;
    reconnectAttempts: number;
    reconnectAllowed: boolean;
  } {
    return {
      state: this._state,
      lastReason: this._lastReason,
      reconnectAttempts: this._reconnectAttempts,
      reconnectAllowed: this._canReconnect(),
    };
  }

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Register the actual connect/disconnect implementations.
   * Called once during setup — the ConnectionManager doesn't know about
   * mineflayer directly; it only knows how to sequence transitions.
   */
  registerHandlers(
    connectFn: () => Promise<void>,
    disconnectFn: () => Promise<void>,
  ): void {
    this._connectFn = connectFn;
    this._disconnectFn = disconnectFn;
  }

  // ── Lifecycle transitions ────────────────────────────────────────────────

  /**
   * Request a connection. Only succeeds from `disconnected` or `blocked` state.
   * Returns when the connection is established (or throws on failure).
   */
  async connect(): Promise<void> {
    if (this._state === 'connecting' || this._state === 'reconnecting') {
      console.log('[ConnectionManager] Already connecting, ignoring duplicate request');
      return;
    }
    if (this._state === 'connected') {
      console.log('[ConnectionManager] Already connected');
      return;
    }
    if (!this._connectFn) {
      throw new Error('[ConnectionManager] No connect handler registered');
    }

    this._cancelReconnectTimer();
    this._transition('connecting');
    this._reconnectAttempts = 0;

    try {
      await this._connectFn();
      this._transition('connected');
    } catch (err) {
      const reason = classifyDisconnectReason(
        err instanceof Error ? err.message : String(err),
        false,
      );
      this._lastReason = reason;
      this._transition(FATAL_REASONS.has(reason) ? 'blocked' : 'disconnected', reason,
        err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Request a clean disconnect. Only the ConnectionManager should call
   * the actual disconnect implementation.
   */
  async disconnect(): Promise<void> {
    if (this._state === 'disconnected' || this._state === 'blocked') {
      return;
    }

    this._cancelReconnectTimer();
    this._transition('disconnecting');
    this._lastReason = 'clean';

    try {
      if (this._disconnectFn) {
        await this._disconnectFn();
      }
    } finally {
      this._transition('disconnected', 'clean');
    }
  }

  /**
   * Called by BotAdapter when the bot disconnects unexpectedly (end/error/kick).
   * This is the ONLY entry point for reconnect decision-making.
   */
  handleUnexpectedDisconnect(rawReason: unknown, wasKicked: boolean): void {
    const reason = classifyDisconnectReason(rawReason, wasKicked);
    this._lastReason = reason;

    console.log(
      `[ConnectionManager] Unexpected disconnect: reason=${reason} ` +
      `raw=${typeof rawReason === 'string' ? rawReason : JSON.stringify(rawReason)} ` +
      `wasKicked=${wasKicked}`
    );

    if (FATAL_REASONS.has(reason)) {
      this._transition('blocked', reason,
        `Not reconnecting: ${reason}. ${typeof rawReason === 'string' ? rawReason : ''}`);
      return;
    }

    // Transient or unknown — attempt reconnect if allowed
    if (this._canReconnect()) {
      this._scheduleReconnect(reason);
    } else {
      this._transition('disconnected', reason,
        `Reconnect attempts exhausted (${this._reconnectAttempts}/${this._config.maxReconnectAttempts})`);
    }
  }

  /**
   * Reset the blocked state (e.g., after operator fixes the server config).
   */
  unblock(): void {
    if (this._state === 'blocked') {
      this._transition('disconnected');
      this._reconnectAttempts = 0;
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private _canReconnect(): boolean {
    return (
      this._reconnectAttempts < this._config.maxReconnectAttempts &&
      this._state !== 'blocked' &&
      this._state !== 'disconnecting'
    );
  }

  private _scheduleReconnect(reason: DisconnectReason): void {
    this._reconnectAttempts++;
    const delay = Math.min(
      this._config.baseReconnectDelayMs * Math.pow(2, this._reconnectAttempts - 1),
      this._config.maxReconnectDelayMs,
    ) + Math.floor(Math.random() * this._config.reconnectJitterMs);

    this._transition('reconnecting', reason,
      `Reconnect ${this._reconnectAttempts}/${this._config.maxReconnectAttempts} in ${delay}ms`);

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      if (this._state !== 'reconnecting') return; // state changed while waiting

      this._transition('connecting');
      try {
        if (this._connectFn) {
          await this._connectFn();
          this._reconnectAttempts = 0;
          this._transition('connected');
        }
      } catch (err) {
        const newReason = classifyDisconnectReason(
          err instanceof Error ? err.message : String(err),
          false,
        );
        this._lastReason = newReason;

        if (FATAL_REASONS.has(newReason)) {
          this._transition('blocked', newReason);
        } else if (this._canReconnect()) {
          this._scheduleReconnect(newReason);
        } else {
          this._transition('disconnected', newReason,
            `Reconnect attempts exhausted (${this._reconnectAttempts}/${this._config.maxReconnectAttempts})`);
        }
      }
    }, delay);
  }

  private _cancelReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _transition(
    newState: ConnectionState,
    reason?: DisconnectReason,
    detail?: string,
  ): void {
    const prev = this._state;
    if (prev === newState) return;

    this._state = newState;
    const event: ConnectionEvent = {
      state: newState,
      previousState: prev,
      reason,
      detail,
      attemptNumber: this._reconnectAttempts || undefined,
      timestamp: Date.now(),
    };

    console.log(
      `[ConnectionManager] ${prev} → ${newState}` +
      (reason ? ` (${reason})` : '') +
      (detail ? ` — ${detail}` : '')
    );

    this.emit('transition', event);
    this.emit(newState, event);
  }
}
