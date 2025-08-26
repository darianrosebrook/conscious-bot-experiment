/**
 * Planning Test Utilities
 *
 * Centralized test utilities and mock factories for the planning package.
 * Replaces scattered mock objects with proper, isolated test utilities.
 *
 * @author @darianrosebrook
 */

import {
  Plan,
  PlanStep,
  PlanStatus,
  PlanStepStatus,
  Action,
  ActionType,
} from '../types';
import { IntegratedPlanningCoordinator } from '../integrated-planning-coordinator';
import { EnhancedGoalManager } from '../goal-formulation/enhanced-goal-manager';
import { EnhancedReactiveExecutor } from '../reactive-executor/enhanced-reactive-executor';

// ============================================================================
// Mock Planning System Components
// ============================================================================

/**
 * Creates a mock integrated planning coordinator for testing
 */
export function createMockIntegratedPlanningCoordinator(): jest.Mocked<IntegratedPlanningCoordinator> {
  return {
    planAndExecute: jest.fn().mockResolvedValue({
      primaryPlan: createMockPlan(),
      confidence: 0.8,
      alternatives: [],
    }),
    getCurrentPlan: jest.fn().mockReturnValue(createMockPlan()),
    updatePlan: jest.fn().mockResolvedValue(true),
    getPlanStatus: jest.fn().mockReturnValue(PlanStatus.EXECUTING),
    getPlanQueue: jest.fn().mockReturnValue([]),
    isPlanningActive: jest.fn().mockReturnValue(true),
  } as any;
}

/**
 * Creates a mock enhanced goal manager for testing
 */
export function createMockEnhancedGoalManager(): jest.Mocked<EnhancedGoalManager> {
  return {
    // Real methods from EnhancedGoalManager
    formulateGoals: jest.fn().mockResolvedValue({
      identifiedNeeds: [],
      generatedGoals: [],
      priorityRanking: [],
      processingTime: 0,
      breakdown: {
        signalProcessing: 0,
        goalGeneration: 0,
        priorityScoring: 0,
      },
    }),
    processSignalType: jest.fn().mockResolvedValue({
      identifiedNeeds: [],
      generatedGoals: [],
      priorityRanking: [],
      processingTime: 0,
      breakdown: {
        signalProcessing: 0,
        goalGeneration: 0,
        priorityScoring: 0,
      },
    }),
    generateGoalsForNeed: jest.fn().mockResolvedValue({
      identifiedNeeds: [],
      generatedGoals: [],
      priorityRanking: [],
      processingTime: 0,
      breakdown: {
        signalProcessing: 0,
        goalGeneration: 0,
        priorityScoring: 0,
      },
    }),
    getGoalAnalysis: jest.fn().mockReturnValue({}),
    updateGoalStatus: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({
      signalProcessingLatency: 0,
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
    }),
    getGoalHistory: jest.fn().mockReturnValue([]),
    getNeedHistory: jest.fn().mockReturnValue([]),
    resetMetrics: jest.fn(),
    listGoals: jest.fn().mockReturnValue([]),
    getGoalsByStatus: jest.fn().mockReturnValue([]),
    getGoalsByType: jest.fn().mockReturnValue([]),
    cleanupGoals: jest.fn(),

    // Mock methods for backward compatibility with planning system
    getCurrentGoals: jest.fn().mockReturnValue([]),
    getActiveGoals: jest.fn().mockReturnValue([]),
    getGoalCount: jest.fn().mockReturnValue(0),
    getCurrentTasks: jest.fn().mockReturnValue([]),
    getCompletedTasks: jest.fn().mockReturnValue([]),
    addTask: jest.fn().mockResolvedValue(true),
  } as any;
}

/**
 * Creates a mock enhanced reactive executor for testing
 */
export function createMockEnhancedReactiveExecutor(): jest.Mocked<EnhancedReactiveExecutor> {
  return {
    isExecuting: jest.fn().mockReturnValue(false),
    executeNextTask: jest.fn().mockResolvedValue({ success: true }),
    getCurrentAction: jest.fn().mockReturnValue(null),
    getActionQueue: jest.fn().mockReturnValue([]),
    executeTask: jest.fn().mockResolvedValue({ success: true }),
    executePlan: jest.fn().mockResolvedValue({ success: true }),
    getMetrics: jest.fn().mockReturnValue({
      isExecuting: false,
      currentAction: null,
      actionQueue: [],
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
    }),
  } as any;
}

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Creates a mock plan for testing
 */
export function createMockPlan(overrides: Partial<Plan> = {}): Plan {
  const basePlan: Plan = {
    id: `test-plan-${Date.now()}`,
    goalId: `test-goal-${Date.now()}`,
    steps: [createMockPlanStep()],
    status: PlanStatus.EXECUTING,
    priority: 0.8,
    estimatedDuration: 30000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    successProbability: 0.8,
  };

  return {
    ...basePlan,
    ...overrides,
  };
}

