/**
 * Behavior Tree Runner - Implements robust execution with streaming telemetry
 *
 * Executes options (skills) via Behavior Trees for robust control, retries, timeouts, and guards;
 * streams ticks/telemetry. BTs are widely used to make game agents stable under noise.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export enum BTNodeStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILURE = 'failure',
  ABORTED = 'aborted',
}

export enum BTNodeType {
  SEQUENCE = 'sequence',
  SELECTOR = 'selector',
  PARALLEL = 'parallel',
  DECORATOR = 'decorator',
  ACTION = 'action',
  CONDITION = 'condition',
  COGNITIVE_REFLECTION = 'cognitive_reflection',
}

export interface BTNode {
  id: string;
  type: BTNodeType;
  name: string;
  children?: BTNode[];
  action?: string;
  condition?: string;
  args?: Record<string, any>;
  timeout?: number;
  retries?: number;
  guard?: string;
  // Decorator semantics (optional)
  decorator?: 'succeeder' | 'inverter' | 'repeater' | 'timeout' | 'retry';
  repeatCount?: number; // for repeater
  parallelPolicy?: 'all' | 'any'; // for PARALLEL
}

export interface BTTick {
  tick: number;
  node: string;
  status: BTNodeStatus;
  metrics: {
    duration: number;
    retries: number;
    timeouts: number;
  };
  data?: any;
  error?: string;
}

export interface BTRunResult {
  success: boolean;
  status: BTNodeStatus;
  ticks: BTTick[];
  finalData?: any;
  error?: string;
  duration: number;
}

export interface BTRunOptions {
  timeout?: number;
  maxRetries?: number;
  enableGuards?: boolean;
  streamTicks?: boolean;
  // Enhanced evaluation context
  evaluator?: ConditionEvaluator;
  blackboard?: Record<string, any>;
  // Streaming control
  sampleRate?: number; // Only emit every Nth tick (default: 1 = all ticks)
  emitNodeBoundaries?: boolean; // Emit ticks only at node boundaries (default: true)
}

// ============================================================================
// Default Condition Evaluator Implementation
// ============================================================================

class DefaultConditionEvaluator implements ConditionEvaluator {
  async evaluate(
    expression: string,
    context: EvaluationContext
  ): Promise<boolean> {
    // Simple expression parser for common patterns
    const expr = expression.trim().toLowerCase();

    // Boolean literals
    if (expr === 'always' || expr === 'true') return true;
    if (expr === 'never' || expr === 'false') return false;

    // Negation
    if (expr.startsWith('!')) {
      return !(await this.evaluate(expr.slice(1), context));
    }

    // Inventory checks: "inventory.has:wood" or "inventory.count:oak_log>=4"
    if (expr.startsWith('inventory.')) {
      return this.evaluateInventoryExpression(expr, context);
    }

    // World state checks: "world.time:day" or "world.weather:clear"
    if (expr.startsWith('world.')) {
      return this.evaluateWorldExpression(expr, context);
    }

    // Blackboard checks: "blackboard.has:lastTargetPos" or "blackboard.value:retryCount<3"
    if (expr.startsWith('blackboard.')) {
      return this.evaluateBlackboardExpression(expr, context);
    }

    // Task checks: "task.type:crafting" or "task.priority>0.8"
    if (expr.startsWith('task.')) {
      return this.evaluateTaskExpression(expr, context);
    }

    // Default to true for unknown expressions (fail-safe)
    console.warn(
      `Unknown condition expression: ${expression}, defaulting to true`
    );
    return true;
  }

  private evaluateInventoryExpression(
    expr: string,
    context: EvaluationContext
  ): boolean {
    const parts = expr.split(':');
    if (parts.length < 2) return false;

    const operation = parts[0].split('.').pop();
    const item = parts[1];

    if (!context.inventory) return false;

    switch (operation) {
      case 'has':
        return context.inventory[item] > 0;
      case 'count':
        const count = context.inventory[item] || 0;
        if (parts.length === 3) {
          const comparison = parts[2];
          if (comparison.includes('>=')) {
            const threshold = parseInt(comparison.split('>=')[1]);
            return count >= threshold;
          } else if (comparison.includes('>')) {
            const threshold = parseInt(comparison.split('>')[1]);
            return count > threshold;
          } else if (comparison.includes('<=')) {
            const threshold = parseInt(comparison.split('<=')[1]);
            return count <= threshold;
          } else if (comparison.includes('<')) {
            const threshold = parseInt(comparison.split('<')[1]);
            return count < threshold;
          } else if (comparison.includes('=')) {
            const threshold = parseInt(comparison.split('=')[1]);
            return count === threshold;
          }
        }
        return count > 0;
      default:
        return false;
    }
  }

  private evaluateWorldExpression(
    expr: string,
    context: EvaluationContext
  ): boolean {
    const parts = expr.split(':');
    if (parts.length < 2) return false;

    const property = parts[0].split('.').pop();
    const value = parts[1];

    if (!context.world) return false;

    switch (property) {
      case 'time':
        return context.world.time === value;
      case 'weather':
        return context.world.weather === value;
      case 'light':
        const light = context.world.light;
        if (value.includes('>')) {
          const threshold = parseInt(value.split('>')[1]);
          return light > threshold;
        }
        return light === parseInt(value);
      default:
        return false;
    }
  }

  private evaluateBlackboardExpression(
    expr: string,
    context: EvaluationContext
  ): boolean {
    const parts = expr.split(':');
    if (parts.length < 2) return false;

    const operation = parts[0].split('.').pop();
    const key = parts[1];
    const value = context.blackboard[key];

    switch (operation) {
      case 'has':
        return value !== undefined && value !== null;
      case 'value':
        if (parts.length === 3) {
          const comparison = parts[2];
          if (comparison.includes('>=')) {
            const threshold = parseFloat(comparison.split('>=')[1]);
            return parseFloat(value) >= threshold;
          } else if (comparison.includes('>')) {
            const threshold = parseFloat(comparison.split('>')[1]);
            return parseFloat(value) > threshold;
          } else if (comparison.includes('<=')) {
            const threshold = parseFloat(comparison.split('<=')[1]);
            return parseFloat(value) <= threshold;
          } else if (comparison.includes('<')) {
            const threshold = parseFloat(comparison.split('<')[1]);
            return parseFloat(value) < threshold;
          } else if (comparison.includes('=')) {
            const threshold = parseFloat(comparison.split('=')[1]);
            return parseFloat(value) === threshold;
          }
        }
        return Boolean(value);
      default:
        return false;
    }
  }

  private evaluateTaskExpression(
    expr: string,
    context: EvaluationContext
  ): boolean {
    const parts = expr.split(':');
    if (parts.length < 2) return false;

    const property = parts[0].split('.').pop();
    const value = parts[1];

    if (!context.task) return false;

    switch (property) {
      case 'type':
        return context.task.type === value;
      case 'priority':
        const priority = context.task.priority || 0;
        if (value.includes('>')) {
          const threshold = parseFloat(value.split('>')[1]);
          return priority > threshold;
        }
        return priority === parseFloat(value);
      case 'status':
        return context.task.status === value;
      default:
        return false;
    }
  }
}

// ============================================================================
// Behavior Tree Runner Implementation
// ============================================================================

export class BehaviorTreeRunner extends EventEmitter {
  private activeRuns: Map<string, BTRun> = new Map();
  private toolExecutor: ToolExecutor;
  private defaultTimeout: number = 5000; // class default timeout
  private defaultRetries: number = 2; // class default retries
  private inlineDefinitions: Map<string, any> = new Map();

  constructor(toolExecutor: ToolExecutor) {
    super();
    this.toolExecutor = toolExecutor;
  }

  /**
   * Execute an option (skill) via Behavior Tree with streaming telemetry
   */
  async runOption(
    optionId: string,
    args: Record<string, any>,
    options: BTRunOptions = {}
  ): Promise<BTRunResult> {
    const runId = `${optionId}-${Date.now()}`;
    const run = new BTRun(
      runId,
      optionId,
      args,
      options,
      this.toolExecutor,
      (id: string) => this.inlineDefinitions.get(id)
    );

    this.activeRuns.set(runId, run);

    // Set up event listeners for streaming
    run.on('tick', (tick: BTTick) => {
      this.emit('tick', { runId, tick });
    });

    run.on('status', (status: BTNodeStatus) => {
      this.emit('status', { runId, status });
    });

    try {
      const result = await run.execute();
      return result;
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  /**
   * Cancel an active run
   */
  async cancel(runId: string): Promise<boolean> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return false;
    }

    await run.abort();
    this.activeRuns.delete(runId);
    return true;
  }

  /**
   * Get status of active runs
   */
  getActiveRuns(): Array<{
    runId: string;
    optionId: string;
    status: BTNodeStatus;
  }> {
    return Array.from(this.activeRuns.values()).map((run) => ({
      runId: run.runId,
      optionId: run.optionId,
      status: run.getStatus(),
    }));
  }

  /**
   * Get telemetry for a specific run
   */
  getRunTelemetry(runId: string): BTTick[] | null {
    const run = this.activeRuns.get(runId);
    return run ? run.getTicks() : null;
  }

  /**
   * Store inline behavior tree definitions from MCP options
   */
  storeInlineDefinition(optionId: string, definition: any): void {
    this.inlineDefinitions.set(optionId, definition);
    console.log(`📝 Stored inline BT definition for ${optionId}`);
  }
}

