/**
 * Curriculum Manager
 *
 * Main orchestrator for curriculum management, coordinating curriculum building,
 * regression testing, ablation studies, and progress tracking for comprehensive
 * agent development and evaluation.
 *
 * @author @darianrosebrook
 */

import {
  CurriculumBuilder,
  CurriculumDesignResult,
} from './curriculum-builder';
import {
  RegressionSuiteManager,
  RegressionTestResult,
} from './regression-suite';
import {
  LearningCurriculum,
  LearnerProfile,
  AdaptivePathway,
  ProgressTracker,
  CurriculumStats,
  AblationStudy,
  AblationResult,
  Skill,
  SkillCategory,
  TestType,
  CurriculumConfig,
  DEFAULT_CURRICULUM_CONFIG,
} from './types';

/**
 * Result of curriculum management operation
 */
export interface CurriculumManagementResult {
  success: boolean;
  curriculum?: LearningCurriculum;
  pathway?: AdaptivePathway;
  progress?: ProgressTracker;
  stats?: CurriculumStats;
  warnings: string[];
  recommendations: string[];
}

/**
 * Result of ablation study execution
 */
export interface AblationStudyResult {
  studyId: string;
  baseline: AblationResult;
  variations: AblationResult[];
  impactAnalysis: ImpactAnalysis;
  recommendations: string[];
  metadata: Record<string, any>;
}

/**
 * Impact analysis for ablation study
 */
export interface ImpactAnalysis {
  significantComponents: string[];
  performanceImpact: Record<string, number>;
  functionalityImpact: Record<string, number>;
  criticalDependencies: string[];
  optimizationOpportunities: string[];
}

/**
 * Main curriculum manager for comprehensive agent development
 */
export class CurriculumManager {
  private config: CurriculumConfig;
  private curriculumBuilder: CurriculumBuilder;
  private regressionManager: RegressionSuiteManager;

  // Data storage
  private curricula: Map<string, LearningCurriculum> = new Map();
  private learners: Map<string, LearnerProfile> = new Map();
  private pathways: Map<string, AdaptivePathway> = new Map();
  private progressTrackers: Map<string, ProgressTracker> = new Map();
  private ablationStudies: Map<string, AblationStudy> = new Map();
  private skills: Map<string, Skill> = new Map();

  constructor(config: Partial<CurriculumConfig> = {}) {
    this.config = { ...DEFAULT_CURRICULUM_CONFIG, ...config };
    this.curriculumBuilder = new CurriculumBuilder(config);
    this.regressionManager = new RegressionSuiteManager(config);
  }

  /**
   * Create comprehensive curriculum for domain
   */
  async createCurriculum(
    domain: string,
    skillRequirements: string[],
    targetDifficulty: number = 5
  ): Promise<CurriculumManagementResult> {
    try {
      // Add skills to curriculum builder
      for (const skillId of skillRequirements) {
        const skill = this.skills.get(skillId);
        if (skill) {
          this.curriculumBuilder.addSkill(skill);
        }
      }

      // Design curriculum
      const designResult =
        await this.curriculumBuilder.designLearningCurriculum(
          domain,
          skillRequirements,
          targetDifficulty
        );

      // Store curriculum
      this.curricula.set(designResult.curriculum.id, designResult.curriculum);

      // Create regression suite for curriculum validation
      const regressionSuiteId = await this.createRegressionSuiteForCurriculum(
        designResult.curriculum
      );

      return {
        success: true,
        curriculum: designResult.curriculum,
        warnings: designResult.warnings,
        recommendations: [
          'Monitor learner progress and adjust difficulty as needed',
          'Run regression tests regularly to ensure capability maintenance',
          'Conduct ablation studies to understand component contributions',
        ],
      };
    } catch (error) {
      console.error('Error creating curriculum:', error);
      return {
        success: false,
        warnings: [error instanceof Error ? error.message : 'Unknown error'],
        recommendations: ['Review skill requirements and try again'],
      };
    }
  }

