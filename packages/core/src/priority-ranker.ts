/**
 * Priority Ranker
 *
 * Implements commitment boosts, novelty boosts, opportunity cost boosts,
 * and advanced priority calculation for sophisticated task prioritization.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { TaskType, ResourceType, ResourceRequirement } from './types';

// ============================================================================
// Core Types
// ============================================================================

export interface PriorityTask {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  basePriority: number; // 0-1
  urgency: number; // 0-1
  importance: number; // 0-1
  complexity: number; // 0-1
  estimatedDuration: number; // minutes
  deadline?: number; // timestamp
  dependencies: string[]; // task IDs
  resources: ResourceRequirement[];
  context: TaskContext;
  metadata: TaskMetadata;
  createdAt: number;
  lastUpdated: number;
}

export interface PrioritizedTask extends PriorityTask {
  calculatedPriority: number; // 0-1, final priority score
  commitmentBoost: number; // 0-1, boost from commitments
  noveltyBoost: number; // 0-1, boost from novelty
  opportunityCostBoost: number; // 0-1, boost from opportunity cost
  deadlinePressure: number; // 0-1, pressure from approaching deadline
  resourceAvailability: number; // 0-1, how available resources are
  socialImpact: number; // 0-1, impact on social relationships
  learningValue: number; // 0-1, potential learning value
  riskLevel: RiskLevel;
  feasibility: number; // 0-1, how feasible the task is
  priorityFactors: PriorityFactor[];
  rankingReason: string;
}

export interface TaskContext {
  environment: string;
  socialContext: string;
  currentGoals: string[];
  recentEvents: string[];
  availableResources: string[];
  constraints: string[];
  opportunities: string[];
  timeOfDay: string;
  energyLevel: number; // 0-1
  stressLevel: number; // 0-1
}

export interface TaskMetadata {
  category: string;
  tags: string[];
  difficulty: number; // 0-1
  skillRequirements: string[];
  emotionalImpact: number; // -1 to 1
  satisfaction: number; // 0-1, expected satisfaction
  novelty: number; // 0-1, how novel the task is
  socialValue: number; // 0-1, value to social relationships
}

export interface PriorityFactor {
  name: string;
  weight: number; // 0-1, importance of this factor
  value: number; // 0-1, current value
  contribution: number; // 0-1, contribution to final priority
  description: string;
}

export interface Commitment {
  id: string;
  type: CommitmentType;
  description: string;
  targetTask: string; // task ID
  strength: number; // 0-1, commitment strength
  deadline: number; // timestamp
  socialContext: string;
  consequences: string[];
  createdAt: number;
  lastReinforced: number;
}

export interface Opportunity {
  id: string;
  type: OpportunityType;
  description: string;
  value: number; // 0-1, opportunity value
  timeWindow: number; // minutes, how long the opportunity lasts
  requirements: string[];
  risks: string[];
  createdAt: number;
  expiresAt: number;
}

export interface PriorityRanking {
  id: string;
  timestamp: number;
  tasks: PrioritizedTask[];
  rankingMethod: RankingMethod;
  confidence: number; // 0-1, confidence in ranking
  factors: PriorityFactor[];
  metadata: RankingMetadata;
}

export interface RankingMetadata {
  totalTasks: number;
  averagePriority: number;
  priorityDistribution: PriorityDistribution;
  topFactors: string[];
  rankingQuality: number; // 0-1
}

export interface PriorityDistribution {
  high: number; // count of high priority tasks
  medium: number; // count of medium priority tasks
  low: number; // count of low priority tasks
  distribution: number[]; // histogram of priority scores
}

export enum RiskLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum CommitmentType {
  PROMISE = 'promise',
  GOAL = 'goal',
  OBLIGATION = 'obligation',
  EXPECTATION = 'expectation',
  AGREEMENT = 'agreement',
  DEADLINE = 'deadline',
}

export enum OpportunityType {
  RESOURCE = 'resource',
  SOCIAL = 'social',
  LEARNING = 'learning',
  EXPLORATION = 'exploration',
  ACHIEVEMENT = 'achievement',
  CREATIVE = 'creative',
}

export enum RankingMethod {
  WEIGHTED_SUM = 'weighted_sum',
  MULTI_CRITERIA = 'multi_criteria',
  ANALYTIC_HIERARCHY = 'analytic_hierarchy',
  FUZZY_LOGIC = 'fuzzy_logic',
  MACHINE_LEARNING = 'machine_learning',
  HYBRID = 'hybrid',
}

// ============================================================================
// Configuration
// ============================================================================

export interface PriorityRankerConfig {
  commitmentBoostWeight: number; // 0-1, weight of commitment boost
  noveltyBoostWeight: number; // 0-1, weight of novelty boost
  opportunityCostWeight: number; // 0-1, weight of opportunity cost
  deadlinePressureWeight: number; // 0-1, weight of deadline pressure
  resourceAvailabilityWeight: number; // 0-1, weight of resource availability
  socialImpactWeight: number; // 0-1, weight of social impact
  learningValueWeight: number; // 0-1, weight of learning value
  riskPenaltyWeight: number; // 0-1, weight of risk penalty
  feasibilityWeight: number; // 0-1, weight of feasibility
  enableAdvancedRanking: boolean;
  enableCommitmentTracking: boolean;
  enableOpportunityTracking: boolean;
  enableContextAwareness: boolean;
  enableAdaptiveWeights: boolean;
}

const DEFAULT_CONFIG: PriorityRankerConfig = {
  commitmentBoostWeight: 0.15,
  noveltyBoostWeight: 0.1,
  opportunityCostWeight: 0.2,
  deadlinePressureWeight: 0.25,
  resourceAvailabilityWeight: 0.1,
  socialImpactWeight: 0.1,
  learningValueWeight: 0.05,
  riskPenaltyWeight: 0.1,
  feasibilityWeight: 0.15,
  enableAdvancedRanking: true,
  enableCommitmentTracking: true,
  enableOpportunityTracking: true,
  enableContextAwareness: true,
  enableAdaptiveWeights: true,
};

// ============================================================================
// Priority Ranker Implementation
// ============================================================================

export class PriorityRanker extends EventEmitter {
  private config: PriorityRankerConfig;
  private tasks: Map<string, PriorityTask> = new Map();
  private commitments: Map<string, Commitment> = new Map();
  private opportunities: Map<string, Opportunity> = new Map();
  private rankingHistory: PriorityRanking[] = [];
  private commitmentTracker: CommitmentTracker;
  private opportunityTracker: OpportunityTracker;
  private contextAnalyzer: ContextAnalyzer;

  constructor(config: Partial<PriorityRankerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.commitmentTracker = new CommitmentTracker();
    this.opportunityTracker = new OpportunityTracker();
    this.contextAnalyzer = new ContextAnalyzer();
  }

  /**
   * Rank tasks by priority with advanced boosting
   */
  async rankTasks(
    tasks: PriorityTask[],
    context: TaskContext
  ): Promise<PriorityRanking> {
    const prioritizedTasks: PrioritizedTask[] = [];

    for (const task of tasks) {
      const prioritizedTask = await this.calculateTaskPriority(task, context);
      prioritizedTasks.push(prioritizedTask);
    }

    // Sort by calculated priority
    prioritizedTasks.sort(
      (a, b) => b.calculatedPriority - a.calculatedPriority
    );

    // Calculate ranking metadata
    const metadata = this.calculateRankingMetadata(prioritizedTasks);
    const factors = this.identifyTopFactors(prioritizedTasks);

    const ranking: PriorityRanking = {
      id: uuidv4(),
      timestamp: Date.now(),
      tasks: prioritizedTasks,
      rankingMethod: this.config.enableAdvancedRanking
        ? RankingMethod.HYBRID
        : RankingMethod.WEIGHTED_SUM,
      confidence: this.calculateRankingConfidence(prioritizedTasks),
      factors,
      metadata,
    };

    this.rankingHistory.push(ranking);
    this.emit('rankingCompleted', ranking);

    return ranking;
  }

  /**
   * Calculate priority for a single task
   */
  private async calculateTaskPriority(
    task: PriorityTask,
    context: TaskContext
  ): Promise<PrioritizedTask> {
    const priorityFactors: PriorityFactor[] = [];

    // Base priority factors
    priorityFactors.push({
      name: 'base_priority',
      weight: 0.3,
      value: task.basePriority,
      contribution: task.basePriority * 0.3,
      description: 'Base priority score',
    });

    priorityFactors.push({
      name: 'urgency',
      weight: 0.2,
      value: task.urgency,
      contribution: task.urgency * 0.2,
      description: 'Task urgency',
    });

    priorityFactors.push({
      name: 'importance',
      weight: 0.25,
      value: task.importance,
      contribution: task.importance * 0.25,
      description: 'Task importance',
    });

    // Commitment boost
    const commitmentBoost = await this.calculateCommitmentBoost(task);
    priorityFactors.push({
      name: 'commitment_boost',
      weight: this.config.commitmentBoostWeight,
      value: commitmentBoost,
      contribution: commitmentBoost * this.config.commitmentBoostWeight,
      description: 'Boost from commitments and promises',
    });

    // Novelty boost
    const noveltyBoost = this.calculateNoveltyBoost(task, context);
    priorityFactors.push({
      name: 'novelty_boost',
      weight: this.config.noveltyBoostWeight,
      value: noveltyBoost,
      contribution: noveltyBoost * this.config.noveltyBoostWeight,
      description: 'Boost from task novelty',
    });

    // Opportunity cost boost
    const opportunityCostBoost = await this.calculateOpportunityCostBoost(
      task,
      context
    );
    priorityFactors.push({
      name: 'opportunity_cost_boost',
      weight: this.config.opportunityCostWeight,
      value: opportunityCostBoost,
      contribution: opportunityCostBoost * this.config.opportunityCostWeight,
      description: 'Boost from opportunity cost',
    });

    // Deadline pressure
    const deadlinePressure = this.calculateDeadlinePressure(task);
    priorityFactors.push({
      name: 'deadline_pressure',
      weight: this.config.deadlinePressureWeight,
      value: deadlinePressure,
      contribution: deadlinePressure * this.config.deadlinePressureWeight,
      description: 'Pressure from approaching deadline',
    });

    // Resource availability
    const resourceAvailability = this.calculateResourceAvailability(
      task,
      context
    );
    priorityFactors.push({
      name: 'resource_availability',
      weight: this.config.resourceAvailabilityWeight,
      value: resourceAvailability,
      contribution:
        resourceAvailability * this.config.resourceAvailabilityWeight,
      description: 'Resource availability score',
    });

    // Social impact
    const socialImpact = this.calculateSocialImpact(task, context);
    priorityFactors.push({
      name: 'social_impact',
      weight: this.config.socialImpactWeight,
      value: socialImpact,
      contribution: socialImpact * this.config.socialImpactWeight,
      description: 'Impact on social relationships',
    });

    // Learning value
    const learningValue = this.calculateLearningValue(task, context);
    priorityFactors.push({
      name: 'learning_value',
      weight: this.config.learningValueWeight,
      value: learningValue,
      contribution: learningValue * this.config.learningValueWeight,
      description: 'Potential learning value',
    });

    // Risk penalty
    const riskLevel = this.calculateRiskLevel(task, context);
    const riskPenalty = this.calculateRiskPenalty(riskLevel);
    priorityFactors.push({
      name: 'risk_penalty',
      weight: this.config.riskPenaltyWeight,
      value: riskPenalty,
      contribution: riskPenalty * this.config.riskPenaltyWeight,
      description: 'Penalty for task risk',
    });

    // Feasibility
    const feasibility = this.calculateFeasibility(task, context);
    priorityFactors.push({
      name: 'feasibility',
      weight: this.config.feasibilityWeight,
      value: feasibility,
      contribution: feasibility * this.config.feasibilityWeight,
      description: 'Task feasibility score',
    });

    // Calculate final priority
    const calculatedPriority = Math.min(
      1.0,
      Math.max(
        0,
        priorityFactors.reduce((sum, factor) => sum + factor.contribution, 0)
      )
    );

    // Generate ranking reason
    const rankingReason = this.generateRankingReason(
      priorityFactors,
      calculatedPriority
    );

    return {
      ...task,
      calculatedPriority,
      commitmentBoost,
      noveltyBoost,
      opportunityCostBoost,
      deadlinePressure,
      resourceAvailability,
      socialImpact,
      learningValue,
      riskLevel,
      feasibility,
      priorityFactors,
      rankingReason,
    };
  }

  /**
   * Calculate commitment boost for a task
   */
  private async calculateCommitmentBoost(task: PriorityTask): Promise<number> {
    if (!this.config.enableCommitmentTracking) {
      return 0;
    }

    const relevantCommitments = Array.from(this.commitments.values()).filter(
      (commitment) =>
        commitment.targetTask === task.id ||
        commitment.description.toLowerCase().includes(task.name.toLowerCase())
    );

    if (relevantCommitments.length === 0) {
      return 0;
    }

    // Calculate weighted commitment boost
    let totalBoost = 0;
    let totalWeight = 0;

    for (const commitment of relevantCommitments) {
      const age = Date.now() - commitment.lastReinforced;
      const recencyFactor = Math.max(0.1, Math.exp(-age / 86400000)); // 24-hour decay
      const strength = commitment.strength * recencyFactor;

      totalBoost += strength;
      totalWeight += 1;
    }

    return Math.min(1.0, totalBoost / totalWeight);
  }

  /**
   * Calculate novelty boost for a task
   */
  private calculateNoveltyBoost(
    task: PriorityTask,
    context: TaskContext
  ): number {
    // Base novelty from task metadata
    let novelty = task.metadata.novelty;

    // Adjust based on context
    if (context.recentEvents.length === 0) {
      novelty += 0.2; // Higher novelty in new contexts
    }

    // Adjust based on task type
    if (task.type === TaskType.EXPLORATION || task.type === TaskType.CREATIVE) {
      novelty += 0.3;
    }

    // Adjust based on social context
    if (
      context.socialContext.includes('new') ||
      context.socialContext.includes('unfamiliar')
    ) {
      novelty += 0.2;
    }

    return Math.min(1.0, novelty);
  }

  /**
   * Calculate opportunity cost boost for a task
   */
  private async calculateOpportunityCostBoost(
    task: PriorityTask,
    context: TaskContext
  ): Promise<number> {
    if (!this.config.enableOpportunityTracking) {
      return 0;
    }

    const relevantOpportunities = Array.from(
      this.opportunities.values()
    ).filter(
      (opportunity) =>
        opportunity.description
          .toLowerCase()
          .includes(task.name.toLowerCase()) ||
        opportunity.requirements.some((req) =>
          task.resources.some((res) => res.name.includes(req))
        )
    );

    if (relevantOpportunities.length === 0) {
      return 0;
    }

    // Calculate opportunity cost based on value and time window
    let totalCost = 0;
    let totalWeight = 0;

    for (const opportunity of relevantOpportunities) {
      const timeRemaining = opportunity.expiresAt - Date.now();
      const urgencyFactor = Math.max(
        0.1,
        1 - timeRemaining / (opportunity.timeWindow * 60000)
      );
      const cost = opportunity.value * urgencyFactor;

      totalCost += cost;
      totalWeight += 1;
    }

    return Math.min(1.0, totalCost / totalWeight);
  }

  /**
   * Calculate deadline pressure for a task
   */
  private calculateDeadlinePressure(task: PriorityTask): number {
    if (!task.deadline) {
      return 0;
    }

    const timeRemaining = task.deadline - Date.now();
    const estimatedDuration = task.estimatedDuration * 60000; // Convert to milliseconds

    if (timeRemaining <= 0) {
      return 1.0; // Overdue
    }

    if (timeRemaining <= estimatedDuration) {
      return 0.9; // Critical deadline
    }

    // Exponential decay based on time remaining
    const pressure = Math.exp(-timeRemaining / (estimatedDuration * 2));
    return Math.min(1.0, pressure);
  }

  /**
   * Calculate resource availability for a task
   */
  private calculateResourceAvailability(
    task: PriorityTask,
    context: TaskContext
  ): number {
    if (task.resources.length === 0) {
      return 1.0; // No resources required
    }

    let totalAvailability = 0;
    let totalWeight = 0;

    for (const resource of task.resources) {
      const available = context.availableResources.includes(resource.name);
      const availability = available ? 1.0 : 0.0;

      totalAvailability += availability * resource.criticality;
      totalWeight += resource.criticality;
    }

    return totalWeight > 0 ? totalAvailability / totalWeight : 0;
  }

  /**
   * Calculate social impact of a task
   */
  private calculateSocialImpact(
    task: PriorityTask,
    context: TaskContext
  ): number {
    // Base social value from metadata
    let impact = task.metadata.socialValue;

    // Adjust based on social context
    if (
      context.socialContext.includes('group') ||
      context.socialContext.includes('team')
    ) {
      impact += 0.3;
    }

    // Adjust based on task type
    if (task.type === TaskType.SOCIAL) {
      impact += 0.4;
    }

    // Adjust based on current goals
    const socialGoals = context.currentGoals.filter(
      (goal) =>
        goal.toLowerCase().includes('social') ||
        goal.toLowerCase().includes('relationship')
    );
    if (socialGoals.length > 0) {
      impact += 0.2;
    }

    return Math.min(1.0, impact);
  }

  /**
   * Calculate learning value of a task
   */
  private calculateLearningValue(
    task: PriorityTask,
    context: TaskContext
  ): number {
    // Base learning value from metadata
    let learningValue = task.metadata.novelty * 0.5; // Novelty contributes to learning

    // Adjust based on task type
    if (task.type === TaskType.LEARNING || task.type === TaskType.EXPLORATION) {
      learningValue += 0.4;
    }

    // Adjust based on complexity
    learningValue += task.complexity * 0.3;

    // Adjust based on skill requirements
    if (task.metadata.skillRequirements.length > 0) {
      learningValue += 0.2;
    }

    return Math.min(1.0, learningValue);
  }

  /**
   * Calculate risk level for a task
   */
  private calculateRiskLevel(
    task: PriorityTask,
    context: TaskContext
  ): RiskLevel {
    let riskScore = 0;

    // Base risk from complexity
    riskScore += task.complexity * 0.3;

    // Risk from resource requirements
    const criticalResources = task.resources.filter((r) => r.criticality > 0.8);
    riskScore += criticalResources.length * 0.2;

    // Risk from constraints
    riskScore += context.constraints.length * 0.1;

    // Risk from stress level
    riskScore += context.stressLevel * 0.2;

    // Determine risk level
    if (riskScore > 0.8) return RiskLevel.CRITICAL;
    if (riskScore > 0.6) return RiskLevel.HIGH;
    if (riskScore > 0.4) return RiskLevel.MEDIUM;
    if (riskScore > 0.2) return RiskLevel.LOW;
    return RiskLevel.NONE;
  }

  /**
   * Calculate risk penalty for a risk level
   */
  private calculateRiskPenalty(riskLevel: RiskLevel): number {
    switch (riskLevel) {
      case RiskLevel.CRITICAL:
        return 0.8;
      case RiskLevel.HIGH:
        return 0.6;
      case RiskLevel.MEDIUM:
        return 0.3;
      case RiskLevel.LOW:
        return 0.1;
      case RiskLevel.NONE:
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Calculate feasibility of a task
   */
  private calculateFeasibility(
    task: PriorityTask,
    context: TaskContext
  ): number {
    let feasibility = 0.5; // Base feasibility

    // Resource feasibility
    const resourceFeasibility = this.calculateResourceAvailability(
      task,
      context
    );
    feasibility += resourceFeasibility * 0.3;

    // Energy feasibility
    if (context.energyLevel > 0.7) {
      feasibility += 0.2;
    } else if (context.energyLevel < 0.3) {
      feasibility -= 0.2;
    }

    // Complexity feasibility
    if (task.complexity < 0.5) {
      feasibility += 0.2;
    } else if (task.complexity > 0.8) {
      feasibility -= 0.2;
    }

    // Time feasibility
    if (task.estimatedDuration < 30) {
      // Less than 30 minutes
      feasibility += 0.1;
    } else if (task.estimatedDuration > 120) {
      // More than 2 hours
      feasibility -= 0.1;
    }

    return Math.min(1.0, Math.max(0, feasibility));
  }

  /**
   * Generate ranking reason for a task
   */
  private generateRankingReason(
    factors: PriorityFactor[],
    priority: number
  ): string {
    const topFactors = factors
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3);

    const reasons = topFactors.map((factor) => {
      const percentage = Math.round(factor.contribution * 100);
      return `${factor.description} (${percentage}%)`;
    });

    return `Priority ${Math.round(priority * 100)}%: ${reasons.join(', ')}`;
  }

  /**
   * Calculate ranking metadata
   */
  private calculateRankingMetadata(tasks: PrioritizedTask[]): RankingMetadata {
    const priorities = tasks.map((t) => t.calculatedPriority);
    const averagePriority =
      priorities.reduce((sum, p) => sum + p, 0) / priorities.length;

    const distribution: PriorityDistribution = {
      high: priorities.filter((p) => p > 0.7).length,
      medium: priorities.filter((p) => p >= 0.4 && p <= 0.7).length,
      low: priorities.filter((p) => p < 0.4).length,
      distribution: this.createPriorityHistogram(priorities),
    };

    const topFactors = this.identifyTopFactors(tasks)
      .slice(0, 5)
      .map((f) => f.name);

    return {
      totalTasks: tasks.length,
      averagePriority,
      priorityDistribution: distribution,
      topFactors,
      rankingQuality: this.calculateRankingQuality(tasks),
    };
  }

  /**
   * Create priority histogram
   */
  private createPriorityHistogram(priorities: number[]): number[] {
    const buckets = 10;
    const histogram = new Array(buckets).fill(0);

    for (const priority of priorities) {
      const bucket = Math.floor(priority * buckets);
      histogram[bucket]++;
    }

    return histogram;
  }

  /**
   * Identify top priority factors
   */
  private identifyTopFactors(tasks: PrioritizedTask[]): PriorityFactor[] {
    const factorMap = new Map<string, PriorityFactor>();

    for (const task of tasks) {
      for (const factor of task.priorityFactors) {
        if (factorMap.has(factor.name)) {
          const existing = factorMap.get(factor.name)!;
          existing.contribution += factor.contribution;
          existing.value = (existing.value + factor.value) / 2;
        } else {
          factorMap.set(factor.name, { ...factor });
        }
      }
    }

    return Array.from(factorMap.values()).sort(
      (a, b) => b.contribution - a.contribution
    );
  }

  /**
   * Calculate ranking confidence
   */
  private calculateRankingConfidence(tasks: PrioritizedTask[]): number {
    if (tasks.length < 2) return 1.0;

    // Calculate confidence based on factor consistency
    const factorConsistencies = tasks[0].priorityFactors.map((factor) => {
      const values = tasks.map(
        (t) => t.priorityFactors.find((f) => f.name === factor.name)?.value || 0
      );
      const variance = this.calculateVariance(values);
      return Math.max(0, 1 - variance);
    });

    return (
      factorConsistencies.reduce((sum, c) => sum + c, 0) /
      factorConsistencies.length
    );
  }

  /**
   * Calculate variance of values
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
  }

  /**
   * Calculate ranking quality
   */
  private calculateRankingQuality(tasks: PrioritizedTask[]): number {
    if (tasks.length < 2) return 1.0;

    // Quality based on priority spread and factor diversity
    const priorities = tasks.map((t) => t.calculatedPriority);
    const spread = Math.max(...priorities) - Math.min(...priorities);
    const factorDiversity = new Set(
      tasks.flatMap((t) => t.priorityFactors.map((f) => f.name))
    ).size;

    return Math.min(1.0, spread * 0.7 + (factorDiversity / 10) * 0.3);
  }

  // ============================================================================
  // Public Interface
  // ============================================================================

  addTask(task: PriorityTask): void {
    this.tasks.set(task.id, task);
    this.emit('taskAdded', task);
  }

  addCommitment(commitment: Commitment): void {
    this.commitments.set(commitment.id, commitment);
    this.emit('commitmentAdded', commitment);
  }

  addOpportunity(opportunity: Opportunity): void {
    this.opportunities.set(opportunity.id, opportunity);
    this.emit('opportunityAdded', opportunity);
  }

  getTasks(): PriorityTask[] {
    return Array.from(this.tasks.values());
  }

  getCommitments(): Commitment[] {
    return Array.from(this.commitments.values());
  }

  getOpportunities(): Opportunity[] {
    return Array.from(this.opportunities.values());
  }

  getRankingHistory(): PriorityRanking[] {
    return [...this.rankingHistory];
  }

  getStats() {
    return {
      totalTasks: this.tasks.size,
      totalCommitments: this.commitments.size,
      totalOpportunities: this.opportunities.size,
      rankingHistory: this.rankingHistory.length,
      averageRankingConfidence:
        this.rankingHistory.length > 0
          ? this.rankingHistory.reduce((sum, r) => sum + r.confidence, 0) /
            this.rankingHistory.length
          : 0,
    };
  }
}

