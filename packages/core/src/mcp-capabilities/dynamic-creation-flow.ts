/**
 * Dynamic Creation Flow - Impasse detection and LLM option proposal system
 *
 * Implements impasse detection with specific thresholds and debouncing,
 * auto-retirement policies based on win rates, and rate-limited proposals
 * to prevent spam.
 *
 * @author @darianrosebrook
 */

import { performance } from 'node:perf_hooks';
import { EnhancedRegistry, Provenance } from './enhanced-registry.js';
import { BTDSLParser } from './bt-dsl-parser.js';
import { LeafContext, ExecError } from './leaf-contracts.js';
import { HRMLLMInterface } from './llm-integration.js';

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
}

/**
 * LLM interface for option proposals
 */
export interface LLMInterface {
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
 * Dynamic creation flow with impasse detection and LLM integration
 */
export class DynamicCreationFlow {
  private registry: EnhancedRegistry;
  private btParser: BTDSLParser;
  private llmInterface: HRMLLMInterface;
  private impasseConfig: ImpasseConfig;
  private autoRetirementConfig: AutoRetirementConfig;
  private impasseStates: Map<string, ImpasseState>; // key: task identifier
  private proposalHistory: Map<
    string,
    { timestamp: number; proposal: OptionProposalResponse | null }[]
  >;

  constructor(
    registry: EnhancedRegistry,
    llmInterface?: HRMLLMInterface,
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

    // Update proposal count and timestamp
    state.proposalCount++;
    state.lastProposalTime = Date.now();
    this.impasseStates.set(taskId, state);

    try {
      // Prepare request context
      const request: OptionProposalRequest = {
        taskId,
        context,
        currentTask,
        recentFailures,
      };

      // Request proposal from LLM
      const proposal = await this.llmInterface.proposeOption(request);

      // Store proposal in history
      if (proposal) {
        const history = this.proposalHistory.get(taskId) || [];
        history.push({ timestamp: Date.now(), proposal });
        this.proposalHistory.set(taskId, history);
      }

      return proposal;
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
  getProposalHistory(
    taskId: string
  ): { timestamp: number; proposal: OptionProposalResponse | null }[] {
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
}

// Mock LLM interface moved to test utilities
// See packages/core/src/__tests__/test-utils.ts for MockLLMInterface