  /**
   * Create adaptive pathway for learner
   */
  async createAdaptivePathway(
    learnerId: string,
    curriculumId: string
  ): Promise<CurriculumManagementResult> {
    try {
      const learner = this.learners.get(learnerId);
      const curriculum = this.curricula.get(curriculumId);

      if (!learner) {
        throw new Error(`Learner ${learnerId} not found`);
      }
      if (!curriculum) {
        throw new Error(`Curriculum ${curriculumId} not found`);
      }

      // Determine starting objectives based on learner profile
      const startingObjectives = this.determineStartingObjectives(
        learner,
        curriculum
      );
      const nextObjectives = this.determineNextObjectives(
        startingObjectives,
        curriculum
      );

      const pathway: AdaptivePathway = {
        id: `pathway_${learnerId}_${curriculumId}_${Date.now()}`,
        learnerId,
        curriculumId,
        currentObjective: startingObjectives[0] || '',
        completedObjectives: [],
        nextObjectives,
        estimatedCompletion: this.estimatePathwayCompletion(
          learner,
          curriculum
        ),
        adaptations: [],
        metadata: {
          createdAt: Date.now(),
          learnerLevel: learner.currentLevel,
          learningPreferences: learner.learningPreferences,
        },
      };

      // Store pathway
      this.pathways.set(pathway.id, pathway);

      // Create progress tracker
      const progressTracker = this.createProgressTracker(
        learner,
        curriculum,
        pathway
      );
      this.progressTrackers.set(progressTracker.learnerId, progressTracker);

      return {
        success: true,
        pathway,
        progress: progressTracker,
        warnings: [],
        recommendations: [
          'Monitor learner progress and apply adaptive rules',
          'Adjust pathway based on performance and preferences',
          'Provide support for struggling learners',
        ],
      };
    } catch (error) {
      console.error('Error creating adaptive pathway:', error);
      return {
        success: false,
        warnings: [error instanceof Error ? error.message : 'Unknown error'],
        recommendations: ['Verify learner and curriculum exist'],
      };
    }
  }

  /**
   * Update learner progress
   */
  async updateProgress(
    learnerId: string,
    objectiveId: string,
    score: number,
    timeSpent: number,
    feedback?: string
  ): Promise<CurriculumManagementResult> {
    try {
      const learner = this.learners.get(learnerId);
      const progressTracker = this.progressTrackers.get(learnerId);

      if (!learner || !progressTracker) {
        throw new Error(`Learner ${learnerId} not found`);
      }

      // Update learner profile
      learner.completedObjectives.push(objectiveId);
      learner.performanceHistory.push({
        timestamp: Date.now(),
        objectiveId,
        score,
        timeSpent,
        attempts: 1, // Could be tracked more sophisticatedly
        feedback: feedback || '',
        metadata: {},
      });

      // Update progress tracker
      progressTracker.completedObjectives.push(objectiveId);
      progressTracker.activeObjectives =
        progressTracker.activeObjectives.filter((id) => id !== objectiveId);

      // Determine next objectives
      const pathway = this.pathways.get(progressTracker.curriculumId);
      if (pathway) {
        pathway.completedObjectives.push(objectiveId);
        pathway.currentObjective = pathway.nextObjectives[0] || '';
        pathway.nextObjectives = this.determineNextObjectives(
          [pathway.currentObjective],
          this.curricula.get(pathway.curriculumId)!
        );
      }

      // Apply adaptive rules
      const adaptations = this.applyAdaptiveRules(learner, score, timeSpent);
      if (adaptations.length > 0) {
        progressTracker.adaptations.push(...adaptations);
        if (pathway) {
          pathway.adaptations.push(...adaptations);
        }
      }

      // Update performance trend
      progressTracker.performanceTrend = this.calculatePerformanceTrend(
        learner.performanceHistory
      );

      return {
        success: true,
        progress: progressTracker,
        warnings: [],
        recommendations: this.generateProgressRecommendations(score, timeSpent),
      };
    } catch (error) {
      console.error('Error updating progress:', error);
      return {
        success: false,
        warnings: [error instanceof Error ? error.message : 'Unknown error'],
        recommendations: ['Verify learner exists and objective is valid'],
      };
    }
  }

  /**
   * Execute ablation study
   */
  async executeAblationStudy(studyId: string): Promise<AblationStudyResult> {
    try {
      const study = this.ablationStudies.get(studyId);
      if (!study) {
        throw new Error(`Ablation study ${studyId} not found`);
      }

      const results: AblationResult[] = [];

      // Execute baseline
      const baselineResult = await this.executeAblationVariation(
        study,
        study.baseline
      );
      results.push(baselineResult);

      // Execute variations
      for (const variation of study.variations) {
        const variationResult = await this.executeAblationVariation(
          study,
          variation
        );
        results.push(variationResult);
      }

      // Analyze impact
      const impactAnalysis = this.analyzeAblationImpact(study, results);

      // Generate recommendations
      const recommendations =
        this.generateAblationRecommendations(impactAnalysis);

      return {
        studyId,
        baseline: baselineResult,
        variations: results.slice(1), // Exclude baseline
        impactAnalysis,
        recommendations,
        metadata: {
          executedAt: Date.now(),
          totalVariations: study.variations.length,
        },
      };
    } catch (error) {
      console.error('Error executing ablation study:', error);
      throw new Error(`Failed to execute ablation study ${studyId}: ${error}`);
    }
  }

