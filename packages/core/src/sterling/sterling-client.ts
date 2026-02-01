/**
 * Sterling WebSocket Client
 *
 * Connects to Sterling's unified WS server for graph-search reasoning.
 * Follows the same patterns as HttpClient (circuit breaker, retry) and
 * OllamaClient (env-var config with defaults).
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type {
  SterlingClientConfig,
  SterlingConnectionState,
  SterlingDomain,
  SterlingHealthStatus,
  SterlingMessage,
  SterlingRequest,
  SterlingSolveResult,
  SterlingSolveStepCallback,
  SterlingDiscoveredNode,
  SterlingSearchEdge,
  SterlingSolutionEdge,
} from './types';

// ============================================================================
// Circuit Breaker
// ============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

// ============================================================================
// Client Implementation
// ============================================================================

export class SterlingClient extends EventEmitter {
  private config: Required<SterlingClientConfig>;
  private ws: WebSocket | null = null;
  private connectionState: SterlingConnectionState = 'disconnected';
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    isOpen: false,
  };
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingMs: number | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(config: SterlingClientConfig = {}) {
    super();
    this.config = {
      url:
        config.url ||
        process.env.STERLING_WS_URL ||
        'ws://localhost:8766',
      enabled:
        config.enabled ??
        (process.env.STERLING_ENABLED !== 'false'),
      solveTimeout:
        config.solveTimeout ??
        parseInt(process.env.STERLING_SOLVE_TIMEOUT || '60000'),
      connectTimeout: config.connectTimeout ?? 5000,
      pingInterval: config.pingInterval ?? 30000,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
    };
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  /** Establish WebSocket connection. Idempotent — returns existing promise if already connecting. */
  connect(): Promise<void> {
    if (!this.config.enabled) {
      return Promise.reject(new Error('Sterling client is disabled'));
    }

    if (this.connectionState === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.doConnect();
    return this.connectPromise;
  }

  private doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.connectionState = 'connecting';
      this.emit('connecting');

      const connectTimer = setTimeout(() => {
        if (this.ws) {
          this.ws.terminate();
        }
        this.connectionState = 'disconnected';
        this.connectPromise = null;
        reject(new Error(`Connection timeout after ${this.config.connectTimeout}ms`));
      }, this.config.connectTimeout);

      try {
        this.ws = new WebSocket(this.config.url);
      } catch (err) {
        clearTimeout(connectTimer);
        this.connectionState = 'disconnected';
        this.connectPromise = null;
        reject(err);
        return;
      }

      this.ws.on('open', () => {
        clearTimeout(connectTimer);
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.connectPromise = null;
        this.startPingInterval();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as SterlingMessage;
          this.emit('message', message);
        } catch {
          // Ignore non-JSON messages
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.stopPingInterval();
        const wasConnected = this.connectionState === 'connected';
        this.connectionState = 'disconnected';
        this.connectPromise = null;
        this.emit('disconnected', { code, reason: reason.toString() });

        if (wasConnected) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(connectTimer);
        this.recordFailure();
        this.emit('error', err);

        if (this.connectionState === 'connecting') {
          this.connectionState = 'disconnected';
          this.connectPromise = null;
          reject(err);
        }
      });
    });
  }

  /** Cleanly close the connection */
  disconnect(): void {
    this.stopPingInterval();
    this.clearReconnectTimer();
    this.connectPromise = null;

    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }

    this.connectionState = 'disconnected';
  }

  /** Full cleanup — disconnect and remove all listeners */
  destroy(): void {
    this.disconnect();
    this.removeAllListeners();
  }

  // --------------------------------------------------------------------------
  // Reconnection
  // --------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('reconnect_failed', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.connectionState = 'reconnecting';
    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const delay =
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1) +
      Math.random() * 500;

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.doConnect();
        this.emit('reconnected', { attempts: this.reconnectAttempts });
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  // --------------------------------------------------------------------------
  // Keep-Alive
  // --------------------------------------------------------------------------

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingTimer = setInterval(() => {
      this.ping().catch(() => {
        // Ping failure is handled by circuit breaker
      });
    }, this.config.pingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Circuit Breaker
  // --------------------------------------------------------------------------

  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false;

    const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;
    if (elapsed > this.config.circuitBreakerTimeout) {
      // Auto-reset
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      return false;
    }
    return true;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      this.circuitBreaker.isOpen = true;
      this.emit('circuit_open');
    }
  }

  private recordSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
  }

  // --------------------------------------------------------------------------
  // Messaging
  // --------------------------------------------------------------------------

  private send(request: SterlingRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(request));
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Send a ping and wait for pong. Returns true if successful. */
  async ping(): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const start = Date.now();

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        this.recordFailure();
        resolve(false);
      }, 5000);

      const handler = (msg: SterlingMessage) => {
        if (msg.type === 'pong') {
          cleanup();
          this.lastPingMs = Date.now() - start;
          this.recordSuccess();
          resolve(true);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.removeListener('message', handler);
      };

      this.on('message', handler);

      try {
        this.send({ command: 'ping' });
      } catch {
        cleanup();
        this.recordFailure();
        resolve(false);
      }
    });
  }

  /** Request server status */
  async getStatus(): Promise<Record<string, unknown> | null> {
    if (!this.isAvailable()) return null;

    return new Promise<Record<string, unknown> | null>((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);

      const handler = (msg: SterlingMessage) => {
        if (msg.type === 'status') {
          cleanup();
          this.recordSuccess();
          resolve(msg.data);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.removeListener('message', handler);
      };

      this.on('message', handler);

      try {
        this.send({ command: 'get_status' });
      } catch {
        cleanup();
        this.recordFailure();
        resolve(null);
      }
    });
  }

  /**
   * Run a solve operation on a Sterling domain.
   *
   * Sends a solve command and collects streamed messages (discover, search_edge,
   * solution, solution_path) until a `complete` or `error` message arrives.
   *
   * @param domain - The solver domain (e.g. 'wikipedia', 'escape', 'wordnet', 'cube')
   * @param params - Domain-specific parameters (e.g. startTitle, targetTitle for wikipedia)
   * @param onStep - Optional callback invoked for each streamed message
   */
  async solve(
    domain: SterlingDomain,
    params: Record<string, unknown> = {},
    onStep?: SterlingSolveStepCallback
  ): Promise<SterlingSolveResult> {
    if (this.isCircuitOpen()) {
      return {
        solutionFound: false,
        solutionPath: [],
        discoveredNodes: [],
        searchEdges: [],
        metrics: {},
        error: 'Circuit breaker is open',
        durationMs: 0,
      };
    }

    // Ensure connected
    if (this.connectionState !== 'connected') {
      try {
        await this.connect();
      } catch (err) {
        return {
          solutionFound: false,
          solutionPath: [],
          discoveredNodes: [],
          searchEdges: [],
          metrics: {},
          error: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: 0,
        };
      }
    }

    const startTime = Date.now();
    const discoveredNodes: SterlingDiscoveredNode[] = [];
    const searchEdges: SterlingSearchEdge[] = [];
    const solutionPath: SterlingSolutionEdge[] = [];
    let solutionFound = false;
    let metrics: Record<string, unknown> = {};
    let error: string | undefined;

    return new Promise<SterlingSolveResult>((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        this.recordFailure();
        resolve({
          solutionFound,
          solutionPath,
          discoveredNodes,
          searchEdges,
          metrics,
          error: `Solve timeout after ${this.config.solveTimeout}ms`,
          durationMs: Date.now() - startTime,
        });
      }, this.config.solveTimeout);

      const handler = (msg: SterlingMessage) => {
        onStep?.(msg);

        switch (msg.type) {
          case 'discover':
            discoveredNodes.push({
              id: msg.u,
              title: msg.title,
              g: msg.g,
              h: msg.h,
              distance: msg.distance,
              isStart: msg.isStart,
              isSolution: msg.isSolution,
            });
            break;

          case 'search_edge':
            searchEdges.push({
              source: msg.source,
              target: msg.target,
              label: msg.label,
            });
            break;

          case 'solution':
            solutionFound = true;
            break;

          case 'solution_path':
            solutionPath.push({
              source: msg.source,
              target: msg.target,
              label: msg.label,
            });
            break;

          case 'complete':
            cleanup();
            metrics = msg.metrics || {};
            this.recordSuccess();
            resolve({
              solutionFound,
              solutionPath,
              discoveredNodes,
              searchEdges,
              metrics,
              durationMs: Date.now() - startTime,
            });
            break;

          case 'error':
            cleanup();
            error = msg.code
              ? `[${msg.code}] ${msg.message}`
              : msg.message;
            if (msg.code === 'unknown_domain') {
              console.error(
                `[Sterling] Unknown domain error: domain=${msg.domain ?? 'unknown'} message=${msg.message}`
              );
            }
            this.recordFailure();
            resolve({
              solutionFound: false,
              solutionPath,
              discoveredNodes,
              searchEdges,
              metrics,
              error,
              durationMs: Date.now() - startTime,
            });
            break;
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.removeListener('message', handler);
      };

      this.on('message', handler);

      try {
        this.send({
          command: 'solve',
          domain,
          ...params,
        });
      } catch (err) {
        cleanup();
        this.recordFailure();
        resolve({
          solutionFound: false,
          solutionPath: [],
          discoveredNodes: [],
          searchEdges: [],
          metrics: {},
          error: `Send failed: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - startTime,
        });
      }
    });
  }

  /** Whether the client is connected and the circuit breaker is closed */
  isAvailable(): boolean {
    return (
      this.config.enabled &&
      this.connectionState === 'connected' &&
      this.ws?.readyState === WebSocket.OPEN &&
      !this.isCircuitOpen()
    );
  }

  /** Get the current health status snapshot */
  getHealthStatus(): SterlingHealthStatus {
    return {
      connected:
        this.connectionState === 'connected' &&
        this.ws?.readyState === WebSocket.OPEN,
      connectionState: this.connectionState,
      lastPingMs: this.lastPingMs,
      circuitBreakerOpen: this.circuitBreaker.isOpen,
    };
  }
}
