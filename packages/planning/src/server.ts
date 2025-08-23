/**
 * Planning System HTTP Server
 *
 * Provides HTTP API endpoints for the planning system.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize planning system (simplified for now)
const planningSystem = {
  goalFormulation: {
    getCurrentGoals: () => [],
    getActiveGoals: () => [],
    getGoalCount: () => 0,
    getCurrentTasks: () => [],
    getCompletedTasks: () => [],
    addTask: (task: any) => {
      // Simple in-memory task storage
      if (!planningSystem.goalFormulation._tasks) {
        planningSystem.goalFormulation._tasks = [];
      }
      planningSystem.goalFormulation._tasks.push(task);
    },
    _tasks: [] as any[],
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

      const task = tasks.shift(); // Remove and get first task
      if (!task) {
        throw new Error('No task available');
      }

      // Execute the task by sending commands to Minecraft bot
      const result = await executeTaskInMinecraft(task);

      // Mark task as completed
      task.status = 'completed';
      task.completedAt = Date.now();

      return { task, result };
    },
  },
};

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
              message: task.parameters?.message || 'Executing task!',
            },
          }),
        }).then((res) => res.json());

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
    };

    res.json(state);
  } catch (error) {
    console.error('Error getting planning state:', error);
    res.status(500).json({ error: 'Failed to get planning state' });
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

// Start server
app.listen(port, () => {
  console.log(`Planning system server running on port ${port}`);
});
