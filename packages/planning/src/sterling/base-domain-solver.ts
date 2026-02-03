/**
 * Base Domain Solver
 *
 * Abstract protocol layer shared by all Sterling domain solvers.
 * Owns availability gating, planId extraction, and episode reporting.
 *
 * Subclasses own ALL domain logic: solve parameters, solution mapping,
 * TaskStep generation, deficit/replan handling, and duration estimation.
 *
 * @author @darianrosebrook
 */

import type { SterlingReasoningService } from './sterling-reasoning-service';
import type { SterlingSolveResult, SterlingDomain } from '@conscious-bot/core';
import type { SolveBundle, EpisodeAck, EpisodeOutcomeClass, EpisodeLinkage } from './solve-bundle-types';
import type { DomainDeclarationV1 } from './domain-declaration';
import { computeRegistrationDigest, validateDeclaration } from './domain-declaration';

// ============================================================================
// Phase 1 Identity Chain Configuration
// ============================================================================

/**
 * When enabled, report_episode includes engineCommitment and operatorRegistryHash.
 * Default OFF until Sterling confirms it accepts these fields without error.
 *
 * Set via environment: STERLING_REPORT_IDENTITY_FIELDS=1
 */
function isReportIdentityFieldsEnabled(): boolean {
  return process.env.STERLING_REPORT_IDENTITY_FIELDS === '1';
}

/**
 * Tracks which solverIds have been latched to "server is pre-Phase-1" mode.
 * When report_episode rejects unknown fields, we downgrade and latch so we
 * don't retry with identity fields on every subsequent report.
 */
const _identityFieldsRejectedBySolverId = new Set<string>();

/**
 * Check if identity fields were rejected for this solverId.
 * If latched, we skip sending identity fields even when toggle is ON.
 */
function areIdentityFieldsRejected(solverId: string): boolean {
  return _identityFieldsRejectedBySolverId.has(solverId);
}

/**
 * Latch a solverId as "identity fields rejected" and emit a single warning.
 * This prevents repeated retry → reject cycles and makes the downgrade visible.
 */
function latchIdentityFieldsRejected(solverId: string, errorHint: string): void {
  if (_identityFieldsRejectedBySolverId.has(solverId)) return;
  _identityFieldsRejectedBySolverId.add(solverId);
  console.warn(
    `[Sterling] Identity fields rejected for ${solverId} — downgrading to core linkage only. ` +
    `Hint: ${errorHint}. Toggle STERLING_REPORT_IDENTITY_FIELDS=0 or wait for server upgrade.`
  );
}

/**
 * Tracks which solverIds have logged their identity field status.
 * Once-per-solverId logging prevents log spam while remaining observable.
 */
const _loggedIdentityStatusBySolverId = new Set<string>();

/**
 * Log identity field presence/absence once per solverId.
 * Makes "identity fields absent" visible without spamming.
 */
function logIdentityFieldStatusOnce(
  solverId: string,
  hasTraceBundleHash: boolean,
  hasEngineCommitment: boolean,
  hasOperatorRegistryHash: boolean,
): void {
  if (_loggedIdentityStatusBySolverId.has(solverId)) return;
  _loggedIdentityStatusBySolverId.add(solverId);

  const present: string[] = [];
  const absent: string[] = [];

  if (hasTraceBundleHash) present.push('traceBundleHash');
  else absent.push('traceBundleHash');

  if (hasEngineCommitment) present.push('engineCommitment');
  else absent.push('engineCommitment');

  if (hasOperatorRegistryHash) present.push('operatorRegistryHash');
  else absent.push('operatorRegistryHash');

  if (absent.length === 0) {
    console.log(`[Sterling] Identity fields for ${solverId}: all present (${present.join(', ')})`);
  } else if (present.length === 0) {
    console.log(`[Sterling] Identity fields for ${solverId}: none present (server may be pre-Phase-1)`);
  } else {
    console.log(
      `[Sterling] Identity fields for ${solverId}: present=[${present.join(', ')}], absent=[${absent.join(', ')}]`
    );
  }
}

// ============================================================================
// Declaration Mode
// ============================================================================

/**
 * Declaration mode controls fail behavior for registration issues.
 * - 'dev': fail-open (log warning, continue)
 * - 'certifying': fail-closed (throw on registration failure)
 */
export type DeclarationMode = 'dev' | 'certifying';

// ============================================================================
// Shared result constraint
// ============================================================================

export interface BaseSolveResult {
  solved: boolean;
  steps: unknown[];
  totalNodes: number;
  durationMs: number;
  error?: string;
  /** Observability metadata — does not affect solve behavior */
  solveMeta?: { bundles: SolveBundle[] };
}

// ============================================================================
// Abstract Base
// ============================================================================

export abstract class BaseDomainSolver<
  TResult extends BaseSolveResult = BaseSolveResult,
