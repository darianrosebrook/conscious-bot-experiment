/**
 * Degradation Manager - Graceful degradation and recovery strategies
 *
 * Implements intelligent degradation strategies when performance constraints
 * cannot be met, with automatic recovery when conditions improve.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { BudgetViolation, DegradationLevel, DegradationStrategy, DegradationState, RecoveryAssessment, ComponentPriority, IDegradationManager } from './types';
export interface DegradationManagerEvents {
    'degradation-evaluated': [DegradationStrategy];
    'degradation-executed': [DegradationState];
    'degradation-level-changed': [DegradationLevel, DegradationLevel];
    'recovery-assessed': [RecoveryAssessment];
    'recovery-started': [DegradationState];
    'recovery-completed': [DegradationState];
    'feature-disabled': [string, string];
    'feature-restored': [string];
}
/**
 * Intelligent degradation management with recovery strategies
 */
export declare class DegradationManager extends EventEmitter<DegradationManagerEvents> implements IDegradationManager {
    private componentPriorities;
    private config;
    private currentState;
    private degradationRules;
    private disabledFeatures;
    private degradationHistory;
    private recoveryTimer?;
    constructor(componentPriorities?: ComponentPriority[], config?: {
        recoveryAttemptInterval: number;
        maxDegradationDuration: number;
        recoveryThreshold: number;
    });
    /**
     * Evaluate appropriate degradation strategy for current situation
     */
    evaluateDegradationStrategy(violation: BudgetViolation, currentState: DegradationState): DegradationStrategy;
    /**
     * Execute graceful degradation with component prioritization
     */
    executeDegradation(strategy: DegradationStrategy): DegradationState;
    /**
     * Monitor degraded operation and plan recovery
     */
    assessRecovery(state: DegradationState): RecoveryAssessment;
    /**
     * Restore full operation when constraints allow
     */
    restoreOperation(state: DegradationState, strategy: DegradationStrategy): DegradationState;
    /**
     * Update performance metrics for degradation assessment
     */
    updatePerformanceMetrics(latency: number): void;
    /**
     * Get current degradation state
     */
    getCurrentState(): DegradationState;
    /**
     * Get degradation history
     */
    getDegradationHistory(limit?: number): Array<{
        level: DegradationLevel;
        timestamp: number;
        reason: string;
        duration: number;
    }>;
    /**
     * Force recovery attempt (for manual intervention)
     */
    forceRecovery(): RecoveryAssessment;
    /**
     * Clean up resources
     */
    dispose(): void;
    private initializeDefaultRules;
    private calculateTargetDegradationLevel;
    private selectOptimalRule;
    private scoreRule;
    private isPrerequisiteMet;
    private createEmergencyStrategy;
    private estimateDegradationDuration;
    private executeAction;
    private restoreFeature;
    private isRecoveryFeasible;
    private calculateRecoveryConfidence;
    private estimateRecoveryDuration;
    private getRecoveryConditions;
    private assessRecoveryRisks;
    private recommendRecoveryApproach;
    private scheduleRecoveryAssessment;
    private startRecoveryMonitoring;
}
//# sourceMappingURL=degradation-manager.d.ts.map