// ============================================================================
// Individual Run Implementation
// ============================================================================

class BTRun extends EventEmitter {
  public runId: string;
  public optionId: string;
  public args: Record<string, any>;
  public options: BTRunOptions;
  private toolExecutor: ToolExecutor;
  private tree: BTNode;
  private ticks: BTTick[] = [];
  private startTime: number = 0;
  private status: BTNodeStatus = BTNodeStatus.RUNNING;
  private abortController: AbortController = new AbortController();
  private tickCounter: number = 0;
  private telemetryCap: number = Number(process.env.BT_TELEMETRY_CAP || 2000);
  private defaultTimeout: number = Number(
    process.env.BT_DEFAULT_TIMEOUT || 8000
  );
  private defaultRetries: number = Number(process.env.BT_DEFAULT_RETRIES || 2);
  private getInlineDefinition: (id: string) => any | undefined;

  // Enhanced context management
  private blackboard: Record<string, any> = {};
  private evaluator: ConditionEvaluator;
  private context: EvaluationContext;

  constructor(
    runId: string,
    optionId: string,
    args: Record<string, any>,
    options: BTRunOptions,
    toolExecutor: ToolExecutor,
    getInlineDefinition: (id: string) => any | undefined
  ) {
    super();
    this.runId = runId;
    this.optionId = optionId;
    this.args = args;
    this.options = options;
    this.toolExecutor = toolExecutor;
    this.getInlineDefinition = getInlineDefinition;

    // Initialize enhanced context
    this.blackboard = { ...options.blackboard };
    this.evaluator = options.evaluator || new DefaultConditionEvaluator();
    this.context = {
      inventory: undefined, // Will be populated during execution
      world: undefined, // Will be populated during execution
      task: undefined, // Will be populated during execution
      blackboard: this.blackboard,
      runId: this.runId,
      timestamp: Date.now(),
    };

    // Initialize with a placeholder tree, will be loaded in execute()
    this.tree = {
      id: optionId,
      type: BTNodeType.ACTION,
      name: optionId,
      action: optionId,
      args: this.args,
      timeout: this.defaultTimeout,
      retries: this.defaultRetries,
    };
  }