// ============================================================================
// Helper Classes
// ============================================================================

class CommitmentTracker {
  private commitments: Map<string, Commitment> = new Map();

  addCommitment(commitment: Commitment): void {
    this.commitments.set(commitment.id, commitment);
  }

  getCommitmentsForTask(taskId: string): Commitment[] {
    return Array.from(this.commitments.values()).filter(
      (c) => c.targetTask === taskId
    );
  }

  updateCommitmentStrength(commitmentId: string, strength: number): void {
    const commitment = this.commitments.get(commitmentId);
    if (commitment) {
      commitment.strength = Math.min(1.0, Math.max(0, strength));
      commitment.lastReinforced = Date.now();
    }
  }
}

class OpportunityTracker {
  private opportunities: Map<string, Opportunity> = new Map();

  addOpportunity(opportunity: Opportunity): void {
    this.opportunities.set(opportunity.id, opportunity);
  }

  getExpiredOpportunities(): Opportunity[] {
    const now = Date.now();
    return Array.from(this.opportunities.values()).filter(
      (o) => o.expiresAt < now
    );
  }

  getActiveOpportunities(): Opportunity[] {
    const now = Date.now();
    return Array.from(this.opportunities.values()).filter(
      (o) => o.expiresAt >= now
    );
  }
}

class ContextAnalyzer {
  analyzeContext(context: TaskContext): ContextAnalysis {
    return {
      energyLevel: context.energyLevel,
      stressLevel: context.stressLevel,
      socialContext: context.socialContext,
      resourceAvailability: context.availableResources.length,
      constraintCount: context.constraints.length,
      opportunityCount: context.opportunities.length,
    };
  }
}

interface ContextAnalysis {
  energyLevel: number;
  stressLevel: number;
  socialContext: string;
  resourceAvailability: number;
  constraintCount: number;
  opportunityCount: number;
}
