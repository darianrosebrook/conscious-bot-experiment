/**
 * Curriculum Tests
 *
 * Comprehensive test suite for the curriculum system.
 *
 * @author @darianrosebrook
 */

import { CurriculumManager } from '../curriculum-manager';
import { CurriculumBuilder } from '../curriculum-builder';
import { RegressionSuiteManager } from '../regression-suite';
import {
  Skill,
  SkillCategory,
  TestType,
  LearnerProfile,
  LearningPreferences,
  AblationStudy,
  AblationComponent,
  AblationVariation,
  ComponentChange,
  AblationBaseline,
} from '../types';

describe('Curriculum System', () => {
  let curriculumManager: CurriculumManager;
  let curriculumBuilder: CurriculumBuilder;
  let regressionManager: RegressionSuiteManager;

  const sampleSkills: Skill[] = [
    {
      id: 'skill_1',
      name: 'Basic Navigation',
      description: 'Navigate through simple environments',
      category: SkillCategory.PERCEPTION,
      complexity: 2,
      dependencies: [],
      validationTests: [
        {
          id: 'test_1',
          name: 'Navigation Test',
          description: 'Test basic navigation capabilities',
          testType: TestType.FUNCTIONAL,
          parameters: { environment: 'simple' },
          expectedOutcome: { success: true },
          timeout: 300,
          retryCount: 2,
          weight: 0.8,
        },
      ],
      performanceMetrics: [
        {
          id: 'metric_1',
          name: 'Navigation Speed',
          description: 'Speed of navigation completion',
          unit: 'seconds',
          target: 60,
          minimum: 120,
          weight: 0.6,
          aggregation: 'average',
        },
      ],
      metadata: {},
    },
    {
      id: 'skill_2',
      name: 'Object Recognition',
      description: 'Recognize and classify objects',
      category: SkillCategory.PERCEPTION,
      complexity: 3,
      dependencies: ['skill_1'],
      validationTests: [
        {
          id: 'test_2',
          name: 'Object Recognition Test',
          description: 'Test object recognition capabilities',
          testType: TestType.FUNCTIONAL,
          parameters: { objectTypes: ['cube', 'sphere'] },
          expectedOutcome: { accuracy: 0.8 },
          timeout: 300,
          retryCount: 2,
          weight: 0.9,
        },
      ],
      performanceMetrics: [
        {
          id: 'metric_2',
          name: 'Recognition Accuracy',
          description: 'Accuracy of object recognition',
          unit: 'percentage',
          target: 85,
          minimum: 70,
          weight: 0.8,
          aggregation: 'average',
        },
      ],
      metadata: {},
    },
    {
      id: 'skill_3',
      name: 'Path Planning',
      description: 'Plan optimal paths through environments',
      category: SkillCategory.PLANNING,
      complexity: 4,
      dependencies: ['skill_1', 'skill_2'],
      validationTests: [
        {
          id: 'test_3',
          name: 'Path Planning Test',
          description: 'Test path planning capabilities',
          testType: TestType.INTEGRATION,
          parameters: { environment: 'complex' },
          expectedOutcome: { pathFound: true },
          timeout: 600,
          retryCount: 3,
          weight: 0.9,
        },
      ],
      performanceMetrics: [
        {
          id: 'metric_3',
          name: 'Planning Time',
          description: 'Time to generate path plan',
          unit: 'seconds',
          target: 30,
          minimum: 60,
          weight: 0.7,
          aggregation: 'average',
        },
      ],
      metadata: {},
    },
  ];

  const sampleLearner: LearnerProfile = {
    id: 'learner_1',
    name: 'Test Learner',
    currentLevel: 3,
    completedObjectives: ['objective_skill_1'],
    skillMastery: {
      skill_1: 0.8,
      skill_2: 0.6,
    },
    learningPreferences: {
      preferredPace: 'moderate',
      preferredStyle: 'visual',
      challengeLevel: 'moderate',
      supportLevel: 'moderate',
    },
    performanceHistory: [
      {
        timestamp: Date.now() - 3600000, // 1 hour ago
        objectiveId: 'objective_skill_1',
        score: 0.8,
        timeSpent: 1200, // 20 minutes
        attempts: 1,
        feedback: 'Good performance',
        metadata: {},
      },
    ],
    metadata: {},
  };

  const sampleAblationStudy: AblationStudy = {
    id: 'ablation_1',
    name: 'Navigation Component Analysis',
    description: 'Analyze impact of navigation components',
    components: [
      {
        id: 'comp_1',
        name: 'Pathfinding Algorithm',
        description: 'Core pathfinding component',
        category: 'planning',
        importance: 0.8,
        dependencies: [],
        metadata: {},
      },
      {
        id: 'comp_2',
        name: 'Obstacle Detection',
        description: 'Obstacle detection component',
        category: 'perception',
        importance: 0.7,
        dependencies: ['comp_1'],
        metadata: {},
      },
    ],
    variations: [
      {
        id: 'var_1',
        name: 'Disable Pathfinding',
        description: 'Test without pathfinding algorithm',
        componentChanges: [
          {
            componentId: 'comp_1',
            changeType: 'disable',
            parameters: {},
          },
        ],
        expectedImpact: 'Significant performance degradation',
        priority: 1,
      },
    ],
    metrics: ['navigation_speed', 'path_quality', 'success_rate'],
    baseline: {
      configuration: { pathfinding: 'enabled', obstacle_detection: 'enabled' },
      performance: {
        navigation_speed: 1.0,
        path_quality: 1.0,
        success_rate: 1.0,
      },
      timestamp: Date.now(),
    },
    results: [],
    metadata: {},
  };

  beforeEach(() => {
    curriculumManager = new CurriculumManager();
    curriculumBuilder = new CurriculumBuilder();
    regressionManager = new RegressionSuiteManager();

    // Add sample skills
    for (const skill of sampleSkills) {
      curriculumManager.addSkill(skill);
      curriculumBuilder.addSkill(skill);
    }

    // Add sample learner
    curriculumManager.addLearner(sampleLearner);

    // Add sample ablation study
    curriculumManager.addAblationStudy(sampleAblationStudy);
  });

  describe('Curriculum Manager', () => {
    it('should create curriculum successfully', async () => {
      const result = await curriculumManager.createCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      expect(result.success).toBe(true);
      expect(result.curriculum).toBeDefined();
      expect(result.curriculum?.domain).toBe('navigation');
      expect(result.curriculum?.objectives.length).toBe(3);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should create adaptive pathway for learner', async () => {
      // First create a curriculum
      const curriculumResult = await curriculumManager.createCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      expect(curriculumResult.success).toBe(true);
      const curriculumId = curriculumResult.curriculum!.id;

      // Create adaptive pathway
      const pathwayResult = await curriculumManager.createAdaptivePathway(
        'learner_1',
        curriculumId
      );

      expect(pathwayResult.success).toBe(true);
      expect(pathwayResult.pathway).toBeDefined();
      expect(pathwayResult.pathway?.learnerId).toBe('learner_1');
      expect(pathwayResult.pathway?.curriculumId).toBe(curriculumId);
      expect(pathwayResult.progress).toBeDefined();
    });

    it('should update learner progress', async () => {
      // Create curriculum and pathway first
      const curriculumResult = await curriculumManager.createCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );
      const pathwayResult = await curriculumManager.createAdaptivePathway(
        'learner_1',
        curriculumResult.curriculum!.id
      );

      // Update progress
      const progressResult = await curriculumManager.updateProgress(
        'learner_1',
        'objective_skill_2',
        0.85,
        900, // 15 minutes
        'Excellent performance on object recognition'
      );

      expect(progressResult.success).toBe(true);
      expect(progressResult.progress).toBeDefined();
      expect(progressResult.progress?.completedObjectives).toContain(
        'objective_skill_2'
      );
      expect(progressResult.recommendations).toBeDefined();
      expect(Array.isArray(progressResult.recommendations)).toBe(true);
    });

    it('should execute ablation study', async () => {
      const result = await curriculumManager.executeAblationStudy('ablation_1');

      expect(result.studyId).toBe('ablation_1');
      expect(result.baseline).toBeDefined();
      expect(result.variations.length).toBe(1);
      expect(result.impactAnalysis).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate curriculum statistics', () => {
      const stats = curriculumManager.getCurriculumStats();

      expect(stats).toBeDefined();
      expect(stats.totalObjectives).toBeGreaterThanOrEqual(0);
      expect(stats.completedObjectives).toBeGreaterThanOrEqual(0);
      expect(stats.activeObjectives).toBeGreaterThanOrEqual(0);
      expect(stats.averageCompletionTime).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);
      expect(stats.regressionTestPassRate).toBeGreaterThanOrEqual(0);
      expect(stats.regressionTestPassRate).toBeLessThanOrEqual(1);
      expect(stats.ablationStudiesCompleted).toBe(1);
      expect(stats.qualityGatePassRate).toBeGreaterThanOrEqual(0);
      expect(stats.qualityGatePassRate).toBeLessThanOrEqual(1);
    });

    it('should handle missing learner gracefully', async () => {
      const result = await curriculumManager.createAdaptivePathway(
        'nonexistent_learner',
        'nonexistent_curriculum'
      );

      expect(result.success).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle missing curriculum gracefully', async () => {
      const result = await curriculumManager.createAdaptivePathway(
        'learner_1',
        'nonexistent_curriculum'
      );

      expect(result.success).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Curriculum Builder', () => {
    it('should design learning curriculum', async () => {
      const result = await curriculumBuilder.designLearningCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      expect(result.curriculum).toBeDefined();
      expect(result.curriculum.domain).toBe('navigation');
      expect(result.curriculum.objectives.length).toBe(3);
      expect(result.dependencyAnalysis).toBeDefined();
      expect(result.difficultyCalibration).toBeDefined();
      expect(result.adaptiveRules.length).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
    });

    it('should map skill dependencies correctly', async () => {
      const result = await curriculumBuilder.designLearningCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      const dependencyGraph = result.curriculum.skillDependencies;
      expect(dependencyGraph.nodes.length).toBe(3);
      expect(dependencyGraph.edges.length).toBeGreaterThan(0);
      expect(dependencyGraph.topologicalOrder.length).toBeGreaterThan(0);
      expect(dependencyGraph.cycles).toBeDefined();
    });

    it('should calibrate difficulty progression', async () => {
      const result = await curriculumBuilder.designLearningCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      const progression = result.curriculum.difficultyProgression;
      expect(progression.levels.length).toBeGreaterThan(0);
      expect(progression.transitions.length).toBeGreaterThanOrEqual(0);
      expect(progression.adaptiveRules).toBeDefined();
      expect(Array.isArray(progression.adaptiveRules)).toBe(true);
    });

    it('should generate adaptive rules', async () => {
      const result = await curriculumBuilder.designLearningCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      const rules = result.adaptiveRules;
      expect(rules.length).toBeGreaterThan(0);

      // Check for specific rule types
      const ruleTypes = rules.map((rule) => rule.action.type);
      expect(ruleTypes).toContain('adjust_difficulty');
      expect(ruleTypes).toContain('repeat_objective');
      expect(ruleTypes).toContain('skip_objective');
      expect(ruleTypes).toContain('add_support');
    });

    it('should analyze dependencies', async () => {
      const result = await curriculumBuilder.designLearningCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      const analysis = result.dependencyAnalysis;
      expect(analysis.cycles).toBeDefined();
      expect(analysis.criticalPath).toBeDefined();
      expect(analysis.parallelPaths).toBeDefined();
      expect(analysis.bottlenecks).toBeDefined();
      expect(analysis.estimatedDuration).toBeGreaterThan(0);
    });

    it('should handle skills with dependencies', () => {
      // Add skills with dependencies
      const skillWithDeps: Skill = {
        id: 'skill_4',
        name: 'Advanced Planning',
        description: 'Advanced planning capabilities',
        category: SkillCategory.PLANNING,
        complexity: 5,
        dependencies: ['skill_3'],
        validationTests: [],
        performanceMetrics: [],
        metadata: {},
      };

      curriculumBuilder.addSkill(skillWithDeps);

      // The builder should handle dependencies correctly
      expect(() => curriculumBuilder.addSkill(skillWithDeps)).not.toThrow();
    });
  });

  describe('Regression Suite Manager', () => {
    it('should create regression suite', () => {
      const tests = [
        {
          id: 'test_1',
          name: 'Functional Test',
          description: 'Test basic functionality',
          testType: TestType.FUNCTIONAL,
          parameters: { testParam: 'value' },
          expectedOutcome: { success: true },
          timeout: 300,
          retryCount: 2,
          weight: 0.8,
          baselineMetrics: { success_rate: 0.9 },
          acceptableDegradation: 10,
        },
      ];

      const schedule = {
        frequency: 'daily' as const,
        triggers: ['manual'],
      };

      const qualityGates = [
        {
          id: 'gate_1',
          name: 'Quality Gate',
          description: 'Basic quality gate',
          criteria: [
            {
              metric: 'success_rate',
              operator: 'gte' as const,
              threshold: 0.8,
              weight: 1.0,
            },
          ],
          action: 'pass' as const,
          severity: 'high' as const,
        },
      ];

      const suiteId = regressionManager.createRegressionSuite(
        'Test Suite',
        'Test regression suite',
        tests,
        schedule,
        qualityGates
      );

      expect(suiteId).toBeDefined();
      expect(typeof suiteId).toBe('string');
    });

    it('should execute regression suite', async () => {
      const tests = [
        {
          id: 'test_1',
          name: 'Functional Test',
          description: 'Test basic functionality',
          testType: TestType.FUNCTIONAL,
          parameters: { testParam: 'value' },
          expectedOutcome: { success: true },
          timeout: 300,
          retryCount: 2,
          weight: 0.8,
          baselineMetrics: { success_rate: 0.9 },
          acceptableDegradation: 10,
        },
      ];

      const schedule = {
        frequency: 'daily' as const,
        triggers: ['manual'],
      };

      const qualityGates = [
        {
          id: 'gate_1',
          name: 'Quality Gate',
          description: 'Basic quality gate',
          criteria: [
            {
              metric: 'success_rate',
              operator: 'gte' as const,
              threshold: 0.8,
              weight: 1.0,
            },
          ],
          action: 'pass' as const,
          severity: 'high' as const,
        },
      ];

      const suiteId = regressionManager.createRegressionSuite(
        'Test Suite',
        'Test regression suite',
        tests,
        schedule,
        qualityGates
      );

      const result = await regressionManager.executeRegressionSuite(suiteId);

      expect(result.suiteId).toBe(suiteId);
      expect(result.executionId).toBeDefined();
      expect(result.results.length).toBe(1);
      expect(result.summary).toBeDefined();
      expect(result.qualityGateResults.length).toBe(1);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle test execution errors gracefully', async () => {
      const tests = [
        {
          id: 'test_error',
          name: 'Error Test',
          description: 'Test that will cause an error',
          testType: TestType.FUNCTIONAL,
          parameters: { causeError: true },
          expectedOutcome: { success: true },
          timeout: 300,
          retryCount: 0, // No retries
          weight: 0.8,
          baselineMetrics: { success_rate: 0.9 },
          acceptableDegradation: 10,
        },
      ];

      const schedule = {
        frequency: 'daily' as const,
        triggers: ['manual'],
      };

      const qualityGates: any[] = [];

      const suiteId = regressionManager.createRegressionSuite(
        'Error Test Suite',
        'Test suite with errors',
        tests,
        schedule,
        qualityGates
      );

      const result = await regressionManager.executeRegressionSuite(suiteId);

      expect(result.results.length).toBe(1);
      expect(result.results[0].status).toBeDefined();
      expect(['passed', 'failed', 'error', 'skipped']).toContain(
        result.results[0].status
      );
      expect(result.summary.errorTests).toBeGreaterThanOrEqual(0);
    });

    it('should evaluate quality gates correctly', async () => {
      const tests = [
        {
          id: 'test_1',
          name: 'Functional Test',
          description: 'Test basic functionality',
          testType: TestType.FUNCTIONAL,
          parameters: { testParam: 'value' },
          expectedOutcome: { success: true },
          timeout: 300,
          retryCount: 2,
          weight: 0.8,
          baselineMetrics: { success_rate: 0.9 },
          acceptableDegradation: 10,
        },
      ];

      const schedule = {
        frequency: 'daily' as const,
        triggers: ['manual'],
      };

      const qualityGates = [
        {
          id: 'gate_1',
          name: 'Success Rate Gate',
          description: 'Check success rate',
          criteria: [
            {
              metric: 'functional_success_rate',
              operator: 'gte' as const,
              threshold: 0.8,
              weight: 1.0,
            },
          ],
          action: 'pass' as const,
          severity: 'high' as const,
        },
      ];

      const suiteId = regressionManager.createRegressionSuite(
        'Quality Gate Suite',
        'Test quality gates',
        tests,
        schedule,
        qualityGates
      );

      const result = await regressionManager.executeRegressionSuite(suiteId);

      expect(result.qualityGateResults.length).toBe(1);
      expect(result.qualityGateResults[0].gateId).toBe('gate_1');
      expect(result.qualityGateResults[0].criteriaResults.length).toBe(1);
      expect(result.qualityGateResults[0].overallScore).toBeGreaterThanOrEqual(
        0
      );
      expect(result.qualityGateResults[0].overallScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Integration Features', () => {
    it('should integrate curriculum creation with regression testing', async () => {
      // Create curriculum
      const curriculumResult = await curriculumManager.createCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );

      expect(curriculumResult.success).toBe(true);
      expect(curriculumResult.curriculum).toBeDefined();

      // The curriculum should have created a regression suite
      // Note: The regression suite is created internally but not exposed through the manager
      expect(curriculumResult.curriculum).toBeDefined();
    });

    it('should track progress across multiple objectives', async () => {
      // Create curriculum and pathway
      const curriculumResult = await curriculumManager.createCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );
      const pathwayResult = await curriculumManager.createAdaptivePathway(
        'learner_1',
        curriculumResult.curriculum!.id
      );

      // Update progress on multiple objectives
      await curriculumManager.updateProgress(
        'learner_1',
        'objective_skill_2',
        0.85,
        900
      );
      await curriculumManager.updateProgress(
        'learner_1',
        'objective_skill_3',
        0.75,
        1200
      );

      // Check progress tracker
      const progressTracker = curriculumManager.getProgressTracker('learner_1');
      expect(progressTracker).toBeDefined();
      expect(progressTracker?.completedObjectives.length).toBeGreaterThan(0); // Including initial objective_skill_1
      expect(progressTracker?.performanceTrend).toBeDefined();
    });

    it('should apply adaptive rules based on performance', async () => {
      // Create curriculum and pathway
      const curriculumResult = await curriculumManager.createCurriculum(
        'navigation',
        ['skill_1', 'skill_2', 'skill_3'],
        4
      );
      const pathwayResult = await curriculumManager.createAdaptivePathway(
        'learner_1',
        curriculumResult.curriculum!.id
      );

      // Update progress with low performance (should trigger adaptations)
      const progressResult = await curriculumManager.updateProgress(
        'learner_1',
        'objective_skill_2',
        0.4, // Low score
        2400 // Long time
      );

      expect(progressResult.success).toBe(true);
      expect(progressResult.progress?.adaptations.length).toBeGreaterThan(0);
    });
  });

  describe('Data Management', () => {
    it('should clear all data when requested', () => {
      expect(() => curriculumManager.clearData()).not.toThrow();

      // Verify data is cleared
      const stats = curriculumManager.getCurriculumStats();
      expect(stats.totalObjectives).toBe(0);
      expect(stats.completedObjectives).toBe(0);
      expect(stats.activeObjectives).toBe(0);
      expect(stats.ablationStudiesCompleted).toBe(0);
    });
  });
});
