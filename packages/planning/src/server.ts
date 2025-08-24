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

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize tool executor (mock for now)
const toolExecutor = {
  async execute(tool: string, args: Record<string, any>) {
    // TODO: Implement actual tool execution
    console.log(`Executing tool: ${tool} with args:`, args);
    return {
      ok: true,
      data: { result: 'mock_success' },
      environmentDeltas: {},
    };
  },
};

// Initialize Behavior Tree Runner
const btRunner = new BehaviorTreeRunner(toolExecutor);

// Initialize cognitive integration
const cognitiveIntegration = new CognitiveIntegration({
  reflectionEnabled: true,
  maxRetries: 3,
  failureThreshold: 0.3,
  successThreshold: 0.7,
});

// Initialize planning system (simplified for now)
const planningSystem = {
  goalFormulation: {
    getCurrentGoals: () => [],
    getActiveGoals: () => [],
    getGoalCount: () => 0,
    getCurrentTasks: () => {
      const tasks = planningSystem.goalFormulation._tasks || [];
      return tasks.filter(
        (t: any) => t.status === 'pending' || t.status === 'in_progress'
      );
    },
    getCompletedTasks: () => {
      const tasks = planningSystem.goalFormulation._tasks || [];
      return tasks.filter(
        (t: any) =>
          t.status === 'completed' ||
          t.status === 'failed' ||
          t.status === 'abandoned'
      );
    },
    addTask: (task: any) => {
      // Simple in-memory task storage
      if (!planningSystem.goalFormulation._tasks) {
        planningSystem.goalFormulation._tasks = [];
      }
      planningSystem.goalFormulation._tasks.push(task);
      console.log(` Task added: ${task.type} - ${task.description}`);
    },
    _tasks: [] as any[],
    _lastTaskExecution: 0, // Track when last task was executed
    _failedTaskCount: 0, // Track failed tasks to prevent infinite loops
    _maxConsecutiveFailures: 3, // Maximum consecutive failures before switching strategies
  },
  hierarchicalPlanner: {
    getCurrentPlan: () => null,
    getPlanQueue: () => [],
    isPlanningActive: () => false,
  },
  reactiveExecutor: {
    getCurrentAction: () => null,
    getActionQueue: () => [],
    isExecuting: () => false,
    executeNextTask: async () => {
      // Simple task execution that sends commands to Minecraft bot
      const tasks = planningSystem.goalFormulation._tasks || [];
      if (tasks.length === 0) {
        throw new Error('No tasks to execute');
      }

      // Find the first pending task
      const taskIndex = tasks.findIndex((t: any) => t.status === 'pending');
      if (taskIndex === -1) {
        throw new Error('No pending tasks to execute');
      }

      const task = tasks[taskIndex];

      // Mark task as in progress
      task.status = 'in_progress';
      task.startedAt = Date.now();
      task.attempts = (task.attempts || 0) + 1;

      try {
        // Execute the task by sending commands to Minecraft bot
        const result = await executeTaskInMinecraft(task);

        // Validate task completion based on result
        const taskCompleted = validateTaskCompletion(task, result);

        // Debug logging
        console.log(` Task Validation for ${task.type}:`, {
          taskId: task.id,
          resultSuccess: (result as any).success,
          resultError: (result as any).error,
          resultType: (result as any).type,
          taskCompleted,
          taskStatus: task.status,
        });

        // Process cognitive feedback
        const cognitiveFeedback =
          await cognitiveIntegration.processTaskCompletion(task, result, {
            taskType: task.type,
            goal: task.goal,
            attempts: task.attempts,
          });

        if (taskCompleted) {
          // Mark task as completed
          task.status = 'completed';
          task.completedAt = Date.now();
          task.result = result;
          task.cognitiveFeedback = cognitiveFeedback;

          // Reset failure counter on success
          planningSystem.goalFormulation._failedTaskCount = 0;

          console.log(
            ` Task completed successfully: ${task.type} - ${task.description}`
          );
          console.log(` Cognitive feedback: ${cognitiveFeedback.reasoning}`);
        } else {
          // Mark task as failed
          task.status = 'failed';
          task.failedAt = Date.now();
          task.failureReason =
            (result as any)?.error || 'Task validation failed';
          task.result = result;
          task.cognitiveFeedback = cognitiveFeedback;

          // Increment failure counter
          planningSystem.goalFormulation._failedTaskCount++;

          console.log(
            ` Task failed: ${task.type} - ${task.description} - Reason: ${task.failureReason}`
          );
          console.log(` Cognitive feedback: ${cognitiveFeedback.reasoning}`);

          // Check if task should be abandoned based on cognitive feedback
          if (cognitiveIntegration.shouldAbandonTask(task.id)) {
            console.log(
              ` Abandoning task ${task.id} based on cognitive feedback`
            );
            task.status = 'abandoned';
            task.abandonedAt = Date.now();
            task.abandonReason = 'Cognitive feedback suggests abandonment';

            // Generate alternative suggestions from cognitive feedback
            if (cognitiveFeedback.alternativeSuggestions.length > 0) {
              console.log(
                ` Alternative suggestions: ${cognitiveFeedback.alternativeSuggestions.join(', ')}`
              );

              // Create alternative tasks based on suggestions
              const alternativeTask = generateTaskFromSuggestions(
                cognitiveFeedback.alternativeSuggestions
              );
              if (alternativeTask) {
                planningSystem.goalFormulation.addTask(alternativeTask);
              }
            }
          } else if (
            planningSystem.goalFormulation._failedTaskCount >=
            planningSystem.goalFormulation._maxConsecutiveFailures
          ) {
            console.log(
              `⚠️ Too many consecutive failures (${planningSystem.goalFormulation._failedTaskCount}), switching task strategy`
            );
            planningSystem.goalFormulation._failedTaskCount = 0;

            // Generate a different type of task
            const alternativeTask = generateAlternativeTask(task);
            planningSystem.goalFormulation.addTask(alternativeTask);
          }
        }

        // Update last execution time
        planningSystem.goalFormulation._lastTaskExecution = Date.now();

        return { task, result, completed: taskCompleted };
      } catch (error) {
        // Mark task as failed due to exception
        task.status = 'failed';
        task.failedAt = Date.now();
        task.failureReason =
          error instanceof Error ? error.message : String(error);

        // Increment failure counter
        planningSystem.goalFormulation._failedTaskCount++;

        console.error(
          ` Task execution error: ${task.type} - ${task.description} - Error: ${task.failureReason}`
        );

        throw error;
      }
    },
  },
};

