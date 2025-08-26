/**
 * Planning System HTTP Server
 *
 * Provides HTTP API endpoints for the planning system.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';
import { CognitiveIntegration } from './cognitive-integration';
import {
  BehaviorTreeRunner,
  BTNodeStatus,
} from './behavior-trees/BehaviorTreeRunner';
import { CognitiveThoughtProcessor } from './cognitive-thought-processor';
import { HomeostasisState } from './types';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize tool executor that connects to Minecraft interface
const toolExecutor = {
  async execute(tool: string, args: Record<string, any>) {
    console.log(`Executing tool: ${tool} with args:`, args);

    try {
      // Map BT actions to Minecraft actions
      const mappedAction = mapBTActionToMinecraft(tool, args);

      // Execute the mapped action via Minecraft interface
      const response = await fetch('http://localhost:3005/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappedAction),
      });

      if (!response.ok) {
        throw new Error(`Minecraft interface returned ${response.status}`);
      }

      const result = await response.json();

      const typedResult = result as any;
      return {
        ok: typedResult.success,
        data: typedResult.result,
        environmentDeltas: {},
        error: typedResult.error,
      };
    } catch (error) {
      console.error(`Tool execution failed for ${tool}:`, error);
      return {
        ok: false,
        data: null,
        environmentDeltas: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Map Behavior Tree actions to Minecraft actions
 */
function mapBTActionToMinecraft(tool: string, args: Record<string, any>) {
  console.log(`🔧 Mapping BT action: ${tool} with args:`, args);

  // Add debugging info to the response
  const debugInfo = { originalAction: tool, args: args };

  switch (tool) {
    case 'scan_for_trees':
      // Look around for trees
      return {
        type: 'wait',
        parameters: {
          duration: 2000,
        },
      };

    case 'pathfind':
      // Move towards target
      return {
        type: 'move_forward',
        parameters: {
          distance: args.distance || 1,
        },
      };

    case 'scan_tree_structure':
      // Look up to scan tree structure
      return {
        type: 'wait',
        parameters: {
          duration: 1000,
        },
      };

    case 'dig_blocks':
      // Mine blocks (tree logs)
      return {
        type: 'mine_block',
        parameters: {
          position: args.position || 'current',
          tool: args.tool || 'axe',
        },
      };

    case 'collect_items':
      // Pick up items from ground
      return {
        type: 'pickup_item',
        parameters: {
          radius: args.radius || 3,
        },
      };

    // Building actions - map to primitive Minecraft actions
    case 'clear_3x3_area':
      // Clear a 3x3 area by mining blocks
      return {
        type: 'mine_block',
        parameters: {
          position: args.position || 'current',
          tool: args.tool || 'pickaxe',
          area: { x: 3, y: 2, z: 3 },
        },
        debug: debugInfo,
      };

    case 'place_blocks':
      console.log(`✅ Matched place_blocks action with args:`, args);
      // Place blocks according to pattern
      const pattern = args.pattern || 'single';
      const blockType = args.block || 'stone';

      console.log(`📦 Pattern: ${pattern}, BlockType: ${blockType}`);

      if (pattern === '3x3_floor') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_floor',
          },
        };
      } else if (pattern === '3x3_walls_2_high') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 12, // 4 walls * 3 blocks high
            placement: 'pattern_3x3_walls',
          },
        };
      } else if (pattern === '3x3_roof') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_roof',
          },
        };
      } else {
        // Default single block placement
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 1,
            placement: 'around_player',
          },
        };
      }

    case 'place_door':
      console.log(`✅ Matched place_door action with args:`, args);
      // Place a door at specified position
      return {
        type: 'place_block',
        parameters: {
          block_type: 'oak_door',
          count: 1,
          placement: 'specific_position',
          position: args.position || 'front_center',
        },
      };

    case 'place_torch':
      console.log(`✅ Matched place_torch action with args:`, args);
      // Place a torch for lighting
      return {
        type: 'place_block',
        parameters: {
          block_type: 'torch',
          count: 1,
          placement:
            args.position === 'center_wall'
              ? 'specific_position'
              : 'around_player',
          position: args.position || 'around_player',
        },
      };

    case 'wait':
      // Wait action
      return {
        type: 'wait',
        parameters: {
          duration: args.duration || 2000,
        },
      };

    default:
      // Unknown action, try to execute as-is
      console.log(
        `⚠️ Unknown BT action: ${tool}, falling through to default case`
      );
      return {
        type: tool,
        parameters: args,
        debug: debugInfo,
      };
  }
}

// Initialize Behavior Tree Runner
const btRunner = new BehaviorTreeRunner(toolExecutor);

// Initialize cognitive integration
const cognitiveIntegration = new CognitiveIntegration({
  reflectionEnabled: true,
  maxRetries: 3,
  failureThreshold: 0.3,
  successThreshold: 0.7,
});

// Initialize cognitive thought processor
const cognitiveThoughtProcessor = new CognitiveThoughtProcessor({
  enableThoughtToTaskTranslation: true,
  thoughtProcessingInterval: 30000, // 30 seconds
  maxThoughtsPerBatch: 5,
  planningEndpoint: 'http://localhost:3002',
  cognitiveEndpoint: 'http://localhost:3003',
});

// Initialize proper integrated planning system
import { IntegratedPlanningCoordinator } from './integrated-planning-coordinator';
import { EnhancedGoalManager } from './goal-formulation/enhanced-goal-manager';
import { EnhancedReactiveExecutor } from './reactive-executor/enhanced-reactive-executor';
import { Goal, GoalStatus } from './types';
import { EnhancedTaskIntegration } from './enhanced-task-integration';
import { EnhancedMemoryIntegration } from './enhanced-memory-integration';

// Initialize the integrated planning coordinator
const integratedPlanningCoordinator = new IntegratedPlanningCoordinator({
  hrmConfig: {
    hrmLatencyTarget: 100,
    qualityThreshold: 0.7,
    maxRefinements: 3,
    enableIterativeRefinement: true,
  },
  plannerConfig: {
    maxRefinements: 3,
    qualityThreshold: 0.8,
  },
});

// Initialize enhanced goal manager
const enhancedGoalManager = new EnhancedGoalManager();

// Initialize enhanced reactive executor
const enhancedReactiveExecutor = new EnhancedReactiveExecutor();

// Initialize enhanced task integration system
const enhancedTaskIntegration = new EnhancedTaskIntegration({
  enableRealTimeUpdates: true,
  enableProgressTracking: true,
  enableTaskStatistics: true,
  enableTaskHistory: true,
  maxTaskHistory: 1000,
  progressUpdateInterval: 5000,
  dashboardEndpoint: 'http://localhost:3000',
});

// Initialize enhanced memory integration system
const enhancedMemoryIntegration = new EnhancedMemoryIntegration({
  enableRealTimeUpdates: true,
  enableReflectiveNotes: true,
  enableEventLogging: true,
  dashboardEndpoint: 'http://localhost:3000',
  memorySystemEndpoint: 'http://localhost:3001',
  maxEvents: 100,
  maxNotes: 50,
});

// Set up event listeners for enhanced task integration
enhancedTaskIntegration.on('taskAdded', (task) => {
  console.log('Task added to enhanced integration:', task.title);
});

enhancedTaskIntegration.on(
  'taskProgressUpdated',
  ({ task, oldProgress, oldStatus }) => {
    console.log(
      `Task progress updated: ${task.title} - ${Math.round(task.progress * 100)}% (${oldStatus} -> ${task.status})`
    );
  }
);

enhancedTaskIntegration.on('taskStepCompleted', ({ task, step }) => {
  console.log(`Task step completed: ${task.title} - ${step.label}`);
});

enhancedTaskIntegration.on('taskStepStarted', ({ task, step }) => {
  console.log(`Task step started: ${task.title} - ${step.label}`);
});

// Set up event listeners for enhanced memory integration
enhancedMemoryIntegration.on('eventAdded', (event) => {
  console.log('Memory event added:', event.title);
});

enhancedMemoryIntegration.on('noteAdded', (note) => {
  console.log('Reflective note added:', note.title);
});

// Add some initial tasks for testing
setTimeout(() => {
  console.log('Adding initial tasks for testing...');

  enhancedTaskIntegration.addTask({
    title: 'Gather Wood',
    description: 'Collect wood from nearby trees for crafting',
    type: 'gathering',
    priority: 0.8,
    urgency: 0.7,
    source: 'autonomous',
    metadata: {
      category: 'survival',
      tags: ['wood', 'gathering', 'crafting'],
    },
  });

  enhancedTaskIntegration.addTask({
    title: 'Craft Wooden Pickaxe',
    description: 'Create a wooden pickaxe for mining stone',
    type: 'crafting',
    priority: 0.9,
    urgency: 0.8,
    source: 'autonomous',
    metadata: {
      category: 'crafting',
      tags: ['pickaxe', 'wood', 'tools'],
    },
  });

  enhancedTaskIntegration.addTask({
    title: 'Explore Cave System',
    description: 'Search for valuable resources in nearby caves',
    type: 'exploration',
    priority: 0.6,
    urgency: 0.5,
    source: 'autonomous',
    metadata: {
      category: 'exploration',
      tags: ['cave', 'mining', 'resources'],
    },
  });
}, 2000);

