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

// Initialize cognitive thought processor
const cognitiveThoughtProcessor = new CognitiveThoughtProcessor({
  enableThoughtToTaskTranslation: true,
  thoughtProcessingInterval: 30000, // 30 seconds
  maxThoughtsPerBatch: 5,
  planningEndpoint: 'http://localhost:3002',
  cognitiveEndpoint: 'http://localhost:3003',
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

      // Check for duplicate tasks (same type and description within last 30 seconds)
      const thirtySecondsAgo = Date.now() - 30000;
      const isDuplicate = planningSystem.goalFormulation._tasks.some(
        (existingTask: any) =>
          existingTask.type === task.type &&
          existingTask.description === task.description &&
          existingTask.createdAt > thirtySecondsAgo
      );

      if (isDuplicate) {
        console.log(
          ` Skipping duplicate task: ${task.type} - ${task.description}`
        );
        return;
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
    getCurrentPlan: () => ({
      id: 'current-plan-1',
      name: 'Survival and Exploration',
      description:
        'Establish basic survival infrastructure and explore the environment',
      steps: [
        {
          id: 'step-1',
          name: 'Find shelter',
          status: 'completed',
          priority: 0.9,
        },
        {
          id: 'step-2',
          name: 'Gather resources',
          status: 'in_progress',
          priority: 0.8,
        },
        {
          id: 'step-3',
          name: 'Explore cave system',
          status: 'pending',
          priority: 0.6,
        },
        {
          id: 'step-4',
          name: 'Establish farming',
          status: 'pending',
          priority: 0.5,
        },
      ],
      progress: 0.25,
      estimatedDuration: 3600000, // 1 hour
      createdAt: Date.now() - 1800000, // 30 minutes ago
    }),
    getPlanQueue: () => [
      {
        id: 'plan-2',
        name: 'Resource Optimization',
        description: 'Improve resource gathering efficiency and storage',
        priority: 0.7,
        estimatedDuration: 2400000, // 40 minutes
      },
      {
        id: 'plan-3',
        name: 'Defense Preparation',
        description: 'Build defensive structures and prepare for threats',
        priority: 0.6,
        estimatedDuration: 1800000, // 30 minutes
      },
    ],
    isPlanningActive: () => true,
  },
  reactiveExecutor: {
    getCurrentAction: () => ({
      id: 'action-1',
      name: 'Gather Wood',
      type: 'gather',
      target: 'oak_log',
      priority: 0.8,
      startedAt: Date.now() - 30000, // 30 seconds ago
      estimatedDuration: 120000, // 2 minutes
      progress: 0.25,
    }),
    getActionQueue: () => [
      {
        id: 'action-2',
        name: 'Craft Wooden Planks',
        type: 'craft',
        priority: 0.7,
      },
      {
        id: 'action-3',
        name: 'Build Basic Shelter',
        type: 'build',
        priority: 0.9,
      },
      {
        id: 'action-4',
        name: 'Explore Surroundings',
        type: 'explore',
        priority: 0.6,
      },
    ],
    isExecuting: () => true,
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
        }

        // Debug logging after status update
        console.log(` Task Validation for ${task.type}:`, {
          taskId: task.id,
          resultSuccess: (result as any).success,
          resultError: (result as any).error,
          resultType: (result as any).type,
          taskCompleted,
          taskStatus: task.status,
        });

        // Check if task should be abandoned based on cognitive feedback (only for failed tasks)
        if (!taskCompleted) {
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

// Helper function to generate autonomous tasks based on goals
async function generateAutonomousTask() {
  // Check current bot state for threats and health
  let threatLevel = 0;
  let healthLevel = 100;
  let isNight = false;

  try {
    const minecraftUrl = 'http://localhost:3005';
    const botStatus = await fetch(`${minecraftUrl}/health`).then((res) =>
      res.json()
    );

    if (botStatus.botStatus?.health) {
      healthLevel = botStatus.botStatus.health;
    }

    // Check if it's night time (phantoms spawn at night)
    const worldState = await fetch(`${minecraftUrl}/state`).then((res) =>
      res.json()
    );
    if (worldState.data?.worldState?.environment?.timeOfDay) {
      const timeOfDay = worldState.data.worldState.environment.timeOfDay;
      isNight = timeOfDay > 13000 || timeOfDay < 1000; // Night time in Minecraft
    }

    // Calculate threat level based on health and time
    if (healthLevel < 90) threatLevel += 30; // Moderate threat if health is below 90%
    if (healthLevel < 70) threatLevel += 40; // High threat if health is below 70%
    if (healthLevel < 50) threatLevel += 50; // Very high threat if health is below 50%
    if (healthLevel < 30) threatLevel += 60; // Critical threat if health is below 30%
    if (isNight && healthLevel < 95) threatLevel += 30; // Night vulnerability
  } catch (error) {
    console.log(' Could not check bot state for threat assessment');
  }

  // If under threat, prioritize defensive tasks
  if (threatLevel > 20) {
    // Lowered from 30 to 20 for faster response
    const defensiveTasks = [
      {
        type: 'flee',
        description: 'Flee from immediate danger to a safe location',
        parameters: { direction: 'away_from_threat', distance: 10 },
        priority: 0.9,
        urgency: 0.9,
      },
      {
        type: 'seek_shelter',
        description: 'Find or build shelter to protect from threats',
        parameters: { shelter_type: 'cave_or_house', light_sources: true },
        priority: 0.8,
        urgency: 0.8,
      },
      {
        type: 'heal',
        description: 'Restore health by eating food or finding healing items',
        parameters: { food_type: 'any', amount: 1 },
        priority: 0.7,
        urgency: 0.7,
      },
      {
        type: 'place_light',
        description:
          'Place light sources to deter phantoms and other hostile mobs',
        parameters: { light_type: 'torch', count: 3 },
        priority: 0.6,
        urgency: 0.6,
      },
    ];

    // Select the most appropriate defensive task based on threat level
    let selectedTask;
    if (healthLevel < 20) {
      // Critical health - flee immediately
      selectedTask =
        defensiveTasks.find((t) => t.type === 'flee') || defensiveTasks[0];
    } else if (healthLevel < 30) {
      // Very low health - heal first, then flee
      selectedTask =
        defensiveTasks.find((t) => t.type === 'heal') || defensiveTasks[0];
    } else if (isNight) {
      // Night time - seek shelter first, then place light
      selectedTask =
        defensiveTasks.find((t) => t.type === 'seek_shelter') ||
        defensiveTasks.find((t) => t.type === 'place_light') ||
        defensiveTasks[1];
    } else {
      // General threat - seek shelter first, then flee
      selectedTask =
        defensiveTasks.find((t) => t.type === 'seek_shelter') ||
        defensiveTasks.find((t) => t.type === 'flee') ||
        defensiveTasks[0];
    }

    return {
      id: `defense-task-${Date.now()}`,
      type: selectedTask.type,
      description: selectedTask.description,
      priority: selectedTask.priority,
      urgency: selectedTask.urgency,
      parameters: selectedTask.parameters,
      goal: 'survival_defense',
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      defensive: true, // Mark as defensive task
    };
  }

  // Normal exploration tasks when not under threat
  const taskTypes = [
    {
      type: 'gather',
      description: 'Gather wood from nearby trees',
      parameters: { resource: 'wood', amount: 3, target: 'tree' },
    },
    {
      type: 'mine',
      description: 'Mine stone blocks for building',
      parameters: { block: 'stone', amount: 5 },
    },
    {
      type: 'explore',
      description: 'Explore the area for resources',
      parameters: {
        distance: 10,
        direction: 'forward',
        search_pattern: 'spiral',
      },
    },
    {
      type: 'craft',
      description: 'Craft wooden planks from gathered wood',
      parameters: { item: 'planks', quantity: 4, require_materials: true },
    },
    {
      type: 'craft',
      description: 'Craft a wooden pickaxe',
      parameters: {
        item: 'wooden_pickaxe',
        quantity: 1,
        require_materials: true,
      },
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
    const newTask = await generateAutonomousTask();
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

    // Check if the bot is connected first
    const botStatus = await fetch(`${minecraftUrl}/health`).then((res) =>
      res.json()
    );
    if (!botStatus.executionStatus?.bot?.connected) {
      return {
        success: false,
        error: 'Bot not connected to Minecraft server',
        botStatus: botStatus,
        type: task.type,
      };
    }

    switch (task.type) {
      case 'move':
        const result = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters?.distance || 1 },
          }),
        }).then((res) => res.json());

        return {
          ...result,
          botStatus: botStatus,
        };

      case 'move_forward':
        const moveForwardResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'move_forward',
            parameters: { distance: task.parameters?.distance || 1 },
          }),
        }).then((res) => res.json());

        return {
          ...moveForwardResult,
          botStatus: botStatus,
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
          ...fleeResult,
          botStatus: botStatus,
          defensive: true,
        };

      case 'heal':
        // Try to eat food to heal
        const healResult = await fetch(`${minecraftUrl}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'consume_food',
            parameters: { food_type: task.parameters?.food_type || 'any' },
          }),
        }).then((res) => res.json());

        return {
          ...healResult,
          botStatus: botStatus,
          defensive: true,
        };

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
          ...lightResult,
          botStatus: botStatus,
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
          ...shelterResult,
          botStatus: botStatus,
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
          ...turnResult,
          botStatus: botStatus,
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
          ...chatResult,
          botStatus: botStatus,
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
        // Execute actual gathering instead of just sending chat messages
        const gatherResults = [];

        try {
          // First, look for the specified resource
          const searchResult = await fetch(`${minecraftUrl}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'search_for_resource',
              parameters: {
                resource: task.parameters?.resource || 'any',
                target: task.parameters?.target,
                search_radius: task.parameters?.search_radius || 5,
              },
            }),
          }).then((res) => res.json());

          gatherResults.push(searchResult);

          // If we found something, try to collect it
          if (
            (searchResult as any).success &&
            (searchResult as any).foundResource
          ) {
            const collectResult = await fetch(`${minecraftUrl}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'collect_resource',
                parameters: {
                  resource: (searchResult as any).resourceType,
                  amount: task.parameters?.amount || 1,
                  position: (searchResult as any).position,
                },
              }),
            }).then((res) => res.json());

            gatherResults.push(collectResult);

            // Send a chat message about what we found
            gatherResults.push(
              await fetch(`${minecraftUrl}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'chat',
                  parameters: {
                    message: (collectResult as any).success
                      ? `Found and collected ${(searchResult as any).resourceType}!`
                      : `Found ${(searchResult as any).resourceType} but couldn't collect it`,
                  },
                }),
              }).then((res) => res.json())
            );
          } else {
            // No resource found - send informative message
            gatherResults.push(
              await fetch(`${minecraftUrl}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'chat',
                  parameters: {
                    message: `No ${task.parameters?.resource || 'resources'} found nearby`,
                  },
                }),
              }).then((res) => res.json())
            );
          }

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

// Get reflective notes
app.get('/notes', (req, res) => {
  try {
    const notes = [
      {
        id: `note-${Date.now()}`,
        timestamp: Date.now() - 300000, // 5 minutes ago
        type: 'reflection',
        title: 'Resource Scarcity Observation',
        content:
          'The plains biome appears to have limited resources. Should prioritize agriculture and explore cave systems for minerals.',
        insights: ['Resource management critical', 'Exploration needed'],
        priority: 0.8,
      },
      {
        id: `note-${Date.now()}-2`,
        timestamp: Date.now() - 420000, // 7 minutes ago
        type: 'strategy',
        title: 'Defensive Protocol Effectiveness',
        content:
          'Flee response was successful in avoiding immediate danger. Should maintain defensive awareness during night time.',
        insights: [
          'Defensive protocols working',
          'Night time vigilance important',
        ],
        priority: 0.9,
      },
      {
        id: `note-${Date.now()}-3`,
        timestamp: Date.now() - 540000, // 9 minutes ago
        type: 'learning',
        title: 'Task Execution Patterns',
        content:
          'Simple tasks like gathering wood are more reliable than complex crafting operations. Should break down complex tasks into smaller steps.',
        insights: [
          'Task decomposition effective',
          'Simple tasks more reliable',
        ],
        priority: 0.7,
      },
    ];

    res.json({
      notes,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Get events
app.get('/events', (req, res) => {
  try {
    const events = [
      {
        id: `event-${Date.now()}`,
        timestamp: Date.now() - 60000, // 1 minute ago
        type: 'task_completed',
        title: 'Flee Task Completed',
        description:
          'Successfully fled from immediate danger to a safe location',
        source: 'planning',
        data: {
          taskId: 'defense-task-1756085123897',
          taskType: 'flee',
          result: 'success',
        },
      },
      {
        id: `event-${Date.now()}-2`,
        timestamp: Date.now() - 120000, // 2 minutes ago
        type: 'task_started',
        title: 'Resource Gathering Started',
        description: 'Began gathering wood and other essential resources',
        source: 'planning',
        data: {
          taskId: 'gather-task-1',
          taskType: 'gather',
          target: 'oak_log',
        },
      },
      {
        id: `event-${Date.now()}-3`,
        timestamp: Date.now() - 180000, // 3 minutes ago
        type: 'plan_created',
        title: 'Survival Plan Created',
        description:
          'Established comprehensive survival and exploration strategy',
        source: 'hierarchical_planner',
        data: {
          planId: 'current-plan-1',
          planName: 'Survival and Exploration',
          steps: 4,
        },
      },
      {
        id: `event-${Date.now()}-4`,
        timestamp: Date.now() - 240000, // 4 minutes ago
        type: 'environment_change',
        title: 'Night Time Detected',
        description:
          'Environment shifted to night time, activating defensive protocols',
        source: 'world',
        data: {
          timeOfDay: 'night',
          weather: 'clear',
        },
      },
    ];

    res.json({
      events,
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

  // Start cognitive thought processor
  console.log(' Starting cognitive thought processor...');
  cognitiveThoughtProcessor.startProcessing();
});