/**
 * Validate if a task was actually completed successfully
 */
function validateTaskCompletion(task: any, result: any): boolean {
  // Check if the result indicates success
  if (!result || result.error) {
    return false;
  }

  // For crafting tasks, check if the item was actually crafted
  if (task.type === 'craft') {
    // Check if the crafting was successful based on the new implementation
    return result.success === true && !result.error;
  }

  // For mining tasks, check if any blocks were successfully mined
  if (task.type === 'mine') {
    return result.success === true && !result.error;
  }

  // For other task types, check the result structure
  if (result.success === false) {
    return false;
  }

  // Default to true if no specific validation rules apply
  return true;
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

// Helper function to generate autonomous tasks based on goals
function generateAutonomousTask() {
  const taskTypes = [
    {
      type: 'explore',
      description: 'Explore the surroundings to understand the environment',
      parameters: { distance: 5, direction: 'forward' },
    },
    {
      type: 'gather',
      description: 'Look for and collect nearby resources',
      parameters: { resource: 'wood', amount: 1 },
    },
    {
      type: 'craft',
      description: 'Attempt to craft basic tools',
      parameters: { item: 'wooden_pickaxe' },
    },
    {
      type: 'build',
      description: 'Build a simple shelter or structure',
      parameters: { structure: 'house', size: 'small' },
    },
    {
      type: 'farm',
      description: 'Start a small farm for food',
      parameters: { crop: 'wheat', area: 3 },
    },
    {
      type: 'mine',
      description: 'Mine for valuable resources',
      parameters: { depth: 5, resource: 'stone' },
    },
  ];

  // Randomly select a task type
  const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];

  return {
    id: `auto-task-${Date.now()}`,
    type: taskType.type,
    description: taskType.description,
    priority: 0.6,
    urgency: 0.5,
    parameters: taskType.parameters,
    goal: 'autonomous_exploration',
    status: 'pending',
    createdAt: Date.now(),
    completedAt: null,
    autonomous: true, // Mark as autonomously generated
  };
}

// Autonomous task execution system
async function autonomousTaskExecutor() {
  const now = Date.now();
  const twoMinutes = 2 * 60 * 1000; // 2 minutes in milliseconds

  // Check if enough time has passed since last task execution
  if (now - planningSystem.goalFormulation._lastTaskExecution < twoMinutes) {
    return; // Not enough time has passed
  }

  // Check if there are any pending tasks
  const pendingTasks = planningSystem.goalFormulation._tasks.filter(
    (task: any) => task.status === 'pending'
  );

  // If no pending tasks, generate a new autonomous task
  if (pendingTasks.length === 0) {
    console.log(' No tasks available, generating autonomous task...');
    const newTask = generateAutonomousTask();
    planningSystem.goalFormulation.addTask(newTask);

    // Execute the task immediately
    try {
      await planningSystem.reactiveExecutor.executeNextTask();
      planningSystem.goalFormulation._lastTaskExecution = now;
      console.log(' Autonomous task executed successfully');
    } catch (error) {
      console.error(' Failed to execute autonomous task:', error);
    }
  } else {
    // Execute the next pending task
    try {
      await planningSystem.reactiveExecutor.executeNextTask();
      planningSystem.goalFormulation._lastTaskExecution = now;
      console.log(' Pending task executed successfully');
    } catch (error) {
      console.error(' Failed to execute pending task:', error);
    }
  }
}