> {
  protected readonly sterlingService: SterlingReasoningService;

  /** Sterling WS domain for transport routing */
  abstract readonly sterlingDomain: SterlingDomain;

  /** Unique solver identifier for planner registry (e.g. 'minecraft.crafting') */
  abstract readonly solverId: string;

  /** Contract version for protocol evolution */
  readonly contractVersion: number = 1;

  /** Declaration mode: 'dev' = fail-open, 'certifying' = fail-closed */
  declarationMode: DeclarationMode = 'dev';

  // -- Declaration registration state (connection-scoped) --
  private _registeredOnNonce = -1;
  private _registeredDigest: string | null = null;
  private _registerPromise: Promise<boolean> | null = null;

  constructor(sterlingService: SterlingReasoningService) {
    this.sterlingService = sterlingService;
  }

  // --------------------------------------------------------------------------
  // Availability guard
  // --------------------------------------------------------------------------

  protected isAvailable(): boolean {
    return this.sterlingService.isAvailable();
  }

  /** Each solver defines its own correctly-typed unavailable result */
  protected abstract makeUnavailableResult(): TResult;

  // --------------------------------------------------------------------------
  // planId extraction
  // --------------------------------------------------------------------------

  /**
   * Extract planId from Sterling solve result metrics.
   * Caller should store this in task metadata — NOT on the solver instance.
   */
  protected extractPlanId(result: SterlingSolveResult): string | null {
    return (result.metrics?.planId as string) ?? null;
  }

  // --------------------------------------------------------------------------
  // Domain Declaration Registration
  // --------------------------------------------------------------------------

  /**
   * Override to provide a domain declaration for this solver.
   * Default: null (no declaration to register — backward compatible).
   */
  getDomainDeclaration(): DomainDeclarationV1 | null {
    return null;
  }

  /**
   * Ensure this solver's declaration is registered with Sterling.
   *
   * Connection-scoped: re-registers after reconnect (nonce change).
   * Concurrency-safe: concurrent callers share the same in-flight promise.
   *
   * @returns true if registered (or no declaration to register), false on
   *          failure in 'dev' mode. Throws in 'certifying' mode on failure.
   */
  async ensureDeclarationRegistered(): Promise<boolean> {
    // Concurrent callers share in-flight promise
    if (this._registerPromise) return this._registerPromise;

    const currentNonce = this.sterlingService.getConnectionNonce();

    // Already registered on this connection
    if (this._registeredOnNonce === currentNonce && this._registeredDigest !== null) {
      return true;
    }

    const decl = this.getDomainDeclaration();
    if (!decl) return true; // No declaration to register

    this._registerPromise = this._doRegister(decl, currentNonce);

    try {
      return await this._registerPromise;
    } finally {
      this._registerPromise = null;
    }
  }

  private async _doRegister(decl: DomainDeclarationV1, nonce: number): Promise<boolean> {
    try {
      validateDeclaration(decl);
      const digest = computeRegistrationDigest(decl);

      const result = await this.sterlingService.registerDomainDeclaration(
        decl as unknown as Record<string, unknown>,
        digest,
      );

      if (result.success) {
        this._registeredOnNonce = nonce;
        this._registeredDigest = digest;
        console.log(
          `[Sterling] Declaration registered: solverId=${decl.solverId} digest=${digest.slice(0, 8)}…`
        );
        return true;
      }

      // Registration failed — distinct from solve failure
      const errMsg =
        `[DeclarationRegistration] Failed: solverId=${decl.solverId} ` +
        `digest=${digest.slice(0, 8)}… nonce=${nonce} ` +
        `serverError=${result.error ?? 'unknown'}`;
      if (this.declarationMode === 'certifying') {
        throw new Error(errMsg);
      }
      // DEV mode: warn, reset state, continue
      console.warn(`[Sterling] ${errMsg} (dev mode, continuing)`);
      this._registeredOnNonce = -1;
      this._registeredDigest = null;
      return false;
    } catch (err) {
      // Reset state on any error
      this._registeredOnNonce = -1;
      this._registeredDigest = null;

      if (this.declarationMode === 'certifying') {
        // Re-throw with diagnostic context if not already a registration error
        if (err instanceof Error && err.message.startsWith('[DeclarationRegistration]')) {
          throw err;
        }
        throw new Error(
          `[DeclarationRegistration] Error: solverId=${decl.solverId} ` +
          `nonce=${nonce}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      console.warn(
        `[Sterling] Declaration registration error for ${decl.solverId}: ${
          err instanceof Error ? err.message : String(err)
        } (dev mode, continuing)`
      );
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Episode reporting
  // --------------------------------------------------------------------------

  /**
   * Report an episode to Sterling and parse the ack response.
   *
   * Sends identity linkage fields (bundle_hash, trace_bundle_hash) and
   * outcome classification alongside the domain-specific payload.
   * Returns the parsed EpisodeAck (including episode_hash when available),
   * or undefined if the report was skipped or failed.
   *
   * planId is REQUIRED — if missing, logs warning and skips.
   *
   * Phase 1 identity fields (engineCommitment, operatorRegistryHash) are
   * forwarded when STERLING_REPORT_IDENTITY_FIELDS=1. Default OFF until
   * Sterling confirms acceptance.
   *
   * **Downgrade-on-rejection**: If Sterling rejects unknown fields (detected
   * by error message heuristics), we retry once without identity fields and
   * latch a "server is pre-Phase-1" bit for this solverId. This ensures
   * misconfiguration degrades gracefully rather than causing outages.
   *
   * Migration note: previously fire-and-forget (void return). Now returns
   * Promise<EpisodeAck | undefined> so callers can access episode_hash.
   * Existing callers that ignore the return value are unaffected.
   */
  protected async reportEpisode(
    payload: Record<string, unknown>,
    linkage?: EpisodeLinkage,
  ): Promise<EpisodeAck | undefined> {
    if (!this.isAvailable()) return undefined;

    if (!payload.planId) {
      console.warn(
        `[Sterling] Skipping ${this.sterlingDomain} episode report: missing planId`
      );
      return undefined;
    }

    // Generate a requestId for correlation
    const requestId = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Phase 1 identity fields: enabled by toggle AND not latched as rejected
    const toggleEnabled = isReportIdentityFieldsEnabled();
    const rejected = areIdentityFieldsRejected(this.solverId);
    const includeIdentityFields = toggleEnabled && !rejected;

    // Attempt with identity fields if enabled
    const ack = await this._doReportEpisode(payload, linkage, requestId, includeIdentityFields);
    if (ack !== 'IDENTITY_REJECTED') {
      // Normal case: return the ack (or undefined on generic failure)
      return ack;
    }

    // Identity fields were rejected — latch and retry without them
    latchIdentityFieldsRejected(this.solverId, 'server rejected unknown fields');
    const retryAck = await this._doReportEpisode(payload, linkage, requestId, false);
    // Retry should not return IDENTITY_REJECTED (no identity fields sent), but handle defensively
    return retryAck === 'IDENTITY_REJECTED' ? undefined : retryAck;
  }

  /**
   * Internal: send report_episode to Sterling.
   *
   * Returns EpisodeAck on success, undefined on generic failure, or
   * 'IDENTITY_REJECTED' if the error looks like unknown-field rejection.
   */
  private async _doReportEpisode(
    payload: Record<string, unknown>,
    linkage: EpisodeLinkage | undefined,
    requestId: string,
    includeIdentityFields: boolean,
  ): Promise<EpisodeAck | undefined | 'IDENTITY_REJECTED'> {
    try {
      const result = await this.sterlingService.solve(this.sterlingDomain, {
        command: 'report_episode',
        domain: this.sterlingDomain,
        contractVersion: this.contractVersion,
        solverId: this.solverId,
        requestId,
        // Core identity linkage fields — always sent when available
        ...(linkage?.bundleHash ? { bundle_hash: linkage.bundleHash } : {}),
        ...(linkage?.traceBundleHash ? { trace_bundle_hash: linkage.traceBundleHash } : {}),
        ...(linkage?.outcomeClass ? { outcome_class: linkage.outcomeClass } : {}),
        // Phase 1 identity fields — conditionally included
        ...(includeIdentityFields && linkage?.engineCommitment
          ? { engine_commitment: linkage.engineCommitment } : {}),
        ...(includeIdentityFields && linkage?.operatorRegistryHash
          ? { operator_registry_hash: linkage.operatorRegistryHash } : {}),
        ...payload,
      });

      // Parse episode_hash from response (absent until Sterling emits it)
      const episodeHash = typeof result.metrics?.episode_hash === 'string'
        ? result.metrics.episode_hash
        : undefined;
      const echoedRequestId = typeof result.metrics?.requestId === 'string'
        ? result.metrics.requestId
        : undefined;

      return { episodeHash, requestId: echoedRequestId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Detect unknown-field rejection (heuristic: error mentions "unknown field", "schema", etc.)
      // This is intentionally loose — we'd rather downgrade unnecessarily than fail repeatedly.
      if (
        includeIdentityFields &&
        (msg.includes('unknown field') ||
         msg.includes('unknown_field') ||
         msg.includes('unexpected field') ||
         msg.includes('schema') ||
         msg.includes('validation'))
      ) {
        return 'IDENTITY_REJECTED';
      }

      console.warn(
        `[Sterling] Failed to report ${this.sterlingDomain} episode: ${msg}`
      );
      return undefined;
    }
  }

  /**
   * Log identity field status for this solver (once per solverId).
   * Call this after attaching Sterling identity to a solve bundle.
   */
  protected logIdentityFieldStatus(
    hasTraceBundleHash: boolean,
    hasEngineCommitment: boolean,
    hasOperatorRegistryHash: boolean,
  ): void {
    logIdentityFieldStatusOnce(
      this.solverId,
      hasTraceBundleHash,
      hasEngineCommitment,
      hasOperatorRegistryHash,
    );
  }
}