  /**
   * Get curriculum statistics
   */
  getCurriculumStats(): CurriculumStats {
    const totalObjectives = Array.from(this.curricula.values()).reduce(
      (sum, curriculum) => sum + curriculum.objectives.length,
      0
    );

    const completedObjectives = Array.from(this.learners.values()).reduce(
      (sum, learner) => sum + learner.completedObjectives.length,
      0
    );

    const activeObjectives = Array.from(this.progressTrackers.values()).reduce(
      (sum, tracker) => sum + tracker.activeObjectives.length,
      0
    );

    // Calculate average completion time
    const completionTimes: number[] = [];
    for (const learner of this.learners.values()) {
      for (const record of learner.performanceHistory) {
        completionTimes.push(record.timeSpent / 60); // Convert to minutes
      }
    }
    const averageCompletionTime =
      completionTimes.length > 0
        ? completionTimes.reduce((sum, time) => sum + time, 0) /
          completionTimes.length
        : 0;

    // Calculate success rate
    const totalAttempts = Array.from(this.learners.values()).reduce(
      (sum, learner) => sum + learner.performanceHistory.length,
      0
    );
    const successfulAttempts = Array.from(this.learners.values()).reduce(
      (sum, learner) =>
        sum + learner.performanceHistory.filter((r) => r.score >= 0.7).length,
      0
    );
    const successRate =
      totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;

    return {
      totalObjectives,
      completedObjectives,
      activeObjectives,
      averageCompletionTime,
      successRate,
      regressionTestPassRate: 0.85, // Would be calculated from actual test results
      ablationStudiesCompleted: this.ablationStudies.size,
      qualityGatePassRate: 0.9, // Would be calculated from actual gate results
      metadata: {
        totalLearners: this.learners.size,
        totalCurricula: this.curricula.size,
        totalPathways: this.pathways.size,
      },
    };
  }

  /**
   * Add learner profile
   */
  addLearner(learner: LearnerProfile): void {
    this.learners.set(learner.id, learner);
  }

  /**
   * Add skill definition
   */
  addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * Add ablation study
   */
  addAblationStudy(study: AblationStudy): void {
    this.ablationStudies.set(study.id, study);
  }

  /**
   * Get learner profile
   */
  getLearner(learnerId: string): LearnerProfile | undefined {
    return this.learners.get(learnerId);
  }

  /**
   * Get curriculum by ID
   */
  getCurriculum(curriculumId: string): LearningCurriculum | undefined {
    return this.curricula.get(curriculumId);
  }

  /**
   * Get adaptive pathway by ID
   */
  getPathway(pathwayId: string): AdaptivePathway | undefined {
    return this.pathways.get(pathwayId);
  }

  /**
   * Get progress tracker by learner ID
   */
  getProgressTracker(learnerId: string): ProgressTracker | undefined {
    return this.progressTrackers.get(learnerId);
  }

