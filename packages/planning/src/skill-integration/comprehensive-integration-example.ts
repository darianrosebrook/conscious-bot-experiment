/**
 * Comprehensive Integration Example for Planning System
 *
 * Demonstrates integration between planning approaches including
 * skills, MCP capabilities, HTN, GOAP, and hybrid planning.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { Goal, GoalType, GoalStatus } from '../types';
import { BehaviorTreeRunner } from '../behavior-trees/BehaviorTreeRunner';
import { HybridSkillPlanner } from './hybrid-skill-planner';
// Temporary local type definition until @conscious-bot/memory is available
export class SkillRegistry {
  constructor() {}
  register(name: string, skill: any): void {
    console.log(`Registered skill: ${name}`);
  }
  getAllSkills(): any[] {
    return [];
  }
  recordSkillUsage(skillId: string, success: boolean, duration: number): void {
    console.log(
      `Recorded skill usage: ${skillId}, success: ${success}, duration: ${duration}`
    );
  }
  getSkill(id: string): any {
    return null;
  }
}
// Temporary local type definitions until @conscious-bot/core is available
export class EnhancedRegistry {
  constructor() {}
  register(name: string, handler: any): void {
    console.log(`Registered: ${name}`);
  }
  listCapabilities(): any[] {
    return [];
  }
  getCapability(id: string): any {
    return null;
  }
  executeShadowRun(context: any): any {
    return { success: true, data: null };
  }
}

export class DynamicCreationFlow {
  constructor() {}
  create(config: any): any {
    return { created: true, config };
  }
  checkImpasse(goal: string, context: any): any {
    return { success: false, reason: 'not implemented' };
  }
  proposeNewCapability(
    goal: string,
    context: any,
    currentTask: string,
    recentFailures: any[]
  ): any {
    return null;
  }
  executeShadowRun(context: any): any {
    return { success: true, data: null };
  }
}
import { HRMInspiredPlanner } from '../hierarchical-planner/hrm-inspired-planner';
import { EnhancedGOAPPlanner } from '../reactive-executor/goap-planner';

// Mock ToolExecutor for demonstration
class MockToolExecutor {
  async execute(tool: string, args: Record<string, any>): Promise<any> {
    console.log(`Mock executing tool: ${tool} with args:`, args);
    return { ok: true, data: { result: 'mock-success' } };
  }
}

// Mock skill registry
const mockSkillRegistry = new SkillRegistry();

// Mock MCP registry
const mockMCPRegistry = {
  queryCapabilities: async () => [],
  registerCapability: async () => true,
  unregisterCapability: async () => true,
} as unknown as EnhancedRegistry;

// Mock dynamic flow
const mockDynamicFlow = {
  createCapability: async () => ({ id: 'mock-capability' }),
  discoverCapabilities: async () => ({ capabilities: [] }),
} as unknown as DynamicCreationFlow;

// Mock planners
const mockHRMPlanner = new HRMInspiredPlanner();
const mockGOAPPlanner = new EnhancedGOAPPlanner();

// Create behavior tree runner with mock tool executor
const mockToolExecutor = new MockToolExecutor();
const btRunner = new BehaviorTreeRunner(mockToolExecutor);

// Create hybrid planner
const hybridPlanner = new HybridSkillPlanner(
  mockSkillRegistry,
  btRunner,
  mockHRMPlanner,
  mockGOAPPlanner,
  mockMCPRegistry,
  mockDynamicFlow
);

/**
 * Set up comprehensive planning system with all components
 */
export async function setupComprehensivePlanningSystem() {
  console.log('Setting up comprehensive planning system...');

  // Initialize components
  // Note: HybridSkillPlanner doesn't have an initialize method

  console.log('Comprehensive planning system ready');
  return hybridPlanner;
}

/**
 * Handle goal with comprehensive planning approach
 */
export async function handleGoalComprehensively(
  goal: Goal,
  context: any
): Promise<any> {
  console.log(`Handling goal: ${goal.description}`);

  const planningResult = await hybridPlanner.plan(goal.description, {
    goal: goal.description,
    constraints: [],
    domain: 'minecraft',
    urgency: context.urgency || 'medium',
    skillRegistry: mockSkillRegistry,
    worldState: context.worldState || {},
    availableResources: context.availableResources || {},
    timeConstraints: {
      urgency: context.urgency || 'medium',
      maxPlanningTime: context.maxPlanningTime || 5000,
    },
    planningPreferences: {
      preferSkills: true,
      preferMCP: true,
      preferHTN: true,
      preferGOAP: true,
      allowHybrid: true,
      preferSimple: false,
    },
    currentState: context.currentState || {},
    resources: context.resources || {},
    leafContext: context.leafContext || {},
  });

  return planningResult;
}

