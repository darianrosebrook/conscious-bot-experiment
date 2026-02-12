/**
 * Dynamic Creation Flow - Impasse detection and LLM option proposal system
 *
 * Implements impasse detection with specific thresholds and debouncing,
 * auto-retirement policies based on win rates, and rate-limited proposals
 * to prevent spam.
 *
 * Env vars:
 *   DYNAMIC_CREATION_ADVISORY_MODE — set to '1' to allow LLM proposals even
 *     without a reduction client (advisory-only mode for development/debugging).
 *     Default: off. Without this flag and without a bound ReductionClient,
 *     proposal generation is skipped entirely to avoid spending sidecar budget
 *     on proposals that cannot be registered.
 *
 * @author @darianrosebrook
 */

import { performance } from 'node:perf_hooks';
import { EnhancedRegistry, Provenance } from './registry';
import { BTDSLParser } from './bt-dsl-parser';
import { LeafContext, ExecError } from './leaf-contracts';
import { HRMLLMInterface } from './llm-integration';
import type { SidecarCallProvenance } from './llm-integration';
import type { ReductionClient, ReductionResult } from './reduction-client';

// ============================================================================
// Impasse Detection (S4.1)
// ============================================================================

/**
 * Impasse detection configuration
 */
export interface ImpasseConfig {
  failureThreshold: number; // Number of consecutive failures
  timeWindowMs: number; // Time window for failure counting
  debounceMs: number; // Debounce time between proposals
  maxProposalsPerHour: number; // Rate limiting
}

/**
 * Impasse detection state
 */
export interface ImpasseState {
  consecutiveFailures: number;
  lastFailureTime: number;
  lastProposalTime: number;
  proposalCount: number;
  proposalResetTime: number;
}

/**
 * Impasse detection result
 */
export interface ImpasseResult {
  isImpasse: boolean;
  reason?: string;
  metrics: {
    consecutiveFailures: number;
    timeSinceLastFailure: number;
    timeSinceLastProposal: number;
    proposalsThisHour: number;
  };
}

// ============================================================================
// LLM Option Proposal
// ============================================================================

/**
 * Option proposal request
 */
export interface OptionProposalRequest {
  taskId: string;
  context: LeafContext;
  currentTask: string;
  recentFailures: ExecError[];
}

/**
 * Option proposal response
 */
export interface OptionProposalResponse {
  name: string;
  version: string;
  btDsl: any;
  confidence: number;
  estimatedSuccessRate: number;
  reasoning: string;
  provenance?: {
    origin: 'hrm_pipeline';
    stages: SidecarCallProvenance[];
    totalLatencyMs: number;
  };
  reductionProvenance?: {
    isExecutable: boolean;
    committedIrDigest?: string;
    committedGoalPropId?: string;
  };
}

/**
 * Interface for option proposal generators.
 * DI seam: DynamicCreationFlow depends on this interface, not on HRMLLMInterface directly.
 * This allows swapping HRM for a Sterling-native generator without changing the flow.
 */
export interface OptionProposalLLM {
  proposeOption(
    request: OptionProposalRequest
  ): Promise<OptionProposalResponse | null>;
}

// ============================================================================
// Auto-Retirement Policies (S4.2)
// ============================================================================

/**
 * Auto-retirement configuration
 */
export interface AutoRetirementConfig {
  winRateThreshold: number; // Minimum win rate to avoid retirement
  minRunsBeforeRetirement: number; // Minimum runs before considering retirement
  evaluationWindowMs: number; // Time window for win rate calculation
  gracePeriodMs: number; // Grace period before retirement
}

/**
 * Retirement decision
 */
export interface RetirementDecision {
  shouldRetire: boolean;
  reason?: string;
  currentWinRate: number;
  totalRuns: number;
  lastRunTime: number;
}

// ============================================================================
// Dynamic Creation Flow
// ============================================================================

/**
 * A single entry in proposal history. Always stores the proposal even on
 * blocked/error paths so the "why was this blocked?" evidence is preserved.
 *
 * Outcome values:
 *   allowed                    — Sterling approved; proposal has reductionProvenance
 *   blocked                    — Sterling rejected (isExecutable:false); blockReason in reductionResult
 *   reduction_error            — Sterling threw; error message in reductionError
 *   advisory_only              — LLM ran but no reduction client; proposal generated but not registered
 *                                (only when DYNAMIC_CREATION_ADVISORY_MODE=1)
 *   skipped_no_reduction_client — LLM was NOT called; no reduction client and advisory mode off
 *   llm_returned_null          — LLM was called but returned null
 */
