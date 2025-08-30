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
import { EnhancedRegistry } from '@conscious-bot/core';

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
 * Check if bot is connected and ready for actions
 */
async function checkBotConnection(): Promise<boolean> {
  try {
    // Check if bot is connected to Minecraft via the Minecraft interface
    const response = await fetch('http://localhost:3005/health', {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });

    if (response.ok) {
      const status = (await response.json()) as {
        status?: string;
        botStatus?: { connected?: boolean };
      };
      return (
        status.status === 'connected' || status.botStatus?.connected === true
      );
    }

    return false;
  } catch (error) {
    console.warn('Bot connection check failed:', error);
    return false;
  }
}

/**
 * Autonomous task executor - Real Action Based Progress
 * Only updates progress when actual bot actions are performed
 */
async function autonomousTaskExecutor() {
  try {
    console.log('🤖 Running autonomous task executor...');

    // Get active tasks from the planning system's actual task storage
    const planningState = await fetch('http://localhost:3002/state').then(res => res.json());
    const activeTasks = planningState.state?.tasks?.current || [];

    if (activeTasks.length === 0) {
      console.log('No active tasks to execute');
      return;
    }

    // Execute the highest priority task
    const currentTask = activeTasks[0]; // Tasks are already sorted by priority
    console.log(
      `🎯 Executing task: ${currentTask.title} (${(currentTask.progress || 0) * 100}% complete)`
    );

    // Check if bot is connected and can perform actions
    const botConnected = await checkBotConnection();
    if (!botConnected) {
      console.log('⚠️ Bot not connected - cannot execute real actions');
      return;
    }

    // Try to find a suitable MCP option for this task type
    const mcpOptions =
      (await serverConfig.getMCPIntegration()?.listOptions('active')) || [];

    // Map task types to MCP options
    const taskTypeMapping: Record<string, string[]> = {
      gathering: ['chop', 'tree', 'wood', 'collect', 'gather'],
      crafting: ['craft', 'build', 'create'],
      exploration: ['explore', 'search', 'find'],
      mining: ['mine', 'dig', 'extract'],
      farming: ['farm', 'plant', 'grow'],
      combat: ['fight', 'attack', 'defend'],
      navigation: ['move', 'navigate', 'travel'],
    };

    const searchTerms = taskTypeMapping[currentTask.type] || [currentTask.type];
    const suitableOption = mcpOptions.find((option) =>
      searchTerms.some(
        (term) =>
          option.name?.toLowerCase().includes(term) ||
          option.description?.toLowerCase().includes(term)
      )
    );

    if (suitableOption) {
      console.log(`✅ Found MCP option for task: ${suitableOption.name}`);

      // Execute the MCP option
      const mcpResult = await serverConfig
        .getMCPIntegration()
        ?.executeTool('run_option', {
          id: suitableOption.id,
        });

      if (mcpResult?.success) {
        console.log(
          `✅ MCP option executed successfully: ${suitableOption.name}`
        );
        // Update task progress based on MCP execution result
        const newProgress = Math.min((currentTask.progress || 0) + 0.25, 1.0);
        
        // Update task progress in the planning system
        await fetch(`http://localhost:3002/task/${currentTask.id}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            progress: newProgress,
            status: newProgress >= 1.0 ? 'completed' : 'active'
          })
        });
      } else {
        console.error(
          `❌ MCP option execution failed: ${suitableOption.name}`,
          mcpResult?.error
        );

        // Mark task as failed if it's been retried too many times
        const retryCount = (currentTask.metadata?.retryCount || 0) + 1;
        const maxRetries = currentTask.metadata?.maxRetries || 3;

        if (retryCount >= maxRetries) {
          // Update task status in the planning system
          await fetch(`http://localhost:3002/task/${currentTask.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'failed' })
          });
          console.log(
            `❌ Task marked as failed after ${retryCount} retries: ${currentTask.title}`
          );
        } else {
          // Update retry count
          await fetch(`http://localhost:3002/task/${currentTask.id}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              retryCount,
              lastRetry: Date.now(),
            })
          });
          console.log(
            `🔄 Task will be retried (${retryCount}/${maxRetries}): ${currentTask.title}`
          );
        }
      }
    } else {
      console.warn(
        `⚠️ No suitable MCP option found for task: ${currentTask.title}. Falling back to planning system.`
      );
      // If no MCP option, execute the task through the planning system
      try {
        console.log(`🚀 Starting execution of task: ${currentTask.title}`);

        const executionResult = await planningSystem.execution.executeTask(currentTask);

        if (executionResult.success) {
          console.log(`✅ Task execution completed: ${currentTask.title}`);

          // Update task progress based on execution result
          const newProgress = Math.min((currentTask.progress || 0) + 0.25, 1.0);
          
          // Update task progress in the planning system
          await fetch(`http://localhost:3002/task/${currentTask.id}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              progress: newProgress,
              status: newProgress >= 1.0 ? 'completed' : 'active'
            })
          });
        } else {
          console.error(
            `❌ Task execution failed: ${currentTask.title}`,
            executionResult.message
          );

          // Mark task as failed if it's been retried too many times
          const retryCount = (currentTask.metadata?.retryCount || 0) + 1;
          const maxRetries = currentTask.metadata?.maxRetries || 3;

          if (retryCount >= maxRetries) {
            // Update task status in the planning system
            await fetch(`http://localhost:3002/task/${currentTask.id}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'failed' })
            });
            console.log(
              `❌ Task marked as failed after ${retryCount} retries: ${currentTask.title}`
            );
          } else {
            // Update retry count
            await fetch(`http://localhost:3002/task/${currentTask.id}/metadata`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                retryCount,
                lastRetry: Date.now(),
              })
            });
            console.log(
              `🔄 Task will be retried (${retryCount}/${maxRetries}): ${currentTask.title}`
            );
          }
        }
      } catch (error) {
        console.error(`❌ Task execution error: ${currentTask.title}`, error);
      }
    }

    // Get active goals and execute them (keep existing goal logic)
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
  updateInterval: 15000, // Increased from 5000ms to 15000ms to reduce load
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
  updateInterval: 10000, // Reduced from 2000ms to 10000ms to reduce load
  maxActionLogs: 100, // Reduced from 1000 to 100 to save memory
  maxVisualFeedbacks: 50, // Reduced from 100 to 50 to save memory
  screenshotInterval: 30000, // Increased from 10000ms to 30000ms to reduce load
});

