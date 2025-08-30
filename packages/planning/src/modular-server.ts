/**
 * Modular Planning Server
 *
 * New modular server implementation with code splitting and MCP integration.
 * Replaces the monolithic server.ts with a cleaner, more maintainable architecture.
 *
 * @author @darianrosebrook
 */

import { ServerConfiguration } from './modules/server-config';
import {
  createPlanningEndpoints,
  PlanningSystem,
} from './modules/planning-endpoints';
import { MCPIntegration } from './modules/mcp-integration';

// Import existing components
import { CognitiveIntegration } from './cognitive-integration';
import { BehaviorTreeRunner } from './behavior-trees/BehaviorTreeRunner';
import { CognitiveThoughtProcessor } from './cognitive-thought-processor';
import { IntegratedPlanningCoordinator } from './integrated-planning-coordinator';
import { EnhancedGoalManager } from './goal-formulation/enhanced-goal-manager';
import { EnhancedReactiveExecutor } from './reactive-executor/enhanced-reactive-executor';
import { EnhancedTaskIntegration } from './enhanced-task-integration';
import { EnhancedMemoryIntegration } from './enhanced-memory-integration';
import { EnhancedEnvironmentIntegration } from './enhanced-environment-integration';
import { EnhancedLiveStreamIntegration } from './enhanced-live-stream-integration';
import { GoalStatus } from './types';

// Initialize tool executor that connects to Minecraft interface
const toolExecutor = {
  async execute(tool: string, args: Record<string, any>) {
    console.log(`Executing tool: ${tool} with args:`, args);

    try {
      // Map BT actions to Minecraft actions
      const mappedAction = mapBTActionToMinecraft(tool, args);

      // Use the bot connection check for Minecraft actions
      return await executeActionWithBotCheck(mappedAction);
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

  const debugInfo = { originalAction: tool, args: args };

  switch (tool) {
    case 'scan_for_trees':
      return {
        type: 'wait',
        parameters: { duration: 2000 },
      };

    case 'pathfind':
      return {
        type: 'move_forward',
        parameters: { distance: args.distance || 1 },
      };

    case 'scan_tree_structure':
      return {
        type: 'wait',
        parameters: { duration: 1000 },
      };

    case 'dig_blocks':
      return {
        type: 'dig_block',
        parameters: {
          pos: args.position || 'current',
          tool: args.tool || 'axe',
        },
      };

    case 'collect_items':
      return {
        type: 'pickup_item',
        parameters: { radius: args.radius || 3 },
      };

    case 'clear_3x3_area':
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
      const pattern = args.pattern || 'single';
      const blockType = args.block || 'stone';

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
            count: 12,
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
      return {
        type: 'wait',
        parameters: { duration: args.duration || 2000 },
      };

    default:
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

/**
 * Execute action with bot connection check
 */
async function executeActionWithBotCheck(action: any) {
  // This would integrate with your existing bot connection logic
  // For now, return a mock successful response
  return {
    ok: true,
    data: { action: action.type, parameters: action.parameters },
    environmentDeltas: {},
  };
}

/**
 * Wait for bot connection
 */
async function waitForBotConnection(timeoutMs: number): Promise<boolean> {
  // This would integrate with your existing bot connection logic
  // For now, return true after a short delay
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), Math.min(timeoutMs, 1000));
  });
}

/**
 * Autonomous task executor
 */
