/**
 * Sterling Reasoning Service
 *
 * Higher-level service wrapping SterlingClient with planning-relevant methods.
 * Provides reachability verification, knowledge graph traversal, and
 * graceful fallback when Sterling is unavailable.
 *
 * @author @darianrosebrook
 */

import {
  SterlingClient,
  type SterlingClientConfig,
  type SterlingDomain,
  type SterlingSolveResult,
  type SterlingHealthStatus,
  type SterlingSolveStepCallback,
  type SterlingLanguageReducerResult,
} from '@conscious-bot/core';
import { computeDeclarationDigest, type DomainDeclarationV1 } from './domain-declaration';

// ============================================================================
// Types
// ============================================================================

export interface SterlingReasoningConfig extends SterlingClientConfig {
  /** Whether to enable the reasoning service. Default: true */
  enabled?: boolean;
}

export interface ReachabilityResult {
  /** Whether the goal is reachable from the given state */
  reachable: boolean;
  /** Estimated cost/distance if reachable */
  estimatedCost: number | null;
  /** Path length if a solution was found */
  pathLength: number | null;
  /** Human-readable reasoning */
  reasoning: string;
  /** Duration of the reachability check in ms */
  durationMs: number;
}

export interface KGTraversalResult {
  /** Whether a path was found between the concepts */
  pathFound: boolean;
  /** Semantic path as a list of concept labels */
  path: string[];
  /** Number of nodes explored */
  nodesExplored: number;
  /** Duration of the traversal in ms */
  durationMs: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class SterlingReasoningService {
  private client: SterlingClient;
  private enabled: boolean;
  private initialized = false;

  /** Monotonically incrementing nonce — incremented on each (re)connect. */
  private _connectionNonce = 0;

  constructor(config: SterlingReasoningConfig = {}) {
    this.enabled = config.enabled ?? (process.env.STERLING_ENABLED !== 'false');
    this.client = new SterlingClient(config);

    // Forward client events
    this.client.on('connected', () => {
      this._connectionNonce++;
      console.log('[Sterling] Connected to reasoning server');
    });
    this.client.on('disconnected', ({ code, reason }: { code: number; reason: string }) => {
      console.log(`[Sterling] Disconnected (code=${code}, reason=${reason})`);
    });
    this.client.on('reconnected', ({ attempts }: { attempts: number }) => {
      this._connectionNonce++;
      console.log(`[Sterling] Reconnected after ${attempts} attempt(s)`);
    });
    this.client.on('reconnect_failed', ({ attempts }: { attempts: number }) => {
      console.warn(`[Sterling] Reconnection failed after ${attempts} attempts`);
    });
    this.client.on('circuit_open', () => {
      console.warn('[Sterling] Circuit breaker opened — requests will be rejected');
    });
    this.client.on('error', (err: Error) => {
      console.warn(`[Sterling] Error: ${err.message}`);
    });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Lazily connect to Sterling. Safe to call multiple times. */
  async initialize(): Promise<void> {
    if (!this.enabled || this.initialized) return;

    try {
      await this.client.connect();
      this.initialized = true;
    } catch (err) {
      console.warn(
        `[Sterling] Failed to connect during initialization: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      // Don't throw — Sterling is optional
    }
  }

  /** Clean up resources */
  destroy(): void {
    this.client.destroy();
    this.initialized = false;
  }

  // --------------------------------------------------------------------------
  // Availability
  // --------------------------------------------------------------------------

  /** Whether Sterling is enabled AND the client is connected with circuit breaker closed */
  isAvailable(): boolean {
    return this.enabled && this.client.isAvailable();
  }

  /** Get detailed health status */
  getHealthStatus(): SterlingHealthStatus & { enabled: boolean } {
    return {
      enabled: this.enabled,
      ...this.client.getHealthStatus(),
    };
  }

  /**
   * Connection-scoped nonce for declaration registration.
   *
   * Incremented on each successful connect/reconnect. Solvers compare their
   * stored registration nonce against this value to decide whether to
   * re-register after a reconnection.
   */
  getConnectionNonce(): number {
    return this._connectionNonce;
  }

  /**
   * Get the underlying SterlingClient instance.
   *
   * This is used to wire the SterlingTransportAdapter for language IO processing.
   * The same WebSocket connection serves both planning (solvers) and language IO.
   */
  getClient(): SterlingClient {
    return this.client;
  }

  /**
   * Materialize a committed IR digest into an opaque leaf-step bundle.
   */
  async expandByDigest(
    request: {
      committed_ir_digest: string;
      schema_version: string;
      request_id?: string;
      envelope_id?: string;
      client_trace_id?: string;
      transport_context?: Record<string, unknown>;
    },
    timeoutMs?: number,
  ): Promise<
    | {
        status: 'ok';
        plan_bundle_digest: string;
        steps: Array<{
          id?: string;
          order?: number;
          leaf: string;
          args: Record<string, unknown>;
          meta?: Record<string, unknown>;
        }>;
        schema_version?: string;
      }
    | { status: 'blocked'; blocked_reason: string; retry_after_ms?: number }
    | { status: 'error'; error: string }
  > {
    if (!this.enabled) {
      return { status: 'blocked', blocked_reason: 'blocked_executor_unavailable' };
    }

    const expandTimeoutMsRaw =
      process.env.STERLING_EXECUTOR_TIMEOUT_MS ?? process.env.STERLING_EXPAND_TIMEOUT_MS ?? '5000';
    const expandTimeoutMs = Number.isFinite(Number(expandTimeoutMsRaw))
      ? Number(expandTimeoutMsRaw)
      : 5000;
    const effectiveTimeoutMs = typeof timeoutMs === 'number' ? timeoutMs : expandTimeoutMs;

    try {
      return await this.client.expandByDigest(request, effectiveTimeoutMs);
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Fetch the server identity banner (evidence-grade). Used by golden-run path
   * to record which Sterling binary is running; invalid/missing banner fails the run.
   */
  async getServerBanner(timeoutMs: number = 3000): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      await this.initialize();
      return await this.client.getServerBanner(timeoutMs);
    } catch {
      return null;
    }
  }

  /**
   * Send a language_io.reduce command to Sterling. Registers the committed IR
   * in Sterling's expansion registry so expandByDigest can resolve the digest.
   */
  async sendLanguageIOReduce(
    envelope: Record<string, unknown>,
    timeoutMs: number = 10000
  ): Promise<
    | { success: true; result: SterlingLanguageReducerResult }
    | { success: false; error: string }
  > {
    if (!this.enabled) {
      return { success: false, error: 'Sterling client not enabled' };
    }
    try {
      await this.initialize();
      return await this.client.sendLanguageIOReduce(envelope, timeoutMs);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // --------------------------------------------------------------------------
  // Reasoning Methods
  // --------------------------------------------------------------------------

  /**
   * Verify whether a goal state is reachable from a given state.
   *
   * Uses Sterling's graph search to check whether a path exists
   * from the current state description to the goal description.
   *
   * @param domain - The solver domain to use
   * @param stateDesc - Description or identifier of the current state
   * @param goalDesc - Description or identifier of the goal state
   */
  async verifyReachability(
    domain: SterlingDomain,
    stateDesc: string,
    goalDesc: string
  ): Promise<ReachabilityResult> {
    if (!this.isAvailable()) {
      return {
        reachable: false,
        estimatedCost: null,
        pathLength: null,
        reasoning: 'Sterling reasoning service unavailable',
        durationMs: 0,
      };
    }

    // Map generic state/goal descriptions to domain-specific params
    const params = this.buildSolveParams(domain, stateDesc, goalDesc);
    const result = await this.client.solve(domain, params);

    return {
      reachable: result.solutionFound,
      estimatedCost: result.solutionFound
        ? result.solutionPath.length
        : null,
      pathLength: result.solutionFound
        ? result.solutionPath.length
        : null,
      reasoning: result.solutionFound
        ? `Path found with ${result.solutionPath.length} steps (${result.discoveredNodes.length} nodes explored)`
        : result.error || 'No path found',
      durationMs: result.durationMs,
    };
  }

  /**
   * Query the knowledge graph for a semantic path between two concepts.
   *
   * Uses the WordNet domain to find paths through the semantic network.
   *
   * @param start - Starting concept (e.g. 'dog.n.01' for WordNet synsets)
   * @param target - Target concept
   * @param opts - Optional parameters (edge types, max nodes, etc.)
   */
  async queryKnowledgeGraph(
    start: string,
    target: string,
    opts: { allowedEdgeTypes?: string[]; maxNodes?: number } = {}
  ): Promise<KGTraversalResult> {
    if (!this.isAvailable()) {
      return {
        pathFound: false,
        path: [],
        nodesExplored: 0,
        durationMs: 0,
      };
    }

    const params: Record<string, unknown> = {
      startSynset: start,
      targetSynset: target,
      maxNodes: opts.maxNodes ?? 5000,
      useLearning: true,
    };

    if (opts.allowedEdgeTypes) {
      params.allowedEdgeTypes = opts.allowedEdgeTypes;
    }

    const result = await this.client.solve('wordnet', params);

    // Extract concept titles from discovered nodes along the solution path
    const pathNodeIds = new Set<string>();
    for (const edge of result.solutionPath) {
      pathNodeIds.add(edge.source);
      pathNodeIds.add(edge.target);
    }

    const path = result.discoveredNodes
      .filter((n) => pathNodeIds.has(n.id))
      .sort((a, b) => a.distance - b.distance)
      .map((n) => n.title || n.id);

    return {
      pathFound: result.solutionFound,
      path,
      nodesExplored: result.discoveredNodes.length,
      durationMs: result.durationMs,
    };
  }

  /**
   * Pass-through solve for custom domain usage.
   */
  async solve(
    domain: SterlingDomain,
    params: Record<string, unknown> = {},
    onStep?: SterlingSolveStepCallback
  ): Promise<SterlingSolveResult> {
    if (!this.isAvailable()) {
      return {
        solutionFound: false,
        solutionPath: [],
        discoveredNodes: [],
        searchEdges: [],
        metrics: {},
        error: 'Sterling reasoning service unavailable',
        durationMs: 0,
      };
    }

    return this.client.solve(domain, params, onStep);
  }

  /**
   * Execute a Sterling operation with a fallback value if the service is unavailable.
   *
   * @param operation - Async function that uses Sterling
   * @param fallback - Value to return if Sterling is unavailable or the operation fails
   */
  async withFallback<T>(
    operation: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    if (!this.isAvailable()) {
      return fallback;
    }

    try {
      return await operation();
    } catch (err) {
      console.warn(
        `[Sterling] Operation failed, using fallback: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return fallback;
    }
  }

  // --------------------------------------------------------------------------
  // Domain Declaration (Capability-Claim Pipeline)
  // --------------------------------------------------------------------------

  /**
   * Register a domain declaration with Sterling.
   *
   * If `digest` is omitted, the service computes it locally using the same
   * canonicalize + contentHash infrastructure as the server. This keeps
   * drift detection engaged on every registration by default: the server
   * always receives a digest to verify against its own computation.
   *
   * @param declaration - The declaration object to register
   * @param digest - Optional content-addressed digest. Computed locally if omitted.
   */
  async registerDomainDeclaration(
    declaration: Record<string, unknown>,
    digest?: string,
  ): Promise<{ success: boolean; digest?: string; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Sterling reasoning service unavailable' };
    }
    // Compute digest locally if caller omitted it, so the server always
    // receives a digest and can verify canonicalization parity.
    // TODO: Validate declaration shape at this boundary instead of trusting the cast.
    // The caller passes Record<string, unknown>; we trust it conforms to DomainDeclarationV1.
    const effectiveDigest = digest ?? computeDeclarationDigest(
      declaration as unknown as DomainDeclarationV1,
    );
    return this.client.registerDomainDeclaration(declaration, effectiveDigest);
  }

  /**
   * Retrieve a domain declaration from Sterling by digest.
   * Passthrough to the underlying SterlingClient.
   */
  async getDomainDeclaration(
    digest: string,
  ): Promise<{ found: boolean; declaration?: Record<string, unknown>; digest?: string; error?: string }> {
    if (!this.isAvailable()) {
      return { found: false, error: 'Sterling reasoning service unavailable' };
    }
    return this.client.getDomainDeclaration(digest);
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private buildSolveParams(
    domain: SterlingDomain,
    stateDesc: string,
    goalDesc: string
  ): Record<string, unknown> {
    switch (domain) {
      case 'wikipedia':
        return {
          startTitle: stateDesc,
          targetTitle: goalDesc,
          maxNodes: 500,
          useLearning: true,
        };
      case 'wordnet':
        return {
          startSynset: stateDesc,
          targetSynset: goalDesc,
          maxNodes: 5000,
          useLearning: true,
        };
      default:
        // Generic params — let the server decide
        return {
          start: stateDesc,
          goal: goalDesc,
          maxNodes: 5000,
          useLearning: true,
        };
    }
  }
}