// Initialize planning system with proper integration
const planningSystem = {
  // Goal formulation with proper pipeline
  goalFormulation: {
    getCurrentGoals: () => enhancedGoalManager.listGoals(),
    getActiveGoals: () =>
      enhancedGoalManager.getGoalsByStatus(GoalStatus.PENDING),
    getGoalCount: () => enhancedGoalManager.listGoals().length,
    getCurrentTasks: () =>
      enhancedGoalManager
        .listGoals()
        .filter((g) => g.status === GoalStatus.PENDING),
    getCompletedTasks: () =>
      enhancedGoalManager.getGoalsByStatus(GoalStatus.COMPLETED),
    addTask: (task: any) => {
      // Convert task to goal format and add to goal manager
      const goal: Goal = {
        id: task.id || `goal-${Date.now()}`,
        type: task.type,
        priority: task.priority || 0.5,
        urgency: task.urgency || 0.5,
        utility: task.priority || 0.5,
        description: task.description,
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };
      enhancedGoalManager.upsert(goal);
    },
    addGoal: async (goal: any) => {
      // Add goal directly to goal manager
      const enhancedGoal: Goal = {
        id: goal.id || `goal-${Date.now()}`,
        type: goal.type,
        priority: goal.priority || 0.5,
        urgency: goal.urgency || 0.5,
        utility: goal.priority || 0.5,
        description: goal.description,
        preconditions: goal.preconditions || [],
        effects: goal.effects || [],
        status: GoalStatus.PENDING,
        createdAt: goal.createdAt || Date.now(),
        updatedAt: Date.now(),
        subGoals: goal.subGoals || [],
      };
      enhancedGoalManager.upsert(enhancedGoal);
      console.log(
        `Added new goal: ${enhancedGoal.type} - ${enhancedGoal.description}`
      );
      return enhancedGoal;
    },
    updateGoalStatus: (goalId: string, status: string) => {
      // Update goal status in goal manager
      const goals = enhancedGoalManager.listGoals();
      const goalIndex = goals.findIndex((g) => g.id === goalId);
      if (goalIndex >= 0) {
        const goal = goals[goalIndex];
        goal.status = status as GoalStatus;
        goal.updatedAt = Date.now();
        enhancedGoalManager.upsert(goal);
        console.log(`Updated goal status: ${goalId} -> ${status}`);
      } else {
        console.log(`Goal not found for status update: ${goalId}`);
      }
    },
    // Legacy properties for backward compatibility (will be removed in Phase 2)
    _tasks: [] as any[],
    _lastTaskExecution: 0,
    _failedTaskCount: 0,
    _maxConsecutiveFailures: 3,
  },

  // Hierarchical planner with proper integration
  hierarchicalPlanner: {
    getCurrentPlan: () => null, // IntegratedPlanningCoordinator doesn't expose current plan
    updatePlan: (plan: any) => {
      // IntegratedPlanningCoordinator handles plan updates internally
      console.log('Plan update requested:', plan);
    },
    getPlanStatus: () => 'idle', // Default status
    getPlanQueue: () => [], // No exposed queue
    isPlanningActive: () => false, // Default to inactive
  },

  // Reactive executor with proper integration
  reactiveExecutor: {
    isExecuting: () => enhancedReactiveExecutor.isExecuting(),
    executeNextTask: async () => enhancedReactiveExecutor.executeNextTask(),
    getCurrentAction: () => enhancedReactiveExecutor.getCurrentAction(),
    getActionQueue: () => enhancedReactiveExecutor.getActionQueue(),
    // Legacy method for backward compatibility (will be removed in Phase 2)
    executeTask: async (task: any) => {
      // Delegate to enhanced reactive executor
      return enhancedReactiveExecutor.executeTask(task);
    },
  },

  // Main planning pipeline method
  planAndExecute: async (signals: any[], context: any) => {
    try {
      // Use the integrated planning coordinator for the full pipeline
      const result = await integratedPlanningCoordinator.planAndExecute(
        signals,
        context
      );

      // If a plan was generated, execute it
      if (result.primaryPlan) {
        // Create proper MCP bus for execution
        const mcpBus = createMCPBus(context);

        const executionResult = await enhancedReactiveExecutor.execute(
          result.primaryPlan,
          context.worldState || {},
          mcpBus
        );

        // Note: executionResult is not part of IntegratedPlanningResult type
        // The result is returned separately
      }

      return result;
    } catch (error) {
      console.error('Planning and execution failed:', error);
      return {
        primaryPlan: null,
        alternativePlans: [],
        routingDecision: { router: 'fallback', reasoning: 'Planning failed' },
        planningApproach: 'fallback',
        confidence: 0,
        estimatedSuccess: 0,
        planningLatency: 0,
        goalFormulation: {
          identifiedNeeds: [],
          generatedGoals: [],
          priorityRanking: [],
        },
        planGeneration: { selectedPlan: null, alternativePlans: [] },
        qualityAssessment: { feasibilityScore: 0, optimalityScore: 0 },
        executionResult: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  },
};

/**
 * Create a proper MCP bus for plan execution
 */
function createMCPBus(context: any): any {
  return {
    executeAction: async (action: any) => {
      try {
        // Execute the action in Minecraft
        const result = await executeTaskInMinecraft(action);

        // Update context with execution results
        if (result.success && result.data) {
          // Update world state based on action results
          updateWorldStateFromAction(context, action, result.data);
        }

        return result;
      } catch (error) {
        console.error('MCP bus action execution failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    // Additional MCP bus methods for enhanced functionality
    getWorldState: () => context.worldState || {},
    getBotStatus: () => context.botStatus || {},
    getInventory: () => context.worldState?.inventory || {},
    getEnvironment: () => context.worldState?.environment || {},

    // Signal processing methods
    emitSignal: (signal: any) => {
      // Add signal to context for processing
      if (!context.signalHistory) {
        context.signalHistory = [];
      }
      context.signalHistory.push({
        ...signal,
        timestamp: Date.now(),
      });
    },

    // Planning coordination methods
    updatePlan: (plan: any) => {
      // Update the current plan in context
      context.currentPlan = plan;
    },

    getPlanStatus: () => context.currentPlan?.status || 'unknown',
  };
}

/**
 * Update world state based on action execution results
 */
function updateWorldStateFromAction(
  context: any,
  action: any,
  resultData: any
): void {
  if (!context.worldState) {
    context.worldState = {};
  }

  // Update inventory if items were added/removed
  if (resultData.inventoryChange) {
    if (!context.worldState.inventory) {
      context.worldState.inventory = { items: [] };
    }

    // Apply inventory changes
    Object.entries(resultData.inventoryChange).forEach(([itemName, change]) => {
      const existingItem = context.worldState.inventory.items.find(
        (item: any) => item.name === itemName
      );

      if (existingItem) {
        existingItem.count += change as number;
        if (existingItem.count <= 0) {
          context.worldState.inventory.items =
            context.worldState.inventory.items.filter(
              (item: any) => item.name !== itemName
            );
        }
      } else if ((change as number) > 0) {
        context.worldState.inventory.items.push({
          name: itemName,
          count: change as number,
        });
      }
    });
  }

  // Update position if movement occurred
  if (resultData.position) {
    if (!context.worldState.botStatus) {
      context.worldState.botStatus = {};
    }
    context.worldState.botStatus.position = resultData.position;
  }

  // Update health/food if changed
  if (resultData.health !== undefined) {
    if (!context.worldState.botStatus) {
      context.worldState.botStatus = {};
    }
    context.worldState.botStatus.health = resultData.health;
  }

  if (resultData.food !== undefined) {
    if (!context.worldState.botStatus) {
      context.worldState.botStatus = {};
    }
    context.worldState.botStatus.food = resultData.food;
  }
}

/**
 * Validate if a task was actually completed successfully
 */
function validateTaskCompletion(task: any, result: any): boolean {
  // Check if the result indicates success
  if (!result || result.error) {
    return false;
  }

  // Check if the bot is connected and ready
  if (result.botStatus && result.botStatus.connected === false) {
    return false;
  }

  // For crafting tasks, check if the item was actually crafted
  if (task.type === 'craft') {
    return (
      result.success === true &&
      !result.error &&
      (result.data?.craftedItems?.length > 0 || result.item)
    );
  }

  // For mining tasks, check if any blocks were successfully mined
  if (task.type === 'mine') {
    const hasMinedBlocks =
      result.data?.minedBlocks?.length > 0 ||
      result.results?.some((r: any) => r.success);
    const hasInventoryChange =
      result.inventoryChange && Object.keys(result.inventoryChange).length > 0;
    const hasChatMessage =
      result.chatMessage &&
      (result.chatMessage.includes('mined') ||
        result.chatMessage.includes('dug'));

    return (
      result.success === true &&
      !result.error &&
      (hasMinedBlocks || hasInventoryChange || hasChatMessage)
    );
  }

  // For building tasks, check if something was actually built
  if (task.type === 'build') {
    return (
      result.success === true &&
      !result.error &&
      (result.data?.builtStructure || result.results?.length > 0)
    );
  }

  // For gathering tasks, check if items were actually collected
  if (task.type === 'gather') {
    const hasGatheredItems =
      result.data?.gatheredItems?.length > 0 || result.results?.length > 0;
    const hasInventoryChange =
      result.inventoryChange && Object.keys(result.inventoryChange).length > 0;
    const hasChatMessage =
      result.chatMessage &&
      (result.chatMessage.includes('found') ||
        result.chatMessage.includes('collected'));

    return (
      result.success === true &&
      !result.error &&
      (hasGatheredItems || hasInventoryChange || hasChatMessage)
    );
  }

  // For movement tasks, check if the bot actually moved
  if (task.type === 'move' || task.type === 'navigate') {
    return (
      result.success === true &&
      !result.error &&
      (result.data?.distanceTraveled > 0 || result.results?.length > 0)
    );
  }

  // For flee tasks, check if defensive action was taken
  if (task.type === 'flee') {
    return (
      result.success === true &&
      !result.error &&
      (result.defensive === true || result.results?.length > 0)
    );
  }

  // For explore tasks, check if exploration was attempted
  if (task.type === 'explore') {
    return (
      result.success === true &&
      !result.error &&
      (result.type === 'exploration' || result.results?.length > 0)
    );
  }

  // For heal tasks, check if healing was attempted
  if (task.type === 'heal') {
    return (
      result.success === true &&
      !result.error &&
      (result.defensive === true || result.results?.length > 0)
    );
  }

  // For place_light tasks, check if lighting was placed
  if (task.type === 'place_light') {
    return (
      result.success === true &&
      !result.error &&
      (result.defensive === true || result.results?.length > 0)
    );
  }

  // For seek_shelter tasks, check if shelter was sought
  if (task.type === 'seek_shelter') {
    return (
      result.success === true &&
      !result.error &&
      (result.defensive === true || result.results?.length > 0)
    );
  }

  // For turn tasks, check if turning was attempted
  if (task.type === 'turn') {
    return (
      result.success === true &&
      !result.error &&
      (result.results?.length > 0 || result.botStatus)
    );
  }

  // For chat tasks, check if message was sent
  if (task.type === 'chat') {
    return (
      result.success === true &&
      !result.error &&
      (result.results?.length > 0 || result.botStatus)
    );
  }

  // For farm tasks, check if farming was attempted
  if (task.type === 'farm') {
    return (
      result.success === true &&
      !result.error &&
      (result.type === 'farming' || result.results?.length > 0)
    );
  }

  // For other task types, require explicit success and no errors
  if (result.success === false || result.error) {
    return false;
  }

  // If we have any form of execution evidence, consider it successful
  if (
    result.results?.length > 0 ||
    result.botStatus ||
    result.type ||
    result.defensive
  ) {
    return true;
  }

  return false;
}

/**
 * Generate a task from cognitive feedback suggestions
 */
function generateTaskFromSuggestions(suggestions: string[]): any | null {
  // Parse suggestions to determine task type
  for (const suggestion of suggestions) {
    if (suggestion.includes('different task type')) {
      return generateAlternativeTask({ type: 'unknown' });
    } else if (suggestion.includes('Explore the environment')) {
      return {
        id: `explore-task-${Date.now()}`,
        type: 'explore',
        description: 'Explore the environment to find new resources',
        priority: 0.8,
        urgency: 0.6,
        parameters: { distance: 5, direction: 'forward' },
        goal: 'exploration',
        status: 'pending',
        createdAt: Date.now(),
        completedAt: null,
        autonomous: true,
        isAlternative: true,
      };
    } else if (suggestion.includes('Gather the required materials')) {
      return {
        id: `gather-task-${Date.now()}`,
        type: 'gather',
        description: 'Gather required materials for crafting',
        priority: 0.9,
        urgency: 0.8,
        parameters: { resource: 'wood', amount: 1 },
        goal: 'resource_gathering',
        status: 'pending',
        createdAt: Date.now(),
        completedAt: null,
        autonomous: true,
        isAlternative: true,
      };
    } else if (suggestion.includes('Try crafting simpler items')) {
      return {
        id: `craft-simple-task-${Date.now()}`,
        type: 'craft',
        description: 'Try crafting simpler items first',
        priority: 0.7,
        urgency: 0.5,
        parameters: { item: 'planks', quantity: 1 },
        goal: 'basic_crafting',
        status: 'pending',
        createdAt: Date.now(),
        completedAt: null,
        autonomous: true,
        isAlternative: true,
      };
    }
  }

  return null;
}

/**
 * Generate an alternative task when the current strategy is failing
 */
function generateAlternativeTask(failedTask: any): any {
  const alternativeTaskTypes = [
    {
      type: 'explore',
      description: 'Explore the surroundings to find resources',
      parameters: { distance: 3, direction: 'forward' },
    },
    {
      type: 'gather',
      description: 'Look for and collect nearby resources',
      parameters: { resource: 'wood', amount: 1 },
    },
    {
      type: 'move',
      description: 'Move to a different location',
      parameters: { distance: 2, direction: 'forward' },
    },
  ];

  // Select a different task type than the failed one
  const availableTypes = alternativeTaskTypes.filter(
    (t) => t.type !== failedTask.type
  );
  const selectedType =
    availableTypes[Math.floor(Math.random() * availableTypes.length)];

  return {
    id: `alt-task-${Date.now()}`,
    type: selectedType.type,
    description: selectedType.description,
    priority: 0.7, // Higher priority for alternative tasks
    urgency: 0.6,
    parameters: selectedType.parameters,
    goal: 'alternative_strategy',
    status: 'pending',
    createdAt: Date.now(),
    completedAt: null,
    autonomous: true,
    isAlternative: true, // Mark as alternative strategy
  };
}

// Goal-driven autonomous task generation using real planning system
async function generateAutonomousTask() {
  try {
    // Use the real planning system to generate tasks based on current goals
    const signals = await generateWorldSignals();
    const context = await createPlanningContext();

    // Get current goals from the planning system
    const currentGoals = planningSystem.goalFormulation.getCurrentGoals();

    // If we have active goals, generate a task from the highest priority goal
    if (currentGoals && currentGoals.length > 0) {
      const highestPriorityGoal = currentGoals.reduce(
        (prev: any, current: any) =>
          current.priority > prev.priority ? current : prev
      );

      // Generate task from goal using the planning system
      const task = await generateTaskFromGoal(highestPriorityGoal, context);
      if (task) {
        return task;
      }
    }

    // If no goals exist, proactively generate goals based on current situation
    console.log(
      'No active goals found, generating new goals based on current situation...'
    );
    const newGoals = await generateProactiveGoals(signals, context);

    if (newGoals && newGoals.length > 0) {
      // Add the new goals to the planning system
      for (const goal of newGoals) {
        await planningSystem.goalFormulation.addGoal(goal);
      }

      // Generate a task from the highest priority new goal
      const highestPriorityGoal = newGoals.reduce((prev: any, current: any) =>
        current.priority > prev.priority ? current : prev
      );

      const task = await generateTaskFromGoal(highestPriorityGoal, context);
      if (task) {
        return task;
      }
    }

    // If no goals or task generation failed, create a fallback task
    return await generateFallbackTask(context);
  } catch (error) {
    console.error('Error in goal-driven task generation:', error);

    // Emergency fallback - create a basic exploration task
    return {
      id: `fallback-task-${Date.now()}`,
      type: 'explore',
      description: 'Explore the area for resources and opportunities',
      priority: 0.5,
      urgency: 0.3,
      parameters: { distance: 10, direction: 'forward' },
      goal: 'exploration',
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      fallback: true,
    };
  }
}

// Generate task from a specific goal
async function generateTaskFromGoal(goal: any, context: any) {
  try {
    console.log(
      `🔧 Generating task for goal: ${goal.type} - ${goal.description}`
    );

    // Direct mapping of goal types to task types
    let taskType = '';
    let taskDescription = '';
    let taskParameters = {};

    switch (goal.type) {
      case 'resource_tools':
        taskType = 'craft';
        taskDescription = 'Craft wooden pickaxe for resource gathering';
        taskParameters = { item: 'wooden_pickaxe', quantity: 1 };
        break;

      case 'resource_gathering':
        if (goal.parameters?.resource === 'wood') {
          taskType = 'gather';
          taskDescription = 'Gather wood from nearby trees';
          taskParameters = { resource: 'wood', amount: 5, target: 'tree' };
        } else if (goal.parameters?.resource === 'stone') {
          taskType = 'gather';
          taskDescription = 'Gather stone for tools and building';
          taskParameters = {
            resource: 'stone',
            amount: 3,
            target: 'stone_blocks',
          };
        } else {
          taskType = 'gather';
          taskDescription = goal.description;
          taskParameters = goal.parameters || {};
        }
        break;

      case 'exploration':
        taskType = 'explore';
        taskDescription = 'Explore the environment for resources';
        taskParameters = { distance: 15, direction: 'forward' };
        break;

      case 'survival_safety':
        taskType = 'move';
        taskDescription = 'Find safe shelter for night';
        taskParameters = { direction: 'forward', distance: 10 };
        break;

      case 'survival_healing':
        taskType = 'gather';
        taskDescription = 'Find food for healing';
        taskParameters = { resource: 'food', target: 'apple_tree_or_animal' };
        break;

      case 'survival_food':
        taskType = 'gather';
        taskDescription = 'Find food to maintain hunger';
        taskParameters = { resource: 'food', target: 'apple_tree_or_animal' };
        break;

      case 'defense_equipment':
        taskType = 'craft';
        taskDescription = 'Craft armor for protection';
        taskParameters = { item: 'leather_helmet', quantity: 1 };
        break;

      default:
        // Fallback to exploration for unknown goal types
        taskType = 'explore';
        taskDescription = 'Explore the environment';
        taskParameters = { distance: 10, direction: 'forward' };
        break;
    }

    const task = {
      id: `goal-task-${Date.now()}`,
      type: taskType,
      description: taskDescription,
      priority: goal.priority,
      urgency: goal.urgency || 0.5,
      parameters: taskParameters,
      goal: goal.id,
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      goalDriven: true,
      metadata: {
        goalId: goal.id,
        goalType: goal.type,
      },
    };

    console.log(`✅ Generated task: ${task.type} - ${task.description}`);
    return task;
  } catch (error) {
    console.error('Error generating task from goal:', error);
    return null;
  }
}

// Generate proactive goals based on current situation
async function generateProactiveGoals(signals: any, context: any) {
  const goals = [];
  const worldState = context.worldState || {};
  const botState = context.botState || {};
  const inventory = worldState.inventory || {};
  const environment = worldState.environment || {};

  console.log('Analyzing current situation for goal generation...');
  console.log('World state:', JSON.stringify(worldState, null, 2));
  console.log('Bot state:', JSON.stringify(botState, null, 2));

  // Check if it's night time (high priority for safety)
  const isNight = environment.timeOfDay > 13000 || environment.timeOfDay < 1000;
  if (isNight) {
    goals.push({
      id: `safety-night-${Date.now()}`,
      type: 'survival_safety',
      description: 'Find shelter and light sources for night safety',
      priority: 0.95,
      urgency: 0.9,
      parameters: { shelter_type: 'cave_or_house', light_sources: true },
      createdAt: Date.now(),
      autonomous: true,
    });
  }

  // Check health and hunger levels
  const health = botState.health || 20;
  const food = botState.food || 20;

  if (health < 15) {
    goals.push({
      id: `heal-${Date.now()}`,
      type: 'survival_healing',
      description: 'Restore health by finding healing items or food',
      priority: 0.9,
      urgency: 0.8,
      parameters: { target_health: 20, food_type: 'any' },
      createdAt: Date.now(),
      autonomous: true,
    });
  }

  if (food < 15) {
    goals.push({
      id: `food-${Date.now()}`,
      type: 'survival_food',
      description: 'Find food to maintain hunger levels',
      priority: 0.85,
      urgency: 0.7,
      parameters: { food_type: 'any', amount: 3 },
      createdAt: Date.now(),
      autonomous: true,
    });
  }

  // Check inventory for basic resources
  const hasWood = inventory.items?.some((item: any) =>
    item.type?.includes('wood')
  );
  const hasStone = inventory.items?.some((item: any) =>
    item.type?.includes('stone')
  );
  const hasTools = inventory.items?.some(
    (item: any) =>
      item.type?.includes('pickaxe') ||
      item.type?.includes('axe') ||
      item.type?.includes('sword')
  );
  const hasArmor = inventory.items?.some(
    (item: any) =>
      item.type?.includes('helmet') ||
      item.type?.includes('chestplate') ||
      item.type?.includes('leggings') ||
      item.type?.includes('boots')
  );

  // If no tools, prioritize tool crafting
  if (!hasTools) {
    goals.push({
      id: `tools-${Date.now()}`,
      type: 'resource_tools',
      description: 'Craft basic tools for resource gathering and defense',
      priority: 0.8,
      urgency: 0.6,
      parameters: { tool_type: 'wooden_pickaxe', material: 'wood' },
      createdAt: Date.now(),
      autonomous: true,
    });
  }

  // If no wood, gather wood (essential for crafting)
  if (!hasWood) {
    goals.push({
      id: `wood-${Date.now()}`,
      type: 'resource_gathering',
      description: 'Gather wood for crafting and building',
      priority: 0.75,
      urgency: 0.5,
      parameters: { resource: 'wood', amount: 5, target: 'tree' },
      createdAt: Date.now(),
      autonomous: true,
    });
  }

  // If no stone, gather stone (for better tools)
  if (!hasStone) {
    goals.push({
      id: `stone-${Date.now()}`,
      type: 'resource_gathering',
      description: 'Gather stone for better tools and building',
      priority: 0.7,
      urgency: 0.4,
      parameters: { resource: 'stone', amount: 3, target: 'stone_blocks' },
      createdAt: Date.now(),
      autonomous: true,
    });
  }

  // If no armor and we have resources, craft armor
  if (!hasArmor && (hasWood || hasStone)) {
    goals.push({
      id: `armor-${Date.now()}`,
      type: 'defense_equipment',
      description: 'Craft armor for better protection',
      priority: 0.65,
      urgency: 0.3,
      parameters: { armor_type: 'leather', material: 'leather_or_iron' },
      createdAt: Date.now(),
      autonomous: true,
    });
  }

  // Always have an exploration goal as fallback
  goals.push({
    id: `explore-${Date.now()}`,
    type: 'exploration',
    description:
      'Explore the environment to discover new resources and opportunities',
    priority: 0.5,
    urgency: 0.2,
    parameters: { distance: 15, direction: 'forward' },
    createdAt: Date.now(),
    autonomous: true,
  });

  console.log(
    `Generated ${goals.length} proactive goals:`,
    goals.map((g) => `${g.type}: ${g.description}`)
  );
  return goals;
}

// Generate fallback task when no goals are available
async function generateFallbackTask(context: any) {
  // Analyze current world state to determine appropriate fallback
  const worldState = context.worldState || {};
  const inventory = worldState.inventory || {};

  // Check what resources we have and what we might need
  const hasWood = inventory.items?.some((item: any) =>
    item.type?.includes('wood')
  );
  const hasStone = inventory.items?.some((item: any) =>
    item.type?.includes('stone')
  );
  const hasFood = inventory.items?.some((item: any) =>
    item.type?.includes('food')
  );
  const hasTools = inventory.items?.some(
    (item: any) => item.type?.includes('pickaxe') || item.type?.includes('axe')
  );

  // Generate appropriate fallback task based on current state
  if (!hasFood) {
    return {
      id: `fallback-food-${Date.now()}`,
      type: 'gather',
      description: 'Search for food to maintain health',
      priority: 0.7,
      urgency: 0.6,
      parameters: { resource: 'food', target: 'apple_tree_or_animal' },
      goal: 'survival_food',
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      fallback: true,
    };
  }

  if (!hasTools) {
    return {
      id: `fallback-tools-${Date.now()}`,
      type: 'craft',
      description: 'Craft basic tools for resource gathering',
      priority: 0.6,
      urgency: 0.5,
      parameters: { item: 'wooden_pickaxe', quantity: 1 },
      goal: 'survival_tools',
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      fallback: true,
    };
  }

  if (!hasWood) {
    return {
      id: `fallback-wood-${Date.now()}`,
      type: 'gather',
      description: 'Gather wood for crafting and building',
      priority: 0.5,
      urgency: 0.4,
      parameters: { resource: 'wood', amount: 3, target: 'tree' },
      goal: 'resource_gathering',
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      fallback: true,
    };
  }

  // Default exploration task
  return {
    id: `fallback-explore-${Date.now()}`,
    type: 'explore',
    description: 'Explore the area for new opportunities',
    priority: 0.4,
    urgency: 0.3,
    parameters: { distance: 15, direction: 'forward' },
    goal: 'exploration',
    status: 'pending',
    createdAt: Date.now(),
    completedAt: null,
    autonomous: true,
    fallback: true,
  };
}

// Continuous autonomous goal pursuit system
async function autonomousTaskExecutor() {
  const now = Date.now();
  const executionInterval = 5000; // 5 seconds between execution cycles

  // Check if enough time has passed since last execution
  if (
    now - planningSystem.goalFormulation._lastTaskExecution <
    executionInterval
  ) {
    return; // Not enough time has passed
  }

  try {
    // Step 1: Generate signals from current world state
    const signals = await generateWorldSignals();

    // Step 2: Create planning context
    const context = await createPlanningContext();

    // Step 3: Check if we have any active goals, if not generate them proactively
    const activeGoals = planningSystem.goalFormulation.getActiveGoals();
    if (!activeGoals || activeGoals.length === 0) {
      console.log('🔄 No active goals found, generating proactive goals...');
      const newGoals = await generateProactiveGoals(signals, context);

      if (newGoals && newGoals.length > 0) {
        console.log(`📋 Generated ${newGoals.length} proactive goals`);
        for (const goal of newGoals) {
          await planningSystem.goalFormulation.addGoal(goal);
        }
      }
    }

    // Step 4: Get the highest priority goal and execute it directly
    const availableGoals = planningSystem.goalFormulation.getActiveGoals();
    if (availableGoals && availableGoals.length > 0) {
      // Get the highest priority goal
      const highestPriorityGoal = availableGoals.reduce(
        (prev: any, current: any) =>
          current.priority > prev.priority ? current : prev
      );

      console.log(
        `🎯 Executing highest priority goal: ${highestPriorityGoal.type} - ${highestPriorityGoal.description}`
      );

      // Generate a task from the goal
      const task = await generateTaskFromGoal(highestPriorityGoal, context);

      if (task) {
        console.log(`📋 Generated task: ${task.type} - ${task.description}`);

        // Execute the task directly using the reactive executor
        const executionResult =
          await planningSystem.reactiveExecutor.executeTask(task);

        console.log(`✅ Task execution result:`, {
          success: executionResult.success,
          type: task.type,
          description: task.description,
        });

        // If task was successful, mark the goal as completed
        if (executionResult.success) {
          planningSystem.goalFormulation.updateGoalStatus(
            highestPriorityGoal.id,
            'completed'
          );
          console.log(`✅ Goal completed: ${highestPriorityGoal.type}`);
        } else {
          console.log(
            `❌ Task failed: ${task.type} - ${executionResult.error || 'Unknown error'}`
          );
        }
      } else {
        console.log(
          `❌ Failed to generate task from goal: ${highestPriorityGoal.type}`
        );
      }
    } else {
      console.log('⚠️ No goals available for execution');
    }

    // Step 5: Update execution timestamp
    planningSystem.goalFormulation._lastTaskExecution = now;

    // Log execution results
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Autonomous execution cycle completed:', {
        currentGoals: planningSystem.goalFormulation.getCurrentGoals().length,
        activeGoals: planningSystem.goalFormulation.getActiveGoals().length,
        completedGoals:
          planningSystem.goalFormulation.getCompletedTasks().length,
      });
    }
  } catch (error) {
    console.error('❌ Autonomous execution cycle failed:', error);
    planningSystem.goalFormulation._lastTaskExecution = now;
  }
}

// Enhanced real-time signal processing with context-aware decision making
async function generateWorldSignals(): Promise<any[]> {
  const signals = [];
  const signalHistory = getSignalHistory(); // Get recent signal history for context

  try {
    const minecraftUrl = 'http://localhost:3005';

    // Get bot status with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const [botStatus, worldState] = await Promise.allSettled([
      fetch(`${minecraftUrl}/health`, { signal: controller.signal }).then(
        (res) => res.json()
      ),
      fetch(`${minecraftUrl}/state`, { signal: controller.signal }).then(
        (res) => res.json()
      ),
    ]);

    clearTimeout(timeoutId);

    if (botStatus.status === 'rejected' || worldState.status === 'rejected') {
      throw new Error('Failed to fetch world state');
    }

    const botData = botStatus.value;
    const worldData = worldState.value;

    // Health signals with context-aware processing
    const typedBotData = botData as any;
    if (typedBotData.botStatus?.health !== undefined) {
      const health = typedBotData.botStatus.health;
      const healthSignal = {
        type: 'health',
        intensity: health < 50 ? 0.8 : health < 80 ? 0.4 : 0.1,
        source: 'homeostasis',
        timestamp: Date.now(),
        metadata: { health, maxHealth: 20 },
      };
      signals.push(healthSignal);
      addSignalToHistory(healthSignal);
    }

    // Inventory signals with context-aware processing
    const typedWorldData = worldData as any;
    if (typedWorldData.data?.worldState?.inventory?.items) {
      const items = typedWorldData.data.worldState.inventory.items;
      const hasFood = items.some(
        (item: any) =>
          item.type?.includes('food') || item.type?.includes('apple')
      );
      const hasTools = items.some(
        (item: any) =>
          item.type?.includes('pickaxe') || item.type?.includes('axe')
      );
      const hasWeapons = items.some(
        (item: any) =>
          item.type?.includes('sword') || item.type?.includes('bow')
      );

      if (!hasFood) {
        signals.push({
          type: 'hunger',
          intensity: 0.7,
          source: 'homeostasis',
          timestamp: Date.now(),
          metadata: { hasFood: false },
        });
      }

      if (!hasTools) {
        signals.push({
          type: 'tool_need',
          intensity: 0.6,
          source: 'homeostasis',
          timestamp: Date.now(),
          metadata: { hasTools: false },
        });
      }

      if (!hasWeapons) {
        signals.push({
          type: 'defense_need',
          intensity: 0.5,
          source: 'homeostasis',
          timestamp: Date.now(),
          metadata: { hasWeapons: false },
        });
      }
    }

    // Environment signals with context-aware processing
    if (typedWorldData.data?.worldState?.environment) {
      const env = typedWorldData.data.worldState.environment;

      // Time of day signals
      if (env.timeOfDay !== undefined) {
        const isNight = env.timeOfDay > 13000 || env.timeOfDay < 1000;
        if (isNight) {
          signals.push({
            type: 'night_vulnerability',
            intensity: 0.6,
            source: 'environment',
            timestamp: Date.now(),
            metadata: { timeOfDay: env.timeOfDay, isNight },
          });
        }
      }

      // Light level signals
      if (env.lightLevel !== undefined) {
        if (env.lightLevel < 8) {
          signals.push({
            type: 'low_light',
            intensity: 0.5,
            source: 'environment',
            timestamp: Date.now(),
            metadata: { lightLevel: env.lightLevel },
          });
        }
      }

      // Hostile entity signals
      if (env.nearbyEntities) {
        const hostiles = env.nearbyEntities.filter(
          (entity: any) =>
            entity.type === 'hostile' ||
            [
              'phantom',
              'zombie',
              'skeleton',
              'creeper',
              'spider',
              'enderman',
            ].includes(entity.name)
        );

        if (hostiles.length > 0) {
          signals.push({
            type: 'threat_detected',
            intensity: Math.min(0.9, hostiles.length * 0.3),
            source: 'environment',
            timestamp: Date.now(),
            metadata: {
              hostileCount: hostiles.length,
              nearestDistance: Math.min(
                ...hostiles.map((h: any) => h.distance || 999)
              ),
            },
          });
        }
      }
    }

    // Exploration signals (if no immediate needs)
    if (signals.length === 0) {
      signals.push({
        type: 'exploration',
        intensity: 0.3,
        source: 'curiosity',
        timestamp: Date.now(),
        metadata: { reason: 'no_immediate_needs' },
      });
    }
  } catch (error) {
    console.error('Failed to generate world signals:', error);
    // Fallback signal
    signals.push({
      type: 'exploration',
      intensity: 0.4,
      source: 'fallback',
      timestamp: Date.now(),
      metadata: { reason: 'signal_generation_failed' },
    });
  }

  // Apply context-aware processing to all signals
  const processedSignals = processSignalsWithContext(signals, signalHistory);

  // Add all signals to history for future context
  processedSignals.forEach((signal) => {
    if (
      !signalHistory.some(
        (h) => h.timestamp === signal.timestamp && h.type === signal.type
      )
    ) {
      addSignalToHistory(signal);
    }
  });

  return processedSignals;
}

