/**
 * Planning Endpoints Module
 *
 * Provides HTTP endpoints for planning operations.
 * Extracted from the main server file for better code organization.
 *
 * @author @darianrosebrook
 */

import { Router, Request, Response } from 'express';
import { MinecraftExecutor } from '../reactive-executor/minecraft-executor';
import { PlanStatus, PlanStepStatus, ActionType } from '../types';

export interface PlanningSystem {
  goalFormulation: {
    getCurrentGoals: () => any[];
    getActiveGoals: () => any[];
    getGoalCount: () => number;
    getCurrentTasks: () => any[];
    addGoal?: (goal: any) => Promise<any> | any;
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
              requirement: t.metadata?.requirement,
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

  // POST /goal - Create a new goal (and optional tasks)
  router.post('/goal', async (req: Request, res: Response) => {
    try {
      const { name, description, priority = 0.5, urgency = 0.5, tasks = [] } =
        req.body || {};

      if (!description && !name) {
        return res.status(400).json({
          success: false,
          error: 'Missing goal description or name',
        });
      }

      // Create minimal goal record via planning system if available
      const goal = {
        id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: inferGoalType(description || name || ''),
        priority,
        urgency,
        utility: (priority + urgency) / 2,
        description: description || name,
        preconditions: [],
        effects: [],
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      if (planningSystem.goalFormulation.addGoal) {
        await planningSystem.goalFormulation.addGoal(goal);
      }

      // Optionally add associated tasks into the queue
      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          try {
            await planningSystem.goalFormulation.addTask({
              title: t.title || t.name || t.description || 'Untitled Task',
              description: t.description || t.title || '',
              type: inferTaskType(t.type, t.description || t.title || name || ''),
              priority: t.priority ?? priority,
              urgency: t.urgency ?? urgency,
              source: 'goal',
              parameters: t.parameters || {},
              metadata: {
                category: t.category || 'general',
                tags: t.tags || [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                retryCount: 0,
                maxRetries: 3,
                parentGoalId: goal.id,
                childTaskIds: [],
              },
            });
          } catch (e) {
            // Continue; one bad task shouldn't block goal creation
          }
        }
      }

      return res.json({ success: true, goalId: goal.id, goal });
    } catch (error) {
      console.error('Failed to create goal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create goal',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  function inferGoalType(text: string): string {
    const t = text.toLowerCase();
    if (/(explore|find|search|scout)/.test(t)) return 'exploration';
    if (/(craft|build|create|make)/.test(t)) return 'achievement';
    if (/(gather|collect|obtain|get)/.test(t)) return 'acquire_item';
    if (/(mine|dig)/.test(t)) return 'achievement';
    if (/(survive|avoid|threat|danger)/.test(t)) return 'survive_threat';
    return 'curiosity';
  }

  function inferTaskType(explicitType: string | undefined, text: string): string {
    const t = (explicitType || '').toLowerCase();
    if (t && t !== 'autonomous' && t !== 'manual') return t;
    const s = (text || '').toLowerCase();
    if (/(gather|collect|wood|log)/.test(s)) return 'gathering';
    if (/(craft|build|make|create|table|pickaxe|stick|plank)/.test(s))
      return 'crafting';
    if (/(mine|iron|stone|ore|dig)/.test(s)) return 'mining';
    if (/(explore|search|scout|look around)/.test(s)) return 'exploration';
    if (/(farm|plant|harvest)/.test(s)) return 'farming';
    if (/(move|go to|walk)/.test(s)) return 'navigation';
    return 'gathering';
  }

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

  // POST /execute-plan - Execute a plan with Minecraft bot
  router.post('/execute-plan', async (req: Request, res: Response) => {
    try {
      const { planId, taskId } = req.body;

      if (!planId && !taskId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: planId or taskId',
        });
      }

      // Create Minecraft executor
      const minecraftExecutor = new MinecraftExecutor();

      // Check if Minecraft interface is available
      const isConnected = await minecraftExecutor.checkConnection();
      if (!isConnected) {
        return res.status(503).json({
          success: false,
          error: 'Minecraft interface not available',
        });
      }

      let plan;
      if (planId) {
        // Execute specific plan
        plan = {
          id: planId,
          goalId: planId,
          steps: [],
          status: PlanStatus.PENDING,
          priority: 0.5,
          estimatedDuration: 30000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          successProbability: 0.8,
        }; // This would need to be fetched from storage
      } else if (taskId) {
        // Generate plan from task and execute
        const task = planningSystem.goalFormulation
          .getCurrentTasks()
          .find((t: any) => t.id === taskId);

        if (!task) {
          return res.status(404).json({
            success: false,
            error: 'Task not found',
          });
        }

        // Convert task to plan (simplified)
        plan = {
          id: `plan-${taskId}`,
          goalId: taskId,
          steps: [
            {
              id: `step-${taskId}-1`,
              planId: `plan-${taskId}`,
              action: {
                id: `action-${taskId}-1`,
                name: task.title,
                description: task.title,
                type: mapTaskTypeToAction(task.type) as any,
                parameters: getActionParameters(task.type),
                preconditions: [],
                effects: [],
                cost: 1,
                duration: 30000,
                successProbability: 0.8,
              },
              preconditions: [],
              effects: [],
              status: PlanStepStatus.PENDING,
              order: 1,
              estimatedDuration: 30000,
              dependencies: [],
            },
          ],
          status: PlanStatus.PENDING,
          priority: task.priority || 0.5,
          estimatedDuration: 30000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          successProbability: 0.8,
        };
      }

      if (!plan || plan.steps.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No plan to execute',
        });
      }

      console.log(
        `🎮 Executing plan ${plan.id} with ${plan.steps.length} steps...`
      );

      // Execute the plan
      const results = await minecraftExecutor.executePlan(plan);

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      res.json({
        success: true,
        planId: plan.id,
        message: `Plan executed: ${successCount} successful, ${failureCount} failed`,
        results,
        summary: {
          totalSteps: plan.steps.length,
          successfulSteps: successCount,
          failedSteps: failureCount,
          successRate: successCount / plan.steps.length,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to execute plan:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Helper functions for task-to-action mapping
  function mapTaskTypeToAction(taskType: string): string {
    const typeMap: Record<string, string> = {
      gathering: 'navigate',
      crafting: 'craft_item',
      exploration: 'navigate',
      mine: 'dig_block',
      navigate: 'navigate',
      build: 'place_block',
    };
    return typeMap[taskType] || 'navigate';
  }

  function getActionParameters(taskType: string): Record<string, any> {
    const paramMap: Record<string, Record<string, any>> = {
      gathering: { target: 'auto_detect', max_distance: 30 },
      crafting: { item: 'auto_detect', materials: 'auto_collect' },
      exploration: { target: 'auto_detect', max_distance: 25 },
      mine: { pos: 'nearest_valuable', tool: 'auto_select' },
      navigate: { target: 'auto_detect', max_distance: 50 },
      build: { block_type: 'auto_select', position: 'optimal_location' },
    };
    return paramMap[taskType] || { target: 'auto_detect', max_distance: 15 };
  }

  return router;
}
