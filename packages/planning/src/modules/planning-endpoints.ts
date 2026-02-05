/**
 * Planning Endpoints Module
 *
 * Provides HTTP endpoints for planning operations.
 * Extracted from the main server file for better code organization.
 *
 * @author @darianrosebrook
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { MinecraftExecutor } from '../reactive-executor/minecraft-executor';
import { PlanStatus, PlanStepStatus, ActionType } from '../types';
import { getSystemReadyState, markSystemReady } from '../startup-barrier';

export interface PlanningSystem {
  goalFormulation: {
    getCurrentGoals: () => any[];
    getActiveGoals: () => any[];
    getGoalCount: () => number;
    getCurrentTasks: () => any[];
    addGoal?: (goal: any) => Promise<any> | any;
    addTask: (task: any) => Promise<any> | void;
    getCompletedTasks: () => any[];
    reprioritizeGoal?: (
      goalId: string,
      priority?: number,
      urgency?: number
    ) => void;
    cancelGoal?: (goalId: string, reason?: string) => void;
    pauseGoal?: (goalId: string) => void;
    resumeGoal?: (goalId: string) => void;
    getGoalStatus?: (goalId: string) => any;
    completeGoal?: (goalId: string) => void;
    updateBotInstance?: (botInstance: any) => Promise<any>;
  };
  execution: {
    executeGoal: (goal: any) => Promise<any>;
    executeTask: (task: any) => Promise<any>;
  };
}

/**
 * Task types that do not require a requirementCandidate (non-goal / advisory / social).
 * Intrusive thoughts like "What was I working on?" produce social/reflection tasks;
 * planning accepts them without inferrable parameters.
 */
const NON_GOAL_TASK_TYPES = new Set([
  'general',
  'social',
  'reflection',
  'status',
  'advisory_action',
  'inventory',
  'survival',
]);

const PLANNING_INGEST_DEBUG_400 =
  process.env.PLANNING_INGEST_DEBUG_400 === '1';

type IngestShapeReport = {
  topLevelKeys: string[];
  bodySizeBytes: number | null;
  contentType: string | null;
  keyPresence: Record<string, boolean>;
  missingFields: string[];
};

function getRequestId(req: Request): string {
  const fromHeader = req.header('x-request-id');
  return fromHeader && fromHeader.trim().length > 0 ? fromHeader : crypto.randomUUID();
}

function inspectTaskPayload(taskData: any, contentType: string | null): IngestShapeReport {
  const topLevelKeys = Object.keys(taskData || {});
  const metadata = taskData?.metadata;
  const reduction = metadata?.reduction;
  const reducerResult = reduction?.reducerResult;

  const keyPresence: Record<string, boolean> = {
    'task.id': typeof taskData?.id === 'string',
    'task.title': typeof taskData?.title === 'string' && taskData.title.length > 0,
    'task.description': typeof taskData?.description === 'string' && taskData.description.length > 0,
    'task.type': typeof taskData?.type === 'string' && taskData.type.length > 0,
    'task.priority': typeof taskData?.priority === 'number',
    'task.source': typeof taskData?.source === 'string' && taskData.source.length > 0,
    'task.steps': Array.isArray(taskData?.steps),
    'task.metadata': typeof metadata === 'object' && metadata !== null,
    'metadata.thoughtId': typeof metadata?.thoughtId === 'string',
    'metadata.origin.thoughtId': typeof metadata?.origin?.thoughtId === 'string',
    'metadata.reduction': typeof reduction === 'object' && reduction !== null,
    'reduction.sterlingProcessed': typeof reduction?.sterlingProcessed === 'boolean',
    'reduction.isExecutable': typeof reduction?.isExecutable === 'boolean',
    'reduction.reducerResult.committed_ir_digest':
      typeof reducerResult?.committed_ir_digest === 'string' ||
      typeof reducerResult?.committedIrDigest === 'string',
  };

  const missingFields = Object.entries(keyPresence)
    .filter(([key, present]) => {
      // Only treat these as required for reporting purposes.
      return [
        'task.title',
        'task.description',
        'task.type',
        'task.metadata',
        'metadata.reduction',
        'reduction.sterlingProcessed',
        'reduction.isExecutable',
        'reduction.reducerResult.committed_ir_digest',
      ].includes(key) && !present;
    })
    .map(([key]) => key);

  const bodySizeBytes = taskData
    ? Buffer.byteLength(JSON.stringify(taskData), 'utf8')
    : 0;

  return {
    topLevelKeys,
    bodySizeBytes,
    contentType,
    keyPresence,
    missingFields,
  };
}