// Signal history tracking for context-aware decision making
const signalHistory: Array<{
  type: string;
  intensity: number;
  source: string;
  timestamp: number;
  metadata: any;
}> = [];

const MAX_SIGNAL_HISTORY = 50; // Keep last 50 signals for context

function getSignalHistory() {
  const now = Date.now();
  const recentSignals = signalHistory.filter(
    (signal) => now - signal.timestamp < 300000 // Last 5 minutes
  );
  return recentSignals;
}

function addSignalToHistory(signal: any) {
  signalHistory.push({
    type: signal.type,
    intensity: signal.intensity,
    source: signal.source,
    timestamp: signal.timestamp,
    metadata: signal.metadata,
  });

  // Keep only the most recent signals
  if (signalHistory.length > MAX_SIGNAL_HISTORY) {
    signalHistory.splice(0, signalHistory.length - MAX_SIGNAL_HISTORY);
  }
}

// Context-aware signal processing
function processSignalsWithContext(signals: any[], history: any[]) {
  const processedSignals = [...signals];

  // Analyze signal patterns for context
  const recentThreatSignals = history.filter(
    (s) => s.type === 'threat_detected'
  );
  const recentHealthSignals = history.filter((s) => s.type === 'health');
  const recentFoodSignals = history.filter((s) => s.type === 'food_needed');

  // Context-aware signal enhancement
  processedSignals.forEach((signal) => {
    // Enhance threat signals based on recent history
    if (signal.type === 'threat_detected' && recentThreatSignals.length > 2) {
      signal.intensity = Math.min(1.0, signal.intensity + 0.2); // Escalating threat
      signal.metadata.escalating = true;
      signal.metadata.recentThreats = recentThreatSignals.length;
    }

    // Enhance health signals if health has been declining
    if (signal.type === 'health' && recentHealthSignals.length > 0) {
      const healthTrend = analyzeHealthTrend(recentHealthSignals);
      if (healthTrend === 'declining') {
        signal.intensity = Math.min(1.0, signal.intensity + 0.3);
        signal.metadata.trend = 'declining';
      }
    }

    // Enhance food signals if consistently needed
    if (signal.type === 'food_needed' && recentFoodSignals.length > 1) {
      signal.intensity = Math.min(1.0, signal.intensity + 0.1);
      signal.metadata.persistent = true;
    }
  });

  return processedSignals;
}

