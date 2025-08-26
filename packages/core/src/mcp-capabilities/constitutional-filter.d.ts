/**
 * Constitutional Filter - Ethical rule enforcement for capability execution
 *
 * Evaluates capability requests against constitutional rules and safety constraints
 * before execution to ensure ethical and safe behavior.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { CapabilitySpec, ExecutionRequest, ExecutionContext, ConstitutionalDecision, RiskLevel, SafetyTag } from './types';
export interface ConstitutionalRule {
    id: string;
    name: string;
    description: string;
    priority: number;
    enabled: boolean;
    appliesTo: string[];
    safetyTagTriggers: SafetyTag[];
    riskLevelThreshold: RiskLevel;
    contextConditions: ContextCondition[];
    evaluate: (capability: CapabilitySpec, request: ExecutionRequest, context: ExecutionContext) => Promise<RuleEvaluation>;
}
export interface ContextCondition {
    type: 'health' | 'danger' | 'time' | 'location' | 'inventory' | 'social';
    operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq' | 'contains' | 'near';
    value: any;
    description: string;
}
export interface RuleEvaluation {
    passed: boolean;
    severity: 'minor' | 'moderate' | 'major' | 'critical';
    message: string;
    suggestedAction?: string;
    requiresApproval?: boolean;
}
export interface ConstitutionalFilterEvents {
    'rule-violated': [string, RuleEvaluation];
    'high-risk-detected': [ExecutionRequest, ConstitutionalDecision];
    'approval-required': [ExecutionRequest, string[]];
}
/**
 * Constitutional filtering system that evaluates capability requests
 * against ethical rules and safety constraints before execution.
 */
export declare class ConstitutionalFilter extends EventEmitter<ConstitutionalFilterEvents> {
    private rules;
    private approvalCache;
    private violationHistory;
    constructor();
    /**
     * Initialize with default constitutional rules
     */
    private initializeDefaultRules;
    /**
     * Evaluate capability execution against constitutional rules
     *
     * @param capability - Capability being requested
     * @param request - Specific execution request
     * @param context - Current agent and environmental context
     * @returns Constitutional approval with reasoning
     */
    evaluateExecution(capability: CapabilitySpec, request: ExecutionRequest, context: ExecutionContext): Promise<ConstitutionalDecision>;
    /**
     * Get applicable rules for capability and context
     */
    private getApplicableRules;
    /**
     * Evaluate a context condition
     */
    private evaluateContextCondition;
    /**
     * Get numeric severity level for comparison
     */
    private getSeverityLevel;
    /**
     * Record a rule violation for tracking
     */
    private recordViolation;
    /**
     * Add a new constitutional rule
     *
     * @param rule - Rule to add
     */
    addRule(rule: ConstitutionalRule): void;
    /**
     * Remove a constitutional rule
     *
     * @param ruleId - ID of rule to remove
     */
    removeRule(ruleId: string): boolean;
    /**
     * Enable or disable a rule
     *
     * @param ruleId - ID of rule
     * @param enabled - Whether to enable or disable
     */
    setRuleEnabled(ruleId: string, enabled: boolean): boolean;
    /**
     * Get all constitutional rules
     *
     * @returns Array of all rules
     */
    getRules(): ConstitutionalRule[];
    /**
     * Get rule by ID
     *
     * @param ruleId - ID of rule
     * @returns Rule or undefined
     */
    getRule(ruleId: string): ConstitutionalRule | undefined;
    /**
     * Get violation history
     *
     * @param limit - Maximum number of violations to return
     * @returns Recent violations
     */
    getViolationHistory(limit?: number): Array<{
        ruleId: string;
        timestamp: number;
        severity: string;
    }>;
    /**
     * Get violation statistics
     *
     * @returns Violation statistics by rule and severity
     */
    getViolationStats(): {
        totalViolations: number;
        violationsByRule: Record<string, number>;
        violationsBySeverity: Record<string, number>;
    };
    /**
     * Clear violation history
     */
    clearViolationHistory(): void;
    /**
     * Check if a capability would be approved (dry run)
     *
     * @param capability - Capability to check
     * @param request - Request to check
     * @param context - Context to check
     * @returns Whether it would be approved
     */
    wouldApprove(capability: CapabilitySpec, request: ExecutionRequest, context: ExecutionContext): Promise<boolean>;
}
//# sourceMappingURL=constitutional-filter.d.ts.map