/**
 * Deterministic inference of `requirementCandidate` from legacy endpoint parameters.
 * Returns the candidate or null if inference fails.
 */
export function inferRequirementFromEndpointParams(
  taskData: any
): { kind: string; outputPattern: string; quantity: number } | null {
  const params = taskData.parameters || {};
  const type = (taskData.type || '').toLowerCase();

  // { recipe: string } → kind: 'craft'
  if (typeof params.recipe === 'string' && params.recipe) {
    return { kind: 'craft', outputPattern: params.recipe, quantity: params.qty || params.quantity || 1 };
  }

  // { item: string } + type → infer kind from type
  if (typeof params.item === 'string' && params.item) {
    const kindFromType: Record<string, string> = {
      crafting: 'craft',
      mining: 'mine',
      gathering: 'collect',
    };
    const kind = kindFromType[type];
    if (kind) {
      return { kind, outputPattern: params.item, quantity: params.quantity || 1 };
    }
  }

  // { blockType: string } → mine or collect based on type
  if (typeof params.blockType === 'string' && params.blockType) {
    const kind = type === 'mining' ? 'mine' : 'collect';
    return { kind, outputPattern: params.blockType, quantity: params.quantity || 1 };
  }

  // { resourceType: 'wood' } → collect any log type via suffix pattern
  if (typeof params.resourceType === 'string') {
    const resourceMap: Record<string, string> = {
      wood: '_log',
      stone: 'stone',
      iron: 'iron_ore',
    };
    const outputPattern = resourceMap[params.resourceType.toLowerCase()];
    if (outputPattern) {
      return { kind: 'collect', outputPattern, quantity: params.quantity || params.targetQuantity || 1 };
    }
  }

  return null;
}

// Track connected SSE clients for task updates
const taskUpdateClients: Set<Response> = new Set();

// Track connected SSE clients for valuation updates
const valuationUpdateClients: Set<Response> = new Set();

/**
 * Broadcast a valuation update to all connected SSE clients.
 * Called by the valuation emitter when a decision is made.
 */
export function broadcastValuationUpdate(eventData: any): void {
  if (valuationUpdateClients.size === 0) return;

  const message = JSON.stringify(eventData);

  for (const client of valuationUpdateClients) {
    try {
      client.write(`data: ${message}\n\n`);
    } catch {
      valuationUpdateClients.delete(client);
    }
  }
}

/**
 * Broadcast a task update to all connected SSE clients
 */
export function broadcastTaskUpdate(event: string, task: any): void {
  const message = JSON.stringify({
    type: 'task_update',
    event,
    data: { task },
    timestamp: Date.now(),
  });

  for (const client of taskUpdateClients) {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (error) {
      // Client disconnected, will be cleaned up
      taskUpdateClients.delete(client);
    }
  }
}