  /**
   * Create regression suite for curriculum validation
   */
  private async createRegressionSuiteForCurriculum(
    curriculum: LearningCurriculum
  ): Promise<string> {
    const tests = [];

    // Create functional tests for each objective
    for (const objective of curriculum.objectives) {
      tests.push({
        id: `functional_${objective.id}`,
        name: `Functional Test: ${objective.title}`,
        description: `Test functional requirements for ${objective.title}`,
        testType: TestType.FUNCTIONAL,
        parameters: { objectiveId: objective.id },
        expectedOutcome: { success: true },
        timeout: this.config.defaultTimeout,
        retryCount: this.config.maxRetries,
        weight: 0.8,
        baselineMetrics: { functional_success_rate: 0.9 },
        acceptableDegradation: 10,
      });
    }

    // Create integration tests
    tests.push({
      id: 'integration_curriculum',
      name: 'Curriculum Integration Test',
      description: 'Test integration between curriculum objectives',
      testType: TestType.INTEGRATION,
      parameters: { curriculumId: curriculum.id },
      expectedOutcome: { integration_success: true },
      timeout: this.config.defaultTimeout,
      retryCount: this.config.maxRetries,
      weight: 0.9,
      baselineMetrics: { integration_success_rate: 0.85 },
      acceptableDegradation: 15,
    });

    // Create performance tests
    tests.push({
      id: 'performance_curriculum',
      name: 'Curriculum Performance Test',
      description: 'Test performance characteristics of curriculum',
      testType: TestType.PERFORMANCE,
      parameters: { curriculumId: curriculum.id },
      expectedOutcome: { performance_acceptable: true },
      timeout: this.config.defaultTimeout,
      retryCount: this.config.maxRetries,
      weight: 0.7,
      baselineMetrics: { completion_time: 1800, success_rate: 0.8 },
      acceptableDegradation: 20,
    });

    const qualityGates = [
      {
        id: 'functional_gate',
        name: 'Functional Quality Gate',
        description: 'Ensure functional requirements are met',
        criteria: [
          {
            id: 'functional_criterion',
            metric: 'functional_success_rate',
            operator: 'gte' as const,
            threshold: 0.8,
            weight: 0.6,
          },
        ],
        action: 'pass' as const,
        severity: 'high' as const,
      },
      {
        id: 'performance_gate',
        name: 'Performance Quality Gate',
        description: 'Ensure performance requirements are met',
        criteria: [
          {
            id: 'performance_criterion',
            metric: 'completion_time',
            operator: 'lte' as const,
            threshold: 2400, // 40 minutes
            weight: 0.4,
          },
        ],
        action: 'pass' as const,
        severity: 'medium' as const,
      },
    ];

    return this.regressionManager.createRegressionSuite(
      `${curriculum.name} Validation Suite`,
      `Regression testing suite for ${curriculum.name}`,
      tests,
      { frequency: 'daily', triggers: ['curriculum_update'] },
      qualityGates
    );
  }

  /**
   * Determine starting objectives for learner
   */
  private determineStartingObjectives(
    learner: LearnerProfile,
    curriculum: LearningCurriculum
  ): string[] {
    const startingObjectives: string[] = [];

    // Find objectives that match learner's current level
    for (const objective of curriculum.objectives) {
      if (objective.difficulty <= learner.currentLevel + 1) {
        // Check if prerequisites are met
        const prerequisitesMet = objective.prerequisites.every((prereqId) =>
          learner.completedObjectives.includes(prereqId)
        );

        if (prerequisitesMet) {
          startingObjectives.push(objective.id);
        }
      }
    }

    // Sort by difficulty and return top candidates
    return startingObjectives
      .sort((a, b) => {
        const objA = curriculum.objectives.find((o) => o.id === a)!;
        const objB = curriculum.objectives.find((o) => o.id === b)!;
        return objA.difficulty - objB.difficulty;
      })
      .slice(0, this.config.maxConcurrentObjectives);
  }

  /**
   * Determine next objectives based on current progress
   */
  private determineNextObjectives(
    currentObjectives: string[],
    curriculum: LearningCurriculum
  ): string[] {
    const nextObjectives: string[] = [];

    for (const objective of curriculum.objectives) {
      // Skip if already completed or currently active
      if (currentObjectives.includes(objective.id)) {
        continue;
      }

      // Check if prerequisites are met
      const prerequisitesMet = objective.prerequisites.every((prereqId) =>
        currentObjectives.includes(prereqId)
      );

      if (prerequisitesMet) {
        nextObjectives.push(objective.id);
      }
    }

    return nextObjectives.slice(0, this.config.maxConcurrentObjectives);
  }

  /**
   * Estimate pathway completion time
   */
  private estimatePathwayCompletion(
    learner: LearnerProfile,
    curriculum: LearningCurriculum
  ): number {
    const remainingObjectives = curriculum.objectives.filter(
      (obj) => !learner.completedObjectives.includes(obj.id)
    );

    const totalTime = remainingObjectives.reduce(
      (sum, obj) => sum + obj.estimatedDuration,
      0
    );

    // Adjust based on learner preferences
    let adjustedTime = totalTime;
    switch (learner.learningPreferences.preferredPace) {
      case 'slow':
        adjustedTime *= 1.3;
        break;
      case 'fast':
        adjustedTime *= 0.7;
        break;
      default:
        // No adjustment for moderate pace
        break;
    }

    return adjustedTime;
  }

