/** BT-DSL Parser and Compiler — deterministic compilation, named sensor predicates. */

import Ajv from 'ajv';
import { performance } from 'node:perf_hooks';
import {
  BT_DSL_SCHEMA,
  BTNode,
  LeafNode,
  SensorPredicate,
  validateBTDSL,
  getLeafNames,
  getSensorPredicates,
  isLeafNode,
  isSequenceNode,
  isSelectorNode,
  isRepeatUntilNode,
  isTimeoutDecoratorNode,
  isFailOnTrueDecoratorNode,
} from './bt-dsl-schema';
import {
  LeafContext,
  LeafResult,
  ExecError,
  createExecError,
  type LeafImpl,
} from './leaf-contracts';
// Do not import concrete LeafFactory class; we compile against an interface.

// ============================================================================
// Execution Status
// ============================================================================

/**
 * Execution status for BT nodes
 */
export type BTStatus = 'success' | 'failure' | 'running';

/**
 * Result from BT node execution
 */
export interface BTResult {
  status: BTStatus;
  result?: any;
  error?: ExecError;
  metrics?: {
    durationMs: number;
    nodeExecutions: number;
    leafExecutions: number;
  };
}

// ============================================================================
// Compiled BT Node
// ============================================================================

/**
 * Compiled BT node ready for execution
 */
export interface CompiledBTNode {
  type: string;
  name?: string;
  execute(ctx: BTExecutionContext): Promise<BTResult>;
}

/**
 * Leaf factory interface for BT-DSL parser
 */
export interface LeafFactoryInterface {
  get(name: string, version?: string): LeafImpl | undefined;
  run(
    name: string,
    version: string,
    ctx: LeafContext,
    args: unknown,
    opts?: unknown
  ): Promise<LeafResult>;
  has(name: string, version?: string): boolean;
  listLeaves(): Array<{
    name: string;
    version: string;
    spec: { name: string; version: string };
  }>;
}

/**
 * Execution context for BT nodes
 */
export interface BTExecutionContext {
  leafFactory: LeafFactoryInterface;
  leafContext: LeafContext;
  startTime: number;
  nodeExecutions: number;
  leafExecutions: number;
  abortSignal: AbortSignal;
}

// ============================================================================
// Sensor Predicate Evaluator
// ============================================================================

/**
 * Evaluates named sensor predicates
 */
export class SensorPredicateEvaluator {
  /**
   * Evaluate a sensor predicate
   */
  async evaluate(
    predicate: SensorPredicate,
    ctx: LeafContext
  ): Promise<boolean> {
    const { name, parameters = {} } = predicate;

    switch (name) {
      case 'distance_to':
        return this.evaluateDistanceTo(parameters, ctx);
      case 'hostiles_present':
        return this.evaluateHostilesPresent(parameters, ctx);
      case 'light_level_safe':
        return this.evaluateLightLevelSafe(parameters, ctx);
      case 'inventory_has_item':
        return this.evaluateInventoryHasItem(parameters, ctx);
      case 'position_reached':
        return this.evaluatePositionReached(parameters, ctx);
      case 'time_elapsed':
        return this.evaluateTimeElapsed(parameters, ctx);
      case 'health_low':
        return this.evaluateHealthLow(parameters, ctx);
      case 'hunger_low':
        return this.evaluateHungerLow(parameters, ctx);
      case 'weather_bad':
        return this.evaluateWeatherBad(parameters, ctx);
      case 'biome_safe':
        return this.evaluateBiomeSafe(parameters, ctx);
      default:
        throw new Error(`Unknown sensor predicate: ${name}`);
    }
  }

  private async evaluateDistanceTo(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { target, maxDistance = 5 } = params;
    if (
      !target ||
      typeof target.x !== 'number' ||
      typeof target.y !== 'number' ||
      typeof target.z !== 'number'
    )
      return false;

    const botPos = ctx.bot.entity?.position;
    if (!botPos) return false;

    const distance = Math.sqrt(
      Math.pow(botPos.x - target.x, 2) +
        Math.pow(botPos.y - target.y, 2) +
        Math.pow(botPos.z - target.z, 2)
    );

    return distance <= maxDistance;
  }

  private async evaluateHostilesPresent(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { maxDistance = 10 } = params;
    const snapshot = await ctx.snapshot();
    const hostiles = Array.isArray(snapshot?.nearbyHostiles)
      ? snapshot.nearbyHostiles
      : [];
    return hostiles.some((hostile) => hostile.distance <= maxDistance);
  }

