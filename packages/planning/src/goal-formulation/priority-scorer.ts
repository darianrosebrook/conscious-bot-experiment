/**
 * Advanced priority scoring with multi-factor utility analysis.
 *
 * Implements sophisticated priority scoring that considers urgency, context,
 * risk, commitment, novelty, and opportunity cost for optimal goal selection.
 *
 * Author: @darianrosebrook
 */

import { Goal, GoalType, Need, NeedType, Resource } from '../types';
import { CandidateGoal, WorldState } from './goal-generator';

export interface PlanningContext {
  activePromises: Promise[];
  currentProject?: Project;
  candidateGoals: CandidateGoal[];
  recentGoalHistory: Goal[];
  timeSinceLastSimilar: (goalType: GoalType) => number;
}

export interface Promise {
  id: string;
  description: string;
  relatedTo: (goal: CandidateGoal) => boolean;
  priority: number;
  deadline?: number;
}

export interface Project {
  id: string;
  name: string;
  goals: string[];
  isPartOf: (goal: CandidateGoal) => boolean;
  priority: number;
}

export interface PriorityScore {
  goal: CandidateGoal;
  totalScore: number;
  urgencyScore: number;
  contextScore: number;
  riskScore: number;
  commitmentBoost: number;
  noveltyBoost: number;
  opportunityCost: number;
  breakdown: Record<string, number>;
}

export interface RiskAssessment {
  pathRisk: number;
  resourceRisk: number;
  timeRisk: number;
  environmentalRisk: number;
  totalRisk: number;
}

/**
 * Advanced priority scorer with multi-factor utility analysis.
 */
export class PriorityScorer {
  private readonly urgencyWeights = {
    healthCrisis: 1.5,
    starvation: 2.0,
    nightExploration: 0.3,
    threatMultiplier: 1.3,
  };

  private readonly contextWeights = {
    missingPrerequisites: 0.1,
    buildingUnderThreat: 0.3,
    noSocialOpportunity: 0.2,
    resourceAvailable: 1.2,
    armed: 0.8,
  };

  private readonly riskWeights = {
    pathRisk: 0.4,
    resourceRisk: 0.3,
    timeRisk: 0.3,
  };

  /**
   * Multi-factor utility function for goal prioritization.
   * Based on urgency, context, risk, and strategic factors.
   */
  scorePriority(
    goal: CandidateGoal,
    worldState: WorldState,
    context: PlanningContext
  ): PriorityScore {
    const urgencyScore = this.computeUrgency(goal, worldState);
    const contextScore = this.computeContextGating(goal, worldState);
    const riskAssessment = this.computeRisk(goal, worldState);
    const commitmentBoost = this.computeCommitmentBoost(goal, context);
    const noveltyBoost = this.computeNoveltyBoost(goal, context);
    const opportunityCost = this.computeOpportunityCost(goal, context);

    // Core priority formula from architecture document
    const totalScore =
      urgencyScore * contextScore * (1 - riskAssessment.totalRisk) +
      commitmentBoost +
      noveltyBoost -
      opportunityCost;

    return {
      goal,
      totalScore: Math.max(0, totalScore),
      urgencyScore,
      contextScore,
      riskScore: riskAssessment.totalRisk,
      commitmentBoost,
      noveltyBoost,
      opportunityCost,
      breakdown: {
        urgency: urgencyScore,
        context: contextScore,
        risk: riskAssessment.totalRisk,
        commitment: commitmentBoost,
        novelty: noveltyBoost,
        opportunity: opportunityCost,
      },
    };
  }

  /**
   * Compute urgency score based on need urgency and contextual factors.
   */
  private computeUrgency(goal: CandidateGoal, worldState: WorldState): number {
    // Base urgency from the underlying need
    let urgency = goal.source.urgency;

    // Time-sensitive adjustments
    if (goal.type === GoalType.SAFETY && worldState.getHealth() < 0.5) {
      urgency *= this.urgencyWeights.healthCrisis; // Health crisis multiplier
    }

    if (goal.type === GoalType.SURVIVAL && worldState.getHunger() < 0.2) {
      urgency *= this.urgencyWeights.starvation; // Starvation multiplier
    }

    // Day/night cycle adjustments
    if (
      worldState.getTimeOfDay() === 'night' &&
      goal.type === GoalType.EXPLORATION
    ) {
      urgency *= this.urgencyWeights.nightExploration; // Avoid exploration at night
    }

    // Threat-based urgency adjustments
    if (goal.type === GoalType.SAFETY && worldState.getThreatLevel() > 0.7) {
      urgency *= this.urgencyWeights.threatMultiplier; // High threat multiplier
    }

    // Ensure survival goals have higher urgency when hunger is high
    if (goal.type === GoalType.SURVIVAL && worldState.getHunger() > 0.7) {
      urgency *= 2.0; // Boost survival urgency when very hungry
    }

    // Ensure exploration goals have lower urgency when hunger is high
    if (goal.type === GoalType.EXPLORATION && worldState.getHunger() > 0.7) {
      urgency *= 0.5; // Reduce exploration urgency when very hungry
    }

    return Math.min(1.0, urgency);
  }