/**
 * Example complex survival goal
 */
export async function exampleComplexSurvivalGoal() {
  const survivalGoal: Goal = {
    id: 'survival_goal_1',
    type: GoalType.SURVIVAL,
    priority: 9,
    urgency: 8,
    utility: 0.9,
    description: 'Survive in hostile environment with limited resources',
    preconditions: [
      {
        id: 'precond_1',
        type: 'inventory' as any,
        condition: 'bot has basic tools',
        isSatisfied: true,
      },
    ],
    effects: [
      {
        id: 'effect_1',
        type: 'health_change' as any,
        description: 'Maintain health above critical level',
        magnitude: 0.8,
        duration: 3600000, // 1 hour
      },
    ],
    status: GoalStatus.ACTIVE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    subGoals: [],
  };

  const result = await handleGoalComprehensively(survivalGoal, {
    urgency: 'high',
    maxPlanningTime: 5000,
    worldState: { environment: 'hostile' },
    availableResources: { tools: 3, food: 5 },
    currentState: { health: 80 },
    resources: { health: 80, energy: 60 },
  });

  console.log('Survival goal result:', result);
  return result;
}

/**
 * Example exploration and discovery goal
 */
export async function exampleExplorationDiscoveryGoal() {
  const explorationGoal: Goal = {
    id: 'exploration_goal_1',
    type: GoalType.EXPLORATION,
    priority: 7,
    urgency: 5,
    utility: 0.8,
    description: 'Explore new territory and discover resources',
    preconditions: [
      {
        id: 'precond_1',
        type: 'skill' as any,
        condition: 'bot has movement skills',
        isSatisfied: true,
      },
    ],
    effects: [
      {
        id: 'effect_1',
        type: 'knowledge_gain' as any,
        description: 'New territory knowledge',
        magnitude: 0.7,
        duration: 7200000, // 2 hours
      },
    ],
    status: GoalStatus.ACTIVE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    subGoals: [],
  };

  const result = await handleGoalComprehensively(explorationGoal, {
    urgency: 'medium',
    maxPlanningTime: 3000,
    worldState: { territory: 'unknown' },
    availableResources: { energy: 100 },
    currentState: { position: [0, 0, 0] },
    resources: { energy: 100, tools: 2 },
  });

  console.log('Exploration goal result:', result);
  return result;
}

/**
 * Example creative building goal
 */
export async function exampleCreativeBuildingGoal() {
  const creativeBuildingGoal: Goal = {
    id: 'creative_building_goal_1',
    type: GoalType.CREATIVITY,
    priority: 6,
    urgency: 4,
    utility: 0.7,
    description: 'Design and construct an innovative building structure',
    preconditions: [
      {
        id: 'precond_1',
        type: 'inventory' as any,
        condition: 'bot has building materials',
        isSatisfied: true,
      },
    ],
    effects: [
      {
        id: 'effect_1',
        type: 'achievement_change' as any,
        description: 'Creative building completed',
        magnitude: 0.8,
        duration: 7200000, // 2 hours
      },
    ],
    status: GoalStatus.ACTIVE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    subGoals: [],
  };

  const result = await handleGoalComprehensively(creativeBuildingGoal, {
    urgency: 'low',
    maxPlanningTime: 4000,
    worldState: { environment: 'safe' },
    availableResources: { materials: 20, tools: 5 },
    currentState: { creativity: 70 },
    resources: { creativity: 70, energy: 80 },
  });

  console.log('Creative building goal result:', result);
  return result;
}

/**
 * Main comprehensive example function
 */
export async function runComprehensiveIntegrationExample() {
  console.log('Running Comprehensive Integration Example\n');

  try {
    // Run complex survival goal example
    await exampleComplexSurvivalGoal();

    // Run exploration and discovery goal example
    await exampleExplorationDiscoveryGoal();

    // Run creative building goal example
    await exampleCreativeBuildingGoal();

    console.log('\nComprehensive integration example completed successfully!');
  } catch (error) {
    console.error('Comprehensive integration example failed:', error);
  }
}
