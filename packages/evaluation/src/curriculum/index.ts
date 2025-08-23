/**
 * Curriculum Module
 *
 * Exports for the curriculum system that handles progressive skill building,
 * regression testing, and ablation study coordination.
 *
 * @author @darianrosebrook
 */

export { CurriculumManager } from './curriculum-manager';
export type {
  CurriculumManagementResult,
  AblationStudyResult,
  ImpactAnalysis,
} from './curriculum-manager';
export { CurriculumBuilder } from './curriculum-builder';
export type {
  CurriculumDesignResult,
  DependencyAnalysis,
  DifficultyCalibration,
} from './curriculum-builder';
export { RegressionSuiteManager } from './regression-suite';
export type {
  RegressionTestResult,
  TestSummary,
  QualityGateResult,
  CriterionResult,
} from './regression-suite';

// Types
export type {
  LearningObjective,
  AssessmentCriterion,
  Skill,
  ValidationTest,
  PerformanceMetric,
  LearningCurriculum,
  DependencyGraph,
  DependencyEdge,
  DifficultyProgression,
  DifficultyLevel,
  DifficultyTransition,
  TransitionCondition,
  AssessmentRequirement,
  AdaptiveRule,
  AdaptiveCondition,
  AdaptiveAction,
  LearnerProfile,
  LearningPreferences,
  PerformanceRecord,
  AdaptivePathway,
  Adaptation,
  RegressionSuite,
  RegressionTest,
  TestSchedule,
  QualityGate,
  QualityCriterion,
  AblationStudy,
  AblationComponent,
  AblationVariation,
  ComponentChange,
  AblationBaseline,
  AblationResult,
  TestResult,
  CurriculumConfig,
  CurriculumStats,
  ProgressTracker,
  PerformanceTrend,
} from './types';

// Enums
export { SkillCategory, TestType } from './types';

// Default configuration
export { DEFAULT_CURRICULUM_CONFIG } from './types';