  /**
   * Compute context gating score based on environmental feasibility.
   */
  private computeContextGating(
    goal: CandidateGoal,
    worldState: WorldState
  ): number {
    // Is this goal feasible right now?
    if (!this.hasPrerequisites(goal, worldState)) {
      return this.contextWeights.missingPrerequisites; // Nearly impossible without prerequisites
    }

    // Environmental feasibility
    if (
      goal.type === GoalType.ACHIEVEMENT &&
      worldState.getThreatLevel() > 0.5
    ) {
      return this.contextWeights.buildingUnderThreat; // Hard to build under threat
    }

    if (goal.type === GoalType.SOCIAL && worldState.getNearbyPlayers() === 0) {
      return this.contextWeights.noSocialOpportunity; // Can't socialize without people
    }

    // Resource availability adjustments
    if (goal.type === GoalType.SURVIVAL && worldState.nearbyFood()) {
      return this.contextWeights.resourceAvailable; // Food available nearby
    }

    if (goal.type === GoalType.SAFETY && worldState.getWeapons().length > 0) {
      return this.contextWeights.armed; // Armed for safety
    }

    return 1.0; // Fully feasible
  }

  /**
   * Compute comprehensive risk assessment.
   */
  private computeRisk(
    goal: CandidateGoal,
    worldState: WorldState
  ): RiskAssessment {
    let pathRisk = 0.0;
    let resourceRisk = 0.0;
    let timeRisk = 0.0;
    let environmentalRisk = 0.0;

    // Location-based risk
    if (goal.requiresMovement) {
      pathRisk = this.assessPathRisk(goal.targetLocation, worldState);
    }

    // Resource risk (might fail due to missing items)
    resourceRisk = this.assessResourceRisk(
      goal.resourceRequirements,
      worldState
    );

    // Time risk (might be interrupted)
    timeRisk = goal.estimatedTime > 30000 ? 0.3 : 0.1;

    // Environmental risk (weather, time of day, etc.)
    environmentalRisk = this.assessEnvironmentalRisk(goal, worldState);

    const totalRisk =
      pathRisk * this.riskWeights.pathRisk +
      resourceRisk * this.riskWeights.resourceRisk +
      timeRisk * this.riskWeights.timeRisk +
      environmentalRisk * 0.1;

    return {
      pathRisk,
      resourceRisk,
      timeRisk,
      environmentalRisk,
      totalRisk: Math.min(1.0, totalRisk),
    };
  }

  /**
   * Compute commitment boost for goals that align with existing promises.
   */
  private computeCommitmentBoost(
    goal: CandidateGoal,
    context: PlanningContext
  ): number {
    let boost = 0.0;

    // Boost goals that align with existing commitments
    for (const promise of context.activePromises) {
      if (promise.relatedTo(goal)) {
        boost += 0.3 * promise.priority; // Strong commitment boost
      }
    }

    // Boost goals that continue current project
    if (context.currentProject && context.currentProject.isPartOf(goal)) {
      boost += 0.2 * context.currentProject.priority; // Project continuity boost
    }

    return Math.min(0.5, boost); // Cap commitment boost
  }

  /**
   * Compute novelty boost to encourage exploration of new activities.
   */
  private computeNoveltyBoost(
    goal: CandidateGoal,
    context: PlanningContext
  ): number {
    const timeSinceLastSimilar = context.timeSinceLastSimilar(goal.type);

    if (timeSinceLastSimilar > 300000) {
      // 5 minutes
      return 0.1; // Small novelty bonus
    }

    if (timeSinceLastSimilar > 600000) {
      // 10 minutes
      return 0.2; // Medium novelty bonus
    }

    if (timeSinceLastSimilar > 1800000) {
      // 30 minutes
      return 0.3; // Large novelty bonus
    }

    return 0.0;
  }

  /**
   * Compute opportunity cost of not pursuing other high-priority goals.
   */
  private computeOpportunityCost(
    goal: CandidateGoal,
    context: PlanningContext
  ): number {
    // Cost of not pursuing other high-priority goals
    const otherHighPriorityGoals = context.candidateGoals.filter(
      (g) => g.id !== goal.id && g.priority > 0.7
    ).length;

    // Time-based opportunity cost
    const timeCost = goal.estimatedTime / 60000; // Cost per minute

    // Resource-based opportunity cost
    const resourceCost = goal.resourceRequirements.length * 0.05;

    return otherHighPriorityGoals * 0.05 + timeCost * 0.1 + resourceCost;
  }

