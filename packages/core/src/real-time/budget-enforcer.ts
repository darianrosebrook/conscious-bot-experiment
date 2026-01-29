/**
 * Budget Enforcer - Performance budget allocation and enforcement
 *
 * Enforces time budgets and triggers degradation when performance
 * constraints are violated to maintain real-time responsiveness.
 *
 * @author @darianrosebrook
 */

import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

import {
  CognitiveOperation,
  PerformanceContext,
  BudgetAllocation,
  BudgetStatus,
  BudgetViolation,
  BudgetConfig,
  SystemLoad,
  SystemContext,
  TrackingSession,
  DegradationState,
  DegradationLevel,
  AdaptiveBudgetConfig,
  IBudgetEnforcer,
  validateBudgetAllocation,
} from './types';

export interface BudgetEnforcerEvents {
  'budget-allocated': [BudgetAllocation];
  'budget-warning': [string, BudgetStatus]; // sessionId, status
  'budget-violated': [BudgetViolation];
  'degradation-triggered': [BudgetViolation, DegradationState];
  'budget-adjusted': [string, number]; // reason, newBudget
}

interface ActiveBudget {
  allocation: BudgetAllocation;
  startTime: number;
  lastCheck: number;
  warningsSent: number;
  violated: boolean;
}

/**
 * Budget enforcement system that maintains real-time constraints
 */