// Analyze health trend from recent signals
function analyzeHealthTrend(
  healthSignals: any[]
): 'stable' | 'declining' | 'improving' {
  if (healthSignals.length < 2) return 'stable';

  const recent = healthSignals.slice(-3); // Last 3 health signals
  const intensities = recent.map((s) => s.intensity);

  // Check if intensity is increasing (worse health) or decreasing (better health)
  const trend = intensities.reduce((acc, curr, i) => {
    if (i === 0) return 0;
    return acc + (curr - intensities[i - 1]);
  }, 0);

  if (trend > 0.1) return 'declining';
  if (trend < -0.1) return 'improving';
  return 'stable';
}

// Enhanced planning context with real-time processing and signal analysis
async function createPlanningContext(): Promise<any> {
  try {
    const minecraftUrl = 'http://localhost:3005';

    // Get data with timeout and error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const [botStatus, worldState] = await Promise.allSettled([
      fetch(`${minecraftUrl}/health`, { signal: controller.signal }).then(
        (res) => res.json()
      ),
      fetch(`${minecraftUrl}/state`, { signal: controller.signal }).then(
        (res) => res.json()
      ),
    ]);

    clearTimeout(timeoutId);

    if (botStatus.status === 'rejected' || worldState.status === 'rejected') {
      throw new Error('Failed to fetch world state for context');
    }

    const botData = botStatus.value;
    const worldData = worldState.value;

    // Get signal history for context-aware planning
    const recentSignals = getSignalHistory();
    const signalAnalysis = analyzeSignalPatterns(recentSignals);

    // Determine urgency based on signal analysis
    const urgency =
      signalAnalysis.threatLevel > 0.7
        ? 'emergency'
        : signalAnalysis.threatLevel > 0.4
          ? 'high'
          : signalAnalysis.urgencyScore > 0.5
            ? 'medium'
            : 'low';

    return {
      worldState: worldData.data?.worldState || {},
      currentState: {
        health: botData.botStatus?.health || 20,
        hunger: botData.botStatus?.hunger || 20,
        energy: botData.botStatus?.energy || 100,
        safety: 1 - signalAnalysis.threatLevel,
        curiosity: 0.5,
        social: 0.3,
        achievement: 0.4,
        creativity: 0.3,
        timestamp: Date.now(),
      },
      activeGoals: planningSystem.goalFormulation.getCurrentGoals() || [],
      availableResources: extractResources(
        worldData.data?.worldState?.inventory?.items || []
      ),
      timeConstraints: {
        urgency: urgency as 'low' | 'medium' | 'high' | 'emergency',
        maxPlanningTime: 5000, // 5 seconds
      },
      situationalFactors: {
        threatLevel: signalAnalysis.threatLevel,
        opportunityLevel: 1 - signalAnalysis.threatLevel,
        socialContext: [],
        environmentalFactors: signalAnalysis.environmentalHazards,
      },
    };
  } catch (error) {
    console.error('Failed to create planning context:', error);
    return {
      worldState: {},
      currentState: {
        health: 20,
        hunger: 20,
        energy: 100,
        safety: 1.0,
        curiosity: 0.5,
        social: 0.3,
        achievement: 0.4,
        creativity: 0.3,
        timestamp: Date.now(),
      },
      activeGoals: [],
      availableResources: [],
      timeConstraints: {
        urgency: 'low' as const,
        maxPlanningTime: 5000,
      },
      situationalFactors: {
        threatLevel: 0,
        opportunityLevel: 1.0,
        socialContext: [],
        environmentalFactors: [],
      },
    };
  }
}