/**
 * Creates a mock plan step for testing
 */
export function createMockPlanStep(
  overrides: Partial<PlanStep> = {}
): PlanStep {
  const baseStep: PlanStep = {
    id: `test-step-${Date.now()}`,
    planId: `test-plan-${Date.now()}`,
    action: createMockAction(),
    preconditions: [],
    effects: [],
    status: PlanStepStatus.PENDING,
    order: 1,
    estimatedDuration: 5000,
    dependencies: [],
  };

  return {
    ...baseStep,
    ...overrides,
  };
}

/**
 * Creates a mock action for testing
 */
export function createMockAction(overrides: Partial<Action> = {}): Action {
  const baseAction: Action = {
    id: `test-action-${Date.now()}`,
    name: 'test_action',
    description: 'Test action for testing',
    type: ActionType.INTERACTION,
    parameters: { test: true },
    preconditions: [],
    effects: [],
    cost: 1,
    duration: 5000,
    successProbability: 0.8,
  };

  return {
    ...baseAction,
    ...overrides,
  };
}

/**
 * Creates a mock task for testing
 */
export function createMockTask(overrides: any = {}) {
  return {
    id: `test-task-${Date.now()}`,
    type: 'mine',
    description: 'Test task for testing',
    priority: 0.5,
    urgency: 0.5,
    status: 'pending',
    createdAt: Date.now(),
    completedAt: null,
    autonomous: false,
    parameters: {},
    goal: 'test_goal',
    ...overrides,
  };
}

/**
 * Creates a mock goal for testing
 */
export function createMockGoal(overrides: any = {}) {
  return {
    id: `test-goal-${Date.now()}`,
    type: 'survival',
    description: 'Test goal for testing',
    priority: 0.8,
    urgency: 0.6,
    status: 'active',
    createdAt: Date.now(),
    completedAt: null,
    parameters: {},
    ...overrides,
  };
}

/**
 * Creates a mock signal for testing
 */
export function createMockSignal(overrides: any = {}) {
  return {
    type: 'test_signal',
    intensity: 0.5,
    source: 'test',
    timestamp: Date.now(),
    metadata: {},
    ...overrides,
  };
}

/**
 * Creates a mock world state for testing
 */
export function createMockWorldState(overrides: any = {}) {
  return {
    botStatus: {
      health: 20,
      food: 20,
      position: { x: 0, y: 64, z: 0 },
    },
    inventory: {
      items: [],
      emptySlots: 36,
    },
    environment: {
      timeOfDay: 6000,
      lightLevel: 15,
      nearbyEntities: [],
    },
    ...overrides,
  };
}

/**
 * Creates a mock planning context for testing
 */
export function createMockPlanningContext(overrides: any = {}) {
  return {
    worldState: createMockWorldState(),
    botStatus: { health: 20, food: 20 },
    activeGoals: [],
    availableResources: [],
    signalHistory: [],
    signalAnalysis: {
      threatLevel: 0,
      healthTrend: 'stable',
      resourceNeeds: [],
      environmentalHazards: [],
      urgencyScore: 0,
    },
    time: Date.now(),
    contextQuality: 'high',
    ...overrides,
  };
}

// ============================================================================
// Mock Planning System
// ============================================================================

/**
 * Creates a complete mock planning system for testing
 */
