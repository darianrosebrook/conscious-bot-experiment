/**
 * Curriculum Types
 *
 * Type definitions for the curriculum module that handles progressive skill building,
 * regression testing, and ablation study coordination.
 *
 * @author @darianrosebrook
 */

/**
 * Learning objective with specific criteria and assessment methods
 */
export interface LearningObjective {
  id: string;
  title: string;
  description: string;
  domain: string;
  difficulty: number; // 1-10 scale
  prerequisites: string[]; // IDs of prerequisite objectives
  assessmentCriteria: AssessmentCriterion[];
  estimatedDuration: number; // minutes
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * Assessment criterion for evaluating objective mastery
 */
export interface AssessmentCriterion {
  id: string;
  description: string;
  metric: string;
  threshold: number;
  weight: number; // 0-1, relative importance
  measurementMethod: 'automated' | 'manual' | 'hybrid';
}

/**
 * Skill with specific capabilities and validation requirements
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  complexity: number; // 1-10 scale
  dependencies: string[]; // Skill IDs
  validationTests: ValidationTest[];
  performanceMetrics: PerformanceMetric[];
  metadata: Record<string, any>;
}

/**
 * Skill categories for organization
 */
export enum SkillCategory {
  PERCEPTION = 'perception',
  COGNITION = 'cognition',
  PLANNING = 'planning',
  EXECUTION = 'execution',
  SOCIAL = 'social',
  SAFETY = 'safety',
  MEMORY = 'memory',
  INTEGRATION = 'integration',
}

/**
 * Validation test for skill assessment
 */
export interface ValidationTest {
  id: string;
  name: string;
  description: string;
  testType: TestType;
  parameters: Record<string, any>;
  expectedOutcome: any;
  timeout: number; // seconds
  retryCount: number;
  weight: number; // 0-1, relative importance
}

/**
 * Test types for validation
 */
export enum TestType {
  FUNCTIONAL = 'functional',
  PERFORMANCE = 'performance',
  STRESS = 'stress',
  INTEGRATION = 'integration',
  REGRESSION = 'regression',
  ABLATION = 'ablation',
}

/**
 * Performance metric for skill evaluation
 */
export interface PerformanceMetric {
  id: string;
  name: string;
  description: string;
  unit: string;
  target: number;
  minimum: number;
  weight: number; // 0-1, relative importance
  aggregation: 'average' | 'min' | 'max' | 'sum';
}

/**
 * Learning curriculum with structured progression
 */
export interface LearningCurriculum {
  id: string;
  name: string;
  description: string;
  domain: string;
  objectives: LearningObjective[];
  skillDependencies: DependencyGraph;
  difficultyProgression: DifficultyProgression;
  estimatedDuration: number; // minutes
  version: string;
  metadata: Record<string, any>;
}

/**
 * Dependency graph for skills and objectives
 */
export interface DependencyGraph {
  nodes: string[]; // Skill/Objective IDs
  edges: DependencyEdge[];
  cycles: string[][]; // Detected dependency cycles
  topologicalOrder: string[]; // Valid execution order
}

/**
 * Dependency edge between skills/objectives
 */
export interface DependencyEdge {
  from: string;
  to: string;
  type: 'prerequisite' | 'co_requisite' | 'recommended';
  strength: number; // 0-1, dependency strength
}

/**
 * Difficulty progression for learning sequence
 */
export interface DifficultyProgression {
  levels: DifficultyLevel[];
  transitions: DifficultyTransition[];
  adaptiveRules: AdaptiveRule[];
}

/**
 * Difficulty level definition
 */
export interface DifficultyLevel {
  level: number; // 1-10
  name: string;
  description: string;
  skillRequirements: string[];
  assessmentThreshold: number;
  estimatedTime: number; // minutes
}

/**
 * Transition between difficulty levels
 */
export interface DifficultyTransition {
  fromLevel: number;
  toLevel: number;
  conditions: TransitionCondition[];
  assessment: AssessmentRequirement;
}

/**
 * Condition for difficulty level transition
 */
export interface TransitionCondition {
  type: 'performance' | 'mastery' | 'time' | 'attempts';
  metric: string;
  threshold: number;
  operator: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
}

/**
 * Assessment requirement for transitions
 */
export interface AssessmentRequirement {
  objectives: string[];
  minimumScore: number;
  timeLimit?: number;
  retryAllowed: boolean;
}

/**
 * Adaptive rule for personalized learning
 */
export interface AdaptiveRule {
  id: string;
  condition: AdaptiveCondition;
  action: AdaptiveAction;
  priority: number;
}

/**
 * Condition for adaptive learning
 */
export interface AdaptiveCondition {
  metric: string;
  operator: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  threshold: number;
  timeWindow?: number; // seconds
}

/**
 * Action for adaptive learning
 */
export interface AdaptiveAction {
  type:
    | 'adjust_difficulty'
    | 'repeat_objective'
    | 'skip_objective'
    | 'add_support';
  parameters: Record<string, any>;
}

/**
 * Learner profile for personalized curriculum
 */
export interface LearnerProfile {
  id: string;
  name: string;
  currentLevel: number;
  completedObjectives: string[];
  skillMastery: Record<string, number>; // Skill ID -> mastery level (0-1)
  learningPreferences: LearningPreferences;
  performanceHistory: PerformanceRecord[];
  metadata: Record<string, any>;
}

/**
 * Learning preferences for personalization
 */
export interface LearningPreferences {
  preferredPace: 'slow' | 'moderate' | 'fast';
  preferredStyle: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
  challengeLevel: 'easy' | 'moderate' | 'challenging';
  supportLevel: 'minimal' | 'moderate' | 'extensive';
}

/**
 * Performance record for tracking progress
 */
export interface PerformanceRecord {
  timestamp: number;
  objectiveId: string;
  score: number;
  timeSpent: number; // seconds
  attempts: number;
  feedback: string;
  metadata: Record<string, any>;
}

/**
 * Adaptive pathway for personalized learning
 */
export interface AdaptivePathway {
  id: string;
  learnerId: string;
  curriculumId: string;
  currentObjective: string;
  completedObjectives: string[];
  nextObjectives: string[];
  estimatedCompletion: number; // minutes
  adaptations: Adaptation[];
  metadata: Record<string, any>;
}

/**
 * Adaptation made to personalize learning
 */
export interface Adaptation {
  timestamp: number;
  type:
    | 'difficulty_adjustment'
    | 'objective_skip'
    | 'support_added'
    | 'pace_change';
  reason: string;
  parameters: Record<string, any>;
  outcome: 'success' | 'failure' | 'neutral';
}

/**
 * Regression test suite for capability validation
 */
export interface RegressionSuite {
  id: string;
  name: string;
  description: string;
  tests: RegressionTest[];
  schedule: TestSchedule;
  qualityGates: QualityGate[];
  metadata: Record<string, any>;
}

/**
 * Regression test for capability validation
 */
export interface RegressionTest {
  id: string;
  name: string;
  description: string;
  testType: TestType;
  parameters: Record<string, any>;
  baselineMetrics: Record<string, number>;
  acceptableDegradation: number; // percentage
  timeout: number; // seconds
  retryCount: number;
  weight: number; // 0-1, relative importance
}

/**
 * Test schedule for regression testing
 */
export interface TestSchedule {
  frequency: 'continuous' | 'hourly' | 'daily' | 'weekly' | 'manual';
  timeWindow?: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday
  triggers: string[]; // Event triggers
}

/**
 * Quality gate for test validation
 */
export interface QualityGate {
  id: string;
  name: string;
  description: string;
  criteria: QualityCriterion[];
  action: 'pass' | 'fail' | 'warn';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Quality criterion for gate evaluation
 */
export interface QualityCriterion {
  id?: string; // Optional id for identification
  metric: string;
  operator: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  threshold: number;
  weight: number; // 0-1, relative importance
}

/**
 * Ablation study for component analysis
 */
export interface AblationStudy {
  id: string;
  name: string;
  description: string;
  components: AblationComponent[];
  variations: AblationVariation[];
  metrics: string[];
  baseline: AblationBaseline;
  results: AblationResult[];
  metadata: Record<string, any>;
}

/**
 * Component for ablation analysis
 */
export interface AblationComponent {
  id: string;
  name: string;
  description: string;
  category: string;
  importance: number; // 0-1, estimated importance
  dependencies: string[];
  metadata: Record<string, any>;
}

/**
 * Variation for ablation testing
 */
export interface AblationVariation {
  id: string;
  name: string;
  description: string;
  componentChanges: ComponentChange[];
  expectedImpact: string;
  priority: number;
}

/**
 * Component change for ablation variation
 */
export interface ComponentChange {
  componentId: string;
  changeType: 'disable' | 'modify' | 'replace';
  parameters: Record<string, any>;
}

/**
 * Baseline for ablation comparison
 */
export interface AblationBaseline {
  configuration: Record<string, any>;
  performance: Record<string, number>;
  timestamp: number;
}

/**
 * Result from ablation study
 */
export interface AblationResult {
  variationId: string;
  performance: Record<string, number>;
  impact: Record<string, number>; // Metric -> impact score
  significance: Record<string, number>; // Metric -> significance level
  timestamp: number;
  metadata: Record<string, any>;
}

/**
 * Test result for any validation test
 */
export interface TestResult {
  testId: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  score: number; // 0-1
  metrics: Record<string, number>;
  duration: number; // seconds
  attempts: number;
  error?: string;
  timestamp: number;
  metadata: Record<string, any>;
}

/**
 * Curriculum configuration
 */
export interface CurriculumConfig {
  maxConcurrentObjectives: number;
  adaptiveLearningEnabled: boolean;
  regressionTestingEnabled: boolean;
  ablationStudyEnabled: boolean;
  qualityGatesEnabled: boolean;
  performanceTrackingEnabled: boolean;
  defaultTimeout: number; // seconds
  maxRetries: number;
  metadata: Record<string, any>;
}

/**
 * Default curriculum configuration
 */
export const DEFAULT_CURRICULUM_CONFIG: CurriculumConfig = {
  maxConcurrentObjectives: 3,
  adaptiveLearningEnabled: true,
  regressionTestingEnabled: true,
  ablationStudyEnabled: true,
  qualityGatesEnabled: true,
  performanceTrackingEnabled: true,
  defaultTimeout: 300, // 5 minutes
  maxRetries: 3,
  metadata: {},
};

/**
 * Curriculum statistics
 */
export interface CurriculumStats {
  totalObjectives: number;
  completedObjectives: number;
  activeObjectives: number;
  averageCompletionTime: number; // minutes
  successRate: number; // 0-1
  regressionTestPassRate: number; // 0-1
  ablationStudiesCompleted: number;
  qualityGatePassRate: number; // 0-1
  metadata: Record<string, any>;
}

/**
 * Progress tracking for curriculum
 */
export interface ProgressTracker {
  learnerId: string;
  curriculumId: string;
  currentLevel: number;
  completedObjectives: string[];
  activeObjectives: string[];
  nextObjectives: string[];
  estimatedCompletion: number; // minutes
  performanceTrend: PerformanceTrend;
  adaptations: Adaptation[];
  metadata: Record<string, any>;
}

/**
 * Performance trend analysis
 */
export interface PerformanceTrend {
  direction: 'improving' | 'declining' | 'stable';
  slope: number; // Rate of change
  confidence: number; // 0-1
  factors: string[]; // Contributing factors
  recommendations: string[];
}
