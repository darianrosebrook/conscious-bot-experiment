/**
 * Degradation Manager - Graceful degradation and recovery strategies
 *
 * Implements intelligent degradation strategies when performance constraints
 * cannot be met, with automatic recovery when conditions improve.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import {
  BudgetViolation,
  DegradationLevel,
  DegradationStrategy,
  DegradationState,
  RecoveryAssessment,
  PerformanceContext,
  SystemLoad,
  ComponentPriority,
  IDegradationManager,
} from './types';

export interface DegradationManagerEvents {
  'degradation-evaluated': [DegradationStrategy];
  'degradation-executed': [DegradationState];
  'degradation-level-changed': [DegradationLevel, DegradationLevel]; // from, to
  'recovery-assessed': [RecoveryAssessment];
  'recovery-started': [DegradationState];
  'recovery-completed': [DegradationState];
  'feature-disabled': [string, string]; // feature, reason
  'feature-restored': [string];
}

interface DegradationRule {
  level: DegradationLevel;
  actions: Array<{
    type:
      | 'disable_feature'
      | 'reduce_quality'
      | 'simplify_algorithm'
      | 'cache_only';
    target: string;
    parameters?: Record<string, any>;
  }>;
  expectedImprovement: number; // Percentage improvement expected
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  prerequisites: string[];
  reversible: boolean;
}

/**
 * Intelligent degradation management with recovery strategies
 */