  private async evaluateLightLevelSafe(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { minLight = 8 } = params;
    const snapshot = await ctx.snapshot();
    const level = snapshot?.lightLevel ?? 0;
    return level >= minLight;
  }

  private async evaluateInventoryHasItem(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { itemName, minCount = 1 } = params;
    if (!itemName) return false;

    const inventory = await ctx.inventory();
    const items = Array.isArray(inventory?.items) ? inventory.items : [];
    const item = items.find((i: any) => i?.name === itemName);

    return item ? item.count >= minCount : false;
  }

  private async evaluatePositionReached(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { target, tolerance = 1 } = params;
    if (
      !target ||
      typeof target.x !== 'number' ||
      typeof target.y !== 'number' ||
      typeof target.z !== 'number'
    )
      return false;

    const botPos = ctx.bot.entity?.position;
    if (!botPos) return false;

    const distance = Math.sqrt(
      Math.pow(botPos.x - target.x, 2) +
        Math.pow(botPos.y - target.y, 2) +
        Math.pow(botPos.z - target.z, 2)
    );

    return distance <= tolerance;
  }

  private async evaluateTimeElapsed(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { startTime, minElapsedMs } = params;
    if (typeof startTime !== 'number' || typeof minElapsedMs !== 'number')
      return false;

    const elapsed = ctx.now() - startTime;
    return elapsed >= minElapsedMs;
  }

  private async evaluateHealthLow(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { threshold = 10 } = params;
    const health = ctx.bot.health ?? 20;

    return health <= threshold;
  }

  private async evaluateHungerLow(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { threshold = 6 } = params;
    const food = ctx.bot.food ?? 20;

    return food <= threshold;
  }

  private async evaluateWeatherBad(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const snapshot = await ctx.snapshot();

    return snapshot.weather === 'rain' || snapshot.weather === 'thunder';
  }

  private async evaluateBiomeSafe(
    params: any,
    ctx: LeafContext
  ): Promise<boolean> {
    const { safeBiomes = ['plains', 'forest', 'desert'] } = params;
    const snapshot = await ctx.snapshot();
    return Array.isArray(safeBiomes) && typeof snapshot?.biome === 'string'
      ? safeBiomes.includes(snapshot.biome)
      : false;
  }
}

// ============================================================================
// Compiled Node Implementations
// ============================================================================

/**
 * Compiled leaf node
 */
class CompiledLeafNode implements CompiledBTNode {
  constructor(
    private node: LeafNode,
    private leafFactory: LeafFactoryInterface
  ) {}

  get type() {
    return this.node.type;
  }
  get name() {
    return this.node.name;
  }

  async execute(ctx: BTExecutionContext): Promise<BTResult> {
    const startTime = performance.now();
    if (ctx.abortSignal?.aborted) {
      return {
        status: 'failure',
        error: { code: 'aborted', retryable: false, detail: 'aborted' },
      };
    }
    ctx.leafExecutions++;

    try {
      const leaf = this.leafFactory.get(
        this.node.leafName,
        this.node.leafVersion
      );
      if (!leaf) {
        return {
          status: 'failure',
          error: {
            code: 'unknown',
            retryable: false,
            detail: `Leaf not found: ${this.node.leafName}`,
          },
        };
      }

      // Use the resolved leaf's actual version if none was specified.
      const versionToRun = this.node.leafVersion ?? leaf.spec.version;

      const result = await this.leafFactory.run(
        this.node.leafName,
        versionToRun,
        ctx.leafContext,
        this.node.args || {},
        { traceId: `bt-${this.node.name || this.node.leafName}` }
      );

      return {
        status: result.status,
        result: result.result,
        error: result.error,
        metrics: {
          durationMs: performance.now() - startTime,
          nodeExecutions: 1,
          leafExecutions: 1,
        },
      };
    } catch (error) {
      return {
        status: 'failure',
        error: createExecError(error),
        metrics: {
          durationMs: performance.now() - startTime,
          nodeExecutions: 1,
          leafExecutions: 1,
        },
      };
    }
  }
}

/**
 * Compiled sequence node
 */
class CompiledSequenceNode implements CompiledBTNode {
  constructor(
    private node: any,
    private children: CompiledBTNode[]
  ) {}

  get type() {
    return this.node.type;
  }
  get name() {
    return this.node.name;
  }

