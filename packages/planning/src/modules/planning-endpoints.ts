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
import {
  getGoldenRunRecorder,
  sanitizeRunId,
  isValidGoldenRunBanner,
} from '../golden-run-recorder';
import {
  getPlanningRuntimeConfig,
  buildPlanningBanner,
} from '../planning-runtime-config';
import { mapBTActionToMinecraft } from './action-mapping';

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

const PLANNING_INGEST_DEBUG_400 = process.env.PLANNING_INGEST_DEBUG_400 === '1';

type IngestShapeReport = {
  topLevelKeys: string[];
  bodySizeBytes: number | null;
  contentType: string | null;
  keyPresence: Record<string, boolean>;
  missingFields: string[];
};

function getRequestId(req: Request): string {
  const fromHeader = req.header('x-request-id');
  return fromHeader && fromHeader.trim().length > 0
    ? fromHeader
    : crypto.randomUUID();
}

function inspectTaskPayload(
  taskData: any,
  contentType: string | null
): IngestShapeReport {
  const topLevelKeys = Object.keys(taskData || {});
  const metadata = taskData?.metadata;
  const reduction = metadata?.reduction;
  const reducerResult = reduction?.reducerResult;

  const keyPresence: Record<string, boolean> = {
    'task.id': typeof taskData?.id === 'string',
    'task.title':
      typeof taskData?.title === 'string' && taskData.title.length > 0,
    'task.description':
      typeof taskData?.description === 'string' &&
      taskData.description.length > 0,
    'task.type': typeof taskData?.type === 'string' && taskData.type.length > 0,
    'task.priority': typeof taskData?.priority === 'number',
    'task.source':
      typeof taskData?.source === 'string' && taskData.source.length > 0,
    'task.steps': Array.isArray(taskData?.steps),
    'task.metadata': typeof metadata === 'object' && metadata !== null,
    'metadata.thoughtId': typeof metadata?.thoughtId === 'string',
    'metadata.origin.thoughtId':
      typeof metadata?.origin?.thoughtId === 'string',
    'metadata.reduction': typeof reduction === 'object' && reduction !== null,
    'reduction.sterlingProcessed':
      typeof reduction?.sterlingProcessed === 'boolean',
    'reduction.isExecutable': typeof reduction?.isExecutable === 'boolean',
    'reduction.reducerResult.committed_ir_digest':
      typeof reducerResult?.committed_ir_digest === 'string' ||
      typeof reducerResult?.committedIrDigest === 'string',
  };

  const missingFields = Object.entries(keyPresence)
    .filter(([key, present]) => {
      // Only treat these as required for reporting purposes.
      return (
        [
          'task.title',
          'task.description',
          'task.type',
          'task.metadata',
          'metadata.reduction',
          'reduction.sterlingProcessed',
          'reduction.isExecutable',
          'reduction.reducerResult.committed_ir_digest',
        ].includes(key) && !present
      );
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
    return {
      kind: 'craft',
      outputPattern: params.recipe,
      quantity: params.qty || params.quantity || 1,
    };
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
      return {
        kind,
        outputPattern: params.item,
        quantity: params.quantity || 1,
      };
    }
  }

  // { blockType: string } → mine or collect based on type
  if (typeof params.blockType === 'string' && params.blockType) {
    const kind = type === 'mining' ? 'mine' : 'collect';
    return {
      kind,
      outputPattern: params.blockType,
      quantity: params.quantity || 1,
    };
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
      return {
        kind: 'collect',
        outputPattern,
        quantity: params.quantity || params.targetQuantity || 1,
      };
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

/** Minimal Language IO envelope for golden-run reduce (Sterling IntentReducerV1). */
function buildMinimalReduceEnvelope(): Record<string, unknown> {
  const raw = '[GOAL: craft plank]';
  const envelopeId = crypto
    .createHash('sha256')
    .update(raw, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return {
    schema_id: 'sterling.language_io_envelope.v1',
    schema_version: '1.0.0',
    raw_text_verbatim: raw,
    sanitized_text: raw,
    sanitization_version: '',
    sanitization_flags: {},
    declared_markers: [
      { marker_type: 'GOAL_TAG', verbatim_text: raw, span: [0, raw.length] },
    ],
    envelope_id: envelopeId,
    timestamp_ms: Date.now(),
  };
}

export interface TaskInventoryResult {
  counts: Record<string, number>;
  total: number;
  /** Count of tasks visible to executor (active + pending). */
  visibleToExecutor: number;
}

export interface PlanningEndpointsDeps {
  /** Fetch Sterling server banner for golden-run evidence. If provided, inject requires valid banner. */
  getServerBanner?: (timeoutMs?: number) => Promise<string | null>;
  /** Send language_io.reduce to Sterling. Used by run-golden-reduce to register a digest. */
  sendLanguageIOReduce?: (
    envelope: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<
    | {
        success: true;
        result: {
          committed_ir_digest: string;
          schema_version: string;
          source_envelope_id: string;
          has_committed_propositions?: boolean;
        };
      }
    | { success: false; error: string }
  >;
  /** Task inventory for diagnostics: counts by status, visible to executor. */
  getTaskInventory?: () => TaskInventoryResult;
}

export function createPlanningEndpoints(
  planningSystem: PlanningSystem,
  deps?: PlanningEndpointsDeps
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
    console.log(
      `[SSE] Client connected to task-updates (${taskUpdateClients.size} total)`
    );

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
      console.log(
        `[SSE] Client disconnected from task-updates (${taskUpdateClients.size} remaining)`
      );
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
    console.log(
      `[SSE] Client connected to valuation-updates (${valuationUpdateClients.size} total)`
    );

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
      console.log(
        `[SSE] Client disconnected from valuation-updates (${valuationUpdateClients.size} remaining)`
      );
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
              error:
                'strict mode: requirementCandidate required; could not infer from provided parameters',
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

  // Dev-only: effective runtime config (redacted; no secrets). Answer "what is this server actually doing?"
  if (process.env.ENABLE_DEV_ENDPOINTS === 'true') {
    router.get('/api/dev/runtime-config', (_req: Request, res: Response) => {
      if (process.env.NODE_ENV === 'production') {
        return res
          .status(403)
          .json({ error: 'Dev endpoints are disabled in production' });
      }
      const config = getPlanningRuntimeConfig();
      const redacted = {
        runMode: config.runMode,
        executorMode: config.executorMode,
        executorEnabled: config.executorEnabled,
        capabilities: config.capabilities,
        configDigest: config.configDigest,
        capabilitiesList: config.capabilitiesList,
      };
      return res.json(redacted);
    });

    router.get('/api/dev/task-inventory', (_req: Request, res: Response) => {
      if (process.env.NODE_ENV === 'production') {
        return res
          .status(403)
          .json({ error: 'Dev endpoints are disabled in production' });
      }
      if (!deps?.getTaskInventory) {
        return res.status(503).json({
          error: 'Task inventory not available',
          detail: 'getTaskInventory dep not wired',
        });
      }
      const inv = deps.getTaskInventory();
      return res.json(inv);
    });

    router.post(
      '/api/dev/inject-sterling-ir',
      async (req: Request, res: Response) => {
        try {
          if (process.env.NODE_ENV === 'production') {
            return res
              .status(403)
              .json({ error: 'Dev endpoints are disabled in production' });
          }
          const { committed_ir_digest, schema_version, envelope_id, run_id } =
            req.body ?? {};

          if (!committed_ir_digest || typeof committed_ir_digest !== 'string') {
            return res
              .status(400)
              .json({ error: 'committed_ir_digest required' });
          }
          if (!schema_version || typeof schema_version !== 'string') {
            return res.status(400).json({ error: 'schema_version required' });
          }
          const digestOk = /^[a-zA-Z0-9:._-]{6,256}$/.test(committed_ir_digest);
          const schemaOk = /^[a-zA-Z0-9._-]{1,64}$/.test(schema_version);
          if (!digestOk) {
            return res
              .status(400)
              .json({ error: 'committed_ir_digest format invalid' });
          }
          if (!schemaOk) {
            return res
              .status(400)
              .json({ error: 'schema_version format invalid' });
          }

          const runIdRaw =
            typeof run_id === 'string' && run_id.trim().length > 0
              ? run_id.trim()
              : crypto.randomUUID();
          const runId = sanitizeRunId(runIdRaw);

          const recorder = getGoldenRunRecorder();

          if (deps?.getServerBanner) {
            const bannerLine = await deps.getServerBanner(8000);
            if (process.env.DEBUG_STERLING_BANNER === '1') {
              console.log(
                '[Planning][Inject] DEBUG_STERLING_BANNER: getServerBanner result',
                {
                  gotBanner: Boolean(bannerLine),
                  length:
                    typeof bannerLine === 'string' ? bannerLine.length : 0,
                  preview:
                    typeof bannerLine === 'string'
                      ? bannerLine.slice(0, 80) +
                        (bannerLine.length > 80 ? '...' : '')
                      : null,
                }
              );
            }
            if (!isValidGoldenRunBanner(bannerLine)) {
              console.warn(
                '[Planning][Inject] Sterling banner missing or invalid',
                {
                  gotBanner: Boolean(bannerLine),
                  bannerLength:
                    typeof bannerLine === 'string' ? bannerLine.length : 0,
                }
              );
              return res.status(503).json({
                error: 'Golden run requires valid Sterling server banner',
                detail:
                  !bannerLine || bannerLine.trim().length === 0
                    ? 'Could not fetch server banner (Sterling unreachable or server_info_v1 not supported)'
                    : 'Banner missing required marker: supports_expand_by_digest_v1_versioned_key=true',
              });
            }
            recorder.recordServerBanner(runId, bannerLine!);
          }
          const planningConfig = getPlanningRuntimeConfig();
          recorder.recordPlanningBanner(
            runId,
            buildPlanningBanner(planningConfig),
            planningConfig.configDigest,
            planningConfig.capabilities.taskTypeBridge
          );

          // Evidence hygiene: include executor mode/enablement so "no dispatch" isn't ambiguous.
          const execState = (globalThis as any).__planningExecutorState;
          const loopStarted = Boolean(execState?.intervalRegistered);
          recorder.recordRuntime(runId, {
            executor: {
              enabled: planningConfig.executorEnabled,
              mode: planningConfig.executorMode,
              loop_started: loopStarted,
              interval_registered: Boolean(execState?.intervalRegistered),
              last_tick_at: execState?.lastTickAt,
              tick_count: execState?.tickCount,
              enable_planning_executor_env:
                process.env.ENABLE_PLANNING_EXECUTOR,
              executor_live_confirm_env: process.env.EXECUTOR_LIVE_CONFIRM,
            },
            bridge_enabled: planningConfig.capabilities.taskTypeBridge,
          });
          if (!planningConfig.executorEnabled) {
            recorder.recordExecutorBlocked(runId, 'executor_disabled');
          }
          recorder.recordInjection(runId, {
            committed_ir_digest,
            schema_version,
            envelope_id: envelope_id ?? null,
            request_id: `inject_${runId}`,
            source: 'dev_injection',
          });

          const requestedTaskId = `sterling-ir-${runId}`;
          const task = await planningSystem.goalFormulation.addTask({
            id: requestedTaskId,
            title: `Sterling IR injection ${runId.slice(0, 8)}`,
            description: `Golden run injection ${runId}`,
            type: 'sterling_ir',
            source: 'manual',
            metadata: {
              tags: ['golden-run', 'dev-injection'],
              category: 'sterling_ir',
              sterling: {
                committedIrDigest: committed_ir_digest,
                schemaVersion: schema_version,
                envelopeId: envelope_id ?? null,
              },
              goldenRun: {
                runId,
                requestedAt: Date.now(),
                source: 'dev_injection',
              },
            },
          });

          const dedupeHit = task != null && task.id !== requestedTaskId;
          if (dedupeHit) {
            recorder.recordTask(runId, {
              task_id: task.id,
              status: task.status,
              dedupe_hit: true,
              returned_task_id: task.id,
              returned_task_golden_run_id:
                (task.metadata as any)?.goldenRun?.runId ?? null,
            });
          }

          return res.json({
            success: true,
            run_id: runId,
            task_id: task?.id ?? null,
          });
        } catch (error) {
          console.error(
            '[dev inject] Failed to inject sterling_ir task:',
            error
          );
          return res.status(500).json({
            error: 'Failed to inject sterling_ir task',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    // Dev-only: run a real reduce then inject (registers digest in Sterling, then injects for expansion)
    router.post(
      '/api/dev/run-golden-reduce',
      async (req: Request, res: Response) => {
        try {
          if (process.env.NODE_ENV === 'production') {
            return res
              .status(403)
              .json({ error: 'Dev endpoints are disabled in production' });
          }
          if (!deps?.sendLanguageIOReduce) {
            return res.status(503).json({
              error:
                'run-golden-reduce requires sendLanguageIOReduce (Sterling client not wired)',
            });
          }

          const envelope = buildMinimalReduceEnvelope();
          const reduceOut = await deps.sendLanguageIOReduce(envelope, 15000);
          if (!reduceOut.success) {
            return res.status(502).json({
              error: 'Sterling reduce failed',
              reduce_error: reduceOut.error,
            });
          }

          const { committed_ir_digest, schema_version, source_envelope_id } =
            reduceOut.result;
          const runIdRaw =
            typeof req.body?.run_id === 'string' &&
            req.body.run_id.trim().length > 0
              ? req.body.run_id.trim()
              : crypto.randomUUID();
          const runId = sanitizeRunId(runIdRaw);
          const recorder = getGoldenRunRecorder();

          if (deps?.getServerBanner) {
            const bannerLine = await deps.getServerBanner(8000);
            if (!isValidGoldenRunBanner(bannerLine)) {
              return res.status(503).json({
                error: 'Golden run requires valid Sterling server banner',
                detail: !bannerLine?.trim()
                  ? 'Could not fetch server banner'
                  : 'Banner missing supports_expand_by_digest_v1_versioned_key=true',
              });
            }
            recorder.recordServerBanner(runId, bannerLine!);
          }
          const planningConfigReduce = getPlanningRuntimeConfig();
          recorder.recordPlanningBanner(
            runId,
            buildPlanningBanner(planningConfigReduce),
            planningConfigReduce.configDigest,
            planningConfigReduce.capabilities.taskTypeBridge
          );

          const execStateReduce = (globalThis as any).__planningExecutorState;
          const loopStartedRunReduce = Boolean(execStateReduce?.intervalRegistered);
          recorder.recordRuntime(runId, {
            executor: {
              enabled: planningConfigReduce.executorEnabled,
              mode: planningConfigReduce.executorMode,
              loop_started: loopStartedRunReduce,
              interval_registered: Boolean(execStateReduce?.intervalRegistered),
              last_tick_at: execStateReduce?.lastTickAt,
              tick_count: execStateReduce?.tickCount,
              enable_planning_executor_env:
                process.env.ENABLE_PLANNING_EXECUTOR,
            },
            bridge_enabled: planningConfigReduce.capabilities.taskTypeBridge,
          });
          if (!planningConfigReduce.executorEnabled) {
            recorder.recordExecutorBlocked(runId, 'executor_disabled');
          }
          recorder.recordInjection(runId, {
            committed_ir_digest,
            schema_version,
            envelope_id: source_envelope_id ?? null,
            request_id: `run_golden_reduce_${runId}`,
            source: 'dev_run_golden_reduce',
          });

          const requestedTaskId = `sterling-ir-${runId}`;
          const task = await planningSystem.goalFormulation.addTask({
            id: requestedTaskId,
            title: `Golden reduce ${runId.slice(0, 8)}`,
            description: `Reduce then inject; digest ${committed_ir_digest}`,
            type: 'sterling_ir',
            source: 'manual',
            metadata: {
              tags: ['golden-run', 'dev-run-golden-reduce'],
              category: 'sterling_ir',
              sterling: {
                committedIrDigest: committed_ir_digest,
                schemaVersion: schema_version,
                envelopeId: source_envelope_id ?? null,
              },
              goldenRun: {
                runId,
                requestedAt: Date.now(),
                source: 'dev_run_golden_reduce',
              },
            },
          });

          const dedupeHit = task != null && task.id !== requestedTaskId;
          if (dedupeHit) {
            recorder.recordTask(runId, {
              task_id: task.id,
              status: task.status,
              dedupe_hit: true,
              returned_task_id: task.id,
              returned_task_golden_run_id:
                (task.metadata as any)?.goldenRun?.runId ?? null,
            });
          }

          return res.json({
            success: true,
            reduce: {
              committed_ir_digest,
              schema_version,
              source_envelope_id,
              has_committed_propositions:
                reduceOut.result.has_committed_propositions ?? true,
            },
            inject: { run_id: runId, task_id: task?.id ?? null },
          });
        } catch (error) {
          console.error('[dev run-golden-reduce] Failed:', error);
          return res.status(500).json({
            error: 'run-golden-reduce failed',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    // Dev-only: enqueue a task with pre-baked executor-native steps.
    // Bypasses Sterling reduce/expand entirely to prove executor dispatch works.
    // Outer guard: ENABLE_DEV_ENDPOINTS=true (line 1114 block).
    // Inner guard: NODE_ENV + ENABLE_DEV_ENDPOINTS re-check (defense-in-depth).
    router.post(
      '/api/dev/enqueue-native-steps',
      async (req: Request, res: Response) => {
        try {
          if (
            process.env.NODE_ENV === 'production' ||
            process.env.ENABLE_DEV_ENDPOINTS !== 'true'
          ) {
            return res
              .status(403)
              .json({ error: 'Dev endpoints are disabled' });
          }

          const { steps: rawSteps, title, description } = req.body || {};

          // Validate caller-provided steps: reject missing leaf or unmapped leaf
          if (Array.isArray(rawSteps) && rawSteps.length > 0) {
            const invalid: string[] = [];
            for (let i = 0; i < rawSteps.length; i++) {
              const s = rawSteps[i];
              const leaf = s.meta?.leaf || s.leaf;
              if (!leaf || typeof leaf !== 'string') {
                invalid.push(`step[${i}]: missing or non-string leaf`);
              } else {
                const mapped = mapBTActionToMinecraft(
                  leaf,
                  s.meta?.args || s.args || {},
                  { strict: true }
                );
                if (!mapped) {
                  invalid.push(
                    `step[${i}]: leaf '${leaf}' has no action mapping (strict mode)`
                  );
                }
              }
            }
            if (invalid.length > 0) {
              return res.status(400).json({
                error: 'Invalid steps — rejected before enqueue',
                invalid,
                hint: 'Each step must have a leaf that maps to a known MC action',
              });
            }
          }

          // Default steps: chat (speech) + step_forward_safely (physical actuation) + wait (timing)
          const steps =
            Array.isArray(rawSteps) && rawSteps.length > 0
              ? rawSteps.map((s: any, i: number) => ({
                  id: s.id || `native-step-${i}`,
                  order: s.order ?? i,
                  label:
                    s.label ||
                    `Step ${i}: ${s.meta?.leaf || s.leaf || 'unknown'}`,
                  done: false,
                  meta: {
                    leaf: s.meta?.leaf || s.leaf,
                    args: s.meta?.args || s.args || {},
                    argsSource: 'explicit',
                    authority: 'dev-injected',
                    executable: true,
                  },
                }))
              : [
                  {
                    id: 'native-step-0',
                    order: 0,
                    label: 'Say hello (proof of speech dispatch)',
                    done: false,
                    meta: {
                      leaf: 'chat',
                      args: {
                        message:
                          '[E2E] Bot executor dispatch proof — hello world!',
                      },
                      argsSource: 'explicit',
                      authority: 'dev-injected',
                      executable: true,
                    },
                  },
                  {
                    id: 'native-step-1',
                    order: 1,
                    label: 'Step forward (proof of physical actuation)',
                    done: false,
                    meta: {
                      leaf: 'step_forward_safely',
                      args: { distance: 1 },
                      argsSource: 'explicit',
                      authority: 'dev-injected',
                      executable: true,
                    },
                  },
                  {
                    id: 'native-step-2',
                    order: 2,
                    label: 'Wait briefly',
                    done: false,
                    meta: {
                      leaf: 'wait',
                      args: { duration: 2000 },
                      argsSource: 'explicit',
                      authority: 'dev-injected',
                      executable: true,
                    },
                  },
                ];

          const task = await planningSystem.goalFormulation.addTask({
            title: title || 'Dev: native step dispatch proof',
            description:
              description ||
              'Executor-native steps injected via /api/dev/enqueue-native-steps',
            type: 'autonomous',
            source: 'manual',
            priority: 0.9,
            urgency: 0.9,
            status: 'active',
            steps,
            metadata: {
              tags: ['dev-injected', 'native-steps'],
              category: 'dev',
              origin: {
                kind: 'dev',
                name: 'enqueue-native-steps',
                createdAt: Date.now(),
              },
            },
          });

          return res.json({
            success: true,
            task_id: task?.id ?? null,
            step_count: steps.length,
            leaves: steps.map((s: any) => s.meta?.leaf),
          });
        } catch (error) {
          console.error('[dev enqueue-native-steps] Failed:', error);
          return res.status(500).json({
            error: 'enqueue-native-steps failed',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    // ── Smoke checkpoint helpers ──────────────────────────────────────
    function buildCheckpointProof(report: any) {
      const A_requested = report?.sterling_expand_requested
        ? {
            ok: true,
            digest: report.sterling_expand_requested.committed_ir_digest,
            requested_at: report.sterling_expand_requested.requested_at,
          }
        : { ok: false };

      const expandResult = report?.sterling_expand_result;
      const A_result = expandResult
        ? {
            ok: expandResult.status === 'ok',
            status: expandResult.status,
            step_count: expandResult.step_count,
            blocked_reason: expandResult.blocked_reason,
            error: expandResult.error,
            elapsed_ms: expandResult.elapsed_ms,
          }
        : { ok: false };

      const expansion = report?.expansion;
      const B_expansion = expansion
        ? {
            ok:
              expansion.status === 'ok' &&
              (expansion.steps?.length ?? 0) > 0,
            executor_plan_digest: expansion.executor_plan_digest,
            step_count: expansion.steps?.length ?? 0,
          }
        : { ok: false };

      const dispatched = report?.execution?.dispatched_steps ?? [];
      const C_dispatch = {
        ok:
          dispatched.length > 0 &&
          dispatched.every((s: any) => s.result?.status === 'ok'),
        count: dispatched.length,
        steps: dispatched.map((s: any) => ({
          leaf: s.leaf,
          status: s.result?.status ?? 'pending',
        })),
      };

      const verification = report?.execution?.verification;
      const D_verification = verification
        ? {
            ok: verification.status === 'verified',
            status: verification.status,
            kind: verification.kind,
          }
        : { ok: false };

      return { A_requested, A_result, B_expansion, C_dispatch, D_verification };
    }

    function isAllCheckpointsOk(report: any): boolean {
      const cp = buildCheckpointProof(report);
      return (
        cp.A_requested.ok &&
        cp.A_result.ok &&
        cp.B_expansion.ok &&
        cp.C_dispatch.ok &&
        cp.D_verification.ok
      );
    }

    // Dev-only: Sterling→Leaf correlation smoke test.
    // Creates a sterling_ir task with a known stub digest, polls for completion,
    // and returns a 4-checkpoint proof report (A_requested, A_result, B_expansion, C_dispatch, D_verification).
    //
    // Accepts optional body: { variant: 'ok' | 'ok_fresh' | 'unknown_digest' | 'slow_wait' | ... }
    //   - 'ok' (default): uses the smoke stub digest (expects full pipeline pass, dedupes on repeat)
    //   - 'ok_fresh': generates a unique digest per run via prefix-wildcard (never dedupes)
    //   - 'unknown_digest': uses a hard-coded non-existent digest (expects F2 blocked failure)
    //   - 'slow_wait': expand ok but 120s wait step exceeds poll timeout (F6)
    //   - 'ok_fresh_01'..'ok_fresh_03': static pool (legacy, prefer ok_fresh)
    //   - 'slow_wait_fresh': generates unique slow_wait digest per run (never dedupes)
    const SMOKE_VARIANTS: Record<string, { digest: string; label: string }> = {
      ok: { digest: 'smoke_e2e_chat_wait_v1', label: 'happy path (stub present)' },
      ok_fresh_01: { digest: 'smoke_e2e_chat_wait_v1_fresh_01', label: 'fresh happy path 01 (static pool)' },
      ok_fresh_02: { digest: 'smoke_e2e_chat_wait_v1_fresh_02', label: 'fresh happy path 02 (static pool)' },
      ok_fresh_03: { digest: 'smoke_e2e_chat_wait_v1_fresh_03', label: 'fresh happy path 03 (static pool)' },
      unknown_digest: { digest: 'smoke_e2e_NONEXISTENT_v1', label: 'F2: digest unknown (blocked)' },
      slow_wait: { digest: 'smoke_e2e_slow_wait_v1', label: 'F6: expand ok, dispatch exceeds poll timeout' },
    };
    // Dynamic variants: generate a unique digest per run via prefix-wildcard.
    // Sterling resolves these by matching the prefix to the base entry and
    // returning the same steps with a derived plan_bundle_digest.
    const DYNAMIC_VARIANTS: Record<string, { prefix: string; label: string }> = {
      ok_fresh: { prefix: 'smoke_e2e_chat_wait_v1_', label: 'fresh happy path (prefix-wildcard, never dedupes)' },
      slow_wait_fresh: { prefix: 'smoke_e2e_slow_wait_v1_', label: 'fresh slow_wait (prefix-wildcard, never dedupes)' },
    };

    router.post(
      '/api/dev/sterling-smoke',
      async (req: Request, res: Response) => {
        const endpointStart = Date.now();
        try {
          if (
            process.env.NODE_ENV === 'production' ||
            process.env.ENABLE_DEV_ENDPOINTS !== 'true'
          ) {
            return res
              .status(403)
              .json({ error: 'Dev endpoints are disabled' });
          }
          if (process.env.ENABLE_PLANNING_EXECUTOR !== '1') {
            return res.status(503).json({
              error: 'Executor not enabled',
              detail: 'Set ENABLE_PLANNING_EXECUTOR=1',
            });
          }

          // Resolve variant (default: ok)
          const variantKey = typeof req.body?.variant === 'string'
            ? req.body.variant
            : 'ok';
          let smokeDigest: string;
          if (SMOKE_VARIANTS[variantKey]) {
            smokeDigest = SMOKE_VARIANTS[variantKey].digest;
          } else if (DYNAMIC_VARIANTS[variantKey]) {
            // Generate unique digest per run via prefix-wildcard
            const runSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
            smokeDigest = `${DYNAMIC_VARIANTS[variantKey].prefix}${runSuffix}`;
          } else {
            const allVariants = [
              ...Object.keys(SMOKE_VARIANTS),
              ...Object.keys(DYNAMIC_VARIANTS),
            ];
            return res.status(400).json({
              error: 'Invalid variant',
              detail: `Allowed variants: ${allVariants.join(', ')}`,
            });
          }

          // Guard: Sterling must be reachable
          if (deps?.getServerBanner) {
            const bannerLine = await deps.getServerBanner(8000);
            if (!bannerLine || bannerLine.trim().length === 0) {
              return res.status(503).json({
                error: 'sterling_not_connected',
                detail: 'Could not fetch Sterling server banner',
              });
            }
          }

          const runId = sanitizeRunId(crypto.randomUUID());
          const recorder = getGoldenRunRecorder();

          // Record banners + runtime (same pattern as inject/enqueue)
          if (deps?.getServerBanner) {
            const bannerLine = await deps.getServerBanner(3000);
            if (bannerLine) recorder.recordServerBanner(runId, bannerLine);
          }
          const planningConfig = getPlanningRuntimeConfig();
          recorder.recordPlanningBanner(
            runId,
            buildPlanningBanner(planningConfig),
            planningConfig.configDigest,
            planningConfig.capabilities.taskTypeBridge
          );
          const execState = (globalThis as any).__planningExecutorState;
          recorder.recordRuntime(runId, {
            executor: {
              enabled: planningConfig.executorEnabled,
              mode: planningConfig.executorMode,
              loop_started: Boolean(execState?.intervalRegistered),
              interval_registered: Boolean(execState?.intervalRegistered),
              last_tick_at: execState?.lastTickAt,
              tick_count: execState?.tickCount,
              enable_planning_executor_env:
                process.env.ENABLE_PLANNING_EXECUTOR,
              executor_live_confirm_env: process.env.EXECUTOR_LIVE_CONFIRM,
            },
            bridge_enabled: planningConfig.capabilities.taskTypeBridge,
          });

          recorder.recordInjection(runId, {
            committed_ir_digest: smokeDigest,
            schema_version: '1.1.0',
            envelope_id: null,
            request_id: `smoke_${runId}`,
            source: 'dev_sterling_smoke',
          });

          // Create sterling_ir task with smoke digest
          const requestedTaskId = `sterling-ir-${runId}`;
          const task = await planningSystem.goalFormulation.addTask({
            id: requestedTaskId,
            title: `[Sterling Smoke] expand→dispatch proof (${variantKey})`,
            description: `Sterling smoke correlation proof ${runId} variant=${variantKey}`,
            type: 'sterling_ir',
            source: 'manual',
            priority: 0.9,
            urgency: 0.9,
            metadata: {
              tags: ['golden-run', 'dev-sterling-smoke'],
              category: 'sterling_ir',
              sterling: {
                committedIrDigest: smokeDigest,
                schemaVersion: '1.1.0',
                envelopeId: null,
              },
              goldenRun: {
                runId,
                requestedAt: Date.now(),
                source: 'dev_sterling_smoke',
              },
            },
          });

          const taskId = task?.id ?? requestedTaskId;
          const dedupeHit = task != null && task.id !== requestedTaskId;

          // Dedupe hit: the digest already has a completed/in-flight task.
          // Read the ORIGINAL task's golden-run artifact for checkpoint data.
          if (dedupeHit) {
            const origRunId = (task.metadata as any)?.goldenRun?.runId;
            const origReport = origRunId
              ? recorder.getReport(origRunId)
              : null;
            const origTaskStatus = task.status ?? 'unknown';
            const allOk = origReport ? isAllCheckpointsOk(origReport) : false;
            // Flush original run's artifact if it exists in memory
            if (origRunId) {
              try { await recorder.flushRun(origRunId); } catch { /* best-effort */ }
            }
            return res.json({
              proof_passed: allOk,
              run_id: runId,
              task_id: taskId,
              task_status: origTaskStatus,
              variant: variantKey,
              dedupe_hit: true,
              original_run_id: origRunId ?? null,
              checkpoints: origReport
                ? buildCheckpointProof(origReport)
                : {
                    A_requested: { ok: false },
                    A_result: { ok: false },
                    B_expansion: { ok: false },
                    C_dispatch: { ok: false, count: 0, steps: [] },
                    D_verification: { ok: false },
                  },
              all_checkpoints_ok: allOk,
              timed_out: false,
              elapsed_ms: Date.now() - endpointStart,
              artifact_path: origRunId
                ? `artifacts/golden-run/golden-${origRunId}.json`
                : null,
              artifact_abs_path: origRunId
                ? recorder.getArtifactPath(origRunId)
                : null,
            });
          }

          // Poll for task completion (3s interval, configurable timeout)
          // Early-exit: if A_result already shows non-ok, no need to wait for dispatch.
          // Bounded override: poll_timeout_ms in request body (min 5000, max 45000).
          const POLL_INTERVAL_MS = 3000;
          const rawPollTimeout = typeof req.body?.poll_timeout_ms === 'number'
            ? req.body.poll_timeout_ms
            : 45000;
          const POLL_TIMEOUT_MS = Math.max(5000, Math.min(45000, rawPollTimeout));
          const pollStart = Date.now();
          let timedOut = false;
          let finalTaskStatus: string | undefined;
          let earlyExit = false;

          // Pre-poll check: expansion may have already completed synchronously
          // (e.g. blocked_digest_unknown resolves in <100ms). Avoid sleeping 3s for nothing.
          await new Promise((resolve) => setTimeout(resolve, 500));
          {
            const preReport = recorder.getReport(runId);
            const preResult = preReport?.sterling_expand_result;
            if (preResult && preResult.status !== 'ok') {
              earlyExit = true;
              const allTasks = [
                ...planningSystem.goalFormulation.getCurrentTasks(),
                ...planningSystem.goalFormulation.getCompletedTasks(),
              ];
              const found = allTasks.find((t: any) => t.id === taskId);
              finalTaskStatus = found?.status;
            }
          }

          while (!earlyExit && Date.now() - pollStart < POLL_TIMEOUT_MS) {
            await new Promise((resolve) =>
              setTimeout(resolve, POLL_INTERVAL_MS)
            );

            // Check checkpoint A result — if expand already failed, return immediately
            const intermediateReport = recorder.getReport(runId);
            const expandResult = intermediateReport?.sterling_expand_result;
            if (expandResult && expandResult.status !== 'ok') {
              earlyExit = true;
              // Still check task status for the response
              const allTasks = [
                ...planningSystem.goalFormulation.getCurrentTasks(),
                ...planningSystem.goalFormulation.getCompletedTasks(),
              ];
              const found = allTasks.find((t: any) => t.id === taskId);
              finalTaskStatus = found?.status;
              break;
            }

            const allTasks = [
              ...planningSystem.goalFormulation.getCurrentTasks(),
              ...planningSystem.goalFormulation.getCompletedTasks(),
            ];
            const found = allTasks.find((t: any) => t.id === taskId);
            finalTaskStatus = found?.status;
            if (
              finalTaskStatus === 'completed' ||
              finalTaskStatus === 'failed'
            ) {
              break;
            }
          }

          if (
            !earlyExit &&
            finalTaskStatus !== 'completed' &&
            finalTaskStatus !== 'failed'
          ) {
            timedOut = true;
          }

          // Build checkpoint proof from golden-run report
          const report = recorder.getReport(runId);
          const checkpoints = buildCheckpointProof(report);
          const allOk = isAllCheckpointsOk(report);

          // Persist artifact to disk (awaitable — ensures file exists before returning path)
          try {
            await recorder.flushRun(runId);
          } catch (flushErr) {
            console.warn('[dev sterling-smoke] Artifact flush failed:', flushErr);
          }

          const artifactAbsPath = recorder.getArtifactPath(runId);

          return res.json({
            proof_passed: allOk && !timedOut,
            run_id: runId,
            task_id: taskId,
            task_status: finalTaskStatus ?? 'unknown',
            variant: variantKey,
            early_exit: earlyExit || undefined,
            checkpoints,
            all_checkpoints_ok: allOk,
            timed_out: timedOut,
            elapsed_ms: Date.now() - endpointStart,
            artifact_path: `artifacts/golden-run/golden-${runId}.json`,
            artifact_abs_path: artifactAbsPath,
          });
        } catch (error) {
          console.error('[dev sterling-smoke] Failed:', error);
          return res.status(500).json({
            error: 'sterling-smoke failed',
            details:
              error instanceof Error ? error.message : String(error),
            elapsed_ms: Date.now() - endpointStart,
          });
        }
      }
    );

    router.get(
      '/api/dev/golden-run-artifact/:runId',
      async (req: Request, res: Response) => {
        if (process.env.NODE_ENV === 'production') {
          return res
            .status(403)
            .json({ error: 'Dev endpoints are disabled in production' });
        }
        const runId = (req.params.runId ?? '').trim();
        if (!runId) {
          return res.status(400).json({ error: 'runId required' });
        }
        const recorder = getGoldenRunRecorder();
        let report = recorder.getReport(runId);
        if (!report) {
          report = await recorder.getReportFromDisk(runId);
        }
        if (!report) {
          return res
            .status(404)
            .json({ error: 'Golden run artifact not found', run_id: runId });
        }
        return res.json(report);
      }
    );
  }

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