async function autonomousTaskExecutor() {
  try {
    console.log('🤖 Running autonomous task executor...');

    // Get active goals and execute them
    const activeGoals = planningSystem.goalFormulation.getActiveGoals();

    for (const goal of activeGoals) {
      try {
        await planningSystem.execution.executeGoal(goal);
      } catch (error) {
        console.error(`Failed to execute goal ${goal.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Autonomous task executor failed:', error);
  }
}

// Initialize core components
const btRunner = new BehaviorTreeRunner(toolExecutor);
const cognitiveIntegration = new CognitiveIntegration({
  reflectionEnabled: true,
  maxRetries: 3,
  failureThreshold: 0.3,
  successThreshold: 0.7,
});

const cognitiveThoughtProcessor = new CognitiveThoughtProcessor({
  enableThoughtToTaskTranslation: true,
  thoughtProcessingInterval: 30000,
  maxThoughtsPerBatch: 5,
  planningEndpoint: 'http://localhost:3002',
  cognitiveEndpoint: 'http://localhost:3003',
});

const integratedPlanningCoordinator = new IntegratedPlanningCoordinator({
  hrmConfig: {
    hrmLatencyTarget: 100,
    qualityThreshold: 0.7,
    maxRefinements: 3,
    enableIterativeRefinement: true,
  },
});

const enhancedGoalManager = new EnhancedGoalManager();
const enhancedReactiveExecutor = new EnhancedReactiveExecutor();
const enhancedTaskIntegration = new EnhancedTaskIntegration({
  enableRealTimeUpdates: true,
  enableProgressTracking: true,
  enableTaskStatistics: true,
  enableTaskHistory: true,
  maxTaskHistory: 1000,
  progressUpdateInterval: 5000,
  dashboardEndpoint: 'http://localhost:3000',
});

const enhancedMemoryIntegration = new EnhancedMemoryIntegration({
  enableRealTimeUpdates: true,
  enableReflectiveNotes: true,
  enableEventLogging: true,
  dashboardEndpoint: 'http://localhost:3000',
  memorySystemEndpoint: 'http://localhost:3001',
  maxEvents: 100,
  maxNotes: 50,
});

const enhancedEnvironmentIntegration = new EnhancedEnvironmentIntegration({
  enableRealTimeUpdates: true,
  enableEntityDetection: true,
  enableInventoryTracking: true,
  enableResourceAssessment: true,
  dashboardEndpoint: 'http://localhost:3000',
  worldSystemEndpoint: 'http://localhost:3004',
  minecraftEndpoint: 'http://localhost:3005',
  updateInterval: 5000,
  maxEntityDistance: 50,
  maxBlockDistance: 20,
});

const enhancedLiveStreamIntegration = new EnhancedLiveStreamIntegration({
  enableRealTimeUpdates: true,
  enableActionLogging: true,
  enableVisualFeedback: true,
  enableMiniMap: true,
  enableScreenshots: true,
  dashboardEndpoint: 'http://localhost:3000',
  minecraftEndpoint: 'http://localhost:3005',
  screenshotEndpoint: 'http://localhost:3005/screenshots',
  updateInterval: 2000,
  maxActionLogs: 1000,
  maxVisualFeedbacks: 100,
  screenshotInterval: 10000,
});

// Create planning system interface
const planningSystem: PlanningSystem = {
  goalFormulation: {
    getCurrentGoals: () => enhancedGoalManager.listGoals(),
    getActiveGoals: () =>
      enhancedGoalManager.getGoalsByStatus(GoalStatus.PENDING),
    getGoalCount: () => enhancedGoalManager.listGoals().length,
    getCurrentTasks: () => [], // Simplified for now
    addTask: (task: any) => enhancedTaskIntegration.addTask(task),
    getCompletedTasks: () => [], // Simplified for now
  },
  execution: {
    executeGoal: async (goal: any) => {
      return { success: true, message: 'Goal execution simulated' };
    },
    executeTask: async (task: any) => {
      return { success: true, message: 'Task execution simulated' };
    },
  },
};

// Initialize server configuration
const serverConfig = new ServerConfiguration({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3002,
  enableCORS: true,
  enableMCP: true,
  mcpConfig: {
    mcpServerPort: 3006,
    registryEndpoint: 'http://localhost:3001',
    botEndpoint: 'http://localhost:3005',
  },
});

// Setup event listeners
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

enhancedMemoryIntegration.on('eventAdded', (event) => {
  console.log('Memory event added:', event.title);
});

enhancedEnvironmentIntegration.on('environmentUpdated', (environment) => {
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.DEBUG_ENVIRONMENT === 'true'
  ) {
    console.log(
      'Environment updated:',
      environment.biome,
      environment.timeOfDay
    );
  }
});

// Add initial tasks for testing
setTimeout(async () => {
  console.log('Adding initial tasks for testing...');

  const botConnected = await waitForBotConnection(10000);
  if (!botConnected) {
    console.log(
      '⚠️ Bot not connected - tasks will be queued but may not execute immediately'
    );
  }

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
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
    },
  });
}, 2000);

// Main server startup function
async function startServer() {
  try {
    // Initialize MCP integration (bot and registry would be passed here)
    await serverConfig.initializeMCP();

    // Mount planning endpoints
    const planningRouter = createPlanningEndpoints(planningSystem);
    serverConfig.mountRouter('/', planningRouter);

    // Add error handling
    serverConfig.addErrorHandling();

    // Start the server
    await serverConfig.start();

    // Start autonomous task executor
    if (process.env.NODE_ENV === 'development') {
      console.log('Starting autonomous task executor...');
    }
    setInterval(autonomousTaskExecutor, 120000); // Check every 2 minutes

    // Initial task generation after 30 seconds
    setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Initializing autonomous behavior...');
      }
      autonomousTaskExecutor();
    }, 30000);

    // Start cognitive thought processor
    console.log('Starting cognitive thought processor...');
    cognitiveThoughtProcessor.startProcessing();

    console.log('✅ Modular planning server started successfully');
  } catch (error) {
    console.error('❌ Failed to start modular planning server:', error);
    process.exit(1);
  }
}

// Export for testing and external use
export {
  serverConfig,
  planningSystem,
  startServer,
  autonomousTaskExecutor,
  cognitiveThoughtProcessor,
  enhancedTaskIntegration,
  enhancedMemoryIntegration,
  enhancedEnvironmentIntegration,
  enhancedLiveStreamIntegration,
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}