  /**
   * Create progress tracker for learner
   */
  private createProgressTracker(
    learner: LearnerProfile,
    curriculum: LearningCurriculum,
    pathway: AdaptivePathway
  ): ProgressTracker {
    return {
      learnerId: learner.id,
      curriculumId: curriculum.id,
      currentLevel: learner.currentLevel,
      completedObjectives: learner.completedObjectives,
      activeObjectives: [pathway.currentObjective].filter(Boolean),
      nextObjectives: pathway.nextObjectives,
      estimatedCompletion: pathway.estimatedCompletion,
      performanceTrend: {
        direction: 'stable',
        slope: 0,
        confidence: 0.5,
        factors: [],
        recommendations: [],
      },
      adaptations: [],
      metadata: {
        createdAt: Date.now(),
        pathwayId: pathway.id,
      },
    };
  }

  /**
   * Apply adaptive rules based on performance
   */
  private applyAdaptiveRules(
    learner: LearnerProfile,
    score: number,
    timeSpent: number
  ): any[] {
    const adaptations = [];

    // Rule 1: Adjust difficulty based on performance
    if (score < 0.6) {
      adaptations.push({
        timestamp: Date.now(),
        type: 'difficulty_adjustment',
        reason: 'Low performance score',
        parameters: { adjustment: -1 },
        outcome: 'success',
      });
    } else if (score > 0.9) {
      adaptations.push({
        timestamp: Date.now(),
        type: 'difficulty_adjustment',
        reason: 'High performance score',
        parameters: { adjustment: 1 },
        outcome: 'success',
      });
    }

    // Rule 2: Add support for slow learners
    if (timeSpent > 1800) {
      // 30 minutes
      adaptations.push({
        timestamp: Date.now(),
        type: 'support_added',
        reason: 'Extended time spent on objective',
        parameters: { supportType: 'hints', frequency: 'increased' },
        outcome: 'success',
      });
    }

    return adaptations;
  }