  async execute(ctx: BTExecutionContext): Promise<BTResult> {
    const startTime = performance.now();
    if (ctx.abortSignal?.aborted) {
      return {
        status: 'failure',
        error: { code: 'aborted', retryable: false, detail: 'aborted' },
      };
    }
    ctx.nodeExecutions++;

    let totalNodeExecutions = 1; // include self
    let totalLeafExecutions = 0;

    for (const child of this.children) {
      const result = await child.execute(ctx);
      totalNodeExecutions += result.metrics?.nodeExecutions || 0;
      totalLeafExecutions += result.metrics?.leafExecutions || 0;

      if (result.status === 'running') {
        return {
          status: 'running',
          metrics: {
            durationMs: performance.now() - startTime,
            nodeExecutions: totalNodeExecutions,
            leafExecutions: totalLeafExecutions,
          },
        };
      }
      if (result.status === 'failure') {
        return {
          status: 'failure',
          error: result.error,
          metrics: {
            durationMs: performance.now() - startTime,
            nodeExecutions: totalNodeExecutions,
            leafExecutions: totalLeafExecutions,
          },
        };
      }
    }

    return {
      status: 'success',
      metrics: {
        durationMs: performance.now() - startTime,
        nodeExecutions: totalNodeExecutions,
        leafExecutions: totalLeafExecutions,
      },
    };
  }
}

/**
 * Compiled selector node
 */
class CompiledSelectorNode implements CompiledBTNode {
  constructor(
    private node: any,
    private children: CompiledBTNode[]
  ) {}

  get type() {
    return this.node.type;
  }
  get name() {
    return this.node.name;
  }

  async execute(ctx: BTExecutionContext): Promise<BTResult> {
    const startTime = performance.now();
    if (ctx.abortSignal?.aborted) {
      return {
        status: 'failure',
        error: { code: 'aborted', retryable: false, detail: 'aborted' },
      };
    }
    ctx.nodeExecutions++;

    let totalNodeExecutions = 1; // include self
    let totalLeafExecutions = 0;
    let lastError: ExecError | undefined;

    for (const child of this.children) {
      const result = await child.execute(ctx);
      totalNodeExecutions += result.metrics?.nodeExecutions || 0;
      totalLeafExecutions += result.metrics?.leafExecutions || 0;

      if (result.status === 'running') {
        return {
          status: 'running',
          metrics: {
            durationMs: performance.now() - startTime,
            nodeExecutions: totalNodeExecutions,
            leafExecutions: totalLeafExecutions,
          },
        };
      }
      if (result.status === 'success') {
        return {
          status: 'success',
          result: result.result,
          metrics: {
            durationMs: performance.now() - startTime,
            nodeExecutions: totalNodeExecutions,
            leafExecutions: totalLeafExecutions,
          },
        };
      }

      if (result.error) {
        lastError = result.error;
      }
    }

    return {
      status: 'failure',
      error: lastError || {
        code: 'unknown',
        retryable: false,
        detail: 'All selector children failed',
      },
      metrics: {
        durationMs: performance.now() - startTime,
        nodeExecutions: totalNodeExecutions,
        leafExecutions: totalLeafExecutions,
      },
    };
  }
}

/**
 * Compiled repeat until node
 */
class CompiledRepeatUntilNode implements CompiledBTNode {
  constructor(
    private node: any,
    private child: CompiledBTNode,
    private condition: SensorPredicate,
    private evaluator: SensorPredicateEvaluator
  ) {}

  get type() {
    return this.node.type;
  }
  get name() {
    return this.node.name;
  }

  async execute(ctx: BTExecutionContext): Promise<BTResult> {
    const startTime = performance.now();
    if (ctx.abortSignal?.aborted) {
      return {
        status: 'failure',
        error: { code: 'aborted', retryable: false, detail: 'aborted' },
      };
    }
    ctx.nodeExecutions++;

    let totalNodeExecutions = 1; // include self
    let totalLeafExecutions = 0;
    const maxIterations = this.node.maxIterations || 100;
    let iterations = 0;

    while (iterations < maxIterations) {
      if (ctx.abortSignal?.aborted) {
        return {
          status: 'failure',
          error: { code: 'aborted', retryable: false, detail: 'aborted' },
        };
      }
      // Check condition first
      const conditionMet = await this.evaluator.evaluate(
        this.condition,
        ctx.leafContext
      );
      if (conditionMet) {
        return {
          status: 'success',
          metrics: {
            durationMs: performance.now() - startTime,
            nodeExecutions: totalNodeExecutions,
            leafExecutions: totalLeafExecutions,
          },
        };
      }

      // Execute child
      const result = await this.child.execute(ctx);
      totalNodeExecutions += result.metrics?.nodeExecutions || 0;
      totalLeafExecutions += result.metrics?.leafExecutions || 0;

      if (result.status === 'running') {
        return {
          status: 'running',
          metrics: {
            durationMs: performance.now() - startTime,
            nodeExecutions: totalNodeExecutions,
            leafExecutions: totalLeafExecutions,
          },
        };
      }
      if (result.status === 'failure') {
        return {
          status: 'failure',
          error: result.error,
          metrics: {
            durationMs: performance.now() - startTime,
            nodeExecutions: totalNodeExecutions,
            leafExecutions: totalLeafExecutions,
          },
        };
      }

      iterations++;
    }

    return {
      status: 'failure',
      error: {
        code: 'unknown',
        retryable: false,
        detail: `Repeat.Until exceeded max iterations: ${maxIterations}`,
      },
      metrics: {
        durationMs: performance.now() - startTime,
        nodeExecutions: totalNodeExecutions,
        leafExecutions: totalLeafExecutions,
      },
    };
  }
}