export function createPlanningEndpoints(
  planningSystem: PlanningSystem
): Router {
  const router = Router();

  // GET /task-updates - SSE endpoint for real-time task updates
  router.get('/task-updates', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Add client to the set
    taskUpdateClients.add(res);
    console.log(`[SSE] Client connected to task-updates (${taskUpdateClients.size} total)`);

    // Send initial task state
    const currentTasks = planningSystem.goalFormulation.getCurrentTasks();
    const initMessage = JSON.stringify({
      type: 'task_stream_init',
      data: { tasks: currentTasks },
      timestamp: Date.now(),
    });
    res.write(`data: ${initMessage}\n\n`);

    // Send keepalive every 30 seconds
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        clearInterval(keepaliveInterval);
        taskUpdateClients.delete(res);
      }
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepaliveInterval);
      taskUpdateClients.delete(res);
      console.log(`[SSE] Client disconnected from task-updates (${taskUpdateClients.size} remaining)`);
    });
  });

  // GET /valuation-updates - SSE endpoint for valuation decision updates
  router.get('/valuation-updates', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    valuationUpdateClients.add(res);
    console.log(`[SSE] Client connected to valuation-updates (${valuationUpdateClients.size} total)`);

    // Send keepalive every 30 seconds
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        clearInterval(keepaliveInterval);
        valuationUpdateClients.delete(res);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(keepaliveInterval);
      valuationUpdateClients.delete(res);
      console.log(`[SSE] Client disconnected from valuation-updates (${valuationUpdateClients.size} remaining)`);
    });
  });

  // GET /health - Health check endpoint
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  // GET/POST /system/ready - Startup readiness barrier
  router.get('/system/ready', (_req: Request, res: Response) => {
    res.json(getSystemReadyState());
  });

  router.post('/system/ready', (req: Request, res: Response) => {
    const source =
      typeof req.body?.source === 'string' ? req.body.source : 'startup';
    markSystemReady(source);
    res.json({ ...getSystemReadyState(), accepted: true });
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
      const {
        name,
        description,
        priority = 0.5,
        urgency = 0.5,
        tasks = [],
      } = req.body || {};

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

      if (process.env.NODE_ENV === 'development') {
        const desc = (goal.description || '').slice(0, 60);
        console.log(
          `[Planning] Goal created: id=${goal.id} description="${desc}" tasks=${tasks?.length ?? 0}`
        );
      }

      // Optionally add associated tasks into the queue
      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          try {
            await planningSystem.goalFormulation.addTask({
              title: t.title || t.name || t.description || 'Untitled Task',
              description: t.description || t.title || '',
              type: inferTaskType(
                t.type,
                t.description || t.title || name || ''
              ),
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

  // PATCH /goal/:id - Update goal (priority/urgency/status)
  router.patch('/goal/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const { priority, urgency, status } = req.body || {};
      if (!id)
        return res
          .status(400)
          .json({ success: false, error: 'Missing goal id' });

      if ((planningSystem as any).goalFormulation?.reprioritizeGoal) {
        (planningSystem as any).goalFormulation.reprioritizeGoal(
          id,
          priority,
          urgency
        );
      }
      if (status) {
        const setStatus = (s: string) => {
          const gf: any = (planningSystem as any).goalFormulation;
          if (s === 'failed') return gf.cancelGoal?.(id, 'manually cancelled');
          if (s === 'suspended') return gf.pauseGoal?.(id);
          if (s === 'pending' || s === 'active') return gf.resumeGoal?.(id);
          if (s === 'completed') return gf.completeGoal?.(id);
        };
        setStatus(String(status));
      }

      res.json({ success: true, goalId: id });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to update goal' });
    }
  });

  // POST /goal/:id/cancel - Cancel a goal
  router.post('/goal/:id/cancel', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const reason = req.body?.reason;
      if (!id)
        return res
          .status(400)
          .json({ success: false, error: 'Missing goal id' });
      const gf: any = (planningSystem as any).goalFormulation;
      const ok = gf?.cancelGoal?.(id, reason);
      res.json({ success: Boolean(ok), goalId: id });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to cancel goal' });
    }
  });

  function inferGoalType(text: string): string {
    const t = text.toLowerCase();
    if (/(explore|find|search|scout)/.test(t)) return 'exploration';
    if (/(craft|build|create|make)/.test(t)) return 'crafting';
    if (/(gather|collect|obtain|get)/.test(t)) return 'gathering';
    if (/(mine|dig)/.test(t)) return 'mining';
    if (/(survive|avoid|threat|danger)/.test(t)) return 'survival';
    if (/(place|put|set)/.test(t)) return 'building';
    return 'general';
  }

  function inferTaskType(
    explicitType: string | undefined,
    text: string
  ): string {
    const t = (explicitType || '').toLowerCase();
    if (t && t !== 'autonomous' && t !== 'manual') return t;

    const s = (text || '').toLowerCase();

    // Handle complex task descriptions with multiple actions
    // Prioritize the primary goal: if the task mentions making/creating something, it's crafting
    if (s.includes('make') && s.includes('tool')) {
      return 'crafting'; // Primary action is crafting a tool
    }
    if (s.includes('crafting table') && s.includes('make')) {
      return 'crafting'; // Primary action is crafting
    }
    if (
      s.includes('place') &&
      s.includes('crafting table') &&
      s.includes('make')
    ) {
      return 'crafting'; // Primary goal is making something, placing table is just a step
    }
    if (
      s.includes('place') &&
      s.includes('crafting table') &&
      s.includes('tool')
    ) {
      return 'crafting'; // Primary goal is making a tool, placing table is just a step
    }
    if (s.includes('place') && s.includes('down') && s.includes('make')) {
      return 'crafting'; // Primary goal is making something
    }

    // Handle pure placement tasks
    if (
      s.includes('place') &&
      s.includes('down') &&
      !s.includes('make') &&
      !s.includes('tool')
    ) {
      return 'building';
    }

    // Handle simple task types
    if (/(gather|collect|wood|log)/.test(s)) return 'gathering';
    if (/(craft|build|make|create|table|pickaxe|stick|plank)/.test(s))
      return 'crafting';
    if (/(mine|iron|stone|ore|dig)/.test(s)) return 'mining';
    if (/(explore|search|scout|look around)/.test(s)) return 'exploration';
    if (/(farm|plant|harvest)/.test(s)) return 'farming';
    if (/(move|go to|walk)/.test(s)) return 'navigation';
    if (/(place|put|set)/.test(s)) return 'building';

    return 'gathering';
  }

  // POST /task - Add a new task
  router.post('/task', async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    res.setHeader('x-request-id', requestId);
    const contentType = req.header('content-type') ?? null;
    const debugReport = PLANNING_INGEST_DEBUG_400
      ? inspectTaskPayload(req.body, contentType)
      : null;
    try {
      const taskData = req.body;

      // Infer requirementCandidate from legacy parameters if missing
      if (!taskData.parameters?.requirementCandidate) {
        const inferred = inferRequirementFromEndpointParams(taskData);
        if (inferred) {
          taskData.parameters = taskData.parameters || {};
          taskData.parameters.requirementCandidate = inferred;
        } else {
          const typeKey = (taskData.type || 'general').toLowerCase();
          if (!NON_GOAL_TASK_TYPES.has(typeKey)) {
            if (PLANNING_INGEST_DEBUG_400 && debugReport) {
              console.warn('[Planning][IngestDebug] 400 rejection', {
                requestId,
                method: req.method,
                path: req.path,
                contentType,
                bodySizeBytes: debugReport.bodySizeBytes,
                topLevelKeys: debugReport.topLevelKeys,
                keyPresence: debugReport.keyPresence,
                missingFields: debugReport.missingFields,
                reasonCode: 'missing_requirement_candidate',
              });
            }
            return res.status(400).json({
              success: false,
              error: 'strict mode: requirementCandidate required; could not infer from provided parameters',
              hint: 'Provide parameters.requirementCandidate with { kind, outputPattern, quantity }',
              requestId,
              ...(PLANNING_INGEST_DEBUG_400 && debugReport
                ? {
                    debug: {
                      reasonCode: 'missing_requirement_candidate',
                      missingFields: debugReport.missingFields,
                      topLevelKeys: debugReport.topLevelKeys,
                      contentType: debugReport.contentType,
                      bodySizeBytes: debugReport.bodySizeBytes,
                    },
                  }
                : {}),
            });
          }
        }
      }

      const task = await planningSystem.goalFormulation.addTask(taskData);
      res.json({
        success: true,
        taskId: task?.id,
        message: `Task added: ${taskData.type} - ${taskData.description}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to add task:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add task',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      });
    }
  });

  // POST /update-bot-instance - Update bot instance for MCP server
  router.post('/update-bot-instance', async (req: Request, res: Response) => {
    try {
      const { botInstance } = req.body;

      if (!botInstance) {
        return res.status(400).json({
          success: false,
          error: 'Missing botInstance in request body',
        });
      }

      if (planningSystem.goalFormulation.updateBotInstance) {
        const result =
          await planningSystem.goalFormulation.updateBotInstance(botInstance);
        res.json({
          success: result.success,
          message: result.message || 'Bot instance updated successfully',
          timestamp: Date.now(),
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Bot instance update not available',
        });
      }
    } catch (error) {
      console.error('Failed to update bot instance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update bot instance',
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
