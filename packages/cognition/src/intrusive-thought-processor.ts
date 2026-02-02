/**
 * Intrusive Thought Processor
 *
 * Processes intrusive thoughts and converts them into actionable tasks
 * that actually influence bot behavior through the planning system.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface Action {
  type: string;
  target: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: 'low' | 'medium' | 'high';
  source: string;
  progress: number;
  status: string;
  steps: TaskStep[];
  createdAt: number;
  updatedAt: number;
  metadata: {
    originalThought: string;
    action: Action;
    confidence: number;
    idempotencyKey?: string;
    bucket?: string;
  };
}

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  order: number;
}

export interface BotResponse {
  accepted: boolean;
  response: string;
  taskId?: string;
  task?: Task;
  recorded?: boolean;
  error?: string;
  thought?: {
    id: string;
    type: string;
    content: string;
    context?: any;
    metadata?: any;
    timestamp: number;
  };
}

// Plan types for MCP integration
type Plan =
  | { kind: 'option'; id: string; args?: any }
  | { kind: 'sequence'; leaves: Array<{ name: string; args?: any }> }
  | { kind: 'proposal'; ticket: string; status: 'shadow' };

// MCP client interface for dependency injection
interface MCPClient {
  callTool<T = any>(name: string, args: any): Promise<T>;
  listTools(): Promise<string[]>;
  readResource<T = any>(uri: string): Promise<T>;
}

// Simple HTTP-based MCP client that connects to the planning server's MCP endpoints
class PlanningMCPClient implements MCPClient {
  constructor(private baseUrl: string = 'http://localhost:3002') {}

  async callTool<T = any>(name: string, args: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`MCP tool call failed: ${response.status}`);
    }

    const result = (await response.json()) as any;
    return result.data || result;
  }

  async listTools(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/mcp/tools`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Failed to list MCP tools: ${response.status}`);
    }

    const result = (await response.json()) as any;
    return result.tools?.map((tool: any) => tool.name) || [];
  }

  async readResource<T = any>(uri: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}/mcp/resources/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Failed to read MCP resource ${uri}: ${response.status}`);
    }

    const result = (await response.json()) as any;
    return result.data || result;
  }
}

export interface IntrusiveThoughtProcessorConfig {
  enableActionParsing: boolean;
  enableTaskCreation: boolean;
  enablePlanningIntegration: boolean;
  enableMinecraftIntegration: boolean;
  planningEndpoint: string;
  minecraftEndpoint: string;
  mcp?: MCPClient;
  suppressionMs?: number;
}

const DEFAULT_CONFIG: IntrusiveThoughtProcessorConfig = {
  enableActionParsing: true,
  enableTaskCreation: true,
  enablePlanningIntegration: true,
  enableMinecraftIntegration: true,
  planningEndpoint: 'http://localhost:3002',
  minecraftEndpoint: 'http://localhost:3005',
  suppressionMs: 8 * 60_000, // 8 min default
};

/**
 * Enhanced intrusive thought processing with action parsing
 * @author @darianrosebrook
 */
export class IntrusiveThoughtProcessor extends EventEmitter {
  private config: IntrusiveThoughtProcessorConfig;
  private recent: Map<string, number> = new Map(); // key -> lastTs

  constructor(config: Partial<IntrusiveThoughtProcessorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Auto-create MCP client if not provided and planning integration is enabled
    if (!this.config.mcp && this.config.enablePlanningIntegration) {
      this.config.mcp = new PlanningMCPClient(this.config.planningEndpoint);
    }
  }