export function createMockPlanningSystem() {
  const mockCoordinator = createMockIntegratedPlanningCoordinator();
  const mockGoalManager = createMockEnhancedGoalManager();
  const mockReactiveExecutor = createMockEnhancedReactiveExecutor();

  return {
    goalFormulation: {
      getCurrentGoals: () => (mockGoalManager as any).getCurrentGoals(),
      getActiveGoals: () => (mockGoalManager as any).getActiveGoals(),
      getGoalCount: () => (mockGoalManager as any).getGoalCount(),
      getCurrentTasks: () => (mockGoalManager as any).getCurrentTasks(),
      getCompletedTasks: () => (mockGoalManager as any).getCompletedTasks(),
      addTask: (task: any) => (mockGoalManager as any).addTask(task),
      // Legacy properties for backward compatibility
      _tasks: [] as any[],
      _lastTaskExecution: 0,
      _failedTaskCount: 0,
      _maxConsecutiveFailures: 3,
    },
    hierarchicalPlanner: {
      getCurrentPlan: () => (mockCoordinator as any).getCurrentPlan(),
      updatePlan: (plan: any) => (mockCoordinator as any).updatePlan(plan),
      getPlanStatus: () => (mockCoordinator as any).getPlanStatus(),
      getPlanQueue: () => (mockCoordinator as any).getPlanQueue(),
      isPlanningActive: () => (mockCoordinator as any).isPlanningActive(),
    },
    reactiveExecutor: {
      isExecuting: () => (mockReactiveExecutor as any).isExecuting(),
      executeNextTask: async () =>
        (mockReactiveExecutor as any).executeNextTask(),
      getCurrentAction: () => (mockReactiveExecutor as any).getCurrentAction(),
      getActionQueue: () => (mockReactiveExecutor as any).getActionQueue(),
      executeTask: async (task: any) =>
        (mockReactiveExecutor as any).executeTask(task),
    },
    planAndExecute: async (signals: any[], context: any) => {
      return (mockCoordinator as any).planAndExecute(signals, context);
    },
  };
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Waits for a specified number of milliseconds
 */
export function waitForAsync(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a mock date for consistent testing
 */
export function createMockDate(timestamp: number = 1640995200000): Date {
  return new Date(timestamp);
}

/**
 * Resets all mocks and clears timers
 */
export function resetTestEnvironment() {
  jest.clearAllMocks();
  jest.clearAllTimers();
}

/**
 * Validates that a plan is valid
 */
export function expectValidPlan(plan: Plan) {
  expect(plan.id).toBeDefined();
  expect(plan.goalId).toBeDefined();
  expect(plan.steps).toBeDefined();
  expect(Array.isArray(plan.steps)).toBe(true);
  expect(plan.status).toBeDefined();
  expect(plan.priority).toBeGreaterThanOrEqual(0);
  expect(plan.priority).toBeLessThanOrEqual(1);
}

/**
 * Validates that a plan step is valid
 */
export function expectValidPlanStep(step: PlanStep) {
  expect(step.id).toBeDefined();
  expect(step.planId).toBeDefined();
  expect(step.action).toBeDefined();
  expect(step.status).toBeDefined();
  expect(step.order).toBeGreaterThan(0);
}

/**
 * Validates that an action is valid
 */
export function expectValidAction(action: Action) {
  expect(action.id).toBeDefined();
  expect(action.name).toBeDefined();
  expect(action.description).toBeDefined();
  expect(action.type).toBeDefined();
  expect(action.parameters).toBeDefined();
  expect(action.cost).toBeGreaterThanOrEqual(0);
  expect(action.duration).toBeGreaterThan(0);
  expect(action.successProbability).toBeGreaterThan(0);
  expect(action.successProbability).toBeLessThanOrEqual(1);
}

/**
 * Validates that a task is valid
 */
export function expectValidTask(task: any) {
  expect(task.id).toBeDefined();
  expect(task.type).toBeDefined();
  expect(task.description).toBeDefined();
  expect(task.priority).toBeGreaterThanOrEqual(0);
  expect(task.priority).toBeLessThanOrEqual(1);
  expect(task.status).toBeDefined();
  expect(task.createdAt).toBeDefined();
}

/**
 * Validates that a goal is valid
 */
export function expectValidGoal(goal: any) {
  expect(goal.id).toBeDefined();
  expect(goal.type).toBeDefined();
  expect(goal.description).toBeDefined();
  expect(goal.priority).toBeGreaterThanOrEqual(0);
  expect(goal.priority).toBeLessThanOrEqual(1);
  expect(goal.status).toBeDefined();
  expect(goal.createdAt).toBeDefined();
}

/**
 * Validates that a signal is valid
 */
export function expectValidSignal(signal: any) {
  expect(signal.type).toBeDefined();
  expect(signal.intensity).toBeGreaterThanOrEqual(0);
  expect(signal.intensity).toBeLessThanOrEqual(1);
  expect(signal.source).toBeDefined();
  expect(signal.timestamp).toBeDefined();
}

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Default test configuration
 */
export const TEST_CONFIG = {
  timeout: 5000,
  retries: 1,
  mockDelay: 100,
  defaultPriority: 0.5,
  defaultUrgency: 0.5,
  defaultSuccessProbability: 0.8,
} as const;

/**
 * Test environment setup
 */
export function setupTestEnvironment() {
  // Mock Date.now for consistent timestamps
  jest.spyOn(Date, 'now').mockImplementation(() => 1640995200000);

  // Mock console methods to reduce noise
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
}

/**
 * Test environment cleanup
 */
export function cleanupTestEnvironment() {
  jest.restoreAllMocks();
  jest.clearAllTimers();
}

// ============================================================================
// Type Exports
// ============================================================================

export type MockIntegratedPlanningCoordinator = ReturnType<
  typeof createMockIntegratedPlanningCoordinator
>;
export type MockEnhancedGoalManager = ReturnType<
  typeof createMockEnhancedGoalManager
>;
export type MockEnhancedReactiveExecutor = ReturnType<
  typeof createMockEnhancedReactiveExecutor
>;
export type MockPlanningSystem = ReturnType<typeof createMockPlanningSystem>;
