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
}

// ============================================================================
// Behavior Tree Runner Implementation
// ============================================================================

export class BehaviorTreeRunner extends EventEmitter {
  private activeRuns: Map<string, BTRun> = new Map();
  private toolExecutor: ToolExecutor;
  private defaultTimeout: number = 5000; // 5 seconds
  private defaultRetries: number = 2;

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
    const run = new BTRun(runId, optionId, args, options, this.toolExecutor);

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

  constructor(
    runId: string,
    optionId: string,
    args: Record<string, any>,
    options: BTRunOptions,
    toolExecutor: ToolExecutor
  ) {
    super();
    this.runId = runId;
    this.optionId = optionId;
    this.args = args;
    this.options = options;
    this.toolExecutor = toolExecutor;
    // Initialize with a placeholder tree, will be loaded in execute()
    this.tree = {
      id: optionId,
      type: BTNodeType.ACTION,
      name: optionId,
      action: optionId,
      args: this.args,
      timeout: 8000,
      retries: 2,
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

  private async executeNode(
    node: BTNode,
    tick: number
  ): Promise<{ status: BTNodeStatus; data?: any; error?: string }> {
    const nodeStartTime = Date.now();
    let retries = 0;
    const maxRetries = node.retries ?? this.options.maxRetries ?? 2;
    const timeout = this.options.timeout ?? node.timeout ?? 5000;

    // Check guard conditions
    if (node.guard && this.options.enableGuards) {
      const guardResult = await this.evaluateGuard(node.guard);
      if (!guardResult) {
        const tickData: BTTick = {
          tick,
          node: node.id,
          status: BTNodeStatus.FAILURE,
          metrics: { duration: 0, retries: 0, timeouts: 0 },
          error: 'Guard condition failed',
        };
        this.recordTick(tickData);
        return { status: BTNodeStatus.FAILURE };
      }
    }

    while (retries <= maxRetries) {
      try {
        // Check for abort
        if (this.abortController.signal.aborted) {
          throw new Error('Run was aborted');
        }

        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Execution timeout')), timeout);
        });

        // Execute with timeout
        const executionPromise = (async () => {
          let result: { status: BTNodeStatus; data?: any; error?: string };

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
              result = await this.executeAction(node, tick);
              break;
            case BTNodeType.CONDITION:
              result = await this.executeCondition(node, tick);
              break;
            default:
              throw new Error(`Unknown node type: ${node.type}`);
          }

          return result;
        })();

        const result = await Promise.race([executionPromise, timeoutPromise]);

        const duration = Date.now() - nodeStartTime;

        if (result.status === BTNodeStatus.SUCCESS) {
          const tickData: BTTick = {
            tick,
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
          console.log(`Retrying ${node.id} (attempt ${retries}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // Max retries exceeded
        const tickData: BTTick = {
          tick,
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
            tick,
            node: node.id,
            status: BTNodeStatus.FAILURE,
            metrics: { duration, retries, timeouts: 0 },
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          this.recordTick(tickData);
          throw error;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Max retries exceeded');
  }

  private async executeSequence(
    node: BTNode,
    tick: number
  ): Promise<{ status: BTNodeStatus; data?: any; error?: string }> {
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
  ): Promise<{ status: BTNodeStatus; data?: any; error?: string }> {
    if (!node.children) {
      return { status: BTNodeStatus.FAILURE };
    }

    for (const child of node.children) {
      const result = await this.executeNode(child, tick + 1);
      if (
        result.status === BTNodeStatus.SUCCESS ||
        result.status === BTNodeStatus.RUNNING
      ) {
        return result;
      }
    }

    return { status: BTNodeStatus.FAILURE };
  }

  private async executeParallel(
    node: BTNode,
    tick: number
  ): Promise<{ status: BTNodeStatus; data?: any; error?: string }> {
    if (!node.children) {
      return { status: BTNodeStatus.SUCCESS };
    }

    const promises = node.children.map((child) =>
      this.executeNode(child, tick + 1)
    );
    const results = await Promise.all(promises);

    // Parallel succeeds if all children succeed
    const allSuccess = results.every((r) => r.status === BTNodeStatus.SUCCESS);
    return {
      status: allSuccess ? BTNodeStatus.SUCCESS : BTNodeStatus.FAILURE,
      data: results.map((r) => r.data),
    };
  }

  private async executeAction(
    node: BTNode,
    tick: number
  ): Promise<{ status: BTNodeStatus; data?: any; error?: string }> {
    if (!node.action) {
      console.log(`No action defined for node: ${node.id}`);
      return { status: BTNodeStatus.FAILURE, error: 'No action defined' };
    }

    console.log(`Executing action: ${node.action} with args:`, {
      ...this.args,
      ...node.args,
    });

    const result = await this.toolExecutor.execute(node.action, {
      ...this.args,
      ...node.args,
    });

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
  ): Promise<{ status: BTNodeStatus; data?: any }> {
    if (!node.condition) {
      return { status: BTNodeStatus.FAILURE };
    }

    const result = await this.evaluateCondition(node.condition);
    return {
      status: result ? BTNodeStatus.SUCCESS : BTNodeStatus.FAILURE,
    };
  }

  private async evaluateGuard(guard: string): Promise<boolean> {
    // TODO: Implement guard evaluation logic
    // For now, return true to allow execution
    return true;
  }

  private async evaluateCondition(condition: string): Promise<boolean> {
    // TODO: Implement condition evaluation logic
    // For now, return true
    return true;
  }

  private async loadBehaviorTree(optionId: string): Promise<BTNode> {
    try {
      // Try to load the behavior tree definition from the skill registry
      const fs = await import('fs/promises');
      const path = await import('path');

      // Look for the BT definition file
      // Handle option IDs like "opt.chop_tree_safe" -> "chop_tree_safe.json"
      const optionName = optionId.replace(/^opt\./, '');

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
          timeout: 8000,
          retries: 2,
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
        timeout: 8000,
        retries: 2,
      };
    }
  }

  private parseBTDefinition(definition: any): BTNode {
    const root = definition.root;

    return {
      id: definition.id,
      type: this.mapNodeType(root.type),
      name: definition.name,
      children: root.children?.map((child: any) => this.parseBTNode(child)),
      action: root.action,
      args: root.args || {},
      condition: root.condition,
      timeout: definition.metadata?.timeout || 8000,
      retries: definition.metadata?.retries || 2,
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
      case 'action':
        return BTNodeType.ACTION;
      case 'condition':
        return BTNodeType.CONDITION;
      default:
        return BTNodeType.ACTION;
    }
  }

  private recordTick(tick: BTTick): void {
    this.ticks.push(tick);
    this.emit('tick', tick);
    this.emit('status', tick.status);
  }
}

// ============================================================================
// Tool Executor Interface
// ============================================================================

export interface ToolExecutor {
  execute(
    tool: string,
    args: Record<string, any>
  ): Promise<{
    ok: boolean;
    data?: any;
    error?: string;
    environmentDeltas?: any;
  }>;
}