export interface ProposalHistoryEntry {
  timestamp: number;
  proposal: OptionProposalResponse | null;
  /** Present when reduction was attempted (success or failure) */
  reductionResult?: ReductionResult;
  /** Present when reduction client threw an exception */
  reductionError?: string;
  /** How this entry was resolved */
  outcome: 'allowed' | 'blocked' | 'reduction_error' | 'advisory_only' | 'skipped_no_reduction_client' | 'llm_returned_null';
}

/**
 * Dynamic creation flow with impasse detection and LLM integration
 */
/** Maximum number of proposal history entries per task (ring buffer). */
const PROPOSAL_HISTORY_MAX_PER_TASK = 50;

/** Evict task histories with no activity for this long (ms). */
const PROPOSAL_HISTORY_TASK_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class DynamicCreationFlow {
  private registry: EnhancedRegistry;
  private btParser: BTDSLParser;
  private llmInterface: OptionProposalLLM;
  private reductionClient?: ReductionClient;
  private impasseConfig: ImpasseConfig;
  private autoRetirementConfig: AutoRetirementConfig;
  private impasseStates: Map<string, ImpasseState>; // key: task identifier
  private proposalHistory: Map<string, ProposalHistoryEntry[]>;

  constructor(
    registry: EnhancedRegistry,
    llmInterface?: OptionProposalLLM,
    impasseConfig?: Partial<ImpasseConfig>,
    autoRetirementConfig?: Partial<AutoRetirementConfig>
  ) {
    this.registry = registry;
    this.btParser = new BTDSLParser();
    this.llmInterface = llmInterface || new HRMLLMInterface();
    this.impasseConfig = {
      failureThreshold: 3,
      timeWindowMs: 60000, // 1 minute
      debounceMs: 5000, // 5 seconds between proposals
      maxProposalsPerHour: 10,
      ...impasseConfig,
    };
    this.autoRetirementConfig = {
      winRateThreshold: 0.6,
      minRunsBeforeRetirement: 5,
      evaluationWindowMs: 3600000, // 1 hour
      gracePeriodMs: 300000, // 5 minutes
      ...autoRetirementConfig,
    };
    this.impasseStates = new Map();
    this.proposalHistory = new Map();

    const advisoryMode = process.env.DYNAMIC_CREATION_ADVISORY_MODE === '1';
    if (this.reductionClient) {
      console.log('[DynamicCreationFlow] Initialized. Reduction client: bound — proposals gated through Sterling');
    } else if (advisoryMode) {
      console.log('[DynamicCreationFlow] Initialized. Reduction client: NOT bound — advisory-only proposals enabled (DYNAMIC_CREATION_ADVISORY_MODE=1)');
    } else {
      console.log('[DynamicCreationFlow] Initialized. Reduction client: NOT bound — proposal generation will be skipped until a reduction client is set');
    }
  }

  /**
   * Late-bind a Sterling reduction client for executable gating.
   * Without a reduction client and without DYNAMIC_CREATION_ADVISORY_MODE=1,
   * proposal generation is skipped entirely (no sidecar calls).
   */
  setReductionClient(client: ReductionClient): void {
    this.reductionClient = client;
    console.log('[DynamicCreationFlow] Reduction client bound — proposals will be gated through Sterling');
  }

  /**
   * Whether a reduction client is currently bound.
   * Useful for health checks and dashboard assertions.
   */
  isReductionClientBound(): boolean {
    return this.reductionClient !== undefined;
  }

  /**
   * Whether proposals can proceed. Returns false (and records a skip entry)
   * when no reduction client is bound and advisory mode is not explicitly enabled.
   * This prevents spending sidecar budget on proposals that can never be registered.
   */
  private shouldAttemptProposal(taskId: string): boolean {
    if (this.reductionClient) return true;
    if (process.env.DYNAMIC_CREATION_ADVISORY_MODE === '1') return true;

    // Update lastProposalTime so the impasse debounce logic prevents
    // rapid-fire skip entries under sustained Sterling outages.
    const state = this.impasseStates.get(taskId);
    if (state) {
      state.lastProposalTime = Date.now();
      this.impasseStates.set(taskId, state);
    }

    this.pushHistory(taskId, {
      timestamp: Date.now(),
      proposal: null,
      outcome: 'skipped_no_reduction_client',
    });
    return false;
  }

  // ============================================================================
  // Impasse Detection
  // ============================================================================

  /**
   * Check if current situation constitutes an impasse
   */
  checkImpasse(taskId: string, failure: ExecError): ImpasseResult {
    const now = Date.now();
    const state =
      this.impasseStates.get(taskId) || this.createInitialImpasseState();

    // Update failure count
    if (
      state.lastFailureTime === 0 ||
      now - state.lastFailureTime < this.impasseConfig.timeWindowMs
    ) {
      state.consecutiveFailures++;
    } else {
      state.consecutiveFailures = 1;
    }
    state.lastFailureTime = now;

    // Check rate limiting
    if (now > state.proposalResetTime) {
      state.proposalCount = 0;
      state.proposalResetTime = now + 3600000; // 1 hour
    }

    // Determine if this is an impasse
    const isImpasse =
      state.consecutiveFailures >= this.impasseConfig.failureThreshold &&
      now - state.lastProposalTime >= this.impasseConfig.debounceMs &&
      state.proposalCount < this.impasseConfig.maxProposalsPerHour;

    // Update state
    this.impasseStates.set(taskId, state);

    return {
      isImpasse,
      reason: isImpasse
        ? `Consecutive failures: ${state.consecutiveFailures}`
        : undefined,
      metrics: {
        consecutiveFailures: state.consecutiveFailures,
        timeSinceLastFailure: now - state.lastFailureTime,
        timeSinceLastProposal: now - state.lastProposalTime,
        proposalsThisHour: state.proposalCount,
      },
    };
  }

  /**
   * Create initial impasse state
   */
  private createInitialImpasseState(): ImpasseState {
    const now = Date.now();
    return {
      consecutiveFailures: 0,
      lastFailureTime: 0,
      lastProposalTime: 0,
      proposalCount: 0,
      proposalResetTime: now + 3600000, // 1 hour from now
    };
  }

  // ============================================================================
  // LLM Option Proposal
  // ============================================================================

  /**
   * Request a new option proposal from LLM
   */
  async requestOptionProposal(
    taskId: string,
    context: LeafContext,
    currentTask: string,
    recentFailures: ExecError[]
  ): Promise<OptionProposalResponse | null> {
    const state = this.impasseStates.get(taskId);
    if (!state) {
      return null;
    }

    // Pre-LLM gate: skip proposal if no reduction client and advisory mode not enabled
    if (!this.shouldAttemptProposal(taskId)) {
      return null;
    }

    // Update proposal count and timestamp
    state.proposalCount++;
    state.lastProposalTime = Date.now();
    this.impasseStates.set(taskId, state);

    try {
      const request: OptionProposalRequest = {
        taskId,
        context,
        currentTask,
        recentFailures,
      };

      const proposal = await this.llmInterface.proposeOption(request);

      if (!proposal) {
        this.pushHistory(taskId, { timestamp: Date.now(), proposal: null, outcome: 'llm_returned_null' });
        return null;
      }

      // Gate through Sterling reduction
      return await this.gateProposalThroughReduction(taskId, proposal);
    } catch (error) {
      console.error('Failed to request option proposal:', error);
      return null;
    }
  }

  // ============================================================================
  // Option Registration and Validation
  // ============================================================================

  /**
   * Register a proposed option with shadow configuration
   */
  async registerProposedOption(
    proposal: OptionProposalResponse,
    author: string
  ): Promise<{ success: boolean; optionId?: string; error?: string }> {
    try {
      // Validate BT-DSL
      const parseResult = this.btParser.parse(
        proposal.btDsl,
        this.registry.getLeafFactory()
      );
      if (!parseResult.valid) {
        return {
          success: false,
          error: `Invalid BT-DSL: ${parseResult.errors?.join(', ')}`,
        };
      }

      // Create provenance
      const provenance: Provenance = {
        author,
        codeHash: this.computeCodeHash(proposal.btDsl),
        createdAt: new Date().toISOString(),
        metadata: {
          confidence: proposal.confidence,
          estimatedSuccessRate: proposal.estimatedSuccessRate,
          reasoning: proposal.reasoning,
        },
      };

      // Register with shadow configuration
      const result = this.registry.registerOption(proposal.btDsl, provenance, {
        successThreshold: proposal.estimatedSuccessRate * 0.8, // 80% of estimated rate
        maxShadowRuns: 10,
        failureThreshold: proposal.estimatedSuccessRate * 0.5, // 50% of estimated rate
        minShadowRuns: 3,
      });

      if (!result.ok) {
        return {
          success: false,
          error: result.error || 'Registration failed',
        };
      }

      return {
        success: true,
        optionId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Auto-Retirement Evaluation
  // ============================================================================

  /**
   * Evaluate if an option should be retired based on performance
   */
  evaluateRetirement(optionId: string): RetirementDecision {
    const stats = this.registry.getShadowStats(optionId);
    const now = Date.now();

    // Check minimum runs requirement
    if (stats.totalRuns < this.autoRetirementConfig.minRunsBeforeRetirement) {
      return {
        shouldRetire: false,
        currentWinRate: stats.successRate,
        totalRuns: stats.totalRuns,
        lastRunTime: stats.lastRunTimestamp,
      };
    }

    // Check win rate threshold
    const shouldRetire =
      stats.successRate < this.autoRetirementConfig.winRateThreshold;

    return {
      shouldRetire,
      reason: shouldRetire
        ? `Win rate ${(stats.successRate * 100).toFixed(1)}% below threshold ${(this.autoRetirementConfig.winRateThreshold * 100).toFixed(1)}%`
        : undefined,
      currentWinRate: stats.successRate,
      totalRuns: stats.totalRuns,
      lastRunTime: stats.lastRunTimestamp,
    };
  }

  /**
   * Process auto-retirement for all options
   */
  async processAutoRetirement(): Promise<string[]> {
    const retiredOptions: string[] = [];
    const shadowOptions = this.registry.getShadowOptions();

    for (const optionId of shadowOptions) {
      const decision = this.evaluateRetirement(optionId);
      if (decision.shouldRetire) {
        const success = await this.registry.retireOption(
          optionId,
          decision.reason || 'Auto-retirement'
        );
        if (success) {
          retiredOptions.push(optionId);
        }
      }
    }

    return retiredOptions;
  }

  // ============================================================================
  // Reduction Gate (shared between requestOptionProposal and proposeNewCapability)
  // ============================================================================

  /**
   * Gate a proposal through Sterling reduction. Returns the proposal with
   * reductionProvenance attached on success, or null on failure. Always
   * records evidence in proposalHistory regardless of outcome.
   */
  private async gateProposalThroughReduction(
    taskId: string,
    proposal: OptionProposalResponse
  ): Promise<OptionProposalResponse | null> {
    if (!this.reductionClient) {
      // No reduction client — advisory-only, do not register
      console.warn(
        `[DynamicCreationFlow] No reduction client — proposal for task ${taskId} is advisory-only, not registering`
      );
      this.pushHistory(taskId, {
        timestamp: Date.now(),
        proposal,
        outcome: 'advisory_only',
      });
      return null;
    }

    // Attempt reduction — wrap in try/catch so exceptions are fail-closed
    let reduction: ReductionResult;
    try {
      reduction = await this.reductionClient.reduceOptionProposal(
        JSON.stringify(proposal.btDsl)
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[DynamicCreationFlow] Reduction client error for task ${taskId}: ${errorMsg}`
      );
      this.pushHistory(taskId, {
        timestamp: Date.now(),
        proposal,
        reductionError: errorMsg,
        outcome: 'reduction_error',
      });
      return null; // fail-closed on error
    }

    if (!reduction.isExecutable) {
      console.warn(
        `[DynamicCreationFlow] Proposal blocked by reduction gate for task ${taskId}: ${reduction.blockReason}`
      );
      this.pushHistory(taskId, {
        timestamp: Date.now(),
        proposal,
        reductionResult: reduction,
        outcome: 'blocked',
      });
      return null; // fail-closed
    }

    // Attach reduction provenance
    proposal.reductionProvenance = {
      isExecutable: true,
      committedIrDigest: reduction.committedIrDigest,
      committedGoalPropId: reduction.committedGoalPropId,
    };

    this.pushHistory(taskId, {
      timestamp: Date.now(),
      proposal,
      reductionResult: reduction,
      outcome: 'allowed',
    });

    return proposal;
  }

  /**
   * Append an entry to proposal history for a task.
   * Enforces a per-task ring buffer of PROPOSAL_HISTORY_MAX_PER_TASK entries
   * and TTL eviction of stale task histories to prevent unbounded memory growth.
   */
  private pushHistory(taskId: string, entry: ProposalHistoryEntry): void {
    // Lazy TTL eviction: on each write, purge any task whose newest entry is stale.
    // This is O(tasks) but tasks is small and this runs at most once per debounce interval.
    const now = entry.timestamp;
    for (const [tid, entries] of this.proposalHistory) {
      if (tid === taskId) continue; // skip the one we're writing to
      const newest = entries[entries.length - 1];
      if (newest && now - newest.timestamp > PROPOSAL_HISTORY_TASK_TTL_MS) {
        this.proposalHistory.delete(tid);
      }
    }

    const history = this.proposalHistory.get(taskId) || [];
    history.push(entry);
    if (history.length > PROPOSAL_HISTORY_MAX_PER_TASK) {
      history.splice(0, history.length - PROPOSAL_HISTORY_MAX_PER_TASK);
    }
    this.proposalHistory.set(taskId, history);
  }

  /**
   * Returns the total number of proposal history entries across all tasks.
   * Useful for health checks and memory monitoring.
   */
  getProposalHistorySize(): { totalEntries: number; taskCount: number } {
    let totalEntries = 0;
    for (const entries of this.proposalHistory.values()) {
      totalEntries += entries.length;
    }
    return { totalEntries, taskCount: this.proposalHistory.size };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Compute code hash for BT-DSL
   */
  private computeCodeHash(btDsl: any): string {
    const json = JSON.stringify(btDsl, (key, value) => {
      // Sort object keys for deterministic hashing
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        return Object.keys(value)
          .sort()
          .reduce((obj: any, key) => {
            obj[key] = value[key];
            return obj;
          }, {});
      }
      return value;
    });

    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get proposal history for a task
   */
  getProposalHistory(taskId: string): ProposalHistoryEntry[] {
    return this.proposalHistory.get(taskId) || [];
  }

  /**
   * Get impasse state for a task
   */
  getImpasseState(taskId: string): ImpasseState | undefined {
    return this.impasseStates.get(taskId);
  }

  /**
   * Clear impasse state for a task
   */
  clearImpasseState(taskId: string): void {
    this.impasseStates.delete(taskId);
    this.proposalHistory.delete(taskId);
  }

  /**
   * Get registry for direct access
   */
  getRegistry(): EnhancedRegistry {
    return this.registry;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.impasseStates.clear();
    this.proposalHistory.clear();
  }

  /**
   * Propose a new capability using LLM integration
   * This is the core method for dynamic capability creation
   */
  async proposeNewCapability(
    taskId: string,
    context: LeafContext,
    currentTask: string,
    recentFailures: ExecError[]
  ): Promise<OptionProposalResponse | null> {
    try {
      // Check if we're in an impasse
      const impasseResult = this.checkImpasse(
        taskId,
        recentFailures[0] || {
          code: 'unknown',
          detail: 'no_failure_data',
          retryable: false,
        }
      );

      if (!impasseResult.isImpasse) {
        console.log(
          `No impasse detected for task ${taskId}, skipping proposal`
        );
        return null;
      }

      // Pre-LLM gate: skip proposal if no reduction client and advisory mode not enabled
      if (!this.shouldAttemptProposal(taskId)) {
        return null;
      }

      // Create proposal request
      const request: OptionProposalRequest = {
        taskId,
        context,
        currentTask,
        recentFailures,
      };

      // Get proposal from LLM
      const proposal = await this.llmInterface.proposeOption(request);

      if (!proposal) {
        console.log(`LLM returned no proposal for task ${taskId}`);
        return null;
      }

      // Validate the proposed BT-DSL
      const parseResult = this.btParser.parse(
        proposal.btDsl,
        this.registry.getLeafFactory()
      );
      if (!parseResult.valid) {
        console.warn(
          `LLM proposed invalid BT-DSL for task ${taskId}:`,
          parseResult.errors
        );
        return null;
      }

      // Gate through Sterling reduction (shared logic)
      const gatedProposal = await this.gateProposalThroughReduction(taskId, proposal);
      if (!gatedProposal) {
        return null; // blocked, advisory-only, or error — already stored in history
      }

      // Register the option with the registry
      const registrationResult = this.registry.registerOption(
        gatedProposal.btDsl,
        {
          author: 'llm',
          createdAt: new Date().toISOString(),
          codeHash: this.computeCodeHash(gatedProposal.btDsl),
        },
        {
          successThreshold: 0.8,
          maxShadowRuns: 10,
          failureThreshold: 0.3,
          minShadowRuns: 3,
        }
      );

      if (!registrationResult.ok) {
        console.warn(
          `Failed to register proposed option for task ${taskId}:`,
          registrationResult.error
        );
        return null;
      }

      // Update impasse state
      const state = this.impasseStates.get(taskId);
      if (state) {
        state.lastProposalTime = Date.now();
        state.proposalCount++;
      }

      console.log(
        `Successfully proposed new capability for task ${taskId}: ${gatedProposal.name}`
      );
      return gatedProposal;
    } catch (error) {
      console.error(
        `Error proposing new capability for task ${taskId}:`,
        error
      );
      return null;
    }
  }
}

// Mock LLM interface moved to test utilities
// See packages/core/src/__tests__/test-utils.ts for MockLLMInterface
