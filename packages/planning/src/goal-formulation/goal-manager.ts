/**
 * Enhanced goal manager with advanced signal processing, goal generation, and priority scoring.
 *
 * Integrates all advanced goal formulation components to provide a complete
 * Signals → Needs → Goals pipeline with sophisticated decision making.
 *
 * Author: @darianrosebrook
 */

import {
  Goal,
  GoalStatus,
  HomeostasisState,
  Need,
  NeedType,
  Resource,
} from '../types';
import {
  AdvancedSignalProcessor,
  InternalSignal,
  SignalType,
} from './advanced-signal-processor';
import { GoalGenerator, CandidateGoal, WorldState } from './goal-generator';
import {
  PriorityScorer,
  PlanningContext,
  PriorityScore,
} from './priority-scorer';
import { HomeostasisMonitor } from './homeostasis-monitor';

export interface GoalFormulationResult {
  identifiedNeeds: Need[];
  generatedGoals: CandidateGoal[];
  priorityRanking: PriorityScore[];
  selectedGoal?: Goal;
  processingTime: number;
  breakdown: {
    signalProcessing: number;
    goalGeneration: number;
    priorityScoring: number;
  };
}

export interface GoalFormulationMetrics {
  signalProcessingLatency: number;
  goalGenerationLatency: number;
  priorityScoringLatency: number;
  totalLatency: number;
  goalSuccessRate: number;
  averageGoalPriority: number;
  subgoalDecompositionRate: number;
  priorityAccuracy: number;
  commitmentViolationRate: number;
  opportunityUtilization: number;
  needSatisfactionLatency: number;
  adaptationSpeed: number;
  resourceUtilizationRatio: number;
}

/**
 * Enhanced goal manager with complete goal formulation pipeline.
 */
export class EnhancedGoalManager {
  private signalProcessor: AdvancedSignalProcessor;
  private goalGenerator: GoalGenerator;
  private priorityScorer: PriorityScorer;
  private homeostasisMonitor: HomeostasisMonitor;
  private goals: Goal[] = [];
  private metrics: GoalFormulationMetrics;
  private goalHistory: Goal[] = [];
  private needHistory: Need[] = [];

  constructor() {
    this.signalProcessor = new AdvancedSignalProcessor();
    this.goalGenerator = new GoalGenerator();
    this.priorityScorer = new PriorityScorer();
    this.homeostasisMonitor = new HomeostasisMonitor();
    this.metrics = this.initializeMetrics();
  }

  /**
   * Complete goal formulation pipeline: Signals → Needs → Goals → Priority Ranking.
   */
  async formulateGoals(
    signals: InternalSignal[],
    worldState: WorldState,
    context?: Partial<PlanningContext>
  ): Promise<GoalFormulationResult> {
    const startTime = Date.now();

    // Step 1: Signal Processing
    const signalStart = Date.now();
    const homeostasis = this.homeostasisMonitor.sample();
    const needs = this.signalProcessor.processSignals(
      signals,
      homeostasis,
      worldState
    );
    const signalTime = Date.now() - signalStart;

    // Step 2: Goal Generation
    const goalStart = Date.now();
    let candidateGoals = await this.goalGenerator.generateCandidates(
      needs,
      worldState
    );

    // If no goals generated from signals but context has candidate goals, use those
    if (candidateGoals.length === 0 && context?.candidateGoals) {
      candidateGoals = context.candidateGoals;
    }

    const goalTime = Date.now() - goalStart;

    // Step 3: Priority Scoring
    const priorityStart = Date.now();
    const planningContext = this.buildPlanningContext(context, candidateGoals);
    const priorityRanking = this.priorityScorer.rankGoals(
      candidateGoals,
      worldState,
      planningContext
    );
    const priorityTime = Date.now() - priorityStart;

    // Step 4: Goal Selection
    const selectedGoal = this.selectBestGoal(priorityRanking, worldState);

    // Update metrics
    this.updateMetrics({
      signalProcessing: signalTime,
      goalGeneration: goalTime,
      priorityScoring: priorityTime,
      total: Date.now() - startTime,
    });

    // Update history
    this.updateHistory(needs, candidateGoals, selectedGoal);

    return {
      identifiedNeeds: needs,
      generatedGoals: candidateGoals,
      priorityRanking: priorityRanking,
      selectedGoal,
      processingTime: Date.now() - startTime,
      breakdown: {
        signalProcessing: signalTime,
        goalGeneration: goalTime,
        priorityScoring: priorityTime,
      },
    };
  }

  /**
   * Process specific signal types with context awareness.
   */
  async processSignalType(
    signalType: SignalType,
    intensity: number,
    metadata: Record<string, any>,
    worldState: WorldState
  ): Promise<GoalFormulationResult> {
    const signal: InternalSignal = {
      type: signalType,
      intensity,
      source: 'manual',
      timestamp: Date.now(),
      metadata,
    };

    return this.formulateGoals([signal], worldState);
  }