export class DegradationManager
  extends EventEmitter<DegradationManagerEvents>
  implements IDegradationManager
{
  private currentState: DegradationState = {
    currentLevel: DegradationLevel.NONE,
    activeStrategies: [],
    triggeredAt: 0,
    reason: '',
    disabledFeatures: [],
    performance: {
      baselineLatency: 0,
      currentLatency: 0,
      improvement: 0,
    },
    recoveryEligible: true,
  };

  private degradationRules: Map<DegradationLevel, DegradationRule[]> =
    new Map();
  private disabledFeatures = new Set<string>();
  private degradationHistory: Array<{
    level: DegradationLevel;
    timestamp: number;
    reason: string;
    duration: number;
  }> = [];

  private recoveryTimer?: NodeJS.Timeout;

  constructor(
    private componentPriorities: ComponentPriority[] = [],
    private config: {
      recoveryAttemptInterval: number;
      maxDegradationDuration: number;
      recoveryThreshold: number;
    } = {
      recoveryAttemptInterval: 300000, // 5 minutes
      maxDegradationDuration: 3600000, // 1 hour
      recoveryThreshold: 0.25, // 25% improvement needed for recovery
    }
  ) {
    super();
    this.initializeDefaultRules();
    this.startRecoveryMonitoring();
  }

  /**
   * Evaluate appropriate degradation strategy for current situation
   */
  evaluateDegradationStrategy(
    violation: BudgetViolation,
    currentState: DegradationState
  ): DegradationStrategy {
    // Determine target degradation level based on violation severity
    const targetLevel = this.calculateTargetDegradationLevel(
      violation,
      currentState
    );

    // Get applicable rules for target level
    const rules = this.degradationRules.get(targetLevel) || [];

    // Select best rule based on current context
    const selectedRule = this.selectOptimalRule(rules, violation, currentState);

    if (!selectedRule) {
      // Fallback to emergency degradation
      return this.createEmergencyStrategy(violation);
    }

    const strategy: DegradationStrategy = {
      level: targetLevel,
      actions: selectedRule.actions.map((action) => action.target),
      expectedImprovement: `${selectedRule.expectedImprovement}%`,
      impactLevel: selectedRule.impactLevel,
      estimatedDuration: this.estimateDegradationDuration(
        violation,
        selectedRule
      ),
      reversible: selectedRule.reversible,
      dependencies: selectedRule.prerequisites,
    };

    this.emit('degradation-evaluated', strategy);
    return strategy;
  }

  /**
   * Execute graceful degradation with component prioritization
   */
  executeDegradation(strategy: DegradationStrategy): DegradationState {
    const previousLevel = this.currentState.currentLevel;

    // Execute degradation actions
    const disabledFeatures: string[] = [];
    const baselineLatency = this.currentState.performance.currentLatency || 200;

    for (const action of strategy.actions) {
      const success = this.executeAction(action, strategy.level);
      if (success) {
        disabledFeatures.push(action);
        this.emit(
          'feature-disabled',
          action,
          `Degradation level ${strategy.level}`
        );
      }
    }

    // Update degradation state
    this.currentState = {
      currentLevel: strategy.level,
      activeStrategies: [strategy],
      triggeredAt: Date.now(),
      reason: `Performance degradation: ${strategy.expectedImprovement} improvement expected`,
      disabledFeatures,
      performance: {
        baselineLatency,
        currentLatency: baselineLatency, // Will be updated as we measure
        improvement: 0, // Will be calculated as performance improves
      },
      recoveryEligible: strategy.reversible,
    };

    // Record degradation in history
    this.degradationHistory.push({
      level: strategy.level,
      timestamp: Date.now(),
      reason: this.currentState.reason,
      duration: 0, // Will be updated when degradation ends
    });

    this.emit('degradation-level-changed', previousLevel, strategy.level);
    this.emit('degradation-executed', this.currentState);

    return this.currentState;
  }

  /**
   * Monitor degraded operation and plan recovery
   */
  assessRecovery(state: DegradationState): RecoveryAssessment {
    const now = Date.now();
    const degradationDuration = now - state.triggeredAt;

    // Calculate current performance improvement
    const improvement =
      state.performance.baselineLatency > 0
        ? (state.performance.baselineLatency -
            state.performance.currentLatency) /
          state.performance.baselineLatency
        : 0;

    // Determine if recovery is feasible
    const feasible = this.isRecoveryFeasible(
      state,
      improvement,
      degradationDuration
    );
    const confidence = this.calculateRecoveryConfidence(state, improvement);

    const assessment: RecoveryAssessment = {
      feasible,
      confidence,
      estimatedDuration: this.estimateRecoveryDuration(state),
      requiredConditions: this.getRecoveryConditions(state),
      risks: this.assessRecoveryRisks(state),
      recommendedApproach: this.recommendRecoveryApproach(
        state,
        improvement,
        degradationDuration
      ),
      nextAssessment: now + this.config.recoveryAttemptInterval,
    };

    this.emit('recovery-assessed', assessment);
    return assessment;
  }

  /**
   * Restore full operation when constraints allow
   */
  restoreOperation(
    state: DegradationState,
    strategy: DegradationStrategy
  ): DegradationState {
    if (!state.recoveryEligible) {
      throw new Error('Recovery is not eligible for current degradation state');
    }

    this.emit('recovery-started', state);

    // Restore disabled features in reverse order
    const restoredFeatures: string[] = [];

    for (let i = state.disabledFeatures.length - 1; i >= 0; i--) {
      const feature = state.disabledFeatures[i];
      const success = this.restoreFeature(feature);

      if (success) {
        restoredFeatures.push(feature);
        this.emit('feature-restored', feature);
      }
    }

    // Create new state representing recovery
    const recoveredState: DegradationState = {
      currentLevel: DegradationLevel.NONE,
      activeStrategies: [],
      triggeredAt: 0,
      reason: 'Recovery completed successfully',
      disabledFeatures: state.disabledFeatures.filter(
        (f) => !restoredFeatures.includes(f)
      ),
      performance: {
        baselineLatency: state.performance.baselineLatency,
        currentLatency: state.performance.currentLatency,
        improvement: state.performance.improvement,
      },
      recoveryEligible: true,
    };

    // Update history
    const historyEntry =
      this.degradationHistory[this.degradationHistory.length - 1];
    if (historyEntry) {
      historyEntry.duration = Date.now() - historyEntry.timestamp;
    }

    this.currentState = recoveredState;
    this.emit(
      'degradation-level-changed',
      state.currentLevel,
      DegradationLevel.NONE
    );
    this.emit('recovery-completed', recoveredState);

    return recoveredState;
  }

  /**
   * Update performance metrics for degradation assessment
   */
  updatePerformanceMetrics(latency: number): void {
    if (this.currentState.currentLevel === DegradationLevel.NONE) {
      return;
    }

    const oldLatency = this.currentState.performance.currentLatency;
    this.currentState.performance.currentLatency = latency;

    // Calculate improvement
    if (this.currentState.performance.baselineLatency > 0) {
      this.currentState.performance.improvement =
        (this.currentState.performance.baselineLatency - latency) /
        this.currentState.performance.baselineLatency;
    }

    // Check if significant improvement occurred
    const improvementThreshold = this.config.recoveryThreshold;
    if (this.currentState.performance.improvement >= improvementThreshold) {
      // Schedule recovery assessment
      this.scheduleRecoveryAssessment();
    }
  }

  /**
   * Get current degradation state
   */
  getCurrentState(): DegradationState {
    return { ...this.currentState };
  }

  /**
   * Get degradation history
   */
  getDegradationHistory(limit: number = 50): Array<{
    level: DegradationLevel;
    timestamp: number;
    reason: string;
    duration: number;
  }> {
    return this.degradationHistory.slice(-limit);
  }

  /**
   * Force recovery attempt (for manual intervention)
   */
  forceRecovery(): RecoveryAssessment {
    const assessment = this.assessRecovery(this.currentState);

    if (assessment.feasible && assessment.confidence > 0.5) {
      // Attempt recovery
      try {
        this.restoreOperation(
          this.currentState,
          this.currentState.activeStrategies[0]
        );
      } catch (error) {
        // Recovery failed, update assessment
        assessment.feasible = false;
        assessment.risks.push('Manual recovery attempt failed');
      }
    }

    return assessment;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private initializeDefaultRules(): void {
    // Minimal degradation rules
    this.degradationRules.set(DegradationLevel.MINIMAL, [
      {
        level: DegradationLevel.MINIMAL,
        actions: [
          { type: 'disable_feature', target: 'curiosity_exploration' },
          {
            type: 'reduce_quality',
            target: 'memory_consolidation',
            parameters: { frequency: 0.5 },
          },
          { type: 'simplify_algorithm', target: 'social_responses' },
        ],
        expectedImprovement: 15,
        impactLevel: 'low',
        prerequisites: [],
        reversible: true,
      },
    ]);

    // Moderate degradation rules
    this.degradationRules.set(DegradationLevel.MODERATE, [
      {
        level: DegradationLevel.MODERATE,
        actions: [
          { type: 'disable_feature', target: 'complex_planning' },
          { type: 'cache_only', target: 'llm_reflection' },
          {
            type: 'reduce_quality',
            target: 'planning_horizon',
            parameters: { reduction: 0.6 },
          },
        ],
        expectedImprovement: 40,
        impactLevel: 'medium',
        prerequisites: [],
        reversible: true,
      },
    ]);

    // Severe degradation rules
    this.degradationRules.set(DegradationLevel.SEVERE, [
      {
        level: DegradationLevel.SEVERE,
        actions: [
          { type: 'disable_feature', target: 'llm_integration' },
          { type: 'cache_only', target: 'planning_system' },
          { type: 'simplify_algorithm', target: 'all_cognitive_modules' },
        ],
        expectedImprovement: 70,
        impactLevel: 'high',
        prerequisites: [],
        reversible: true,
      },
    ]);

    // Critical degradation rules
    this.degradationRules.set(DegradationLevel.CRITICAL, [
      {
        level: DegradationLevel.CRITICAL,
        actions: [
          { type: 'disable_feature', target: 'all_planning' },
          { type: 'cache_only', target: 'safety_reflexes' },
          { type: 'simplify_algorithm', target: 'sensory_processing' },
        ],
        expectedImprovement: 90,
        impactLevel: 'critical',
        prerequisites: [],
        reversible: false, // Critical degradation may not be fully reversible
      },
    ]);
  }

  private calculateTargetDegradationLevel(
    violation: BudgetViolation,
    currentState: DegradationState
  ): DegradationLevel {
    const violationRatio = violation.budgetExceeded / violation.allocatedBudget;

    // If already degraded, consider stepping up
    let targetLevel = currentState.currentLevel;

    if (violationRatio > 2) {
      targetLevel = Math.max(targetLevel, DegradationLevel.SEVERE);
    } else if (violationRatio > 1) {
      targetLevel = Math.max(targetLevel, DegradationLevel.MODERATE);
    } else if (violationRatio > 0.5) {
      targetLevel = Math.max(targetLevel, DegradationLevel.MINIMAL);
    }

    // Emergency contexts may require more aggressive degradation
    if (violation.context === PerformanceContext.EMERGENCY) {
      targetLevel = Math.min(DegradationLevel.CRITICAL, targetLevel + 1);
    }

    return targetLevel;
  }

  private selectOptimalRule(
    rules: DegradationRule[],
    violation: BudgetViolation,
    currentState: DegradationState
  ): DegradationRule | null {
    if (rules.length === 0) return null;

    // Score rules based on expected improvement and impact
    const scoredRules = rules.map((rule) => ({
      rule,
      score: this.scoreRule(rule, violation, currentState),
    }));

    // Sort by score (higher is better)
    scoredRules.sort((a, b) => b.score - a.score);

    return scoredRules[0].rule;
  }

  private scoreRule(
    rule: DegradationRule,
    violation: BudgetViolation,
    currentState: DegradationState
  ): number {
    let score = rule.expectedImprovement; // Base score on expected improvement

    // Prefer less impactful rules
    const impactPenalty = {
      low: 0,
      medium: -10,
      high: -20,
      critical: -40,
    };
    score += impactPenalty[rule.impactLevel];

    // Prefer reversible rules
    if (rule.reversible) {
      score += 5;
    }

    // Check if prerequisites are met
    for (const prereq of rule.prerequisites) {
      if (!this.isPrerequisiteMet(prereq, currentState)) {
        score -= 100; // Heavy penalty for unmet prerequisites
      }
    }

    return score;
  }

  private isPrerequisiteMet(
    prerequisite: string,
    state: DegradationState
  ): boolean {
    // Implementation depends on specific prerequisites
    // For now, assume all prerequisites are met
    return true;
  }

  private createEmergencyStrategy(
    violation: BudgetViolation
  ): DegradationStrategy {
    return {
      level: DegradationLevel.CRITICAL,
      actions: ['disable_all_non_essential', 'emergency_mode_only'],
      expectedImprovement: '95%',
      impactLevel: 'critical',
      estimatedDuration: 60000, // 1 minute emergency degradation
      reversible: false,
      dependencies: [],
    };
  }

  private estimateDegradationDuration(
    violation: BudgetViolation,
    rule: DegradationRule
  ): number {
    // Base duration on violation severity and rule impact
    const baseDuration = 300000; // 5 minutes
    const severityMultiplier = violation.severity === 'critical' ? 2 : 1;
    const impactMultiplier = rule.impactLevel === 'critical' ? 3 : 1;

    return baseDuration * severityMultiplier * impactMultiplier;
  }

  private executeAction(action: string, level: DegradationLevel): boolean {
    // Implementation would interact with actual system components
    // For now, just track the disabled feature
    this.disabledFeatures.add(action);
    return true;
  }

  private restoreFeature(feature: string): boolean {
    // Implementation would re-enable the actual system component
    // For now, just remove from disabled set
    return this.disabledFeatures.delete(feature);
  }

  private isRecoveryFeasible(
    state: DegradationState,
    improvement: number,
    duration: number
  ): boolean {
    // Check if sufficient improvement has been achieved
    if (improvement < this.config.recoveryThreshold) {
      return false;
    }

    // Check if degradation has been active long enough to be stable
    if (duration < 60000) {
      return false; // Wait at least 1 minute
    }

    // Check if maximum degradation duration exceeded
    if (duration > this.config.maxDegradationDuration) {
      return true; // Force recovery after max duration
    }

    return state.recoveryEligible;
  }

  private calculateRecoveryConfidence(
    state: DegradationState,
    improvement: number
  ): number {
    let confidence = improvement * 2; // Base confidence on improvement

    // Adjust based on degradation level
    const levelConfidence = {
      [DegradationLevel.NONE]: 1.0,
      [DegradationLevel.MINIMAL]: 0.9,
      [DegradationLevel.MODERATE]: 0.7,
      [DegradationLevel.SEVERE]: 0.4,
      [DegradationLevel.CRITICAL]: 0.1,
    };

    confidence *= levelConfidence[state.currentLevel];

    return Math.min(1, Math.max(0, confidence));
  }

  private estimateRecoveryDuration(state: DegradationState): number {
    // Base recovery time on degradation level
    const baseTimes = {
      [DegradationLevel.NONE]: 0,
      [DegradationLevel.MINIMAL]: 30000, // 30 seconds
      [DegradationLevel.MODERATE]: 120000, // 2 minutes
      [DegradationLevel.SEVERE]: 300000, // 5 minutes
      [DegradationLevel.CRITICAL]: 600000, // 10 minutes
    };

    return baseTimes[state.currentLevel];
  }

  private getRecoveryConditions(state: DegradationState): string[] {
    const conditions: string[] = [];

    if (state.performance.improvement < this.config.recoveryThreshold) {
      conditions.push(
        `Performance improvement >= ${this.config.recoveryThreshold * 100}%`
      );
    }

    if (state.currentLevel >= DegradationLevel.SEVERE) {
      conditions.push('System load reduction');
      conditions.push('Resource availability confirmation');
    }

    return conditions;
  }

  private assessRecoveryRisks(state: DegradationState): string[] {
    const risks: string[] = [];

    if (state.currentLevel >= DegradationLevel.MODERATE) {
      risks.push('Performance regression');
      risks.push('Cascade failure during recovery');
    }

    if (state.performance.improvement < 0.5) {
      risks.push('Insufficient performance improvement');
    }

    return risks;
  }

  private recommendRecoveryApproach(
    state: DegradationState,
    improvement: number,
    duration: number
  ): RecoveryAssessment['recommendedApproach'] {
    if (duration > this.config.maxDegradationDuration) {
      return 'immediate'; // Force recovery
    }

    if (improvement >= 0.5 && state.currentLevel <= DegradationLevel.MODERATE) {
      return 'immediate';
    }

    if (improvement >= 0.3) {
      return 'gradual';
    }

    if (improvement >= this.config.recoveryThreshold) {
      return 'scheduled';
    }

    return 'manual'; // Requires human intervention
  }

  private scheduleRecoveryAssessment(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    this.recoveryTimer = setTimeout(() => {
      const assessment = this.assessRecovery(this.currentState);

      if (assessment.feasible && assessment.confidence > 0.7) {
        // Attempt automatic recovery
        try {
          this.restoreOperation(
            this.currentState,
            this.currentState.activeStrategies[0]
          );
        } catch (error) {
          // Recovery failed, schedule next attempt
          this.scheduleRecoveryAssessment();
        }
      } else {
        // Schedule next assessment
        this.scheduleRecoveryAssessment();
      }
    }, this.config.recoveryAttemptInterval);
  }

  private startRecoveryMonitoring(): void {
    // Start periodic recovery monitoring
    setInterval(() => {
      if (this.currentState.currentLevel > DegradationLevel.NONE) {
        this.assessRecovery(this.currentState);
      }
    }, this.config.recoveryAttemptInterval);
  }
}