  /**
   * Assess path risk for movement-based goals.
   */
  private assessPathRisk(
    targetLocation: string | undefined,
    worldState: WorldState
  ): number {
    if (!targetLocation) return 0.0;

    // Simplified path risk assessment
    const baseRisk = 0.2;
    const threatMultiplier = worldState.getThreatLevel() > 0.5 ? 1.5 : 1.0;
    const timeMultiplier = worldState.getTimeOfDay() === 'night' ? 1.3 : 1.0;

    return Math.min(1.0, baseRisk * threatMultiplier * timeMultiplier);
  }

  /**
   * Assess resource risk based on missing requirements.
   */
  private assessResourceRisk(
    requirements: any[],
    worldState: WorldState
  ): number {
    if (requirements.length === 0) return 0.0;

    let missingCount = 0;
    for (const requirement of requirements) {
      if (!worldState.hasItem(requirement.resourceType, requirement.quantity)) {
        missingCount++;
      }
    }

    return missingCount / requirements.length;
  }

  /**
   * Assess environmental risk factors.
   */
  private assessEnvironmentalRisk(
    goal: CandidateGoal,
    worldState: WorldState
  ): number {
    let risk = 0.0;

    // Night-time risk for certain activities
    if (
      worldState.getTimeOfDay() === 'night' &&
      (goal.type === GoalType.EXPLORATION || goal.type === GoalType.SOCIAL)
    ) {
      risk += 0.3;
    }

    // Low light risk
    if (worldState.getLightLevel() < 10 && goal.type !== GoalType.SAFETY) {
      risk += 0.2;
    }

    // High threat environment risk
    if (worldState.getThreatLevel() > 0.7 && goal.type !== GoalType.SAFETY) {
      risk += 0.4;
    }

    return Math.min(1.0, risk);
  }

  /**
   * Check if goal has prerequisites.
   */
  private hasPrerequisites(
    goal: CandidateGoal,
    worldState: WorldState
  ): boolean {
    // Check if bot has required health/energy
    if (goal.estimatedCost > worldState.getEnergy() * 100) {
      return false;
    }

    // Check if it's safe to pursue this goal
    if (goal.type !== GoalType.SAFETY && worldState.getThreatLevel() > 0.8) {
      return false;
    }

    return true;
  }

  /**
   * Rank multiple goals by priority score.
   */
  rankGoals(
    goals: CandidateGoal[],
    worldState: WorldState,
    context: PlanningContext
  ): PriorityScore[] {
    const scoredGoals = goals.map((goal) =>
      this.scorePriority(goal, worldState, context)
    );

    return scoredGoals.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Get detailed breakdown of priority factors for a goal.
   */
  getPriorityBreakdown(
    goal: CandidateGoal,
    worldState: WorldState,
    context: PlanningContext
  ): Record<string, any> {
    const score = this.scorePriority(goal, worldState, context);
    const risk = this.computeRisk(goal, worldState);

    return {
      goal: {
        id: goal.id,
        type: goal.type,
        description: goal.description,
        priority: goal.priority,
        estimatedCost: goal.estimatedCost,
        estimatedTime: goal.estimatedTime,
      },
      scores: {
        total: score.totalScore,
        urgency: score.urgencyScore,
        context: score.contextScore,
        risk: score.riskScore,
        commitment: score.commitmentBoost,
        novelty: score.noveltyBoost,
        opportunity: score.opportunityCost,
      },
      riskBreakdown: {
        path: risk.pathRisk,
        resource: risk.resourceRisk,
        time: risk.timeRisk,
        environmental: risk.environmentalRisk,
        total: risk.totalRisk,
      },
      context: {
        health: worldState.getHealth(),
        hunger: worldState.getHunger(),
        energy: worldState.getEnergy(),
        safety: worldState.getSafety(),
        threatLevel: worldState.getThreatLevel(),
        timeOfDay: worldState.getTimeOfDay(),
        nearbyPlayers: worldState.getNearbyPlayers(),
        lightLevel: worldState.getLightLevel(),
      },
      recommendations: this.generateRecommendations(score, risk, worldState),
    };
  }

  /**
   * Generate recommendations for improving goal priority.
   */
  private generateRecommendations(
    score: PriorityScore,
    risk: RiskAssessment,
    worldState: WorldState
  ): string[] {
    const recommendations: string[] = [];

    if (score.contextScore < 0.5) {
      recommendations.push(
        'Goal has low feasibility - consider prerequisites or alternative approaches'
      );
    }

    if (risk.totalRisk > 0.7) {
      recommendations.push(
        'High risk goal - consider risk mitigation or deferral'
      );
    }

    if (score.urgencyScore < 0.3) {
      recommendations.push(
        'Low urgency goal - consider deferring for higher priority tasks'
      );
    }

    if (score.opportunityCost > 0.3) {
      recommendations.push(
        'High opportunity cost - consider parallel execution or goal combination'
      );
    }

    if (
      worldState.getThreatLevel() > 0.6 &&
      score.goal.type !== GoalType.SAFETY
    ) {
      recommendations.push('High threat environment - prioritize safety goals');
    }

    return recommendations;
  }
}