  /**
   * Canonicalize thought for deduplication
   */
  private canonicalize(thought: string): string {
    return thought.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Check if thought is suppressed due to recent processing
   */
  private suppressed(key: string): boolean {
    const last = this.recent.get(key) ?? 0;
    return Date.now() - last < (this.config.suppressionMs ?? 0);
  }

  /**
   * Process an intrusive thought and convert it to actionable content
   * Enhanced pipeline with MCP integration, grounding, and safety
   */
  async processIntrusiveThought(thought: string): Promise<BotResponse> {
    try {
      const canonical = this.canonicalize(thought);
      this.emit('thoughtProcessingStarted', {
        thought: canonical,
        ts: Date.now(),
      });

      // Quick suppression unless survival triggers override later
      if (this.suppressed(canonical)) {
        return {
          accepted: true,
          response: `Suppressed duplicate thought: "${thought}"`,
          recorded: true,
        };
      }

      // Parse → intent (keep your regex as a fallback)
      // If parsing fails, default to a safe clarification request rather than a vague investigation
      const action = this.parseActionFromThought(canonical) ?? {
        type: 'ask',
        target: 'for clarification on next step',
        priority: 'low',
        category: 'social',
      };

      // Policy gate (deny or patch unsafe)
      const safeAction = this.policyRewrite(action);
      if (!safeAction) {
        return {
          accepted: false,
          response: `Unsafe or disallowed: ${action.type} ${action.target}`,
        };
      }

      // Grounding: world snapshot via MCP (fast, cached)
      const snapshot = this.config.mcp
        ? await this.config.mcp.readResource<any>('world://snapshot')
        : null;

      // Readiness & survival bump
      const adjusted = this.adjustPriorityByGrounding(safeAction, snapshot);

      // Choose plan: existing option? sequence of leaves? propose new option?
      let plan = await this.choosePlan(adjusted, snapshot);

      // Preflight: ensure sequence leaves are available; if not, fall back to a status report
      if (plan.kind === 'sequence') {
        const ok = await this.sequenceLeavesAvailable(
          plan.leaves.map((l) => l.name)
        );
        if (!ok) {
          plan = this.buildStatusReportPlan(snapshot);
        }
      }

      // Bucket selection + idempotency key
      const bucket = await this.selectBucket(plan, snapshot);
      const idem = this.computeIdempotencyKey(canonical, plan, snapshot);

      // Build task (steps derived from plan)
      const task = this.buildTaskFromPlan(
        thought,
        adjusted,
        plan,
        bucket,
        idem
      );

      // Record suppression last
      this.recent.set(canonical, Date.now());

      // Send to planning system (reuse your existing updatePlanningSystem)
      if (this.config.enablePlanningIntegration) {
        await this.updatePlanningSystem(task);
      }

      // Optionally fire-and-forget tiny plans (Tactical bucket) immediately via MCP
      if (plan.kind === 'option' && bucket.name === 'Tactical') {
        try {
          await this.config.mcp?.callTool('run_option', {
            id: plan.id,
            args: plan.args,
          });
        } catch {
          /* ignore: planner will pick it up anyway */
        }
      }

      return {
        accepted: true,
        response: `Created task (${bucket.name}): ${task.title}`,
        taskId: task.id,
        task,
        thought: {
          id: `thought-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: action.category || 'task',
          content: task.description || task.title,
          context: { action, bucket: bucket.name },
          metadata: { taskId: task.id, bucket: bucket.name },
          timestamp: Date.now(),
        },
      };
    } catch (err) {
      this.emit('processingError', { thought, error: err });
      const msg = err instanceof Error ? err.message : String(err);
      return {
        accepted: false,
        response: `Failed to process: "${thought}" — ${msg}`,
        error: msg,
      };
    }
  }

  /**
   * Safety/policy rewrite - deny or patch unsafe actions
   */
  private policyRewrite(a: Action): Action | null {
    const t = a.type.toLowerCase();
    // Deny obvious footguns
    if (t === 'dig' && /straight\s+down/.test(a.target)) return null;
    if (
      t === 'explore' &&
      /lava|nether/.test(a.target) &&
      a.priority !== 'high'
    ) {
      return {
        ...a,
        target: a.target.replace(/lava|nether/, 'nearby safe area'),
        priority: 'medium',
      };
    }
    return a;
  }

  /**
   * Priority adjustment from grounding - survival and environmental factors
   */
  private adjustPriorityByGrounding(a: Action, snap?: any): Action {
    if (!snap) return a;
    const hungerLow = (snap.vitals?.food ?? 20) < 8;
    const healthLow = (snap.vitals?.health ?? 20) < 8;
    if (hungerLow && a.category !== 'survival')
      return {
        ...a,
        priority: 'high',
        category: 'survival',
        type: 'investigate',
        target: 'food inventory and sources',
      };
    if (healthLow && a.category !== 'survival')
      return {
        ...a,
        priority: 'high',
        category: 'survival',
        type: 'investigate',
        target: 'health status',
      };
    // Nighttime: prefer lighting before building/mining
    const isNight = (snap.time ?? 0) > 12000;
    if (isNight && (a.category === 'building' || a.category === 'mining')) {
      return {
        ...a,
        priority: 'high',
        type: 'place',
        target: 'torches along path',
        category: 'building',
      };
    }
    return a;
  }

  /**
   * Plan selection - use MCP options first, otherwise compose leaves, otherwise propose & register
   */
  private async choosePlan(a: Action, snap?: any): Promise<Plan> {
    // 1) Try to map to an active option by simple name heuristics
    const optionsResp = this.config.mcp
      ? await this.config.mcp.callTool<{
          options: Array<{ id: string; name: string; status: string }>;
        }>('list_options', { status: 'active' })
      : { options: [] };
    const match = optionsResp.options.find((o) =>
      this.optionMatches(a, o.name, o.id)
    );
    if (match)
      return {
        kind: 'option',
        id: `${match.id}`,
        args: this.buildArgsForOption(a, snap),
      };

    // 2) Try a sequence of leaves you already expose (move_to, dig_block, chat, etc.)
    const seq = this.sequenceForAction(a, snap);
    if (seq) return { kind: 'sequence', leaves: seq };

    // 3) Propose/register BT via MCP prompts/registry (shadow)
    const spec = await this.proposeBTOption(a, snap);
    if (spec) {
      const reg = await this.config.mcp
        ?.callTool('register_option', spec)
        .catch(() => null);
      if (reg && (reg as any).status === 'success') {
        return {
          kind: 'option',
          id: (reg as any).optionId,
          args: this.buildArgsForOption(a, snap),
        };
      }
      // Fallback: at least return a ticket for later
      return {
        kind: 'proposal',
        ticket: spec.id + '@' + (spec.version ?? '1.0.0'),
        status: 'shadow',
      };
    }

    // Last resort
    return {
      kind: 'sequence',
      leaves: [
        {
          name: 'chat',
          args: { message: `I need help with: ${a.type} ${a.target}` },
        },
      ],
    };
  }

  private optionMatches(a: Action, name: string, id: string): boolean {
    const s = `${name} ${id}`.toLowerCase();
    return (
      s.includes(a.type) ||
      s.includes(a.category) ||
      s.includes(a.target.split(' ')[0])
    );
  }

  /**
   * Verify that all requested leaves are available via MCP tool list
   */
  private async sequenceLeavesAvailable(names: string[]): Promise<boolean> {
    try {
      if (!this.config.mcp) return true; // assume ok if no MCP integration
      const toolNames = await this.config.mcp.listTools();
      const available = new Set(
        (toolNames || []).map((s) => s.split('@')[0].replace('minecraft.', ''))
      );
      return names.every((n) => available.has(n));
    } catch {
      return true; // fail-open to avoid blocking execution
    }
  }

  /**
   * Build a conservative status-report sequence using widely available leaves
   */
  private buildStatusReportPlan(snap?: any): Plan {
    const health = snap?.vitals?.health ?? 'unknown';
    const food = snap?.vitals?.food ?? 'unknown';
    const time = snap?.time ?? 'unknown';
    const msg = `Status — health:${health} food:${food} time:${time}`;
    return {
      kind: 'sequence',
      leaves: [
        { name: 'sense_hostiles' },
        { name: 'get_light_level' },
        { name: 'chat', args: { message: msg } },
      ],
    };
  }

  private buildArgsForOption(a: Action, snap?: any): any {
    // Keep it minimal and schema-safe
    if (a.type === 'gather' && a.target.includes('wood'))
      return { target_amount: 8, species: 'oak' };
    if (a.type === 'investigate' && a.target.includes('inventory')) return {};
    return {};
  }

  private sequenceForAction(
    a: Action,
    snap?: any
  ): Array<{ name: string; args?: any }> | null {
    if (a.type === 'gather' && /wood|logs/.test(a.target)) {
      return [
        {
          name: 'minecraft.move_to',
          args: {
            x: snap?.position?.x ?? 0,
            y: snap?.position?.y ?? 64,
            z: (snap?.position?.z ?? 0) + 5,
          },
        },
        { name: 'chat', args: { message: 'Scanning for trees…' } },
        // This is illustrative; in production you'd use your scan leaves
      ];
    }

    // Social actions
    if (a.category === 'social') {
      return [
        {
          name: 'chat',
          args: {
            message: `Hello! ${a.type === 'ask' ? 'I wanted to ask: ' : ''}${a.target}`,
          },
        },
      ];
    }

    return null;
  }

  private async proposeBTOption(a: Action, snap?: any): Promise<any | null> {
    // Call your MCP prompt to propose a BT-DSL (server side fills it)
    try {
      const leaves = await this.config.mcp?.listTools(); // Names include leaf names
      const args = {
        failure_pattern: `repeated need for ${a.type} ${a.target}`,
        available_leaves: (leaves ?? []).map((s) =>
          s.split('@')[0].replace('minecraft.', '')
        ),
        pre: ['sense_tools', 'sense_inventory'],
        post: ['sense_inventory'],
      };
      // Depending on your MCP host, you might call prompts using a separate API;
      // if prompts aren't invokable here, just return a minimal spec to register.
      return {
        id: `opt.${a.type}_${a.target.replace(/\s+/g, '_')}`,
        version: '1.0.0',
        name: `Auto ${a.type} ${a.target}`,
        description: `Auto-generated from intrusive thought`,
        permissions: [],
        btDefinition: {
          id: `opt.${a.type}`,
          name: `Auto ${a.type}`,
          root: {
            type: 'sequence',
            children: [{ type: 'action', action: 'sense_inventory' }],
          }, // Keep small; registry will lint
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Bucket selection and idempotency
   */
  private async selectBucket(
    plan: Plan,
    snap?: any
  ): Promise<{ name: string; maxMs: number }> {
    const policy = await this.config.mcp
      ?.readResource<any>('policy://buckets')
      .catch(() => null);
    const buckets = policy ?? {
      Tactical: { maxMs: 60_000 },
      Short: { maxMs: 240_000 },
      Standard: { maxMs: 600_000 },
      Long: { maxMs: 1_500_000 },
    };
    // Simple heuristic
    if (plan.kind === 'sequence' && plan.leaves.length <= 2)
      return { name: 'Tactical', maxMs: buckets.Tactical.maxMs };
    if (plan.kind === 'option')
      return { name: 'Short', maxMs: buckets.Short.maxMs };
    return { name: 'Standard', maxMs: buckets.Standard.maxMs };
  }

  private computeIdempotencyKey(
    canonicalThought: string,
    plan: Plan,
    snap?: any
  ): string {
    const snapSig = snap
      ? `${Math.round(snap.position?.x ?? 0)}:${Math.round(snap.position?.y ?? 0)}:${Math.round(snap.position?.z ?? 0)}:${snap.time ?? 0}`
      : 'nosnap';
    const planSig =
      plan.kind === 'option'
        ? plan.id
        : plan.kind === 'sequence'
          ? plan.leaves.map((l) => l.name).join('+')
          : plan.ticket;
    return `ith:${canonicalThought}:${planSig}:${snapSig}`;
  }

  /**
   * Build task from plan (steps are executable)
   */
  private buildTaskFromPlan(
    thought: string,
    action: Action,
    plan: Plan,
    bucket: { name: string; maxMs: number },
    idem: string
  ): Task {
    const steps: TaskStep[] = [];
    let title = '';
    if (plan.kind === 'option') {
      title = `${this.generateTaskTitle(action)} (via ${plan.id})`;
      steps.push({
        id: `s1`,
        label: `Run option ${plan.id}`,
        done: false,
        order: 1,
      });
    } else if (plan.kind === 'sequence') {
      title = `${this.generateTaskTitle(action)} (seq)`;
      plan.leaves.forEach((l, i) =>
        steps.push({
          id: `s${i + 1}`,
          label: `Leaf: ${l.name}`,
          done: false,
          order: i + 1,
        })
      );
    } else {
      title = `${this.generateTaskTitle(action)} (proposal queued)`;
      steps.push({
        id: `s1`,
        label: `Await shadow option ${plan.ticket}`,
        done: false,
        order: 1,
      });
    }

    return {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description: `From thought "${thought.replace(/\s*\[GOAL:[^\]]*\](?:\s*\d+\w*)?/gi, '').trim()}" — bucket ${bucket.name}, cap ${bucket.maxMs}ms.`,
      type: action.category,
      priority: action.priority,
      source: 'intrusive-thought',
      progress: 0,
      status: 'active',
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        originalThought: thought,
        action,
        confidence: 0.7,
        idempotencyKey: idem,
        bucket: bucket.name,
      },
    };
  }

  /**
   * Parse actionable content from a thought
   */
  private parseActionFromThought(thought: string): Action | null {
    // First check for clear action patterns
    const actionPatterns = {
      craft: {
        pattern: /craft\s+(.+)/i,
        priority: 'high' as const,
        category: 'crafting',
      },
      mine: {
        pattern: /mine\s+(.+)/i,
        priority: 'medium' as const,
        category: 'mining',
      },
      explore: {
        pattern: /explore\s+(.+)/i,
        priority: 'medium' as const,
        category: 'exploration',
      },
      build: {
        pattern: /build\s+(.+)/i,
        priority: 'high' as const,
        category: 'building',
      },
      gather: {
        pattern: /gather\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      find: {
        pattern: /find\s+(.+)/i,
        priority: 'medium' as const,
        category: 'search',
      },
      go: {
        pattern: /go\s+(.+)/i,
        priority: 'medium' as const,
        category: 'movement',
      },
      move: {
        pattern: /move\s+(.+)/i,
        priority: 'medium' as const,
        category: 'movement',
      },
      collect: {
        pattern: /collect\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      search: {
        pattern: /search\s+(.+)/i,
        priority: 'medium' as const,
        category: 'search',
      },
      create: {
        pattern: /create\s+(.+)/i,
        priority: 'high' as const,
        category: 'crafting',
      },
      make: {
        pattern: /make\s+(.+)/i,
        priority: 'high' as const,
        category: 'crafting',
      },
      dig: {
        pattern: /dig\s+(.+)/i,
        priority: 'medium' as const,
        category: 'mining',
      },
      farm: {
        pattern: /farm\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      chop: {
        pattern: /chop\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      cut: {
        pattern: /cut\s+(.+)/i,
        priority: 'medium' as const,
        category: 'gathering',
      },
      place: {
        pattern: /place\s+(.+)/i,
        priority: 'medium' as const,
        category: 'building',
      },
      put: {
        pattern: /put\s+(.+)/i,
        priority: 'medium' as const,
        category: 'building',
      },
      ask: {
        pattern: /ask\s+(.+)/i,
        priority: 'medium' as const,
        category: 'social',
      },
      talk: {
        pattern: /talk\s+(.+)/i,
        priority: 'medium' as const,
        category: 'social',
      },
      chat: {
        pattern: /chat\s+(.+)/i,
        priority: 'medium' as const,
        category: 'social',
      },
      interact: {
        pattern: /interact\s+(.+)/i,
        priority: 'medium' as const,
        category: 'social',
      },
      help: {
        pattern: /help\s+(.+)/i,
        priority: 'high' as const,
        category: 'social',
      },
      shouldAsk: {
        pattern: /should\s+ask\s+(.+)/i,
        priority: 'medium' as const,
        category: 'social',
      },
      needToAsk: {
        pattern: /need\s+to\s+ask\s+(.+)/i,
        priority: 'medium' as const,
        category: 'social',
      },
      playerInteraction: {
        pattern: /player.*(ask|talk|chat|interact)/i,
        priority: 'medium' as const,
        category: 'social',
      },
    };

    for (const [actionType, config] of Object.entries(actionPatterns)) {
      const match = thought.match(config.pattern);
      if (match) {
        return {
          type: actionType,
          target: match[1].trim(),
          priority: config.priority,
          category: config.category,
        };
      }
    }

    // If no clear action pattern found, check if it's a question that needs investigation
    const questionAction = this.parseQuestionAsAction(thought);
    if (questionAction) {
      return questionAction;
    }

    return null;
  }

  /**
   * Parse questions and convert them to investigative actions
   */
  private parseQuestionAsAction(thought: string): Action | null {
    const lowerThought = thought.toLowerCase();

    // Food-related questions
    if (
      lowerThought.includes('food') ||
      lowerThought.includes('hunger') ||
      lowerThought.includes('eat')
    ) {
      if (
        lowerThought.includes('have') ||
        lowerThought.includes('got') ||
        lowerThought.includes('any')
      ) {
        return {
          type: 'investigate',
          target: 'food inventory and sources',
          priority: 'high',
          category: 'survival',
        };
      }
    }

    // Health-related questions
    if (
      lowerThought.includes('health') ||
      lowerThought.includes('hurt') ||
      lowerThought.includes('damage')
    ) {
      return {
        type: 'investigate',
        target: 'health status',
        priority: 'high',
        category: 'survival',
      };
    }

    // Inventory-related questions
    if (
      lowerThought.includes('inventory') ||
      lowerThought.includes('items') ||
      lowerThought.includes('stuff')
    ) {
      return {
        type: 'investigate',
        target: 'inventory contents',
        priority: 'medium',
        category: 'inventory',
      };
    }

    // Location/environment questions
    if (
      lowerThought.includes('where') ||
      lowerThought.includes('location') ||
      lowerThought.includes('area')
    ) {
      return {
        type: 'investigate',
        target: 'current location and surroundings',
        priority: 'medium',
        category: 'exploration',
      };
    }

    // Resource questions
    if (
      lowerThought.includes('wood') ||
      lowerThought.includes('stone') ||
      lowerThought.includes('iron') ||
      lowerThought.includes('coal')
    ) {
      return {
        type: 'investigate',
        target: 'resource availability',
        priority: 'medium',
        category: 'gathering',
      };
    }

    // Player interaction questions
    if (
      lowerThought.includes('player') &&
      (lowerThought.includes('ask') || lowerThought.includes('should'))
    ) {
      return {
        type: 'ask',
        target: 'player for resources or assistance',
        priority: 'medium',
        category: 'social',
      };
    }

    // General questions — prefer asking for clarification rather than vague investigate
    if (
      lowerThought.includes('?') &&
      (lowerThought.includes('do i') ||
        lowerThought.includes('have i') ||
        lowerThought.includes('am i'))
    ) {
      return {
        type: 'ask',
        target: 'for clarification on next step',
        priority: 'low',
        category: 'social',
      };
    }

    return null;
  }

  /**
   * Create a task from an intrusive thought and action
   */
  private async createTaskFromThought(
    thought: string,
    action: Action
  ): Promise<Task> {
    const taskTitle = this.generateTaskTitle(action);
    const taskDescription = this.generateTaskDescription(action, thought);

    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskTitle,
      description: taskDescription,
      type: action.category,
      priority: action.priority,
      source: 'intrusive-thought',
      progress: 0,
      status: 'active',
      steps: this.generateTaskSteps(action),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        originalThought: thought,
        action: action,
        confidence: 0.7,
      },
    };

    return task;
  }

  /**
   * Generate a task title from an action
   */
  private generateTaskTitle(action: Action): string {
    const titles: Record<string, string> = {
      craft: `Craft ${action.target}`,
      mine: `Mine ${action.target}`,
      explore: `Explore ${action.target}`,
      build: `Build ${action.target}`,
      gather: `Gather ${action.target}`,
      find: `Find ${action.target}`,
      go: `Go to ${action.target}`,
      move: `Move ${action.target}`,
      collect: `Collect ${action.target}`,
      search: `Search for ${action.target}`,
      create: `Create ${action.target}`,
      make: `Make ${action.target}`,
      dig: `Dig ${action.target}`,
      chop: `Chop ${action.target}`,
      cut: `Cut ${action.target}`,
      place: `Place ${action.target}`,
      put: `Put ${action.target}`,
      investigate: `Investigate ${action.target}`,
      ask: `Ask ${action.target}`,
      talk: `Talk to ${action.target}`,
      chat: `Chat with ${action.target}`,
      interact: `Interact with ${action.target}`,
      help: `Help ${action.target}`,
      shouldAsk: `Ask ${action.target}`,
      needToAsk: `Ask ${action.target}`,
      playerInteraction: `Interact with ${action.target}`,
    };

    return titles[action.type] || `Perform ${action.type} on ${action.target}`;
  }

  /**
   * Generate a task description from an action and original thought
   */
  private generateTaskDescription(
    action: Action,
    originalThought: string
  ): string {
    const cleanThought = originalThought.replace(/\s*\[GOAL:[^\]]*\](?:\s*\d+\w*)?/gi, '').trim();
    return `Task created from intrusive thought: "${cleanThought}". ${action.type} ${action.target}.`;
  }

  /**
   * Generate task steps for an action
   */
  private generateTaskSteps(action: Action): TaskStep[] {
    // Special handling for investigate actions
    if (action.type === 'investigate') {
      return this.generateInvestigationSteps(action);
    }

    // Special handling for social actions
    if (action.category === 'social') {
      return this.generateSocialSteps(action);
    }

    const baseSteps = [
      {
        id: `step-${Date.now()}-1`,
        label: `Prepare for ${action.type}`,
        done: false,
        order: 1,
      },
      {
        id: `step-${Date.now()}-2`,
        label: `Locate ${action.target}`,
        done: false,
        order: 2,
      },
      {
        id: `step-${Date.now()}-3`,
        label: `Perform ${action.type} on ${action.target}`,
        done: false,
        order: 3,
      },
      {
        id: `step-${Date.now()}-4`,
        label: `Complete ${action.type} task`,
        done: false,
        order: 4,
      },
    ];

    return baseSteps;
  }

  /**
   * Generate specific steps for investigation tasks
   */
  private generateInvestigationSteps(action: Action): TaskStep[] {
    const lowerTarget = action.target.toLowerCase();

    // Food investigation
    if (lowerTarget.includes('food')) {
      return [
        {
          id: `step-${Date.now()}-1`,
          label: 'Check inventory for food items',
          done: false,
          order: 1,
        },
        {
          id: `step-${Date.now()}-2`,
          label: 'Scan surroundings for food sources',
          done: false,
          order: 2,
        },
        {
          id: `step-${Date.now()}-3`,
          label: 'Identify nearest food gathering opportunities',
          done: false,
          order: 3,
        },
        {
          id: `step-${Date.now()}-4`,
          label: 'Report food availability status',
          done: false,
          order: 4,
        },
      ];
    }

    // Health investigation
    if (lowerTarget.includes('health')) {
      return [
        {
          id: `step-${Date.now()}-1`,
          label: 'Check current health status',
          done: false,
          order: 1,
        },
        {
          id: `step-${Date.now()}-2`,
          label: 'Assess any damage or injuries',
          done: false,
          order: 2,
        },
        {
          id: `step-${Date.now()}-3`,
          label: 'Evaluate need for healing',
          done: false,
          order: 3,
        },
        {
          id: `step-${Date.now()}-4`,
          label: 'Report health status',
          done: false,
          order: 4,
        },
      ];
    }

    // Inventory investigation
    if (lowerTarget.includes('inventory')) {
      return [
        {
          id: `step-${Date.now()}-1`,
          label: 'Open inventory interface',
          done: false,
          order: 1,
        },
        {
          id: `step-${Date.now()}-2`,
          label: 'Count and categorize items',
          done: false,
          order: 2,
        },
        {
          id: `step-${Date.now()}-3`,
          label: 'Identify useful resources',
          done: false,
          order: 3,
        },
        {
          id: `step-${Date.now()}-4`,
          label: 'Report inventory contents',
          done: false,
          order: 4,
        },
      ];
    }

    // Location investigation
    if (
      lowerTarget.includes('location') ||
      lowerTarget.includes('surroundings')
    ) {
      return [
        {
          id: `step-${Date.now()}-1`,
          label: 'Determine current coordinates',
          done: false,
          order: 1,
        },
        {
          id: `step-${Date.now()}-2`,
          label: 'Scan immediate surroundings',
          done: false,
          order: 2,
        },
        {
          id: `step-${Date.now()}-3`,
          label: 'Identify nearby resources and threats',
          done: false,
          order: 3,
        },
        {
          id: `step-${Date.now()}-4`,
          label: 'Report location assessment',
          done: false,
          order: 4,
        },
      ];
    }

    // Resource investigation
    if (lowerTarget.includes('resource')) {
      return [
        {
          id: `step-${Date.now()}-1`,
          label: 'Scan area for available resources',
          done: false,
          order: 1,
        },
        {
          id: `step-${Date.now()}-2`,
          label: 'Identify resource types and quantities',
          done: false,
          order: 2,
        },
        {
          id: `step-${Date.now()}-3`,
          label: 'Assess resource accessibility',
          done: false,
          order: 3,
        },
        {
          id: `step-${Date.now()}-4`,
          label: 'Report resource availability',
          done: false,
          order: 4,
        },
      ];
    }

    // General investigation
    return [
      {
        id: `step-${Date.now()}-1`,
        label: 'Prepare for investigation',
        done: false,
        order: 1,
      },
      {
        id: `step-${Date.now()}-2`,
        label: `Investigate ${action.target}`,
        done: false,
        order: 2,
      },
      {
        id: `step-${Date.now()}-3`,
        label: 'Analyze findings',
        done: false,
        order: 3,
      },
      {
        id: `step-${Date.now()}-4`,
        label: 'Report investigation results',
        done: false,
        order: 4,
      },
    ];
  }

  /**
   * Generate specific steps for social interaction tasks
   */
  private generateSocialSteps(action: Action): TaskStep[] {
    const lowerTarget = action.target.toLowerCase();

    // Player interaction steps
    if (lowerTarget.includes('player')) {
      return [
        {
          id: `step-${Date.now()}-1`,
          label: 'Locate nearby player',
          done: false,
          order: 1,
        },
        {
          id: `step-${Date.now()}-2`,
          label: 'Approach player safely',
          done: false,
          order: 2,
        },
        {
          id: `step-${Date.now()}-3`,
          label: `Initiate conversation: ${action.type} ${action.target}`,
          done: false,
          order: 3,
        },
        {
          id: `step-${Date.now()}-4`,
          label: 'Wait for player response',
          done: false,
          order: 4,
        },
      ];
    }

    // General social interaction steps
    return [
      {
        id: `step-${Date.now()}-1`,
        label: 'Prepare for social interaction',
        done: false,
        order: 1,
      },
      {
        id: `step-${Date.now()}-2`,
        label: `Locate target for ${action.type}`,
        done: false,
        order: 2,
      },
      {
        id: `step-${Date.now()}-3`,
        label: `Perform ${action.type} action`,
        done: false,
        order: 3,
      },
      {
        id: `step-${Date.now()}-4`,
        label: 'Complete social interaction',
        done: false,
        order: 4,
      },
    ];
  }

  /**
   * Update the planning system with a new task
   */
  private async updatePlanningSystem(task: Task): Promise<void> {
    try {
      const response = await fetch(`${this.config.planningEndpoint}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          type: task.type,
          priority: task.priority,
          source: task.source,
          steps: task.steps,
          metadata: task.metadata,
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Planning system responded with ${response.status}`);
      }

      const result = await response.json();
      console.log(`Task created in planning system:`, result);

      this.emit('planningSystemUpdated', { task, result });
    } catch (error) {
      console.error('Failed to update planning system:', error);
      this.emit('planningSystemError', { task, error });
      throw error;
    }
  }

  /**
   * Execute a direct action on the Minecraft bot
   */
  async executeDirectAction(action: Action): Promise<BotResponse> {
    try {
      const response = await fetch(`${this.config.minecraftEndpoint}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: action.type,
          parameters: {
            target: action.target,
            priority: action.priority,
          },
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Minecraft bot responded with ${response.status}`);
      }

      const result = await response.json();
      console.log(`Direct action executed:`, result);

      this.emit('directActionExecuted', { action, result });

      return {
        accepted: true,
        response: `Direct action executed: ${action.type} ${action.target}`,
        taskId: (result as any).taskId,
      };
    } catch (error) {
      console.error('Failed to execute direct action:', error);
      this.emit('directActionError', { action, error });

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        accepted: false,
        response: `Failed to execute action: ${action.type} ${action.target}. Error: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<IntrusiveThoughtProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): IntrusiveThoughtProcessorConfig {
    return { ...this.config };
  }
}