// Create planning system interface
const planningSystem: PlanningSystem = {
  goalFormulation: {
    getCurrentGoals: () => enhancedGoalManager.listGoals(),
    getActiveGoals: () =>
      enhancedGoalManager.getGoalsByStatus(GoalStatus.PENDING),
    getGoalCount: () => enhancedGoalManager.listGoals().length,
    getCurrentTasks: () => enhancedTaskIntegration.getActiveTasks(),
    addTask: async (task: any) => await enhancedTaskIntegration.addTask(task),
    getCompletedTasks: () =>
      enhancedTaskIntegration.getTasks({ status: 'completed' }),
  },
  execution: {
    executeGoal: async (goal: any) => {
      try {
        console.log(`🎯 Executing goal: ${goal.title || goal.id}`);

        // Execute the goal through the enhanced reactive executor
        const result = await enhancedReactiveExecutor.executeTask(goal);

        if (result.success) {
          console.log(
            `✅ Goal executed successfully: ${goal.title || goal.id}`
          );
          return {
            success: true,
            message: 'Goal executed successfully',
            result,
          };
        } else {
          console.error(
            `❌ Goal execution failed: ${goal.title || goal.id}`,
            result.error
          );
          return {
            success: false,
            message: result.error || 'Goal execution failed',
            result,
          };
        }
      } catch (error) {
        console.error(
          `❌ Goal execution error: ${goal.title || goal.id}`,
          error
        );
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    executeTask: async (task: any) => {
      try {
        console.log(`🔄 Executing task: ${task.title || task.id}`);

        // Execute the task through the enhanced reactive executor
        const result = await enhancedReactiveExecutor.executeTask(task);

        if (result.success) {
          console.log(
            `✅ Task executed successfully: ${task.title || task.id}`
          );
          return {
            success: true,
            message: 'Task executed successfully',
            result,
          };
        } else {
          console.error(
            `❌ Task execution failed: ${task.title || task.id}`,
            result.error
          );
          return {
            success: false,
            message: result.error || 'Task execution failed',
            result,
          };
        }
      } catch (error) {
        console.error(
          `❌ Task execution error: ${task.title || task.id}`,
          error
        );
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
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

  const task1 = await enhancedTaskIntegration.addTask({
    title: 'Gather Wood',
    description: 'Collect wood from nearby trees for crafting',
    type: 'gathering',
    priority: 0.8,
    urgency: 0.7,
    source: 'autonomous' as const,
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

  console.log('Task 1 added:', task1.id, task1.title);
  console.log(
    'Active tasks after task 1:',
    enhancedTaskIntegration.getActiveTasks().length
  );

  await enhancedTaskIntegration.addTask({
    title: 'Craft Wooden Pickaxe',
    description: 'Create a wooden pickaxe for mining stone',
    type: 'crafting',
    priority: 0.9,
    urgency: 0.8,
    source: 'autonomous' as const,
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

  await enhancedTaskIntegration.addTask({
    title: 'Explore Cave System',
    description: 'Search for valuable resources in nearby caves',
    type: 'exploration',
    priority: 0.6,
    urgency: 0.5,
    source: 'autonomous' as const,
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
    // Create an EnhancedRegistry for MCP integration
    const registry = new EnhancedRegistry();

    // Initialize MCP integration with the registry
    try {
      await serverConfig.initializeMCP(undefined, registry);
    } catch (error) {
      console.warn(
        '⚠️ MCP integration failed to initialize, continuing without it:',
        error
      );
    }

    // Mount planning endpoints
    const planningRouter = createPlanningEndpoints(planningSystem);
    serverConfig.mountRouter('/', planningRouter);

    // Add error handling
    serverConfig.addErrorHandling();

    // Start the server
    await serverConfig.start();

    // Start autonomous task executor with error handling
    if (process.env.NODE_ENV === 'development') {
      console.log('Starting autonomous task executor...');
    }

    // Wrap the interval in error handling
    setInterval(() => {
      try {
        console.log('🔄 Scheduled autonomous task executor running...');
        autonomousTaskExecutor();
      } catch (error) {
        console.warn('Autonomous task executor error (non-fatal):', error);
      }
    }, 10000); // Check every 10 seconds for more responsive execution

    // Initial task generation after 5 seconds with error handling
    setTimeout(() => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('Initializing autonomous behavior...');
        }
        autonomousTaskExecutor();
      } catch (error) {
        console.warn('Initial autonomous behavior error (non-fatal):', error);
      }
    }, 5000);

    // Start cognitive thought processor with error handling
    try {
      console.log('Starting cognitive thought processor...');
      cognitiveThoughtProcessor.startProcessing();
    } catch (error) {
      console.warn(
        '⚠️ Cognitive thought processor failed to start, continuing without it:',
        error
      );
    }

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