  async execute(): Promise<BTRunResult> {
    this.startTime = Date.now();

    try {
      // Check for abort signal
      if (this.abortController.signal.aborted) {
        throw new Error('Run was aborted');
      }

      // Load the behavior tree definition
      this.tree = await this.loadBehaviorTree(this.optionId);

      // Execute the behavior tree
      const result = await this.executeNode(this.tree, 0);

      const duration = Date.now() - this.startTime;

      return {
        success: result.status === BTNodeStatus.SUCCESS,
        status: result.status,
        ticks: this.ticks,
        finalData: result.data,
        error: result.error,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - this.startTime;

      return {
        success: false,
        status: BTNodeStatus.FAILURE,
        ticks: this.ticks,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  async abort(): Promise<void> {
    this.status = BTNodeStatus.ABORTED;
    this.abortController.abort();
  }

  getStatus(): BTNodeStatus {
    return this.status;
  }

  getTicks(): BTTick[] {
    return [...this.ticks];
  }

  // Enhanced blackboard management
  setBlackboardValue(key: string, value: any): void {
    this.blackboard[key] = value;
    this.context.blackboard = this.blackboard;
  }

  getBlackboardValue(key: string): any {
    return this.blackboard[key];
  }

  hasBlackboardValue(key: string): boolean {
    return key in this.blackboard;
  }

  removeBlackboardValue(key: string): void {
    delete this.blackboard[key];
    this.context.blackboard = this.blackboard;
  }

  getBlackboard(): Record<string, any> {
    return { ...this.blackboard };
  }

  // Context population methods
  setInventoryContext(inventory: Record<string, number>): void {
    this.context.inventory = inventory;
  }

  setWorldContext(world: Record<string, any>): void {
    this.context.world = world;
  }

  setTaskContext(task: Record<string, any>): void {
    this.context.task = task;
  }

  private async executeNode(
    node: BTNode,
    tick: number
  ): Promise<{
    status: BTNodeStatus;
    data?: any;
    error?: string;
    confidence?: number;
    cost?: number;
    duration?: number;
  }> {
    const nodeStartTime = Date.now();
    let retries = 0;
    // Precedence: node-specific > run options > class/env default
    const maxRetries =
      node.retries ?? this.options.maxRetries ?? this.defaultRetries;
    const timeout = node.timeout ?? this.options.timeout ?? this.defaultTimeout;

    // Check guard conditions
    if (node.guard && this.options.enableGuards) {
      const guardResult = await this.evaluateGuard(node.guard);
      if (!guardResult) {
        const tickData: BTTick = {
          tick: ++this.tickCounter,
          node: node.id,
          status: BTNodeStatus.FAILURE,
          metrics: { duration: 0, retries: 0, timeouts: 0 },
          error: 'Guard condition failed',
        };
        this.recordTick(tickData);
        return { status: BTNodeStatus.FAILURE };
      }
    }

    // Handle simple decorators as wrappers
    if (node.type === BTNodeType.DECORATOR && node.decorator) {
      switch (node.decorator) {
        case 'succeeder': {
          const child = node.children?.[0];
          if (!child) return { status: BTNodeStatus.SUCCESS };
          const r = await this.executeNode(child, tick + 1);
          return { status: BTNodeStatus.SUCCESS, data: r.data };
        }
        case 'inverter': {
          const child = node.children?.[0];
          if (!child) return { status: BTNodeStatus.FAILURE };
          const r = await this.executeNode(child, tick + 1);
          const inv =
            r.status === BTNodeStatus.SUCCESS
              ? BTNodeStatus.FAILURE
              : r.status === BTNodeStatus.FAILURE
                ? BTNodeStatus.SUCCESS
                : r.status;
          return { status: inv, data: r.data, error: r.error };
        }
        case 'repeater': {
          const child = node.children?.[0];
          const n = Math.max(1, node.repeatCount || 1);
          let last = { status: BTNodeStatus.SUCCESS } as {
            status: BTNodeStatus;
            data?: any;
            error?: string;
          };
          for (let i = 0; i < n; i++) {
            if (!child) break;
            last = await this.executeNode(child, tick + 1);
            if (last.status !== BTNodeStatus.SUCCESS) break;
          }
          return last;
        }
        case 'timeout': {
          const child = node.children?.[0];
          if (!child)
            return {
              status: BTNodeStatus.FAILURE,
              error: 'No child for timeout decorator',
            };
          const saved = node.timeout ?? this.defaultTimeout;
          const res = await Promise.race([
            this.executeNode(child, tick + 1),
            new Promise<{ status: BTNodeStatus; error: string }>((_, rej) =>
              setTimeout(
                () =>
                  rej({
                    status: BTNodeStatus.FAILURE,
                    error: 'Decorator timeout',
                  } as any),
                saved
              )
            ),
          ]).catch((e: any) => e);
          return res;
        }
        case 'retry': {
          const child = node.children?.[0];
          const n = Math.max(1, node.retries ?? this.defaultRetries);
          let last: { status: BTNodeStatus; data?: any; error?: string } = {
            status: BTNodeStatus.FAILURE,
          };
          for (let i = 0; i <= n; i++) {
            if (!child) break;
            last = await this.executeNode(child, tick + 1);
            if (last.status === BTNodeStatus.SUCCESS) break;
          }
          return last;
        }
      }
    }

    while (retries <= maxRetries) {
      try {
        // Check for abort
        if (this.abortController.signal.aborted) {
          throw new Error('Run was aborted');
        }

        // Abortable timeout via linked controller
        const opController = new AbortController();
        const onAbort = () => opController.abort();
        this.abortController.signal.addEventListener('abort', onAbort, {
          once: true,
        });
        const timeoutId = setTimeout(() => opController.abort(), timeout);

        // Execute with timeout
        const executionPromise = (async () => {
          let result: {
            status: BTNodeStatus;
            data?: any;
            error?: string;
            confidence?: number;
            cost?: number;
            duration?: number;
          };

          switch (node.type) {
            case BTNodeType.SEQUENCE:
              result = await this.executeSequence(node, tick);
              break;
            case BTNodeType.SELECTOR:
              result = await this.executeSelector(node, tick);
              break;
            case BTNodeType.PARALLEL:
              result = await this.executeParallel(node, tick);
              break;
            case BTNodeType.ACTION:
              result = await this.executeAction(
                node,
                tick,
                opController.signal
              );
              break;
            case BTNodeType.CONDITION:
              result = await this.executeCondition(node, tick);
              break;
            case BTNodeType.COGNITIVE_REFLECTION:
              result = await this.executeCognitiveReflection(node, tick);
              break;
            default:
              throw new Error(`Unknown node type: ${node.type}`);
          }

          return result;
        })();

        let result: {
          status: BTNodeStatus;
          data?: any;
          error?: string;
          confidence?: number;
          cost?: number;
          duration?: number;
        };
        try {
          result = await executionPromise;
        } finally {
          clearTimeout(timeoutId);
          this.abortController.signal.removeEventListener('abort', onAbort);
        }

        const duration = Date.now() - nodeStartTime;

        if (result.status === BTNodeStatus.SUCCESS) {
          // Store enhanced metrics in blackboard for future reference
          if (result.confidence !== undefined) {
            this.setBlackboardValue(`${node.id}.confidence`, result.confidence);
          }
          if (result.cost !== undefined) {
            this.setBlackboardValue(`${node.id}.cost`, result.cost);
          }
          if (result.duration !== undefined) {
            this.setBlackboardValue(`${node.id}.duration`, result.duration);
          }

          const tickData: BTTick = {
            tick: ++this.tickCounter,
            node: node.id,
            status: BTNodeStatus.SUCCESS,
            metrics: { duration, retries, timeouts: 0 },
            data: result.data,
          };
          this.recordTick(tickData);
          return result;
        }

        // If we get here, the execution failed
        retries++;
        if (retries <= maxRetries) {
          const backoffMs = Math.min(1000 * 2 ** (retries - 1), 8000);
          console.log(
            `Retrying ${node.id} (attempt ${retries}/${maxRetries}) after ${backoffMs}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Max retries exceeded
        const tickData: BTTick = {
          tick: ++this.tickCounter,
          node: node.id,
          status: BTNodeStatus.FAILURE,
          metrics: { duration, retries, timeouts: 0 },
          error: result.error || 'Max retries exceeded',
        };
        this.recordTick(tickData);
        return result;
      } catch (error) {
        retries++;
        const duration = Date.now() - nodeStartTime;

        if (retries > maxRetries) {
          const tickData: BTTick = {
            tick: ++this.tickCounter,
            node: node.id,
            status: BTNodeStatus.FAILURE,
            metrics: { duration, retries, timeouts: 1 },
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          this.recordTick(tickData);
          throw error;
        }

        // Wait with backoff
        const backoffMs = Math.min(1000 * 2 ** (retries - 1), 8000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error('Max retries exceeded');
  }

  private async executeSequence(
    node: BTNode,
    tick: number
  ): Promise<{
    status: BTNodeStatus;
    data?: any;
    error?: string;
    confidence?: number;
    cost?: number;
    duration?: number;
  }> {
    if (!node.children) {
      return { status: BTNodeStatus.SUCCESS };
    }

    for (const child of node.children) {
      const result = await this.executeNode(child, tick + 1);
      if (result.status !== BTNodeStatus.SUCCESS) {
        return result;
      }
    }

    return { status: BTNodeStatus.SUCCESS };
  }

  private async executeSelector(
    node: BTNode,
    tick: number
  ): Promise<{
    status: BTNodeStatus;
    data?: any;
    error?: string;
    confidence?: number;
    cost?: number;
    duration?: number;
  }> {
    if (!node.children) {
      return { status: BTNodeStatus.FAILURE };
    }

    // Enhanced selector with confidence-based selection
    let bestResult: {
      status: BTNodeStatus;
      data?: any;
      error?: string;
      confidence?: number;
    } | null = null;
    let bestConfidence = -1;

    for (const child of node.children) {
      const result = await this.executeNode(child, tick + 1);

      if (result.status === BTNodeStatus.SUCCESS) {
        // Get confidence from blackboard if available
        const confidence =
          this.getBlackboardValue(`${child.id}.confidence`) || 0.5;

        if (confidence > bestConfidence) {
          bestResult = { ...result, confidence };
          bestConfidence = confidence;
        }

        // Early return if we find a high-confidence success
        if (confidence >= 0.9) {
          return result;
        }
      } else if (result.status === BTNodeStatus.RUNNING) {
        return result;
      }
    }

    // Return the best result if we found any success, otherwise failure
    if (bestResult) {
      return bestResult;
    }

    return { status: BTNodeStatus.FAILURE };
  }

  private async executeParallel(
    node: BTNode,
    tick: number
  ): Promise<{
    status: BTNodeStatus;
    data?: any;
    error?: string;
    confidence?: number;
    cost?: number;
    duration?: number;
  }> {
    if (!node.children) {
      return { status: BTNodeStatus.SUCCESS };
    }

    const policy = node.parallelPolicy || 'all';
    const promises = node.children.map((child) =>
      this.executeNode(child, tick + 1)
    );
    const results = await Promise.all(promises);
    const successes = results.filter(
      (r) => r.status === BTNodeStatus.SUCCESS
    ).length;
    const status =
      policy === 'any'
        ? successes > 0
          ? BTNodeStatus.SUCCESS
          : BTNodeStatus.FAILURE
        : successes === results.length
          ? BTNodeStatus.SUCCESS
          : BTNodeStatus.FAILURE;
    return { status, data: results.map((r) => r.data) };
  }

  private async executeAction(
    node: BTNode,
    tick: number,
    signal?: AbortSignal
  ): Promise<{
    status: BTNodeStatus;
    data?: any;
    error?: string;
    confidence?: number;
    cost?: number;
    duration?: number;
  }> {
    if (!node.action) {
      console.log(`No action defined for node: ${node.id}`);
      return { status: BTNodeStatus.FAILURE, error: 'No action defined' };
    }

    console.log(`Executing action: ${node.action} with args:`, {
      ...this.args,
      ...node.args,
    });

    // Prefix the action with "minecraft." since the tool executor expects this namespace
    const toolName = node.action.startsWith('minecraft.')
      ? node.action
      : `minecraft.${node.action}`;

    const result = await this.toolExecutor.execute(
      toolName,
      { ...this.args, ...node.args },
      signal
    );

    console.log(`Action result:`, result);

    return {
      status: result.ok ? BTNodeStatus.SUCCESS : BTNodeStatus.FAILURE,
      data: result.data,
      error: result.ok ? undefined : result.error,
    };
  }

  private async executeCondition(
    node: BTNode,
    tick: number
  ): Promise<{
    status: BTNodeStatus;
    data?: any;
    error?: string;
    confidence?: number;
    cost?: number;
    duration?: number;
  }> {
    if (!node.condition) {
      return { status: BTNodeStatus.FAILURE };
    }

    const result = await this.evaluateCondition(node.condition);
    return {
      status: result ? BTNodeStatus.SUCCESS : BTNodeStatus.FAILURE,
      confidence: result ? 1.0 : 0.0, // Conditions have binary confidence
      cost: 0, // Conditions are free
      duration: 0, // Conditions are instant
    };
  }

  private async evaluateGuard(guard: string): Promise<boolean> {
    return await this.evaluator.evaluate(guard, this.context);
  }

  private async evaluateCondition(condition: string): Promise<boolean> {
    return await this.evaluator.evaluate(condition, this.context);
  }

  /**
   * Execute cognitive reflection nodes
   */
  private async executeCognitiveReflection(
    node: BTNode,
    tick: number
  ): Promise<{
    status: BTNodeStatus;
    data?: any;
    confidence?: number;
    cost?: number;
    duration?: number;
  }> {
    const startTime = Date.now();

    try {
      console.log(
        `🧠 [BEHAVIOR TREE] Executing cognitive reflection: ${node.name}`
      );

      // Extract the thought content from node arguments
      const thoughtContent = node.args?.thoughtContent || '';
      const signals = node.args?.signals || [];

      if (!thoughtContent) {
        console.log(
          '❌ [BEHAVIOR TREE] No thought content provided to cognitive reflection node'
        );
        return {
          status: BTNodeStatus.FAILURE,
          confidence: 0,
          cost: 0,
          duration: Date.now() - startTime,
        };
      }

      console.log(
        `🧠 [BEHAVIOR TREE] Processing thought: "${thoughtContent.substring(0, 100)}..."`
      );
      console.log(`🧠 [BEHAVIOR TREE] Received ${signals.length} signals`);

      // Analyze the signals to determine appropriate actions
      const analysis = this.analyzeCognitiveSignals(signals);

      console.log(`🧠 [BEHAVIOR TREE] Signal analysis:`, {
        resourceNeeds: analysis.resourceNeeds.length,
        toolNeeds: analysis.toolNeeds.length,
        safetyConcerns: analysis.safetyConcerns.length,
        urgencyLevel: analysis.urgencyLevel,
      });

      // Execute actions based on the analyzed signals
      const actions = this.generateActionsFromSignals(analysis, thoughtContent);

      // Execute the actions through the tool executor
      let actionResults = [];
      if (actions.length > 0) {
        console.log(
          `🧠 [BEHAVIOR TREE] Executing ${actions.length} actions based on cognitive reflection`
        );

        for (const action of actions) {
          try {
            console.log(
              `🧠 [BEHAVIOR TREE] Executing action: ${action.type} - ${action.description}`
            );
            const result = await this.toolExecutor.execute(
              action.type,
              action.parameters || {}
            );
            actionResults.push({ action, success: result.ok, result });
          } catch (error) {
            console.error(
              `❌ [BEHAVIOR TREE] Action execution failed: ${action.type}`,
              error
            );
            actionResults.push({
              action,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      const result = {
        status: actionResults.every((r) => r.success)
          ? BTNodeStatus.SUCCESS
          : BTNodeStatus.FAILURE,
        data: {
          thoughtContent,
          signalsProcessed: signals.length,
          analysis,
          actionsExecuted: actions.length,
          actionResults,
          timestamp: Date.now(),
        },
        confidence: actionResults.length > 0 ? 0.8 : 0.6, // Higher confidence if actions were executed
        cost: 0.1 + actions.length * 0.05, // Cost increases with number of actions
        duration: Date.now() - startTime,
      };

      console.log(
        `✅ [BEHAVIOR TREE] Cognitive reflection completed successfully`
      );
      return result;
    } catch (error) {
      console.error(
        '❌ [BEHAVIOR TREE] Error executing cognitive reflection:',
        error
      );
      return {
        status: BTNodeStatus.FAILURE,
        confidence: 0,
        cost: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Analyze cognitive signals to extract actionable insights
   */
  private analyzeCognitiveSignals(signals: any[]): {
    resourceNeeds: any[];
    toolNeeds: any[];
    safetyConcerns: any[];
    urgencyLevel: number;
  } {
    const resourceNeeds: any[] = [];
    const toolNeeds: any[] = [];
    const safetyConcerns: any[] = [];
    let urgencyLevel = 0;

    signals.forEach((signal) => {
      switch (signal.type) {
        case 'resource_need':
          resourceNeeds.push(signal);
          if (signal.concept === 'wood' || signal.concept === 'iron') {
            urgencyLevel = Math.max(urgencyLevel, 0.6);
          }
          break;
        case 'tool_need':
          toolNeeds.push(signal);
          if (signal.concept === 'pickaxe') {
            urgencyLevel = Math.max(urgencyLevel, 0.7);
          }
          break;
        case 'safety_concern':
          safetyConcerns.push(signal);
          urgencyLevel = Math.max(urgencyLevel, 0.8);
          break;
        case 'urgency_signal':
          urgencyLevel = Math.max(urgencyLevel, signal.value || 0.8);
          break;
        case 'crafting_intent':
          urgencyLevel = Math.max(urgencyLevel, 0.5);
          break;
        case 'exploration_drive':
          urgencyLevel = Math.max(urgencyLevel, 0.4);
          break;
      }
    });

    return { resourceNeeds, toolNeeds, safetyConcerns, urgencyLevel };
  }

  /**
   * Generate bot actions based on analyzed cognitive signals
   */
  private generateActionsFromSignals(
    analysis: any,
    thoughtContent: string
  ): any[] {
    const actions: any[] = [];

    // Generate actions based on resource needs
    analysis.resourceNeeds.forEach((need: any) => {
      if (need.concept === 'wood') {
        actions.push({
          type: 'move_and_gather',
          description: `Gather wood to satisfy resource need`,
          parameters: {
            resource: 'wood',
            quantity: Math.min(need.value * 10, 20), // Convert signal value to quantity
            searchRadius: 50,
          },
        });
      } else if (need.concept === 'iron') {
        actions.push({
          type: 'move_and_mine',
          description: `Mine iron to satisfy resource need`,
          parameters: {
            resource: 'iron',
            quantity: Math.min(need.value * 5, 10), // Iron is harder to get
            searchRadius: 30,
          },
        });
      }
    });

    // Generate actions based on exploration drive
    if (analysis.urgencyLevel >= 0.4) {
      actions.push({
        type: 'explore_area',
        description: `Explore area to satisfy curiosity and gather resources`,
        parameters: {
          radius: 25,
          duration: 30000, // 30 seconds
        },
      });
    }

    // Generate safety actions if there are safety concerns
    if (analysis.safetyConcerns.length > 0) {
      actions.push({
        type: 'assess_safety',
        description: `Assess and improve safety based on concerns`,
        parameters: {
          checkRadius: 20,
        },
      });
    }

    // If no specific actions were generated, add a general movement action
    if (actions.length === 0) {
      actions.push({
        type: 'move_random',
        description: `Move to a random location for general exploration`,
        parameters: {
          distance: 20,
          duration: 15000, // 15 seconds
        },
      });
    }

    return actions;
  }

  private async loadBehaviorTree(optionId: string): Promise<BTNode> {
    try {
      // First, check if we have an inline definition from MCP options
      const inlineDefinition = this.getInlineDefinition(optionId);
      if (inlineDefinition) {
        console.log(`Using inline BT definition for ${optionId}`);
        return this.parseBTDefinition(this.validateBT(inlineDefinition));
      }

      // Try to load the behavior tree definition from the skill registry
      const fs = await import('fs/promises');
      const path = await import('path');

      // Look for the BT definition file
      // Handle option IDs like "opt.chop_tree_safe" -> "chop_tree_safe.json"
      const optionName = optionId.replace(/^opt\./, '').replace(/@.+$/, '');

      // Use a path relative to the current working directory (planning package)
      const btDefinitionPath = path.join(
        process.cwd(),
        'src',
        'behavior-trees',
        'definitions',
        `${optionName}.json`
      );

      console.log(`Loading BT definition from: ${btDefinitionPath}`);
      console.log(`Current working directory: ${process.cwd()}`);
      console.log(
        `File exists check: ${await fs
          .access(btDefinitionPath)
          .then(() => 'YES')
          .catch(() => 'NO')}`
      );

      try {
        const btDefinitionContent = await fs.readFile(btDefinitionPath, 'utf8');
        const btDefinition = JSON.parse(btDefinitionContent);
        console.log(
          `Loaded BT definition for ${optionId}:`,
          JSON.stringify(btDefinition, null, 2)
        );
        return this.parseBTDefinition(btDefinition);
      } catch (fileError) {
        console.warn(
          `BT definition not found for ${optionId}, using fallback action:`,
          fileError
        );
        return {
          id: optionId,
          type: BTNodeType.ACTION,
          name: optionId,
          action: optionId,
          args: this.args,
          timeout: this.defaultTimeout,
          retries: this.defaultRetries,
        };
      }
    } catch (error) {
      console.error(`Failed to load BT definition for ${optionId}:`, error);
      // Fallback: return a simple action node
      return {
        id: optionId,
        type: BTNodeType.ACTION,
        name: optionId,
        action: optionId,
        args: this.args,
        timeout: this.defaultTimeout,
        retries: this.defaultRetries,
      };
    }
  }

  private validateBT(def: any): any {
    // Minimal structural validation; replace with zod/ajv if you prefer
    if (!def || typeof def !== 'object' || !def.root) {
      throw new Error('Invalid BT definition: missing root');
    }
    if (!def.id) def.id = def.name || 'bt';
    if (!def.name) def.name = def.id;
    return def;
  }

  private parseBTDefinition(definition: any): BTNode {
    const root = definition.root;

    return {
      id: definition.id,
      type: this.mapNodeType(root.type),
      name: definition.name,
      children: root.children?.map((child: any) => this.parseBTNode(child)),
      action: root.type === 'action' ? root.action : undefined,
      args: root.args || {},
      condition: root.condition,
      timeout: definition.metadata?.timeout ?? this.defaultTimeout,
      retries: definition.metadata?.retries ?? this.defaultRetries,
    };
  }

  private parseBTNode(nodeDef: any): BTNode {
    return {
      id: nodeDef.name || nodeDef.type,
      type: this.mapNodeType(nodeDef.type),
      name: nodeDef.name,
      children: nodeDef.children?.map((child: any) => this.parseBTNode(child)),
      action: nodeDef.action,
      args: nodeDef.args || {},
      condition: nodeDef.condition,
      timeout: nodeDef.timeout || 5000,
      retries: nodeDef.retries || 1,
      decorator: nodeDef.decorator,
      repeatCount: nodeDef.repeatCount,
      parallelPolicy: nodeDef.parallelPolicy,
    };
  }

  private mapNodeType(type: string): BTNodeType {
    switch (type.toLowerCase()) {
      case 'sequence':
        return BTNodeType.SEQUENCE;
      case 'selector':
        return BTNodeType.SELECTOR;
      case 'parallel':
        return BTNodeType.PARALLEL;
      case 'decorator':
        return BTNodeType.DECORATOR;
      case 'action':
        return BTNodeType.ACTION;
      case 'condition':
        return BTNodeType.CONDITION;
      case 'cognitive_reflection':
      case 'cognitive-reflection':
        return BTNodeType.COGNITIVE_REFLECTION;
      default:
        return BTNodeType.ACTION;
    }
  }

  private recordTick(tick: BTTick): void {
    // Apply streaming controls
    const sampleRate = this.options.sampleRate || 1;
    const emitNodeBoundaries = this.options.emitNodeBoundaries !== false;

    // Store all ticks (for internal use)
    if (this.ticks.length < this.telemetryCap) {
      this.ticks.push(tick);
    }

    // Apply sample rate filtering
    if (tick.tick % sampleRate === 0) {
      this.emit('tick', tick);
    }

    // Always emit status changes (node boundaries)
    if (emitNodeBoundaries) {
      this.emit('status', tick.status);
    }
  }
}

// ============================================================================
// Tool Executor Interface
// ============================================================================

// ============================================================================
// Enhanced Evaluation and Context Types
// ============================================================================

export interface ConditionEvaluator {
  evaluate(expression: string, context: EvaluationContext): Promise<boolean>;
}

export interface EvaluationContext {
  inventory?: Record<string, number>;
  world?: Record<string, any>;
  task?: Record<string, any>;
  blackboard: Record<string, any>;
  runId: string;
  timestamp: number;
}

export interface ActionResult {
  ok: boolean;
  data?: any;
  error?: string;
  environmentDeltas?: any;
  // Enhanced metrics
  confidence?: number; // 0-1 confidence in the result
  cost?: number; // Resource cost of the action
  duration?: number; // How long the action took
  metadata?: Record<string, any>; // Additional context
}

export interface ToolExecutor {
  execute(
    tool: string,
    args: Record<string, any>,
    signal?: AbortSignal
  ): Promise<ActionResult>;
}
