/**
 * Budget Enforcer - Performance budget allocation and enforcement
 *
 * Enforces time budgets and triggers degradation when performance
 * constraints are violated to maintain real-time responsiveness.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { CognitiveOperation, PerformanceContext, BudgetAllocation, BudgetStatus, BudgetViolation, BudgetConfig, SystemLoad, TrackingSession, DegradationState, AdaptiveBudgetConfig, IBudgetEnforcer } from './types';
export interface BudgetEnforcerEvents {
    'budget-allocated': [BudgetAllocation];
    'budget-warning': [string, BudgetStatus];
    'budget-violated': [BudgetViolation];
    'degradation-triggered': [BudgetViolation, DegradationState];
    'budget-adjusted': [string, number];
}
/**
 * Budget enforcement system that maintains real-time constraints
 */
export declare class BudgetEnforcer extends EventEmitter<BudgetEnforcerEvents> implements IBudgetEnforcer {
    private baseBudgets;
    private adaptiveConfig;
    private activeBudgets;
    private violationHistory;
    private currentSystemLoad;
    private readonly monitoringInterval;
    constructor(baseBudgets: Record<PerformanceContext, BudgetConfig>, adaptiveConfig: AdaptiveBudgetConfig);
    /**
     * Allocate performance budget for cognitive operation
     */
    allocateBudget(operation: CognitiveOperation, context: PerformanceContext): BudgetAllocation;
    /**
     * Monitor ongoing operation against allocated budget
     */
    monitorBudgetUsage(session: TrackingSession, allocation: BudgetAllocation): BudgetStatus;
    /**
     * Trigger degradation when budget violations detected
     */
    triggerDegradation(violation: BudgetViolation): DegradationState;
    /**
     * Calculate dynamic budget adjustments based on system load
     */
    calculateDynamicBudget(baseBudget: BudgetConfig, systemLoad: SystemLoad): BudgetConfig;
    /**
     * Update system load for dynamic budget calculations
     */
    updateSystemLoad(systemLoad: SystemLoad): void;
    /**
     * Get current active budget allocations
     */
    getActiveBudgets(): BudgetAllocation[];
    /**
     * Get recent budget violations
     */
    getViolationHistory(limit?: number): BudgetViolation[];
    /**
     * Force release budget allocation (for cleanup)
     */
    releaseBudget(sessionId: string): boolean;
    /**
     * Get budget statistics
     */
    getBudgetStatistics(): {
        activeBudgets: number;
        totalViolations: number;
        recentViolationRate: number;
        averageUtilization: number;
    };
    /**
     * Clean up resources
     */
    dispose(): void;
    private getLoadScalingFactor;
    private getOperationMultiplier;
    private getContextMultiplier;
    private estimateProgress;
    private createBudgetViolation;
    private determineSeverity;
    private handleBudgetViolation;
    private adjustActiveBudgets;
    private monitorActiveBudgets;
}
//# sourceMappingURL=budget-enforcer.d.ts.map