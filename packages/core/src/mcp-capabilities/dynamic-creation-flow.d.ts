/**
 * Dynamic Creation Flow - Impasse detection and LLM option proposal system
 *
 * Implements impasse detection with specific thresholds and debouncing,
 * auto-retirement policies based on win rates, and rate-limited proposals
 * to prevent spam.
 *
 * @author @darianrosebrook
 */
import { EnhancedRegistry } from './enhanced-registry';
import { LeafContext, ExecError } from './leaf-contracts';
import { HRMLLMInterface } from './llm-integration';
/**
 * Impasse detection configuration
 */
export interface ImpasseConfig {
    failureThreshold: number;
    timeWindowMs: number;
    debounceMs: number;
    maxProposalsPerHour: number;
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
    proposeOption(request: OptionProposalRequest): Promise<OptionProposalResponse | null>;
}
/**
 * Auto-retirement configuration
 */
export interface AutoRetirementConfig {
    winRateThreshold: number;
    minRunsBeforeRetirement: number;
    evaluationWindowMs: number;
    gracePeriodMs: number;
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
/**
 * Dynamic creation flow with impasse detection and LLM integration
 */
export declare class DynamicCreationFlow {
    private registry;
    private btParser;
    private llmInterface;
    private impasseConfig;
    private autoRetirementConfig;
    private impasseStates;
    private proposalHistory;
    constructor(registry: EnhancedRegistry, llmInterface?: HRMLLMInterface, impasseConfig?: Partial<ImpasseConfig>, autoRetirementConfig?: Partial<AutoRetirementConfig>);
    /**
     * Check if current situation constitutes an impasse
     */
    checkImpasse(taskId: string, failure: ExecError): ImpasseResult;
    /**
     * Create initial impasse state
     */
    private createInitialImpasseState;
    /**
     * Request a new option proposal from LLM
     */
    requestOptionProposal(taskId: string, context: LeafContext, currentTask: string, recentFailures: ExecError[]): Promise<OptionProposalResponse | null>;
    /**
     * Register a proposed option with shadow configuration
     */
    registerProposedOption(proposal: OptionProposalResponse, author: string): Promise<{
        success: boolean;
        optionId?: string;
        error?: string;
    }>;
    /**
     * Evaluate if an option should be retired based on performance
     */
    evaluateRetirement(optionId: string): RetirementDecision;
    /**
     * Process auto-retirement for all options
     */
    processAutoRetirement(): Promise<string[]>;
    /**
     * Compute code hash for BT-DSL
     */
    private computeCodeHash;
    /**
     * Get proposal history for a task
     */
    getProposalHistory(taskId: string): {
        timestamp: number;
        proposal: OptionProposalResponse | null;
    }[];
    /**
     * Get impasse state for a task
     */
    getImpasseState(taskId: string): ImpasseState | undefined;
    /**
     * Clear impasse state for a task
     */
    clearImpasseState(taskId: string): void;
    /**
     * Get registry for direct access
     */
    getRegistry(): EnhancedRegistry;
    /**
     * Clear all data (for testing)
     */
    clear(): void;
}
/**
 * Mock LLM interface for testing
 */
export declare class MockLLMInterface implements LLMInterface {
    proposeOption(request: OptionProposalRequest): Promise<OptionProposalResponse | null>;
}
//# sourceMappingURL=dynamic-creation-flow.d.ts.map