/**
 * Compiled timeout decorator node
 */
class CompiledTimeoutDecoratorNode implements CompiledBTNode {
  constructor(
    private node: any,
    private child: CompiledBTNode
  ) {}

  get type() {
    return this.node.type;
  }
  get name() {
    return this.node.name;
  }

  async execute(ctx: BTExecutionContext): Promise<BTResult> {
    const startTime = performance.now();
    if (ctx.abortSignal?.aborted) {
      return {
        status: 'failure',
        error: { code: 'aborted', retryable: false, detail: 'aborted' },
      };
    }
    ctx.nodeExecutions++;

    try {
      const ms =
        typeof this.node.timeoutMs === 'number' ? this.node.timeoutMs : 0;
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<BTResult>((_, reject) => {
        timer = setTimeout(() => {
          reject({
            code: 'deadline.exceeded',
            detail: `Timeout after ${ms}ms`,
            retryable: false,
          });
        }, ms);
      });

      const result = await Promise.race([
        this.child.execute(ctx),
        timeoutPromise,
      ]);
      if (timer) clearTimeout(timer);

      return result;
    } catch (error) {
      return {
        status: 'failure',
        error: createExecError(error),
        metrics: {
          durationMs: performance.now() - startTime,
          nodeExecutions: 1,
          leafExecutions: 0,
        },
      };
    }
  }
}

/**
 * Compiled fail on true decorator node
 */
class CompiledFailOnTrueDecoratorNode implements CompiledBTNode {
  constructor(
    private node: any,
    private child: CompiledBTNode,
    private condition: SensorPredicate,
    private evaluator: SensorPredicateEvaluator
  ) {}

  get type() {
    return this.node.type;
  }
  get name() {
    return this.node.name;
  }

  async execute(ctx: BTExecutionContext): Promise<BTResult> {
    const startTime = performance.now();
    if (ctx.abortSignal?.aborted) {
      return {
        status: 'failure',
        error: { code: 'aborted', retryable: false, detail: 'aborted' },
      };
    }
    ctx.nodeExecutions++;

    // Check condition first
    const conditionTrue = await this.evaluator.evaluate(
      this.condition,
      ctx.leafContext
    );
    if (conditionTrue) {
      return {
        status: 'failure',
        error: {
          code: 'unknown',
          retryable: false,
          detail: 'FailOnTrue condition was true',
        },
        metrics: {
          durationMs: performance.now() - startTime,
          nodeExecutions: 1,
          leafExecutions: 0,
        },
      };
    }

    // Execute child
    const result = await this.child.execute(ctx);
    return {
      ...result,
      metrics: {
        durationMs: performance.now() - startTime,
        nodeExecutions: (result.metrics?.nodeExecutions || 0) + 1,
        leafExecutions: result.metrics?.leafExecutions || 0,
      },
    };
  }
}

// ============================================================================
// BT-DSL Parser and Compiler
// ============================================================================

/**
 * BT-DSL Parser with deterministic compilation
 */