export class BudgetEnforcer
  extends EventEmitter<BudgetEnforcerEvents>
  implements IBudgetEnforcer
{
  private activeBudgets = new Map<string, ActiveBudget>();
  private violationHistory: BudgetViolation[] = [];
  private currentSystemLoad: SystemLoad = {
    cpu: 0.5,
    memory: 0.4,
    network: 0.2,
    concurrentOperations: 0,
    queueDepth: 0,
    level: 'low',
    timestamp: Date.now(),
  };

  private readonly monitoringInterval: NodeJS.Timeout;

  constructor(
    private baseBudgets: Record<PerformanceContext, BudgetConfig>,
    private adaptiveConfig: AdaptiveBudgetConfig
  ) {
    super();

    // Start budget monitoring
    this.monitoringInterval = setInterval(() => {
      this.monitorActiveBudgets();
    }, 100); // Check every 100ms for real-time responsiveness
  }

  /**
   * Allocate performance budget for cognitive operation
   */
  allocateBudget(
    operation: CognitiveOperation,
    context: PerformanceContext
  ): BudgetAllocation {
    const baseBudget = this.baseBudgets[context];
    const adjustedBudget = this.calculateDynamicBudget(
      baseBudget,
      this.currentSystemLoad
    );

    // Apply operation-specific adjustments
    const operationMultiplier = this.getOperationMultiplier(operation);
    const contextMultiplier = this.getContextMultiplier(context);

    const totalBudget =
      adjustedBudget.total * operationMultiplier * contextMultiplier;
    const reservedBuffer = Math.min(totalBudget * 0.1, 10); // 10% buffer, max 10ms

    const allocation: BudgetAllocation = {
      sessionId: uuidv4(),
      totalBudget,
      allocatedBudget: totalBudget - reservedBuffer,
      reservedBuffer,
      context,
      allocation: {
        signalProcessing:
          adjustedBudget.allocation.signalProcessing * operationMultiplier,
        routing: adjustedBudget.allocation.routing * operationMultiplier,
        execution: adjustedBudget.allocation.execution * operationMultiplier,
      },
      adjustmentFactors: {
        systemLoad: this.getLoadScalingFactor(this.currentSystemLoad.level),
        operationType: operationMultiplier,
        context: contextMultiplier,
      },
      expiryTime: Date.now() + totalBudget * 2, // Budget expires after 2x allocated time
    };

    validateBudgetAllocation(allocation);

    // Track active budget
    this.activeBudgets.set(allocation.sessionId, {
      allocation,
      startTime: Date.now(),
      lastCheck: Date.now(),
      warningsSent: 0,
      violated: false,
    });

    this.emit('budget-allocated', allocation);
    return allocation;
  }

  /**
   * Monitor ongoing operation against allocated budget
   */
  monitorBudgetUsage(
    session: TrackingSession,
    allocation: BudgetAllocation
  ): BudgetStatus {
    const activeBudget = this.activeBudgets.get(allocation.sessionId);
    if (!activeBudget) {
      throw new Error(`Budget allocation ${allocation.sessionId} not found`);
    }

    const now = Date.now();
    const elapsed = now - activeBudget.startTime;
    const utilization = elapsed / allocation.allocatedBudget;

    // Calculate remaining budget
    const remaining = Math.max(0, allocation.allocatedBudget - elapsed);

    // Project if we'll exceed budget
    const progress = this.estimateProgress(session);
    const projectedTotal =
      progress > 0 ? elapsed / progress : allocation.allocatedBudget * 2;
    const projectedOverrun = Math.max(
      0,
      projectedTotal - allocation.allocatedBudget
    );

    // Determine warning level
    let warningLevel: BudgetStatus['warningLevel'] = 'none';
    let recommendedAction: BudgetStatus['recommendedAction'] = 'continue';

    if (utilization > 0.9) {
      warningLevel = 'critical';
      recommendedAction = 'abort';
    } else if (utilization > 0.8) {
      warningLevel = 'high';
      recommendedAction = 'degrade';
    } else if (utilization > 0.6) {
      warningLevel = 'medium';
      recommendedAction = 'optimize';
    } else if (utilization > 0.4) {
      warningLevel = 'low';
      recommendedAction = 'continue';
    }

    const status: BudgetStatus = {
      utilization,
      remaining,
      projectedOverrun,
      warningLevel,
      timeRemaining: remaining,
      recommendedAction,
    };

    // Send warnings if needed
    if (warningLevel !== 'none' && activeBudget.warningsSent < 3) {
      activeBudget.warningsSent++;
      this.emit('budget-warning', allocation.sessionId, status);
    }

    // Check for violations
    if (elapsed > allocation.allocatedBudget && !activeBudget.violated) {
      activeBudget.violated = true;
      const violation = this.createBudgetViolation(
        session,
        allocation,
        elapsed
      );
      this.handleBudgetViolation(violation);
    }

    activeBudget.lastCheck = now;
    return status;
  }

  /**
   * Trigger degradation when budget violations detected
   */
  triggerDegradation(violation: BudgetViolation): DegradationState {
    // Determine appropriate degradation level based on violation severity
    let degradationLevel: DegradationLevel;

    const overrunRatio = violation.budgetExceeded / violation.allocatedBudget;

    if (overrunRatio > 3) {
      degradationLevel = DegradationLevel.CRITICAL;
    } else if (overrunRatio > 2) {
      degradationLevel = DegradationLevel.SEVERE;
    } else if (overrunRatio > 1.5) {
      degradationLevel = DegradationLevel.MODERATE;
    } else {
      degradationLevel = DegradationLevel.MINIMAL;
    }

    const degradationState: DegradationState = {
      currentLevel: degradationLevel,
      activeStrategies: [], // Will be populated by DegradationManager
      triggeredAt: Date.now(),
      reason: `Budget violation: ${violation.budgetExceeded}ms over ${violation.allocatedBudget}ms limit`,
      disabledFeatures: [],
      performance: {
        baselineLatency: violation.allocatedBudget,
        currentLatency: violation.actualDuration,
        improvement: 0, // Will be measured after degradation
      },
      recoveryEligible: false, // Will be determined after degradation settles
    };

    this.emit('degradation-triggered', violation, degradationState);
    return degradationState;
  }

  /**
   * Calculate dynamic budget adjustments based on system load
   */
  calculateDynamicBudget(
    baseBudget: BudgetConfig,
    systemLoad: SystemLoad
  ): BudgetConfig {
    const loadFactor = this.getLoadScalingFactor(systemLoad.level);

    return {
      total: baseBudget.total * loadFactor,
      allocation: {
        signalProcessing: baseBudget.allocation.signalProcessing * loadFactor,
        routing: baseBudget.allocation.routing * loadFactor,
        execution: baseBudget.allocation.execution * loadFactor,
      },
      triggers: baseBudget.triggers,
    };
  }

  /**
   * Update system load for dynamic budget calculations
   */
  updateSystemLoad(systemLoad: SystemLoad): void {
    this.currentSystemLoad = systemLoad;

    // Adjust existing budgets if system load changed significantly
    const previousLevel = this.currentSystemLoad.level;
    if (systemLoad.level !== previousLevel) {
      this.adjustActiveBudgets(systemLoad);
    }
  }

  /**
   * Get current active budget allocations
   */
  getActiveBudgets(): BudgetAllocation[] {
    return Array.from(this.activeBudgets.values()).map((ab) => ab.allocation);
  }

  /**
   * Get recent budget violations
   */
  getViolationHistory(limit: number = 50): BudgetViolation[] {
    return this.violationHistory.slice(-limit);
  }

  /**
   * Force release budget allocation (for cleanup)
   */
  releaseBudget(sessionId: string): boolean {
    return this.activeBudgets.delete(sessionId);
  }

  /**
   * Get budget statistics
   */
  getBudgetStatistics(): {
    activeBudgets: number;
    totalViolations: number;
    recentViolationRate: number;
    averageUtilization: number;
  } {
    const recentCutoff = Date.now() - 300000; // 5 minutes
    const recentViolations = this.violationHistory.filter(
      (v) => v.timestamp > recentCutoff
    );

    const activeBudgetsList = Array.from(this.activeBudgets.values());
    const totalUtilization = activeBudgetsList.reduce((sum, budget) => {
      const elapsed = Date.now() - budget.startTime;
      return sum + elapsed / budget.allocation.allocatedBudget;
    }, 0);

    return {
      activeBudgets: this.activeBudgets.size,
      totalViolations: this.violationHistory.length,
      recentViolationRate:
        recentViolations.length / Math.max(1, activeBudgetsList.length),
      averageUtilization:
        activeBudgetsList.length > 0
          ? totalUtilization / activeBudgetsList.length
          : 0,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    clearInterval(this.monitoringInterval);
    this.activeBudgets.clear();
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private getLoadScalingFactor(loadLevel: SystemLoad['level']): number {
    switch (loadLevel) {
      case 'low':
        return this.adaptiveConfig.loadScaling.lowLoad;
      case 'medium':
        return this.adaptiveConfig.loadScaling.mediumLoad;
      case 'high':
        return this.adaptiveConfig.loadScaling.highLoad;
      case 'critical':
        return this.adaptiveConfig.loadScaling.criticalLoad;
      default:
        return 1.0;
    }
  }

  private getOperationMultiplier(operation: CognitiveOperation): number {
    // Check QoS guarantees
    for (const [pattern, qos] of Object.entries(
      this.adaptiveConfig.qosGuarantees
    )) {
      if (
        operation.name.includes(pattern) ||
        operation.type.includes(pattern)
      ) {
        return qos.budgetMultiplier;
      }
    }

    // Default multipliers based on operation type
    const operationMultipliers: Record<string, number> = {
      signal_processing: 0.8,
      routing_decision: 0.6,
      capability_execution: 1.2,
      memory_operation: 1.0,
      planning_operation: 1.5,
      llm_inference: 2.0,
      world_interaction: 1.1,
    };

    return operationMultipliers[operation.type] || 1.0;
  }

  private getContextMultiplier(context: PerformanceContext): number {
    // Apply context modifiers from adaptive config
    const contextMultipliers: Record<PerformanceContext, number> = {
      [PerformanceContext.EMERGENCY]: 0.8, // Tighter budgets in emergencies
      [PerformanceContext.ROUTINE]: 1.0, // Standard budgets
      [PerformanceContext.DELIBERATIVE]: 1.2, // Looser budgets for complex tasks
    };

    return contextMultipliers[context] || 1.0;
  }

  private estimateProgress(session: TrackingSession): number {
    if (session.checkpoints.length === 0) {
      // Estimate based on elapsed time vs expected duration
      const elapsed = Date.now() - session.startTime;
      const expected = session.operation.expectedDuration || session.budget;
      return Math.min(1, elapsed / expected);
    }

    // Use latest checkpoint progress
    const latestCheckpoint =
      session.checkpoints[session.checkpoints.length - 1];
    return latestCheckpoint.progress;
  }

  private createBudgetViolation(
    session: TrackingSession,
    allocation: BudgetAllocation,
    actualDuration: number
  ): BudgetViolation {
    const overrun = actualDuration - allocation.allocatedBudget;
    const severity = this.determineSeverity(
      overrun,
      allocation.allocatedBudget
    );

    const violation: BudgetViolation = {
      sessionId: allocation.sessionId,
      operationType: session.operation.type,
      budgetExceeded: overrun,
      actualDuration,
      allocatedBudget: allocation.allocatedBudget,
      severity,
      context: allocation.context,
      timestamp: Date.now(),
    };

    return violation;
  }

  private determineSeverity(
    overrun: number,
    allocatedBudget: number
  ): BudgetViolation['severity'] {
    const ratio = overrun / allocatedBudget;

    if (ratio > 1) return 'critical';
    if (ratio > 0.5) return 'major';
    if (ratio > 0.2) return 'moderate';
    return 'minor';
  }

  private handleBudgetViolation(violation: BudgetViolation): void {
    this.violationHistory.push(violation);

    // Keep only recent violations (last 1000)
    if (this.violationHistory.length > 1000) {
      this.violationHistory = this.violationHistory.slice(-1000);
    }

    this.emit('budget-violated', violation);

    // Trigger degradation for severe violations
    if (violation.severity === 'major' || violation.severity === 'critical') {
      this.triggerDegradation(violation);
    }
  }

  private adjustActiveBudgets(newSystemLoad: SystemLoad): void {
    const adjustmentReason = `System load changed from ${this.currentSystemLoad.level} to ${newSystemLoad.level}`;

    for (const [sessionId, activeBudget] of this.activeBudgets) {
      const oldBudget = activeBudget.allocation.allocatedBudget;
      const newScaling = this.getLoadScalingFactor(newSystemLoad.level);
      const oldScaling = this.getLoadScalingFactor(
        this.currentSystemLoad.level
      );

      const adjustmentRatio = newScaling / oldScaling;
      const newBudget = oldBudget * adjustmentRatio;

      // Update allocation
      activeBudget.allocation.allocatedBudget = newBudget;
      activeBudget.allocation.totalBudget =
        newBudget + activeBudget.allocation.reservedBuffer;

      this.emit('budget-adjusted', adjustmentReason, newBudget);
    }
  }

  private monitorActiveBudgets(): void {
    const now = Date.now();
    const expiredBudgets: string[] = [];

    for (const [sessionId, activeBudget] of this.activeBudgets) {
      // Remove expired budgets
      if (now > activeBudget.allocation.expiryTime) {
        expiredBudgets.push(sessionId);
        continue;
      }

      // Check for violations in long-running operations
      const elapsed = now - activeBudget.startTime;
      if (
        elapsed > activeBudget.allocation.allocatedBudget &&
        !activeBudget.violated
      ) {
        activeBudget.violated = true;

        // Create synthetic session for violation reporting
        const syntheticSession: TrackingSession = {
          id: sessionId,
          operation: {
            id: sessionId,
            type: 'signal_processing' as any, // Will be overridden by actual operation
            name: 'unknown_operation',
            module: 'unknown',
            priority: 0.5,
          },
          context: activeBudget.allocation.context,
          startTime: activeBudget.startTime,
          budget: activeBudget.allocation.allocatedBudget,
          checkpoints: [],
          warnings: [],
          active: false,
        };

        const violation = this.createBudgetViolation(
          syntheticSession,
          activeBudget.allocation,
          elapsed
        );

        this.handleBudgetViolation(violation);
      }
    }

    // Clean up expired budgets
    for (const sessionId of expiredBudgets) {
      this.activeBudgets.delete(sessionId);
    }
  }
}