  /**
   * Generate goals for specific need types.
   */
  async generateGoalsForNeed(
    needType: NeedType,
    intensity: number,
    urgency: number,
    worldState: WorldState
  ): Promise<GoalFormulationResult> {
    const need: Need = {
      id: `need-${Date.now()}-${needType}`,
      type: needType,
      intensity,
      urgency,
      satisfaction: 0,
      description: `Generated need for ${needType}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const candidateGoals = await this.goalGenerator.generateCandidates(
      [need],
      worldState
    );
    const planningContext = this.buildPlanningContext({}, candidateGoals);
    const priorityRanking = this.priorityScorer.rankGoals(
      candidateGoals,
      worldState,
      planningContext
    );
    const selectedGoal = this.selectBestGoal(priorityRanking, worldState);

    return {
      identifiedNeeds: [need],
      generatedGoals: candidateGoals,
      priorityRanking: priorityRanking,
      selectedGoal,
      processingTime: 0,
      breakdown: {
        signalProcessing: 0,
        goalGeneration: 0,
        priorityScoring: 0,
      },
    };
  }

  /**
   * Get detailed analysis of goal priority factors.
   */
  getGoalAnalysis(
    goal: CandidateGoal,
    worldState: WorldState,
    context?: Partial<PlanningContext>
  ): Record<string, any> {
    const planningContext = this.buildPlanningContext(context, [goal]);
    return this.priorityScorer.getPriorityBreakdown(
      goal,
      worldState,
      planningContext
    );
  }

  /**
   * Update goal status and track outcomes.
   */
  updateGoalStatus(goalId: string, status: GoalStatus, outcome?: any): void {
    const goal = this.goals.find((g) => g.id === goalId);
    if (goal) {
      goal.status = status;
      goal.updatedAt = Date.now();

      // Track outcome for metrics
      if (outcome) {
        this.trackGoalOutcome(goal, outcome);
      }
    }
  }

  /**
   * Get current goal metrics and performance statistics.
   */
  getMetrics(): GoalFormulationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get goal history for analysis.
   */
  getGoalHistory(): Goal[] {
    return [...this.goalHistory];
  }

  /**
   * Get need history for analysis.
   */
  getNeedHistory(): Need[] {
    return [...this.needHistory];
  }

  /**
   * Reset metrics and history.
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.goalHistory = [];
    this.needHistory = [];
  }

  /**
   * Build planning context from partial context and current goals.
   */
  private buildPlanningContext(
    partialContext: Partial<PlanningContext> | undefined,
    candidateGoals: CandidateGoal[]
  ): PlanningContext {
    return {
      activePromises: partialContext?.activePromises || [],
      currentProject: partialContext?.currentProject,
      candidateGoals,
      recentGoalHistory: this.goalHistory.slice(-10), // Last 10 goals
      timeSinceLastSimilar: (goalType) =>
        this.getTimeSinceLastSimilar(goalType),
    };
  }

  /**
   * Select the best goal based on priority ranking and current state.
   */
  private selectBestGoal(
    priorityRanking: PriorityScore[],
    worldState: WorldState
  ): Goal | undefined {
    if (priorityRanking.length === 0) return undefined;

    const topScore = priorityRanking[0];

    // Convert candidate goal to full goal
    const goal: Goal = {
      id: topScore.goal.id,
      type: topScore.goal.type,
      priority: topScore.goal.priority,
      urgency: topScore.goal.source.urgency,
      utility: topScore.totalScore,
      description: topScore.goal.description,
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subGoals: [],
    };

    this.goals.push(goal);
    return goal;
  }

  /**
   * Get time since last similar goal type.
   */
  private getTimeSinceLastSimilar(goalType: any): number {
    const now = Date.now();
    const lastSimilar = this.goalHistory
      .filter((g) => g.type === goalType)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    return lastSimilar ? now - lastSimilar.createdAt : Infinity;
  }

  /**
   * Update processing metrics.
   */
  private updateMetrics(times: {
    signalProcessing: number;
    goalGeneration: number;
    priorityScoring: number;
    total: number;
  }): void {
    // Update with latest times (ensure they're at least 1ms to avoid zero values)
    this.metrics.signalProcessingLatency = Math.max(1, times.signalProcessing);
    this.metrics.goalGenerationLatency = Math.max(1, times.goalGeneration);
    this.metrics.priorityScoringLatency = Math.max(1, times.priorityScoring);
    this.metrics.totalLatency = Math.max(1, times.total);

    // Update running averages for better metrics
    if (times.total > 0) {
      this.metrics.adaptationSpeed = 1000 / times.total; // goals per second
    }
  }

  /**
   * Update goal and need history.
   */
  private updateHistory(
    needs: Need[],
    candidateGoals: CandidateGoal[],
    selectedGoal?: Goal
  ): void {
    this.needHistory.push(...needs);
    if (selectedGoal) {
      this.goalHistory.push(selectedGoal);
    }

    // Keep history size manageable
    if (this.needHistory.length > 100) {
      this.needHistory = this.needHistory.slice(-100);
    }
    if (this.goalHistory.length > 50) {
      this.goalHistory = this.goalHistory.slice(-50);
    }
  }

  /**
   * Track goal outcome for metrics calculation.
   */
  private trackGoalOutcome(goal: Goal, outcome: any): void {
    // Update success rate
    const success = outcome.success || false;
    this.metrics.goalSuccessRate = this.calculateSuccessRate(success);

    // Update average priority
    this.metrics.averageGoalPriority = this.calculateAveragePriority();

    // Update other metrics based on outcome
    if (outcome.processingTime) {
      this.metrics.needSatisfactionLatency = outcome.processingTime;
    }

    if (outcome.resourceUtilization) {
      this.metrics.resourceUtilizationRatio = outcome.resourceUtilization;
    }
  }

  /**
   * Calculate success rate from recent goals.
   */
  private calculateSuccessRate(currentSuccess: boolean): number {
    const recentGoals = this.goalHistory.slice(-20); // Last 20 goals
    if (recentGoals.length === 0) return 0;

    const successfulGoals = recentGoals.filter(
      (g) => g.status === GoalStatus.COMPLETED
    ).length;
    return successfulGoals / recentGoals.length;
  }

  /**
   * Calculate average priority from recent goals.
   */
  private calculateAveragePriority(): number {
    const recentGoals = this.goalHistory.slice(-20); // Last 20 goals
    if (recentGoals.length === 0) return 0;

    const totalPriority = recentGoals.reduce((sum, g) => sum + g.priority, 0);
    return totalPriority / recentGoals.length;
  }

  /**
   * Initialize metrics with default values.
   */
  private initializeMetrics(): GoalFormulationMetrics {
    return {
      signalProcessingLatency: 0, // Start with zero and update with actual values
      goalGenerationLatency: 0,
      priorityScoringLatency: 0,
      totalLatency: 0,
      goalSuccessRate: 0,
      averageGoalPriority: 0,
      subgoalDecompositionRate: 0,
      priorityAccuracy: 0,
      commitmentViolationRate: 0,
      opportunityUtilization: 0,
      needSatisfactionLatency: 0,
      adaptationSpeed: 0,
      resourceUtilizationRatio: 0,
    };
  }

  /**
   * Get all current goals.
   */
  listGoals(): Goal[] {
    return [...this.goals];
  }

  /** Get a goal by ID */
  getGoal(goalId: string): Goal | undefined {
    return this.goals.find((g) => g.id === goalId);
  }

  /**
   * Add or update a goal.
   */
  upsert(goal: Goal): void {
    const existingIndex = this.goals.findIndex((g) => g.id === goal.id);
    if (existingIndex >= 0) {
      // Update existing goal
      this.goals[existingIndex] = {
        ...this.goals[existingIndex],
        ...goal,
        updatedAt: Date.now(),
      };
    } else {
      // Add new goal
      this.goals.push({
        ...goal,
        createdAt: goal.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  /** Reprioritize a goal */
  reprioritize(goalId: string, priority?: number, urgency?: number): boolean {
    const g = this.getGoal(goalId);
    if (!g) return false;
    if (typeof priority === 'number') g.priority = priority;
    if (typeof urgency === 'number') g.urgency = urgency;
    g.updatedAt = Date.now();
    return true;
  }

  /** Cancel (fail) a goal with optional reason */
  cancel(goalId: string, reason?: string): boolean {
    const g = this.getGoal(goalId);
    if (!g) return false;
    g.status = GoalStatus.FAILED;
    g.updatedAt = Date.now();
    if (reason) {
      g.description = `${g.description} (cancelled: ${reason})`;
    }
    return true;
  }

  /** Pause a goal */
  pause(goalId: string): boolean {
    const g = this.getGoal(goalId);
    if (!g) return false;
    g.status = GoalStatus.SUSPENDED;
    g.updatedAt = Date.now();
    return true;
  }

  /** Resume a paused goal */
  resume(goalId: string): boolean {
    const g = this.getGoal(goalId);
    if (!g) return false;
    g.status = GoalStatus.PENDING;
    g.updatedAt = Date.now();
    return true;
  }

  /** Complete a goal */
  complete(goalId: string): boolean {
    const g = this.getGoal(goalId);
    if (!g) return false;
    g.status = GoalStatus.COMPLETED;
    g.updatedAt = Date.now();
    return true;
  }

  /**
   * Get goals by status.
   */
  getGoalsByStatus(status: GoalStatus): Goal[] {
    return this.goals.filter((g) => g.status === status);
  }

  /**
   * Get goals by type.
   */
  getGoalsByType(type: any): Goal[] {
    return this.goals.filter((g) => g.type === type);
  }

  /**
   * Remove completed or failed goals.
   */
  cleanupGoals(): void {
    this.goals = this.goals.filter(
      (g) => g.status !== GoalStatus.COMPLETED && g.status !== GoalStatus.FAILED
    );
  }
}