// Analyze signal patterns for context-aware planning
function analyzeSignalPatterns(signals: any[]) {
  const analysis = {
    threatLevel: 0,
    healthTrend: 'stable' as 'stable' | 'declining' | 'improving',
    resourceNeeds: [] as string[],
    environmentalHazards: [] as string[],
    urgencyScore: 0,
  };

  // Analyze threat patterns
  const threatSignals = signals.filter((s) => s.type === 'threat_detected');
  analysis.threatLevel =
    threatSignals.reduce((sum, s) => sum + s.intensity, 0) /
    Math.max(threatSignals.length, 1);

  // Analyze health trends
  const healthSignals = signals.filter((s) => s.type === 'health');
  analysis.healthTrend = analyzeHealthTrend(healthSignals);

  // Analyze resource needs
  const resourceSignals = signals.filter(
    (s) =>
      s.type === 'hunger' || s.type === 'tool_need' || s.type === 'defense_need'
  );
  analysis.resourceNeeds = resourceSignals.map((s) => s.type);

  // Analyze environmental hazards
  const envSignals = signals.filter(
    (s) => s.type === 'night_vulnerability' || s.type === 'low_light'
  );
  analysis.environmentalHazards = envSignals.map((s) => s.type);

  // Calculate overall urgency
  analysis.urgencyScore =
    signals.reduce((sum, s) => sum + s.intensity, 0) /
    Math.max(signals.length, 1);

  return analysis;
}

// Calculate context quality for planning decisions
function calculateContextQuality(
  botData: any,
  worldData: any,
  signals: any[]
): 'high' | 'medium' | 'low' | 'degraded' {
  let quality = 0;

  // Check data completeness
  if (botData.botStatus?.health !== undefined) quality += 25;
  if (worldData.data?.worldState?.inventory) quality += 25;
  if (worldData.data?.worldState?.environment) quality += 25;
  if (signals.length > 0) quality += 25;

  if (quality >= 90) return 'high';
  if (quality >= 70) return 'medium';
  if (quality >= 50) return 'low';
  return 'degraded';
}

// Extract available resources from inventory
function extractResources(items: any[]): any[] {
  return items.map((item: any) => ({
    type: item.type,
    count: item.count || 1,
    name: item.name || item.type,
  }));
}