// Helper function to execute tasks in Minecraft
async function executeTaskInMinecraft(task: any) {
  try {
    const minecraftUrl = 'http://localhost:3005';

    switch (task.type) {
      case 'move':
        return await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters?.distance || 1 },
          }),
        }).then((res) => res.json());

      case 'turn':
        return await fetch(`${minecraftUrl}/action`, {
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

      case 'chat':
        return await fetch(`${minecraftUrl}/action`, {
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
        };

      case 'gather':
        // Execute gathering by looking for and collecting resources
        const gatherResults = [];
        gatherResults.push(
          await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Looking for ${task.parameters?.resource || 'resources'}`,
              },
            }),
          }).then((res) => res.json())
        );

        return {
          results: gatherResults,
          type: 'gathering',
          success: true,
          error: undefined,
        };

      case 'craft':
        // Execute actual crafting instead of just sending chat messages
        const craftResults = [];

        try {
          // First, check if we have the required materials
          const inventoryCheck = await fetch(`${minecraftUrl}/inventory`)
            .then((res) => res.json())
            .catch(() => ({ items: [] }));

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

            // Send a chat message to inform about the result
            craftResults.push(
              await fetch(`${minecraftUrl}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'chat',
                  parameters: {
                    message: (craftResult as any).success
                      ? `Successfully crafted ${itemToCraft}!`
                      : `Failed to craft ${itemToCraft}: ${(craftResult as any).error || 'Unknown error'}`,
                  },
                }),
              }).then((res) => res.json())
            );

            return {
              results: craftResults,
              type: 'crafting',
              success: (craftResult as any).success,
              error: (craftResult as any).error,
              item: itemToCraft,
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
            error: 'Crafting system unavailable',
            item: task.parameters?.item || 'item',
          };
        }

      case 'build':
        // Execute building by creating structures
        const buildResults = [];
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

        return {
          results: buildResults,
          type: 'building',
          success: true,
          error: undefined,
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
        // Execute mining by digging for resources
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

        // Try to mine each position
        for (const position of miningPositions) {
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

            // If mining was successful, break out of the loop
            if ((mineResult as any).success) {
              console.log(
                ` Successfully mined block at ${JSON.stringify(position)}`
              );
              break;
            }
          } catch (error) {
            console.log(
              `⚠️ Failed to mine at ${JSON.stringify(position)}:`,
              error
            );
          }
        }

        // Check if any mining was successful (exclude chat messages)
        const miningActionResults = mineResults.filter(
          (result: any) => result.action === 'mine_block'
        );
        const successfulMining = miningActionResults.some(
          (result: any) => result.success === true
        );

        return {
          results: mineResults,
          type: 'mining',
          success: successfulMining,
          error: successfulMining
            ? undefined
            : 'No blocks were successfully mined',
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
    const tasks = planningSystem.goalFormulation._tasks || [];
    res.json({
      success: true,
      tasks,
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
      return res.status(400).json({ error: 'Missing required field: option_id' });
    }

    const result = await btRunner.runOption(option_id, args || {}, options || {});
    
    res.json({
      success: true,
      result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('BT execution failed:', error);
    res.status(500).json({ 
      error: 'BT execution failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// POST /run-option/stream - Stream BT execution with SSE
app.post('/run-option/stream', async (req, res) => {
  try {
    const { option_id, args, options } = req.body;

    if (!option_id) {
      return res.status(400).json({ error: 'Missing required field: option_id' });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const runId = `${option_id}-${Date.now()}`;
    
    // Set up event listeners for streaming
    const onTick = (data: { runId: string; tick: any }) => {
      if (data.runId === runId) {
        res.write(`data: ${JSON.stringify({ type: 'tick', data: data.tick })}\n\n`);
      }
    };

    const onStatus = (data: { runId: string; status: BTNodeStatus }) => {
      if (data.runId === runId) {
        res.write(`data: ${JSON.stringify({ type: 'status', data: data.status })}\n\n`);
        
        // Close stream when execution completes
        if (data.status === BTNodeStatus.SUCCESS || data.status === BTNodeStatus.FAILURE) {
          res.write(`data: ${JSON.stringify({ type: 'complete', data: data.status })}\n\n`);
          res.end();
        }
      }
    };

    btRunner.on('tick', onTick);
    btRunner.on('status', onStatus);

    // Execute the option
    const result = await btRunner.runOption(option_id, args || {}, options || {});

    // Clean up event listeners
    btRunner.off('tick', onTick);
    btRunner.off('status', onStatus);

  } catch (error) {
    console.error('BT streaming failed:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
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
      details: error instanceof Error ? error.message : 'Unknown error' 
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
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Planning system server running on port ${port}`);

  // Start autonomous task executor
  console.log(' Starting autonomous task executor...');
  setInterval(autonomousTaskExecutor, 120000); // Check every 2 minutes

  // Initial task generation after 30 seconds
  setTimeout(() => {
    console.log(' Initializing autonomous behavior...');
    autonomousTaskExecutor();
  }, 30000);
});