  /**
   * Calculate performance trend from history
   */
  private calculatePerformanceTrend(history: any[]): any {
    if (history.length < 3) {
      return {
        direction: 'stable',
        slope: 0,
        confidence: 0.3,
        factors: ['Insufficient data'],
        recommendations: ['Continue learning to establish trend'],
      };
    }

    // Simple linear regression
    const recentScores = history.slice(-10).map((r) => r.score);
    const xValues = Array.from({ length: recentScores.length }, (_, i) => i);

    const n = recentScores.length;
    const sumX = xValues.reduce((sum, x) => sum + x, 0);
    const sumY = recentScores.reduce((sum, y) => sum + y, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * recentScores[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const direction =
      slope > 0.01 ? 'improving' : slope < -0.01 ? 'declining' : 'stable';
    const confidence = Math.min(0.9, Math.abs(slope) * 10);

    return {
      direction,
      slope,
      confidence,
      factors: this.identifyTrendFactors(history),
      recommendations: this.generateTrendRecommendations(direction, slope),
    };
  }

  /**
   * Identify factors contributing to performance trend
   */
  private identifyTrendFactors(history: any[]): string[] {
    const factors = [];
    const recentScores = history.slice(-5).map((r) => r.score);
    const averageScore =
      recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;

    if (averageScore > 0.8) {
      factors.push('Consistent high performance');
    } else if (averageScore < 0.6) {
      factors.push('Struggling with objectives');
    }

    const timeSpent = history.slice(-5).map((r) => r.timeSpent);
    const averageTime =
      timeSpent.reduce((sum, time) => sum + time, 0) / timeSpent.length;

    if (averageTime > 1800) {
      factors.push('Extended time on objectives');
    } else if (averageTime < 600) {
      factors.push('Quick completion of objectives');
    }

    return factors;
  }

  /**
   * Generate recommendations based on performance trend
   */
  private generateTrendRecommendations(
    direction: string,
    slope: number
  ): string[] {
    const recommendations = [];

    if (direction === 'improving') {
      recommendations.push('Continue current learning approach');
      if (slope > 0.05) {
        recommendations.push('Consider increasing difficulty level');
      }
    } else if (direction === 'declining') {
      recommendations.push('Review learning strategies');
      recommendations.push('Consider additional support or review');
      if (slope < -0.05) {
        recommendations.push('May need to revisit foundational concepts');
      }
    } else {
      recommendations.push('Maintain consistent learning pace');
      recommendations.push('Consider new learning approaches');
    }

    return recommendations;
  }

  /**
   * Generate progress recommendations
   */
  private generateProgressRecommendations(
    score: number,
    timeSpent: number
  ): string[] {
    const recommendations = [];

    if (score < 0.6) {
      recommendations.push('Consider reviewing prerequisite concepts');
      recommendations.push('Request additional support or guidance');
    } else if (score > 0.9) {
      recommendations.push(
        'Excellent performance - consider advancing to next level'
      );
    }

    if (timeSpent > 1800) {
      recommendations.push('Consider breaking down complex objectives');
      recommendations.push('Request additional time or support');
    }

    return recommendations;
  }

  /**
   * Execute ablation variation
   */
  private async executeAblationVariation(
    study: AblationStudy,
    variation: any
  ): Promise<AblationResult> {
    // Simulate ablation study execution
    const performance: Record<string, number> = {};
    const impact: Record<string, number> = {};
    const significance: Record<string, number> = {};

    for (const metric of study.metrics) {
      const baselineValue = study.baseline.performance[metric] || 1.0;
      const variationFactor = 0.7 + Math.random() * 0.6; // ±30% variation
      performance[metric] = baselineValue * variationFactor;
      impact[metric] =
        ((performance[metric] - baselineValue) / baselineValue) * 100;
      significance[metric] =
        Math.abs(impact[metric]) > 10
          ? 0.8 + Math.random() * 0.2
          : 0.2 + Math.random() * 0.3;
    }

    return {
      variationId: variation.id || 'baseline',
      performance,
      impact,
      significance,
      timestamp: Date.now(),
      metadata: {
        variation: variation.name || 'baseline',
        componentChanges: variation.componentChanges || [],
      },
    };
  }

  /**
   * Analyze ablation study impact
   */
  private analyzeAblationImpact(
    study: AblationStudy,
    results: AblationResult[]
  ): ImpactAnalysis {
    const significantComponents: string[] = [];
    const performanceImpact: Record<string, number> = {};
    const functionalityImpact: Record<string, number> = {};
    const criticalDependencies: string[] = [];
    const optimizationOpportunities: string[] = [];

    // Analyze each variation
    for (const result of results.slice(1)) {
      // Skip baseline
      const variation = study.variations.find(
        (v) => v.id === result.variationId
      );
      if (!variation) continue;

      // Check for significant impacts
      for (const [metric, impact] of Object.entries(result.impact)) {
        if (Math.abs(impact) > 15) {
          // 15% threshold
          significantComponents.push(
            ...variation.componentChanges.map((c) => c.componentId)
          );

          if (metric.includes('performance')) {
            performanceImpact[metric] = impact;
          } else if (metric.includes('functionality')) {
            functionalityImpact[metric] = impact;
          }
        }
      }

      // Identify critical dependencies
      if (Object.values(result.significance).some((s) => s > 0.8)) {
        criticalDependencies.push(
          ...variation.componentChanges.map((c) => c.componentId)
        );
      }

      // Identify optimization opportunities
      if (Object.values(result.impact).some((i) => i > 20)) {
        optimizationOpportunities.push(
          `Optimize ${variation.componentChanges.map((c) => c.componentId).join(', ')}`
        );
      }
    }

    return {
      significantComponents: [...new Set(significantComponents)],
      performanceImpact,
      functionalityImpact,
      criticalDependencies: [...new Set(criticalDependencies)],
      optimizationOpportunities: [...new Set(optimizationOpportunities)],
    };
  }

  /**
   * Generate ablation study recommendations
   */
  private generateAblationRecommendations(
    impactAnalysis: ImpactAnalysis
  ): string[] {
    const recommendations = [];

    if (impactAnalysis.significantComponents.length > 0) {
      recommendations.push(
        `Focus optimization efforts on: ${impactAnalysis.significantComponents.join(', ')}`
      );
    }

    if (impactAnalysis.criticalDependencies.length > 0) {
      recommendations.push(
        `Protect critical dependencies: ${impactAnalysis.criticalDependencies.join(', ')}`
      );
    }

    if (impactAnalysis.optimizationOpportunities.length > 0) {
      recommendations.push(...impactAnalysis.optimizationOpportunities);
    }

    if (Object.keys(impactAnalysis.performanceImpact).length > 0) {
      recommendations.push('Monitor performance impacts closely');
    }

    return recommendations;
  }

  /**
   * Clear all data
   */
  clearData(): void {
    this.curricula.clear();
    this.learners.clear();
    this.pathways.clear();
    this.progressTrackers.clear();
    this.ablationStudies.clear();
    this.skills.clear();
    this.curriculumBuilder.clearData();
    this.regressionManager.clearData();
  }
}