// Helper function to execute tasks in Minecraft
async function executeTaskInMinecraft(task: any) {
  try {
    const minecraftUrl = 'http://localhost:3005';

    // Check if the bot is connected first
    const botStatus = await fetch(`${minecraftUrl}/health`).then((res) =>
      res.json()
    );
    const typedBotStatus = botStatus as any;

    // Enhanced verification: check both connection and health
    if (!typedBotStatus.executionStatus?.bot?.connected) {
      return {
        success: false,
        error: 'Bot not connected to Minecraft server',
        botStatus: botStatus,
        type: task.type,
      };
    }

    // Critical: Check if bot is actually alive (health > 0)
    if (!typedBotStatus.isAlive || typedBotStatus.botStatus?.health <= 0) {
      return {
        success: false,
        error: 'Bot is dead and cannot execute actions',
        botStatus: botStatus,
        type: task.type,
        botHealth: typedBotStatus.botStatus?.health || 0,
      };
    }

    // Additional verification: check if bot is responsive
    try {
      const stateCheck = await fetch(`${minecraftUrl}/state`, {
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });

      if (!stateCheck.ok) {
        return {
          success: false,
          error: 'Bot is not responsive to state requests',
          botStatus: botStatus,
          type: task.type,
        };
      }
    } catch (stateError) {
      return {
        success: false,
        error: 'Bot state check failed - bot may be unresponsive',
        botStatus: botStatus,
        type: task.type,
      };
    }

    // Helper function to get bot position
    const getBotPosition = async () => {
      try {
        const stateResponse = await fetch(`${minecraftUrl}/state`);
        const stateData = await stateResponse.json();
        return (
          stateData.data?.worldState?._minecraftState?.player?.position || {
            x: 0,
            y: 0,
            z: 0,
          }
        );
      } catch (error) {
        console.error('Failed to get bot position:', error);
        return { x: 0, y: 0, z: 0 };
      }
    };

    // Helper function to get bot inventory
    const getBotInventory = async () => {
      try {
        const stateResponse = await fetch(`${minecraftUrl}/state`);
        const stateData = await stateResponse.json();
        return stateData.data?.worldState?.inventory?.items || [];
      } catch (error) {
        console.error('Failed to get bot inventory:', error);
        return [];
      }
    };

    // Helper function to check if inventory changed
    const inventoryChanged = (
      before: any[],
      after: any[],
      targetItem?: string
    ) => {
      if (targetItem) {
        // Check if specific item count changed
        const beforeCount = before.filter(
          (item) => item.name === targetItem
        ).length;
        const afterCount = after.filter(
          (item) => item.name === targetItem
        ).length;
        return afterCount > beforeCount;
      }
      // Check if any items changed
      return before.length !== after.length;
    };

    // Helper function to check if positions are different
    const positionsAreDifferent = (pos1: any, pos2: any) => {
      const tolerance = 0.1; // Small tolerance for floating point precision
      return (
        Math.abs(pos1.x - pos2.x) > tolerance ||
        Math.abs(pos1.y - pos2.y) > tolerance ||
        Math.abs(pos1.z - pos2.z) > tolerance
      );
    };

    // Helper function to get block state at a specific position
    const getBlockState = async (position: any) => {
      try {
        const stateResponse = await fetch(`${minecraftUrl}/state`);
        const stateData = await stateResponse.json();
        const nearbyBlocks =
          stateData.data?.worldState?._minecraftState?.environment
            ?.nearbyBlocks || [];

        // Find the block at the specified position
        const block = nearbyBlocks.find(
          (block: any) =>
            block.position?.x === position.x &&
            block.position?.y === position.y &&
            block.position?.z === position.z
        );

        return block || { type: 'air', position, properties: {} };
      } catch (error) {
        console.error('Failed to get block state:', error);
        return { type: 'unknown', position, properties: {} };
      }
    };

    // Helper function to check if block state changed
    const blockStateChanged = (before: any, after: any) => {
      // Check if block type changed (e.g., stone -> air for mining, air -> stone for building)
      if (before.type !== after.type) {
        return true;
      }

      // Check if block properties changed
      if (
        JSON.stringify(before.properties) !== JSON.stringify(after.properties)
      ) {
        return true;
      }

      return false;
    };

    // Helper function to get multiple block states
    const getMultipleBlockStates = async (positions: any[]) => {
      const blockStates = [];
      for (const position of positions) {
        const blockState = await getBlockState(position);
        blockStates.push(blockState);
      }
      return blockStates;
    };

    switch (task.type) {
      case 'move':
        // Get position before movement
        const beforePosition = await getBotPosition();

        const result = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters?.distance || 1 },
          }),
        }).then((res) => res.json());

        // Verify the action actually succeeded
        if (!(result as any).success) {
          return {
            success: false,
            error: (result as any).error || 'Move action failed',
            botStatus: typedBotStatus,
            type: task.type,
          };
        }

        // Wait a moment for movement to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Get position after movement
        const afterPosition = await getBotPosition();

        // Verify the bot actually moved
        if (!positionsAreDifferent(beforePosition, afterPosition)) {
          return {
            success: false,
            error:
              'Move action reported success but bot did not change position',
            botStatus: typedBotStatus,
            type: task.type,
            beforePosition,
            afterPosition,
            actionData: (result as any).result?.data,
          };
        }

        return {
          ...(result as any),
          botStatus: typedBotStatus,
          beforePosition,
          afterPosition,
          distanceMoved: Math.sqrt(
            Math.pow(afterPosition.x - beforePosition.x, 2) +
              Math.pow(afterPosition.y - beforePosition.y, 2) +
              Math.pow(afterPosition.z - beforePosition.z, 2)
          ),
        };

      case 'move_forward':
        // Get position before movement
        const beforePositionForward = await getBotPosition();

        const moveForwardResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters?.distance || 1 },
          }),
        }).then((res) => res.json());

        // Verify the action actually succeeded
        if (!(moveForwardResult as any).success) {
          return {
            success: false,
            error:
              (moveForwardResult as any).error || 'Move forward action failed',
            botStatus: typedBotStatus,
            type: task.type,
          };
        }

        // Wait a moment for movement to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Get position after movement
        const afterPositionForward = await getBotPosition();

        // Verify the bot actually moved
        if (
          !positionsAreDifferent(beforePositionForward, afterPositionForward)
        ) {
          return {
            success: false,
            error:
              'Move forward action reported success but bot did not change position',
            botStatus: typedBotStatus,
            type: task.type,
            beforePosition: beforePositionForward,
            afterPosition: afterPositionForward,
            actionData: (moveForwardResult as any).result?.data,
          };
        }

        return {
          ...(moveForwardResult as any),
          botStatus: typedBotStatus,
          beforePosition: beforePositionForward,
          afterPosition: afterPositionForward,
          distanceMoved: Math.sqrt(
            Math.pow(afterPositionForward.x - beforePositionForward.x, 2) +
              Math.pow(afterPositionForward.y - beforePositionForward.y, 2) +
              Math.pow(afterPositionForward.z - beforePositionForward.z, 2)
          ),
        };

      case 'flee':
        // Flee by moving away from current position (simple implementation)
        const fleeResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters?.distance || 10 },
          }),
        }).then((res) => res.json());

        return {
          ...(fleeResult as any),
          botStatus: typedBotStatus,
          defensive: true,
        };

      case 'attack_entity':
        // Attack the nearest hostile entity
        const attackResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'attack_entity',
            parameters: {
              target: task.parameters?.target || 'nearest',
              weapon: task.parameters?.weapon || 'best_available',
            },
          }),
        }).then((res) => res.json());

        return {
          ...(attackResult as any),
          botStatus: typedBotStatus,
          defensive: true,
        };

      case 'heal':
        // Execute healing using Behavior Tree skills
        try {
          console.log(`Executing heal task with parameters:`, task.parameters);

          // Use food pipeline skill for healing
          const btResult = await btRunner.runOption(
            'opt.food_pipeline_starter',
            {
              food_type: task.parameters?.food_type || 'any',
              amount: task.parameters?.amount || 1,
            },
            {
              timeout: 15000,
              maxRetries: 1,
              enableGuards: true,
              streamTicks: true,
            }
          );

          return {
            success: btResult.status === 'success',
            action: 'opt.food_pipeline_starter',
            result: btResult,
            botStatus: botStatus,
            defensive: true,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            botStatus: botStatus,
            defensive: true,
          };
        }

      case 'place_light':
        // Place torches to create light (deters phantoms)
        const lightResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'place_block',
            parameters: {
              block_type: 'torch',
              count: task.parameters?.count || 3,
              placement: 'around_player',
            },
          }),
        }).then((res) => res.json());

        return {
          ...(lightResult as any),
          botStatus: typedBotStatus,
          defensive: true,
        };

      case 'seek_shelter':
        // Look for nearby caves or build a simple shelter
        const shelterResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'find_shelter',
            parameters: {
              shelter_type: task.parameters?.shelter_type || 'cave_or_house',
              light_sources: task.parameters?.light_sources || true,
            },
          }),
        }).then((res) => res.json());

        return {
          ...(shelterResult as any),
          botStatus: typedBotStatus,
          defensive: true,
        };

      case 'turn':
        const turnResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:
              task.parameters?.direction === 'left'
                ? 'turn_left'
                : 'turn_right',
            parameters: { angle: task.parameters?.angle || 90 },
          }),
        }).then((res) => res.json());

        return {
          ...(turnResult as any),
          botStatus: typedBotStatus,
        };

      case 'chat':
        const chatResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            parameters: {
              message:
                task.parameters?.message ||
                task.description ||
                'Executing task!',
            },
          }),
        }).then((res) => res.json());

        return {
          ...(chatResult as any),
          botStatus: typedBotStatus,
        };

      case 'explore':
        // Execute exploration by moving around and looking
        const exploreResults = [];
        exploreResults.push(
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'move_forward',
              parameters: { distance: task.parameters?.distance || 3 },
            }),
          }).then((res) => res.json())
        );

        exploreResults.push(
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Exploring: ${task.description}`,
              },
            }),
          }).then((res) => res.json())
        );

        return {
          results: exploreResults,
          type: 'exploration',
          success: true,
          error: undefined,
          botStatus: botStatus,
        };

      case 'gather':
        // Execute gathering using Behavior Tree skills
        const gatherResults = [];

        try {
          // Map task parameters to appropriate BT skill
          let skillId = 'opt.chop_tree_safe'; // Default for wood gathering
          let skillArgs = {
            target: task.parameters?.target || 'oak_log',
            amount: task.parameters?.amount || 1,
          };

          // Use appropriate skill based on resource type
          if (
            task.parameters?.resource === 'wood' ||
            task.parameters?.target === 'tree'
          ) {
            skillId = 'opt.chop_tree_safe';
          } else if (
            task.parameters?.resource === 'iron' ||
            task.parameters?.target === 'iron_ore'
          ) {
            skillId = 'opt.ore_ladder_iron';
          } else if (task.parameters?.resource === 'food') {
            skillId = 'opt.food_pipeline_starter';
          }

          console.log(`Executing BT skill: ${skillId} with args:`, skillArgs);

          // Execute the skill via Behavior Tree
          const btResult = await btRunner.runOption(skillId, skillArgs, {
            timeout: 30000,
            maxRetries: 2,
            enableGuards: true,
            streamTicks: true,
          });

          gatherResults.push({
            success: btResult.status === 'success',
            action: skillId,
            result: btResult,
            data: (btResult as any).data,
          });

          return {
            results: gatherResults,
            type: 'gathering',
            success: gatherResults.some((r: any) => r.success),
            error: undefined,
            botStatus: botStatus,
          };
        } catch (error) {
          return {
            results: gatherResults,
            type: 'gathering',
            success: false,
            error: error instanceof Error ? error.message : 'Gathering failed',
            botStatus: botStatus,
          };
        }

      case 'craft':
        // Execute actual crafting instead of just sending chat messages
        const craftResults = [];

        try {
          // Get inventory before crafting
          const beforeInventory = await getBotInventory();

          const itemToCraft = task.parameters?.item || 'item';

          // Check if we can actually craft the item
          const canCraft = await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'can_craft',
              parameters: { item: itemToCraft },
            }),
          }).then((res) => res.json());

          if ((canCraft as any).success && (canCraft as any).canCraft) {
            // Actually attempt to craft the item
            const craftResult = await fetch(`${minecraftUrl}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'craft_item',
                parameters: {
                  item: itemToCraft,
                  quantity: task.parameters?.quantity || 1,
                },
              }),
            }).then((res) => res.json());

            craftResults.push(craftResult);

            // Verify the action actually succeeded
            if (!(craftResult as any).success) {
              return {
                results: craftResults,
                type: 'crafting',
                success: false,
                error: (craftResult as any).error || 'Crafting action failed',
                item: itemToCraft,
                beforeInventory,
                afterInventory: beforeInventory,
              };
            }

            // Wait a moment for crafting to complete
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Get inventory after crafting
            const afterInventory = await getBotInventory();

            // Verify the bot actually gained the crafted item
            if (
              !inventoryChanged(beforeInventory, afterInventory, itemToCraft)
            ) {
              return {
                results: craftResults,
                type: 'crafting',
                success: false,
                error: `Crafting reported success but bot did not gain ${itemToCraft}`,
                item: itemToCraft,
                beforeInventory,
                afterInventory,
                actionData: craftResult,
              };
            }

            // Send a chat message to inform about the result
            craftResults.push(
              await fetch(`${minecraftUrl}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'chat',
                  parameters: {
                    message: `Successfully crafted ${itemToCraft}!`,
                  },
                }),
              }).then((res) => res.json())
            );

            return {
              results: craftResults,
              type: 'crafting',
              success: true,
              error: undefined,
              item: itemToCraft,
              beforeInventory,
              afterInventory,
              itemsGained:
                afterInventory.filter((item) => item.name === itemToCraft)
                  .length -
                beforeInventory.filter((item) => item.name === itemToCraft)
                  .length,
            };
          } else {
            // Cannot craft - send informative message
            craftResults.push(
              await fetch(`${minecraftUrl}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'chat',
                  parameters: {
                    message: `Cannot craft ${itemToCraft} - missing required materials`,
                  },
                }),
              }).then((res) => res.json())
            );

            return {
              results: craftResults,
              type: 'crafting',
              success: false,
              error: 'Missing required materials',
              item: itemToCraft,
              beforeInventory,
              afterInventory: beforeInventory,
            };
          }
        } catch (error) {
          // Fallback to chat message if crafting system is unavailable
          craftResults.push(
            await fetch(`${minecraftUrl}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'chat',
                parameters: {
                  message: `Crafting system unavailable - cannot craft ${task.parameters?.item || 'item'}`,
                },
              }),
            }).then((res) => res.json())
          );

          return {
            results: craftResults,
            type: 'crafting',
            success: false,
            error:
              error instanceof Error ? error.message : 'Crafting system error',
            item: task.parameters?.item || 'item',
            beforeInventory: [],
            afterInventory: [],
          };
        }

      case 'build':
        // Execute building by creating structures with block change verification
        const buildResults = [];

        // First, announce what we're doing
        buildResults.push(
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Building ${task.parameters?.structure || 'structure'}`,
              },
            }),
          }).then((res) => res.json())
        );

        // Get current bot position for building
        const buildGameState = await fetch(`${minecraftUrl}/state`)
          .then((res) => res.json())
          .catch(() => ({ position: { x: 0, y: 64, z: 0 } }));

        const buildBotPos = (buildGameState as any).position || {
          x: 0,
          y: 64,
          z: 0,
        };

        // Define building positions (simple structure)
        const buildingPositions = [
          { x: buildBotPos.x, y: buildBotPos.y + 1, z: buildBotPos.z }, // Block above
          { x: buildBotPos.x + 1, y: buildBotPos.y, z: buildBotPos.z }, // Block to the right
          { x: buildBotPos.x - 1, y: buildBotPos.y, z: buildBotPos.z }, // Block to the left
          { x: buildBotPos.x, y: buildBotPos.y, z: buildBotPos.z + 1 }, // Block in front
          { x: buildBotPos.x, y: buildBotPos.y, z: buildBotPos.z - 1 }, // Block behind
        ];

        // Get block states before building
        const beforeBuildBlockStates =
          await getMultipleBlockStates(buildingPositions);
        let successfulBuilding = false;
        let builtPosition = null;
        let beforeBuildBlockState = null;
        let afterBuildBlockState = null;

        // Try to build at each position
        for (let i = 0; i < buildingPositions.length; i++) {
          const position = buildingPositions[i];
          const beforeState = beforeBuildBlockStates[i];

          // Skip if block is already occupied (not air)
          if (beforeState.type !== 'air') {
            continue;
          }

          try {
            const buildResult = await fetch(`${minecraftUrl}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'place_block',
                parameters: {
                  position,
                  blockType: task.parameters?.blockType || 'stone',
                },
              }),
            }).then((res) => res.json());

            buildResults.push(buildResult);

            // If building action reported success, verify block actually changed
            if ((buildResult as any).success) {
              // Wait a moment for building to complete
              await new Promise((resolve) => setTimeout(resolve, 500));

              // Get block state after building
              const afterState = await getBlockState(position);

              // Verify the block actually changed (e.g., air -> stone)
              if (blockStateChanged(beforeState, afterState)) {
                console.log(
                  `✅ Successfully built block at ${JSON.stringify(position)}: ${beforeState.type} -> ${afterState.type}`
                );
                successfulBuilding = true;
                builtPosition = position;
                beforeBuildBlockState = beforeState;
                afterBuildBlockState = afterState;
                break;
              } else {
                console.log(
                  `⚠️ Building reported success but block didn't change at ${JSON.stringify(position)}`
                );
              }
            }
          } catch (error) {
            console.log(
              `⚠️ Failed to build at ${JSON.stringify(position)}:`,
              error
            );
          }
        }

        return {
          results: buildResults,
          type: 'building',
          success: successfulBuilding,
          error: successfulBuilding
            ? undefined
            : 'No blocks were successfully placed or block states did not change',
          verificationData: {
            beforeBuildBlockStates,
            builtPosition,
            beforeBuildBlockState,
            afterBuildBlockState,
            totalPositionsChecked: buildingPositions.length,
          },
        };

      case 'farm':
        // Execute farming by planting crops
        const farmResults = [];
        farmResults.push(
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Starting farm for ${task.parameters?.crop || 'crops'}`,
              },
            }),
          }).then((res) => res.json())
        );

        return {
          results: farmResults,
          type: 'farming',
          success: true,
          error: undefined,
        };

      case 'mine':
        // Execute mining by digging for resources with block change verification
        const mineResults = [];

        // First, announce what we're doing
        mineResults.push(
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Starting to mine for ${task.parameters?.resource || 'resources'}`,
              },
            }),
          }).then((res) => res.json())
        );

        // Get current bot position and look for blocks to mine nearby
        const gameState = await fetch(`${minecraftUrl}/state`)
          .then((res) => res.json())
          .catch(() => ({ position: { x: 0, y: 64, z: 0 } }));

        const botPos = (gameState as any).position || { x: 0, y: 64, z: 0 };

        // Try to mine blocks in a small area around the bot
        const miningPositions = [
          { x: botPos.x, y: botPos.y - 1, z: botPos.z }, // Block below
          { x: botPos.x + 1, y: botPos.y, z: botPos.z }, // Block to the right
          { x: botPos.x - 1, y: botPos.y, z: botPos.z }, // Block to the left
          { x: botPos.x, y: botPos.y, z: botPos.z + 1 }, // Block in front
          { x: botPos.x, y: botPos.y, z: botPos.z - 1 }, // Block behind
        ];

        // Get block states before mining
        const beforeBlockStates = await getMultipleBlockStates(miningPositions);
        let successfulMining = false;
        let minedPosition = null;
        let beforeBlockState = null;
        let afterBlockState = null;

        // Try to mine each position
        for (let i = 0; i < miningPositions.length; i++) {
          const position = miningPositions[i];
          const beforeState = beforeBlockStates[i];

          // Skip if block is already air or unknown
          if (beforeState.type === 'air' || beforeState.type === 'unknown') {
            continue;
          }

          try {
            const mineResult = await fetch(`${minecraftUrl}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'mine_block',
                parameters: {
                  position,
                  blockType: task.parameters?.resource, // Optional: specify what to mine
                },
              }),
            }).then((res) => res.json());

            mineResults.push(mineResult);

            // If mining action reported success, verify block actually changed
            if ((mineResult as any).success) {
              // Wait a moment for mining to complete
              await new Promise((resolve) => setTimeout(resolve, 500));

              // Get block state after mining
              const afterState = await getBlockState(position);

              // Verify the block actually changed (e.g., stone -> air)
              if (blockStateChanged(beforeState, afterState)) {
                console.log(
                  `✅ Successfully mined block at ${JSON.stringify(position)}: ${beforeState.type} -> ${afterState.type}`
                );
                successfulMining = true;
                minedPosition = position;
                beforeBlockState = beforeState;
                afterBlockState = afterState;
                break;
              } else {
                console.log(
                  `⚠️ Mining reported success but block didn't change at ${JSON.stringify(position)}`
                );
              }
            }
          } catch (error) {
            console.log(
              `⚠️ Failed to mine at ${JSON.stringify(position)}:`,
              error
            );
          }
        }

        return {
          results: mineResults,
          type: 'mining',
          success: successfulMining,
          error: successfulMining
            ? undefined
            : 'No blocks were successfully mined or block states did not change',
          verificationData: {
            beforeBlockStates,
            minedPosition,
            beforeBlockState,
            afterBlockState,
            totalPositionsChecked: miningPositions.length,
          },
        };

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  } catch (error) {
    console.error('Error executing task in Minecraft:', error);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'planning',
    timestamp: Date.now(),
    version: '0.1.0',
  });
});

