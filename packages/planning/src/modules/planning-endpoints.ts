/**
 * Planning Endpoints Module
 *
 * Provides HTTP endpoints for planning operations.
 * Extracted from the main server file for better code organization.
 *
 * @author @darianrosebrook
 */

import { Router, Request, Response } from 'express';

export interface PlanningSystem {
  goalFormulation: {
    getCurrentGoals: () => any[];
    getActiveGoals: () => any[];
    getGoalCount: () => number;
    getCurrentTasks: () => any[];
    addTask: (task: any) => void;
    getCompletedTasks: () => any[];
  };
  execution: {
    executeGoal: (goal: any) => Promise<any>;
    executeTask: (task: any) => Promise<any>;
  };
}

export function createPlanningEndpoints(
  planningSystem: PlanningSystem
): Router {
  const router = Router();

  // GET /health - Health check endpoint
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  // GET /planner - Get planning system status
  router.get('/planner', (req: Request, res: Response) => {
    try {
      const currentGoals = planningSystem.goalFormulation.getCurrentGoals();
      const activeGoals = planningSystem.goalFormulation.getActiveGoals();
      const currentTasks = planningSystem.goalFormulation.getCurrentTasks();

      // Convert tasks to the expected PlannerData format
      const currentPlan =
        currentTasks.length > 0
          ? {
              id: currentTasks[0].id,
              name: currentTasks[0].title,
              description: currentTasks[0].description,
              steps:
                currentTasks[0].steps?.map((step: any) => ({
                  id: step.id,
                  name: step.label,
                  status: step.done ? 'completed' : 'pending',
                  priority: 0.5,
                })) || [],
              progress: currentTasks[0].progress || 0,
              estimatedDuration: 30000, // Default 30 seconds
              createdAt: currentTasks[0].metadata?.createdAt || Date.now(),
            }
          : null;

      const planQueue = currentTasks.slice(1).map((task: any) => ({
        id: task.id,
        name: task.title,
        description: task.description,
        estimatedDuration: 30000,
      }));

      const currentAction =
        currentTasks.length > 0
          ? {
              id: currentTasks[0].id,
              name: currentTasks[0].title,
              type: currentTasks[0].type,
              target: undefined,
              priority: currentTasks[0].priority || 0.5,
              startedAt: currentTasks[0].metadata?.startedAt,
              estimatedDuration: 30000,
              progress: currentTasks[0].progress || 0,
            }
          : null;

      const actionQueue = currentTasks.slice(1).map((task: any) => ({
        id: task.id,
        name: task.title,
        type: task.type,
        target: undefined,
        priority: task.priority || 0.5,
        startedAt: task.metadata?.startedAt,
        estimatedDuration: 30000,
        progress: task.progress || 0,
      }));

      res.json({
        currentPlan,
        planQueue,
        currentAction,
        actionQueue,
        isPlanningActive: currentGoals.length > 0,
        isExecuting: currentTasks.length > 0,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to get planner status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get planner status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /state - Get current system state
  router.get('/state', (req: Request, res: Response) => {
    try {
      const currentGoals = planningSystem.goalFormulation.getCurrentGoals();
      const activeGoals = planningSystem.goalFormulation.getActiveGoals();
      const currentTasks = planningSystem.goalFormulation.getCurrentTasks();
      const completedTasks = planningSystem.goalFormulation.getCompletedTasks();

      res.json({
        success: true,
        state: {
          goals: {
            current: currentGoals.map((g: any) => ({
              id: g.id,
              type: g.type,
              description: g.description,
              priority: g.priority,
              status: g.status,
            })),
            active: activeGoals.map((g: any) => ({
              id: g.id,
              type: g.type,
              description: g.description,
              priority: g.priority,
              status: g.status,
            })),
          },
          tasks: {
            current: currentTasks.map((t: any) => ({
              id: t.id,
              title: t.title,
              type: t.type,
              status: t.status,
              progress: t.progress,
            })),
            completed: completedTasks.length,
          },
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to get system state:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system state',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /task - Add a new task
  router.post('/task', async (req: Request, res: Response) => {
    try {
      const task = req.body;

      if (!task || !task.type || !task.description) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: type, description',
        });
      }

      // Add task to planning system
      await planningSystem.goalFormulation.addTask(task);

      res.json({
        success: true,
        taskId: task.id,
        message: `Task added: ${task.type} - ${task.description}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to add task:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add task',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /tasks - Get all tasks
  router.get('/tasks', (req: Request, res: Response) => {
    try {
      const currentTasks = planningSystem.goalFormulation.getCurrentTasks();
      const completedTasks = planningSystem.goalFormulation.getCompletedTasks();

      res.json({
        success: true,
        tasks: {
          current: currentTasks,
          completed: completedTasks,
          total: currentTasks.length + completedTasks.length,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to get tasks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tasks',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /execute - Execute a goal or task
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { type, id, data } = req.body;

      if (!type || !id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: type, id',
        });
      }

      let result;
      if (type === 'goal') {
        const goal = planningSystem.goalFormulation
          .getCurrentGoals()
          .find((g: any) => g.id === id);
        if (!goal) {
          return res.status(404).json({
            success: false,
            error: 'Goal not found',
          });
        }
        result = await planningSystem.execution.executeGoal(goal);
      } else if (type === 'task') {
        const task = planningSystem.goalFormulation
          .getCurrentTasks()
          .find((t: any) => t.id === id);
        if (!task) {
          return res.status(404).json({
            success: false,
            error: 'Task not found',
          });
        }
        result = await planningSystem.execution.executeTask(task);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid type. Must be "goal" or "task"',
        });
      }

      res.json({
        success: true,
        result,
        message: `${type} executed successfully`,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to execute:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /autonomous - Trigger autonomous execution
  router.post('/autonomous', async (req: Request, res: Response) => {
    try {
      console.log('🚀 Triggering autonomous execution...');

      // Get current goals and execute them
      const activeGoals = planningSystem.goalFormulation.getActiveGoals();

      const results = [];
      for (const goal of activeGoals) {
        try {
          const result = await planningSystem.execution.executeGoal(goal);
          results.push({ goalId: goal.id, success: true, result });
        } catch (error) {
          results.push({
            goalId: goal.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        message: 'Autonomous execution completed',
        results,
        goalsProcessed: activeGoals.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to trigger autonomous execution:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to trigger autonomous execution',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