export class BTDSLParser {
  private ajv: Ajv;
  private validate: any;
  private evaluator: SensorPredicateEvaluator;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.validate = this.ajv.compile(BT_DSL_SCHEMA);
    this.evaluator = new SensorPredicateEvaluator();
  }

  /**
   * Parse and compile BT-DSL JSON into executable tree
   * Deterministic compilation for reproducible results (S2.2)
   */
  parse(
    btDslJson: any,
    leafFactory: LeafFactoryInterface
  ): {
    valid: boolean;
    errors?: string[];
    compiled?: CompiledBTNode;
    treeHash?: string;
  } {
    // (quiet) Keep logging minimal; Cursor struggles with giant console noise.

    // Validate JSON schema
    if (!this.validate(btDslJson)) {
      return {
        valid: false,
        errors: this.ajv.errorsText(this.validate.errors).split(', '),
      };
    }

    // Validate BT-DSL structure
    const validation = validateBTDSL(btDslJson.root);
    if (!validation.valid) {
      return {
        valid: false,
        errors: validation.errors,
      };
    }

    // Validate that required leaves (and versions, if specified) exist
    const missingLeaves = new Set<string>();
    const checkNode = (n: BTNode) => {
      if (isLeafNode(n)) {
        const id = n.leafVersion
          ? `${n.leafName}@${n.leafVersion}`
          : n.leafName;
        const ok = n.leafVersion
          ? leafFactory.has(n.leafName, n.leafVersion)
          : leafFactory.has(n.leafName);
        if (!ok) missingLeaves.add(id);
      }
      const kids: BTNode[] = (n as any).children || [];
      kids.forEach(checkNode);
      if ((n as any).child) checkNode((n as any).child);
    };
    checkNode(btDslJson.root);

    if (missingLeaves.size > 0) {
      return {
        valid: false,
        errors: [`Missing leaves: ${Array.from(missingLeaves).join(', ')}`],
      };
    }

    // Compile the tree
    try {
      const compiled = this.compileNode(btDslJson.root, leafFactory);
      const treeHash = this.computeTreeHash(btDslJson.root);

      return {
        valid: true,
        compiled,
        treeHash,
      };
    } catch (error) {
      console.log('BT-DSL Parser: Compilation failed:', error);
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Compilation failed'],
      };
    }
  }

  /**
   * Compile a BT node into executable form
   */
  private compileNode(
    node: BTNode,
    leafFactory: LeafFactoryInterface
  ): CompiledBTNode {
    if (isLeafNode(node)) {
      return new CompiledLeafNode(node, leafFactory);
    } else if (isSequenceNode(node)) {
      const children = node.children.map((child) =>
        this.compileNode(child, leafFactory)
      );
      return new CompiledSequenceNode(node, children);
    } else if (isSelectorNode(node)) {
      const children = node.children.map((child) =>
        this.compileNode(child, leafFactory)
      );
      return new CompiledSelectorNode(node, children);
    } else if (isRepeatUntilNode(node)) {
      const child = this.compileNode(node.child, leafFactory);
      return new CompiledRepeatUntilNode(
        node,
        child,
        node.condition,
        this.evaluator
      );
    } else if (isTimeoutDecoratorNode(node)) {
      const child = this.compileNode(node.child, leafFactory);
      return new CompiledTimeoutDecoratorNode(node, child);
    } else if (isFailOnTrueDecoratorNode(node)) {
      const child = this.compileNode(node.child, leafFactory);
      return new CompiledFailOnTrueDecoratorNode(
        node,
        child,
        node.condition,
        this.evaluator
      );
    } else {
      throw new Error(`Unknown node type: ${(node as any).type}`);
    }
  }

  /**
   * Compute deterministic hash of BT tree for caching
   */
  private computeTreeHash(node: BTNode): string {
    const json = JSON.stringify(node, (key, value) => {
      // Sort object keys for deterministic ordering
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        return Object.keys(value)
          .sort()
          .reduce((obj: any, key) => {
            obj[key] = value[key];
            return obj;
          }, {});
      }
      return value;
    });

    // Simple hash function for deterministic results
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Execute a compiled BT tree
   */
  async execute(
    compiled: CompiledBTNode,
    leafFactory: LeafFactoryInterface,
    leafContext: LeafContext,
    abortSignal?: AbortSignal
  ): Promise<BTResult> {
    const startTime = performance.now();
    const ctx: BTExecutionContext = {
      leafFactory,
      leafContext,
      startTime,
      nodeExecutions: 0,
      leafExecutions: 0,
      abortSignal: abortSignal || new AbortController().signal,
    };

    try {
      const result = await compiled.execute(ctx);
      return {
        ...result,
        metrics: {
          durationMs: performance.now() - startTime,
          nodeExecutions: ctx.nodeExecutions,
          leafExecutions: ctx.leafExecutions,
        },
      };
    } catch (error) {
      return {
        status: 'failure',
        error: createExecError(error),
        metrics: {
          durationMs: performance.now() - startTime,
          nodeExecutions: ctx.nodeExecutions,
          leafExecutions: ctx.leafExecutions,
        },
      };
    }
  }
}