// Get reflective notes
app.get('/notes', async (req, res) => {
  try {
    // Get notes from enhanced memory integration
    const localNotes = enhancedMemoryIntegration.getNotes();
    
    // Get memories from memory system
    const memoryNotes = await enhancedMemoryIntegration.getMemorySystemMemories();
    
    // Combine all notes
    const allNotes = [...localNotes, ...memoryNotes];
    
    // Sort by timestamp (newest first)
    allNotes.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      notes: allNotes,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Get events
app.get('/events', async (req, res) => {
  try {
    // Get events from enhanced memory integration
    const localEvents = enhancedMemoryIntegration.getEvents();
    
    // Get events from memory system
    const memoryEvents = await enhancedMemoryIntegration.getMemorySystemEvents();
    
    // Combine all events
    const allEvents = [...localEvents, ...memoryEvents];
    
    // Sort by timestamp (newest first)
    allEvents.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      events: allEvents,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get planner data
app.get('/planner', (req, res) => {
  try {
    const currentPlan = planningSystem.hierarchicalPlanner.getCurrentPlan();
    const planQueue = planningSystem.hierarchicalPlanner.getPlanQueue();
    const currentAction = planningSystem.reactiveExecutor.getCurrentAction();
    const actionQueue = planningSystem.reactiveExecutor.getActionQueue();

    const plannerData = {
      currentPlan,
      planQueue,
      currentAction,
      actionQueue,
      isPlanningActive: planningSystem.hierarchicalPlanner.isPlanningActive(),
      isExecuting: planningSystem.reactiveExecutor.isExecuting(),
      timestamp: Date.now(),
    };

    res.json(plannerData);
  } catch (error) {
    console.error('Error getting planner data:', error);
    res.status(500).json({ error: 'Failed to get planner data' });
  }
});

// Get planning system state
app.get('/state', (req, res) => {
  try {
    const state = {
      goalFormulation: {
        currentGoals: planningSystem.goalFormulation.getCurrentGoals(),
        activeGoals: planningSystem.goalFormulation.getActiveGoals(),
        goalCount: planningSystem.goalFormulation.getGoalCount(),
        currentTasks: planningSystem.goalFormulation.getCurrentTasks(),
        completedTasks: planningSystem.goalFormulation.getCompletedTasks(),
        failedTaskCount: planningSystem.goalFormulation._failedTaskCount,
        maxConsecutiveFailures:
          planningSystem.goalFormulation._maxConsecutiveFailures,
      },
      hierarchicalPlanner: {
        currentPlan: planningSystem.hierarchicalPlanner.getCurrentPlan(),
        planQueue: planningSystem.hierarchicalPlanner.getPlanQueue(),
        planningActive: planningSystem.hierarchicalPlanner.isPlanningActive(),
      },
      reactiveExecutor: {
        currentAction: planningSystem.reactiveExecutor.getCurrentAction(),
        actionQueue: planningSystem.reactiveExecutor.getActionQueue(),
        executing: planningSystem.reactiveExecutor.isExecuting(),
      },
      cognitiveIntegration: {
        reflectionEnabled: cognitiveIntegration['config'].reflectionEnabled,
        maxRetries: cognitiveIntegration['config'].maxRetries,
        failureThreshold: cognitiveIntegration['config'].failureThreshold,
        successThreshold: cognitiveIntegration['config'].successThreshold,
      },
      enhancedTaskIntegration: {
        activeTasks: enhancedTaskIntegration.getActiveTasks(),
        taskStatistics: enhancedTaskIntegration.getTaskStatistics(),
        taskProgress: enhancedTaskIntegration.getAllTaskProgress(),
        taskHistory: enhancedTaskIntegration.getTaskHistory(10),
      },
      enhancedMemoryIntegration: {
        events: enhancedMemoryIntegration.getEvents({ limit: 20 }),
        notes: enhancedMemoryIntegration.getNotes({ limit: 10 }),
        totalEvents: enhancedMemoryIntegration.getEvents().length,
        totalNotes: enhancedMemoryIntegration.getNotes().length,
      },
      lastTaskExecution: planningSystem.goalFormulation._lastTaskExecution,
      timestamp: Date.now(),
    };

    res.json(state);
  } catch (error) {
    console.error('Error getting planning state:', error);
    res.status(500).json({ error: 'Failed to get planning state' });
  }
});

// Get cognitive insights
app.get('/cognitive-insights', async (req, res) => {
  try {
    const taskType = req.query.taskType as string;
    const insights = taskType
      ? await cognitiveIntegration.getCognitiveInsights(taskType)
      : ['No specific task type requested for insights'];

    res.json({
      success: true,
      taskType: taskType || 'all',
      insights,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting cognitive insights:', error);
    res.status(500).json({ error: 'Failed to get cognitive insights' });
  }
});

// Add memory event
app.post('/memory-events', (req, res) => {
  try {
    const { type, title, description, source, data, priority } = req.body;
    
    if (!type || !title || !description || !source) {
      return res.status(400).json({
        success: false,
        message: 'Event type, title, description, and source are required',
      });
    }

    const event = enhancedMemoryIntegration.addEvent(
      type,
      title,
      description,
      source,
      data || {},
      priority || 0.5
    );

    res.json({
      success: true,
      event,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error adding memory event:', error);
    res.status(500).json({ error: 'Failed to add memory event' });
  }
});

// Add reflective note
app.post('/memory-notes', (req, res) => {
  try {
    const { type, title, content, insights, source, confidence } = req.body;
    
    if (!type || !title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Note type, title, and content are required',
      });
    }

    const note = enhancedMemoryIntegration.addReflectiveNote(
      type,
      title,
      content,
      insights || [],
      source || 'cognitive-system',
      confidence || 0.7
    );

    res.json({
      success: true,
      note,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error adding reflective note:', error);
    res.status(500).json({ error: 'Failed to add reflective note' });
  }
});

// Get memory statistics
app.get('/memory-statistics', (req, res) => {
  try {
    const events = enhancedMemoryIntegration.getEvents();
    const notes = enhancedMemoryIntegration.getNotes();
    
    const statistics = {
      totalEvents: events.length,
      totalNotes: notes.length,
      eventsByType: {},
      notesByType: {},
      eventsBySource: {},
      notesBySource: {},
      recentActivity: {
        eventsLastHour: events.filter(e => Date.now() - e.timestamp < 3600000).length,
        notesLastHour: notes.filter(n => Date.now() - n.timestamp < 3600000).length,
      },
    };

    // Count events by type
    events.forEach(event => {
      statistics.eventsByType[event.type] = (statistics.eventsByType[event.type] || 0) + 1;
      statistics.eventsBySource[event.source] = (statistics.eventsBySource[event.source] || 0) + 1;
    });

    // Count notes by type
    notes.forEach(note => {
      statistics.notesByType[note.type] = (statistics.notesByType[note.type] || 0) + 1;
      statistics.notesBySource[note.source] = (statistics.notesBySource[note.source] || 0) + 1;
    });

    res.json({
      success: true,
      statistics,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting memory statistics:', error);
    res.status(500).json({ error: 'Failed to get memory statistics' });
  }
});

// Get task statistics
app.get('/task-stats/:taskId', (req, res) => {
  try {
    const taskId = req.params.taskId;
    const stats = cognitiveIntegration.getTaskStats(taskId);
    const shouldAbandon = cognitiveIntegration.shouldAbandonTask(taskId);

    res.json({
      success: true,
      taskId,
      stats,
      shouldAbandon,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting task stats:', error);
    res.status(500).json({ error: 'Failed to get task stats' });
  }
});

// Create a new goal/task
app.post('/task', async (req, res) => {
  try {
    const {
      type,
      description,
      priority = 0.5,
      urgency = 0.5,
      parameters = {},
      goal = null,
    } = req.body;

    if (!type || !description) {
      return res.status(400).json({
        success: false,
        message: 'Task type and description are required',
      });
    }

    const task = {
      id: `task-${Date.now()}`,
      type,
      description,
      priority,
      urgency,
      parameters,
      goal,
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
    };

    // Add to task queue
    planningSystem.goalFormulation.addTask(task);

    // If this is a goal-oriented task, notify the cognition system
    if (goal) {
      try {
        await fetch('http://localhost:3003/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'goal_creation',
            context: { goal, task },
            options: { priority: 'high' },
          }),
        });
      } catch (error) {
        console.warn('Could not notify cognition system:', error);
      }
    }

    res.json({
      success: true,
      task,
      message: 'Task created successfully',
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create task',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create a complex goal with multiple sub-tasks
app.post('/goal', async (req, res) => {
  try {
    const {
      name,
      description,
      priority = 0.7,
      urgency = 0.6,
      tasks = [],
    } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'Goal name and description are required',
      });
    }

    const goal = {
      id: `goal-${Date.now()}`,
      name,
      description,
      priority,
      urgency,
      status: 'active',
      createdAt: Date.now(),
      completedAt: null,
    };

    // Create tasks for this goal
    const createdTasks = [];
    for (const taskData of tasks) {
      const task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: taskData.type,
        description: taskData.description,
        priority: taskData.priority || priority,
        urgency: taskData.urgency || urgency,
        parameters: taskData.parameters || {},
        goal: goal.id,
        status: 'pending',
        createdAt: Date.now(),
        completedAt: null,
      };

      planningSystem.goalFormulation.addTask(task);
      createdTasks.push(task);
    }

    // Notify cognition system about the new goal
    try {
      await fetch('http://localhost:3003/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'goal_analysis',
          context: { goal, tasks: createdTasks },
          options: { priority: 'high' },
        }),
      });
    } catch (error) {
      console.warn('Could not notify cognition system:', error);
    }

    res.json({
      success: true,
      goal,
      tasks: createdTasks,
      message: 'Goal created successfully with tasks',
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create goal',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get current tasks
app.get('/tasks', (req, res) => {
  try {
    const filters = {
      status: req.query.status as any,
      source: req.query.source as any,
      category: req.query.category as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const tasks = enhancedTaskIntegration.getTasks(filters);

    res.json({
      success: true,
      tasks,
      count: tasks.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tasks',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Add new task
app.post('/tasks', (req, res) => {
  try {
    const taskData = req.body;
    const task = enhancedTaskIntegration.addTask(taskData);

    res.json({
      success: true,
      task,
      message: 'Task added successfully',
    });
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add task',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update task progress
app.put('/tasks/:taskId/progress', (req, res) => {
  try {
    const { taskId } = req.params;
    const { progress, status } = req.body;

    const success = enhancedTaskIntegration.updateTaskProgress(
      taskId,
      progress,
      status
    );

    if (success) {
      res.json({
        success: true,
        message: 'Task progress updated successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Task not found',
      });
    }
  } catch (error) {
    console.error('Error updating task progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update task progress',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Complete task step
app.post('/tasks/:taskId/steps/:stepId/complete', (req, res) => {
  try {
    const { taskId, stepId } = req.params;

    const success = enhancedTaskIntegration.completeTaskStep(taskId, stepId);

    if (success) {
      res.json({
        success: true,
        message: 'Task step completed successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Task or step not found',
      });
    }
  } catch (error) {
    console.error('Error completing task step:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete task step',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start task step
app.post('/tasks/:taskId/steps/:stepId/start', (req, res) => {
  try {
    const { taskId, stepId } = req.params;

    const success = enhancedTaskIntegration.startTaskStep(taskId, stepId);

    if (success) {
      res.json({
        success: true,
        message: 'Task step started successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Task or step not found',
      });
    }
  } catch (error) {
    console.error('Error starting task step:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start task step',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get task statistics
app.get('/task-statistics', (req, res) => {
  try {
    const statistics = enhancedTaskIntegration.getTaskStatistics();

    res.json({
      success: true,
      statistics,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting task statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task statistics',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get task progress
app.get('/task-progress', (req, res) => {
  try {
    const { taskId } = req.query;

    if (taskId) {
      const progress = enhancedTaskIntegration.getTaskProgress(
        taskId as string
      );

      if (progress) {
        res.json({
          success: true,
          progress,
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Task not found',
        });
      }
    } else {
      const allProgress = enhancedTaskIntegration.getAllTaskProgress();

      res.json({
        success: true,
        progress: allProgress,
        count: allProgress.length,
      });
    }
  } catch (error) {
    console.error('Error getting task progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task progress',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Execute next task
app.post('/execute', async (req, res) => {
  try {
    const result = await planningSystem.reactiveExecutor.executeNextTask();
    res.json({
      success: true,
      result,
      message: 'Task executed successfully',
    });
  } catch (error) {
    console.error('Error executing task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute task',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Execute specific task with enhanced verification
app.post('/execute-task', async (req, res) => {
  try {
    const { type, description, parameters } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Task type is required',
      });
    }

    const task = {
      id: `task-${Date.now()}`,
      type,
      description: description || `Execute ${type}`,
      parameters: parameters || {},
      priority: 0.5,
      urgency: 0.4,
      status: 'pending',
      createdAt: Date.now(),
    };

    console.log(
      `🔍 Executing task with enhanced verification: ${type} - ${description}`
    );

    // Execute the task directly using the enhanced verification system
    const executionResult = await executeTaskInMinecraft(task);

    console.log(`✅ Task execution result:`, {
      success: executionResult.success,
      type: task.type,
      description: task.description,
      error: executionResult.error,
    });

    res.json({
      success: true,
      task,
      result: executionResult,
      message: executionResult.success
        ? 'Task executed successfully'
        : 'Task execution failed',
    });
  } catch (error) {
    console.error('Error executing specific task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute specific task',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Trigger autonomous task execution
app.post('/autonomous', async (req, res) => {
  try {
    await autonomousTaskExecutor();
    res.json({
      success: true,
      message: 'Autonomous task execution triggered',
    });
  } catch (error) {
    console.error('Error triggering autonomous execution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger autonomous execution',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test endpoint for direct goal generation
app.post('/test-goals', async (req, res) => {
  try {
    console.log('🧪 Testing direct goal generation...');

    // Generate signals and context
    const signals = await generateWorldSignals();
    const context = await createPlanningContext();

    console.log('Generated signals:', signals.length);
    console.log('Context created:', !!context);

    // Generate proactive goals
    const newGoals = await generateProactiveGoals(signals, context);

    console.log(
      `Generated ${newGoals?.length || 0} goals:`,
      newGoals?.map((g) => `${g.type}: ${g.description}`)
    );

    if (newGoals && newGoals.length > 0) {
      // Add goals to the planning system
      for (const goal of newGoals) {
        await planningSystem.goalFormulation.addGoal(goal);
      }

      // Check current goals
      const currentGoals = planningSystem.goalFormulation.getCurrentGoals();

      res.json({
        success: true,
        message: `Generated and added ${newGoals.length} goals`,
        goals: newGoals,
        currentGoals: currentGoals,
        goalCount: currentGoals.length,
      });
    } else {
      res.json({
        success: false,
        message: 'No goals generated',
        goals: [],
        currentGoals: [],
        goalCount: 0,
      });
    }
  } catch (error) {
    console.error('Error in test goal generation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test goal generation',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get telemetry data
app.get('/telemetry', (req, res) => {
  try {
    const telemetry = {
      events: [
        {
          id: `planning-${Date.now()}`,
          timestamp: Date.now(),
          source: 'planning-system',
          type: 'planning_state',
          data: {
            goalFormulationActive:
              planningSystem.goalFormulation.getGoalCount() > 0,
            planningActive:
              planningSystem.hierarchicalPlanner.isPlanningActive(),
            executionActive: planningSystem.reactiveExecutor.isExecuting(),
            metrics: {
              activeProcesses: 0,
              memoryUsage: process.memoryUsage(),
              uptime: process.uptime(),
            },
          },
        },
      ],
    };

    res.json(telemetry);
  } catch (error) {
    console.error('Error getting planning telemetry:', error);
    res.status(500).json({ error: 'Failed to get telemetry' });
  }
});

// ============================================================================
// Behavior Tree Endpoints
// ============================================================================

// POST /run-option - Execute an option (skill) via Behavior Tree
app.post('/run-option', async (req, res) => {
  try {
    const { option_id, args, options } = req.body;

    if (!option_id) {
      return res
        .status(400)
        .json({ error: 'Missing required field: option_id' });
    }

    const result = await btRunner.runOption(
      option_id,
      args || {},
      options || {}
    );

    res.json({
      success: true,
      result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('BT execution failed:', error);
    res.status(500).json({
      error: 'BT execution failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /run-option/stream - Stream BT execution with SSE
app.post('/run-option/stream', async (req, res) => {
  try {
    const { option_id, args, options } = req.body;

    if (!option_id) {
      return res
        .status(400)
        .json({ error: 'Missing required field: option_id' });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const runId = `${option_id}-${Date.now()}`;

    // Set up event listeners for streaming
    const onTick = (data: { runId: string; tick: any }) => {
      if (data.runId === runId) {
        res.write(
          `data: ${JSON.stringify({ type: 'tick', data: data.tick })}\n\n`
        );
      }
    };

    const onStatus = (data: { runId: string; status: BTNodeStatus }) => {
      if (data.runId === runId) {
        res.write(
          `data: ${JSON.stringify({ type: 'status', data: data.status })}\n\n`
        );

        // Close stream when execution completes
        if (
          data.status === BTNodeStatus.SUCCESS ||
          data.status === BTNodeStatus.FAILURE
        ) {
          res.write(
            `data: ${JSON.stringify({ type: 'complete', data: data.status })}\n\n`
          );
          res.end();
        }
      }
    };

    btRunner.on('tick', onTick);
    btRunner.on('status', onStatus);

    // Execute the option
    const result = await btRunner.runOption(
      option_id,
      args || {},
      options || {}
    );

    // Clean up event listeners
    btRunner.off('tick', onTick);
    btRunner.off('status', onStatus);
  } catch (error) {
    console.error('BT streaming failed:', error);
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`
    );
    res.end();
  }
});

// POST /cancel - Cancel an active run
app.post('/cancel', async (req, res) => {
  try {
    const { run_id } = req.body;

    if (!run_id) {
      return res.status(400).json({ error: 'Missing required field: run_id' });
    }

    const cancelled = await btRunner.cancel(run_id);

    res.json({
      success: cancelled,
      cancelled,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Cancel failed:', error);
    res.status(500).json({
      error: 'Cancel failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /active-runs - Get status of active runs
app.get('/active-runs', (req, res) => {
  try {
    const activeRuns = btRunner.getActiveRuns();

    res.json({
      success: true,
      activeRuns,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to get active runs:', error);
    res.status(500).json({
      error: 'Failed to get active runs',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /tasks - Add task from cognitive thought processor
app.post('/tasks', (req, res) => {
  try {
    const task = req.body;

    if (!task || !task.type || !task.description) {
      return res.status(400).json({
        error: 'Missing required fields: type, description',
      });
    }

    // Add task to planning system
    planningSystem.goalFormulation.addTask(task);

    res.json({
      success: true,
      taskId: task.id,
      message: `Task added: ${task.type} - ${task.description}`,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to add task:', error);
    res.status(500).json({
      error: 'Failed to add task',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /trigger-goals - Manually trigger goal execution for testing
app.post('/trigger-goals', async (req, res) => {
  try {
    console.log('🚀 Manually triggering goal execution...');

    // Execute the autonomous task executor
    await autonomousTaskExecutor();

    // Get current state after execution
    const currentGoals = planningSystem.goalFormulation.getCurrentGoals();
    const activeGoals = planningSystem.goalFormulation.getActiveGoals();
    const completedGoals = planningSystem.goalFormulation.getCompletedTasks();

    res.json({
      success: true,
      message: 'Goal execution triggered successfully',
      goals: {
        total: currentGoals.length,
        active: activeGoals.length,
        completed: completedGoals.length,
        activeGoals: activeGoals.map((g: any) => ({
          id: g.id,
          type: g.type,
          description: g.description,
          priority: g.priority,
          status: g.status,
        })),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to trigger goal execution:', error);
    res.status(500).json({
      error: 'Failed to trigger goal execution',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Planning system server running on port ${port}`);

  // Start autonomous task executor
  // Only log in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log(' Starting autonomous task executor...');
  }
  setInterval(autonomousTaskExecutor, 120000); // Check every 2 minutes

  // Initial task generation after 30 seconds
  setTimeout(() => {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(' Initializing autonomous behavior...');
    }
    autonomousTaskExecutor();
  }, 30000);

  // Start cognitive thought processor
  console.log(' Starting cognitive thought processor...');
  cognitiveThoughtProcessor.startProcessing();
});
