/**
 * Conscious Bot MCP Server
 *
 * Full MCP implementation with schema validation, permission enforcement,
 * and proper integration with our existing leaf factory and registry.
 *
 * @author @darianrosebrook
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  // Tool,
  // Resource,
  // Prompt,
} from '@modelcontextprotocol/sdk/types.js';
import Ajv, { ValidateFunction } from 'ajv';

// Import our existing components
import {
  LeafFactory,
  createLeafContext,
} from '@conscious-bot/executor-contracts';

// MCP-like interface definitions
interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  metadata: {
    version: string;
    timeoutMs?: number;
    retries?: number;
    permissions: string[];
  };
}

interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  metadata: any;
}

interface MCPPromptDefinition {
  name: string;
  description: string;
  arguments: any;
  messages: Array<{
    role: string;
    content: string;
  }>;
}

// Dependencies interface
export interface MCPServerDependencies {
  leafFactory: LeafFactory;
  registry?: any; // EnhancedRegistry - will be properly typed when available
  bot?: any; // Bot instance - will be properly typed when available
  policyBuckets?: Record<string, any>;
}

class ConsciousBotMCPServer extends Server {
  private leafFactory: LeafFactory;
  private tools = new Map<string, MCPToolDefinition>();
  private resources = new Map<string, MCPResourceDefinition>();
  private prompts = new Map<string, MCPPromptDefinition>();

  // NEW: validators for input/output schemas
  private ajv = new Ajv({
    allErrors: true,
    useDefaults: true,
    coerceTypes: true,
  });
  private validators = new Map<
    string,
    { in: ValidateFunction; out?: ValidateFunction }
  >();

  constructor(private deps: MCPServerDependencies) {
    super({
      name: 'conscious-bot-mcp',
      version: '0.2.0',
    });

    this.leafFactory = deps.leafFactory;
    this.setupHandlers();
    this.hydrateToolsFromLeafFactory();
    this.loadDefaultData(deps.policyBuckets);
  }

  private setupHandlers() {
    // Tools endpoints
    this.setRequestHandler(ListToolsRequestSchema, async () => {
      const toolsList = Array.from(this.tools.values());
      return { tools: toolsList };
    });

    this.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await this.executeTool(name, args);

      return {
        content: [
          {
            type: 'json',
            json: result,
          },
        ],
      };
    });

    // Resources endpoints
    this.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resourcesList = Array.from(this.resources.values());
      return { resources: resourcesList };
    });

    this.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      const resource = this.resources.get(uri);

      if (!resource) {
        throw new Error(`Resource not found: ${uri}`);
      }

      // Handle dynamic resources
      if (uri === 'world://snapshot') {
        const snap = await this.createWorldSnapshot();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(snap),
            },
          ],
        };
      }

      if (uri === 'policy://buckets') {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(resource.metadata),
            },
          ],
        };
      }

      // For BT options, return the BT definition
      if (uri.startsWith('mcp+bt://options/')) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(resource.metadata.btDefinition),
            },
          ],
        };
      }

      // Default: return metadata
      return {
        contents: [
          {
            uri,
            mimeType: resource.mimeType,
            text: JSON.stringify(resource.metadata),
          },
        ],
      };
    });

    // Prompts endpoints
    this.setRequestHandler(ListPromptsRequestSchema, async () => {
      const promptsList = Array.from(this.prompts.values());
      return { prompts: promptsList };
    });

    this.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;
      const prompt = this.prompts.get(name);

      if (!prompt) {
        throw new Error(`Prompt not found: ${name}`);
      }

      return { prompt };
    });
  }

  // PATCH 1: Hydrate tools from LeafFactory, not demo stubs
  private hydrateToolsFromLeafFactory() {
    if (
      !this.leafFactory ||
      typeof (this.leafFactory as any).listLeaves !== 'function'
    ) {
      console.warn(
        '[MCP] LeafFactory.listLeaves() not available; minecraft.* tools will be unavailable.'
      );
      return;
    }

    // Reset existing minecraft tools while keeping registry utilities intact
    for (const key of Array.from(this.tools.keys())) {
      if (this.isMinecraftToolKey(key)) {
        this.tools.delete(key);
      }
    }
    this.validators.clear();

    let leaves: Array<{ name: string; version: string; spec: any }> = [];
    try {
      leaves = this.leafFactory.listLeaves();
    } catch (error) {
      console.error('[MCP] Failed to list leaves from factory:', error);
      return;
    }

    for (const leaf of leaves) {
      const spec = leaf?.spec ?? {};
      const leafName = spec.name ?? leaf?.name;
      const leafVersion = spec.version ?? leaf?.version ?? '1.0.0';
      if (!leafName) {
        console.warn('[MCP] Skipping leaf without name', leaf);
        continue;
      }

      const toolKey = `minecraft.${leafName}@${leafVersion}`;
      const inputSchema = this.normalizeSchema(
        spec.inputSchema ?? { type: 'object', additionalProperties: true },
        { type: 'object', additionalProperties: true }
      );
      const outputSchema = this.normalizeSchema(spec.outputSchema, {
        type: 'null',
      });

      const def: MCPToolDefinition = {
        name: toolKey,
        description: spec.description ?? leafName,
        inputSchema,
        outputSchema,
        metadata: {
          version: leafVersion,
          timeoutMs: spec.timeoutMs,
          retries: spec.retries,
          permissions: Array.isArray(spec.permissions) ? spec.permissions : [],
        },
      };

      const validatorIn = this.compileSchema(inputSchema, toolKey, 'input');
      if (!validatorIn) {
        console.warn(
          `[MCP] Skipping tool ${toolKey}: input schema compilation failed`
        );
        continue;
      }
      const validatorOut = outputSchema
        ? this.compileSchema(outputSchema, toolKey, 'output')
        : undefined;

      this.tools.set(toolKey, def);
      this.validators.set(toolKey, { in: validatorIn, out: validatorOut });
    }
  }

  private isMinecraftToolKey(key: string): boolean {
    return key.startsWith('minecraft.');
  }

  private normalizeSchema(schema: any, fallback: any) {
    if (!schema) return fallback;

    // Accept already usable JSON schema objects
    if (typeof schema === 'object' && !('safeParse' in schema)) {
      return schema;
    }

    // Handle Zod schemas by deferring to provided toJSON if available
    if (schema && typeof schema === 'object') {
      if (typeof schema.toJSON === 'function') {
        try {
          return schema.toJSON();
        } catch (error) {
          console.warn('[MCP] Failed to convert schema via toJSON', error);
        }
      }
    }

    return fallback;
  }

  private compileSchema(
    schema: any,
    toolKey: string,
    type: 'input' | 'output'
  ): ValidateFunction | undefined {
    try {
      return this.ajv.compile(schema);
    } catch (error) {
      console.error(
        `[MCP] ${type} schema compilation failed for ${toolKey}:`,
        error
      );
      return undefined;
    }
  }

  private loadDefaultData(policyBuckets?: Record<string, any>) {
    // Load world/policy resources
    this.resources.set('world://snapshot', {
      uri: 'world://snapshot',
      name: 'World Snapshot',
      description: 'Position, time, light, hostiles, inventory summary',
      mimeType: 'application/json',
      metadata: {
        version: '1.0.0',
        permissions: ['sense'],
      }, // filled at read-time
    });

    this.resources.set('policy://buckets', {
      uri: 'policy://buckets',
      name: 'Time Bucket Policy',
      description: 'Bucket caps and checkpoint cadence',
      mimeType: 'application/json',
      metadata: policyBuckets || {
        Tactical: {
          maxMs: 60_000,
          checkpointEveryMs: 15_000,
          trailer: 'opt.retreat_and_block',
        },
        Short: {
          maxMs: 240_000,
          checkpointEveryMs: 60_000,
          trailer: 'opt.retreat_and_block',
        },
        Standard: {
          maxMs: 600_000,
          checkpointEveryMs: 60_000,
          trailer: 'opt.retreat_and_block',
        },
        Long: {
          maxMs: 1_500_000,
          checkpointEveryMs: 90_000,
          trailer: 'opt.retreat_and_block',
        },
        Expedition: {
          maxMs: 3_000_000,
          checkpointEveryMs: 120_000,
          trailer: 'opt.camp_and_cache',
        },
      },
    });

    // Load default BT options
    this.resources.set('mcp+bt://options/opt.chop_tree_safe@1.0.0', {
      uri: 'mcp+bt://options/opt.chop_tree_safe@1.0.0',
      name: 'Safe Tree Chopping (1.0.0)',
      description: 'Gather N logs from target species with safety checks',
      mimeType: 'application/json',
      metadata: {
        id: 'opt.chop_tree_safe',
        version: '1.0.0',
        status: 'active',
        permissions: ['movement', 'dig', 'sense'],
        shadow: {
          success_threshold: 0.8,
          failure_threshold: 0.3,
          max_shadow_runs: 10,
        },
        provenance: {
          authored_by: 'llm',
          created_at: new Date().toISOString(),
        },
        btDefinition: {
          id: 'opt.chop_tree_safe',
          name: 'Safe Tree Chopping',
          description: 'Gather N logs from target species with safety checks',
          root: {
            type: 'sequence',
            children: [
              {
                type: 'action',
                name: 'check_tools',
                action: 'sense_tools',
                args: { required: ['axe'], light_threshold: 7 },
              },
              {
                type: 'selector',
                name: 'find_tree',
                children: [
                  {
                    type: 'action',
                    name: 'find_nearby_tree',
                    action: 'scan_for_trees',
                    args: { radius: 50, species: 'target_species' },
                  },
                  {
                    type: 'action',
                    name: 'pathfind_to_tree',
                    action: 'pathfind',
                    args: { target: 'nearest_tree', avoid_water: true },
                  },
                ],
              },
              {
                type: 'sequence',
                name: 'chop_tree',
                children: [
                  {
                    type: 'action',
                    name: 'scan_canopy',
                    action: 'scan_tree_structure',
                    args: { method: 'top_down' },
                  },
                  {
                    type: 'action',
                    name: 'chop_logs',
                    action: 'dig_blocks',
                    args: { pattern: 'tree_logs_top_down', tool: 'axe' },
                  },
                  {
                    type: 'action',
                    name: 'collect_drops',
                    action: 'collect_items',
                    args: { radius: 10 },
                  },
                ],
              },
              {
                type: 'action',
                name: 'verify_logs',
                action: 'sense_inventory',
                args: { item: 'logs', min_count: 'target_amount' },
              },
            ],
          },
          metadata: {
            timeout: 45000,
            retries: 2,
            priority: 'medium',
            interruptible: true,
          },
        },
      },
    });

    // Load prompts
    this.prompts.set('propose_option', {
      name: 'propose_option',
      description:
        'Propose a new option (BT-DSL) when encountering a repeated failure pattern',
      arguments: {
        type: 'object',
        required: ['failure_pattern', 'available_leaves', 'pre', 'post'],
        properties: {
          failure_pattern: { type: 'string' },
          available_leaves: {
            type: 'array',
            items: { type: 'string' },
          },
          pre: {
            type: 'array',
            items: { type: 'string' },
          },
          post: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You produce valid BT-DSL JSON using only allowed leaves. Supported node types: sequence, selector, action. No condition nodes - use sensor leaves + decorators. No code.',
        },
        {
          role: 'user',
          content:
            'Failure: {{failure_pattern}}\nLeaves: {{available_leaves}}\nPre: {{pre}}\nPost: {{post}}',
        },
      ],
    });

    this.prompts.set('plan_goal', {
      name: 'plan_goal',
      description: 'Create a hierarchical plan to achieve a specific goal',
      arguments: {
        type: 'object',
        required: ['goal', 'available_options'],
        properties: {
          goal: { type: 'string' },
          available_options: {
            type: 'array',
            items: { type: 'string' },
          },
          constraints: {
            type: 'array',
            items: { type: 'string' },
          },
          world_state: {
            type: 'object',
            description: 'Current world state',
          },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You are a hierarchical task network (HTN) planner. Create a plan that decomposes the goal into subgoals and selects appropriate options.',
        },
        {
          role: 'user',
          content:
            'Goal: {{goal}}\nAvailable Options: {{available_options}}\nConstraints: {{constraints}}\nWorld State: {{world_state}}',
        },
      ],
    });

    // Add registry tools
    this.tools.set('register_option', {
      name: 'register_option',
      description: 'Register a new Behavior Tree option',
      inputSchema: {
        type: 'object',
        required: ['id', 'name', 'description', 'btDefinition'],
        properties: {
          id: { type: 'string', description: 'Unique option identifier' },
          version: { type: 'string', default: '1.0.0' },
          name: { type: 'string', description: 'Human-readable name' },
          description: { type: 'string', description: 'Option description' },
          btDefinition: {
            type: 'object',
            description: 'Behavior Tree DSL definition',
          },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required permissions',
          },
        },
      },
      outputSchema: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { enum: ['success', 'failure'] },
          optionId: { type: 'string' },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              detail: { type: 'string' },
            },
          },
        },
      },
      metadata: {
        version: '1.0.0',
        permissions: ['registry.write'],
      },
    });

    this.tools.set('promote_option', {
      name: 'promote_option',
      description: 'Promote an option from shadow to active status',
      inputSchema: {
        type: 'object',
        required: ['optionId'],
        properties: {
          optionId: {
            type: 'string',
            description: 'Option to promote (id@version)',
          },
        },
      },
      outputSchema: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { enum: ['success', 'failure'] },
          optionId: { type: 'string' },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              detail: { type: 'string' },
            },
          },
        },
      },
      metadata: {
        version: '1.0.0',
        permissions: ['registry.admin'],
      },
    });

    this.tools.set('list_options', {
      name: 'list_options',
      description: 'List all available options with their status',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['shadow', 'active', 'retired', 'all'],
            default: 'all',
          },
        },
      },
      outputSchema: {
        type: 'object',
        required: ['options'],
        properties: {
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                status: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
      metadata: {
        version: '1.0.0',
        permissions: ['registry.read'],
      },
    });

    // PATCH 5a: Add run_option tool
    this.tools.set('run_option', {
      name: 'run_option',
      description: 'Execute a registered BT option by id@version',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          args: { type: 'object' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          status: { enum: ['success', 'failure', 'running'] },
          metrics: { type: 'object' },
        },
      },
      metadata: { version: '1.0.0', permissions: ['registry.read'] },
    });
  }

  /**
   * Get the list of available tools
   */
  getTools(): Array<{
    name: string;
    description: string;
    inputSchema: any;
    outputSchema: any;
    metadata: any;
  }> {
    return Array.from(this.tools.values());
  }

  /**
   * Get the list of available resources
   */
  getResources(): Array<{
    uri: string;
    name: string;
    description: string;
    mimeType: string;
    metadata: any;
  }> {
    return Array.from(this.resources.values());
  }

  /**
   * Get the list of available prompts
   */
  getPrompts(): Array<{ name: string; description: string; arguments: any }> {
    return Array.from(this.prompts.values());
  }

  /**
   * Read a specific resource
   */
  async readResource(uri: string): Promise<any> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    // Handle dynamic resources
    if (uri === 'world://snapshot') {
      return await this.createWorldSnapshot();
    }

    if (uri === 'policy://buckets') {
      return resource.metadata;
    }

    // For BT options, return the BT definition
    if (uri.startsWith('mcp+bt://options/')) {
      return resource.metadata.btDefinition;
    }

    // Default: return metadata
    return resource.metadata;
  }

  // Best‑effort arg normalizer for common leaves to reduce schema friction
  private normalizeArgsForLeaf(leafName: string, args: any): any {
    try {
      if (args == null) return args;
      const a = typeof args === 'object' ? { ...args } : args;

      // chat: allow a plain string or { text }
      if (leafName === 'chat') {
        if (typeof a === 'string') return { message: a };
        if (a && typeof a === 'object') {
          if (a.message == null && typeof a.text === 'string')
            a.message = a.text;
          return a;
        }
        return { message: String(a) };
      }

      // move_to: allow top‑level x,y,z or { position }
      if (leafName === 'move_to') {
        if (Array.isArray(a) && a.length >= 3) {
          return { pos: { x: Number(a[0]), y: Number(a[1]), z: Number(a[2]) } };
        }
        if (a && typeof a === 'object') {
          const hasTopXYZ = ['x', 'y', 'z'].every(
            (k) => typeof a[k] === 'number'
          );
          if (hasTopXYZ) {
            const { x, y, z, ...rest } = a;
            return { pos: { x, y, z }, ...rest };
          }
          if (a.position && typeof a.position === 'object') {
            const { x, y, z } = a.position;
            const rest = { ...a };
            delete (rest as any).position;
            return {
              pos: { x: Number(x), y: Number(y), z: Number(z) },
              ...rest,
            };
          }
        }
        return a;
      }

      // get_light_level: allow top‑level x,y,z
      if (leafName === 'get_light_level') {
        if (a && typeof a === 'object') {
          const hasTopXYZ = ['x', 'y', 'z'].every(
            (k) => typeof a[k] === 'number'
          );
          if (hasTopXYZ) {
            const { x, y, z, ...rest } = a;
            return { position: { x, y, z }, ...rest };
          }
        }
        return a;
      }

      // wait: allow seconds instead of ms, or a number directly
      if (leafName === 'wait') {
        if (typeof a === 'number') return { ms: a };
        if (a && typeof a === 'object') {
          if (typeof a.seconds === 'number' && a.ms == null) {
            a.ms = Math.round(a.seconds * 1000);
            delete (a as any).seconds;
          }
        }
        return a;
      }

      return a;
    } catch {
      return args;
    }
  }

  private async executeTool(name: string, args: any): Promise<any> {
    // Handle registry tools
    if (name === 'register_option') {
      return this.handleRegisterOption(args);
    }

    if (name === 'promote_option') {
      return this.handlePromoteOption(args);
    }

    if (name === 'list_options') {
      return this.handleListOptions(args);
    }

    // PATCH 5b: Handle run_option tool
    if (name === 'run_option') {
      const id = args?.id;
      if (!this.deps.registry?.getBTParser) {
        throw Object.assign(new Error('registry.unavailable'), {
          data: { detail: 'EnhancedRegistry not provided' },
        });
      }
      const parser = this.deps.registry.getBTParser();
      const compiled =
        (this.deps.registry as any).ensureCompiled?.(id) ??
        (() => {
          throw new Error(`option.not_compiled: ${id}`);
        })();
      const ctx = this.deps.bot ? createLeafContext(this.deps.bot) : undefined;
      if (!ctx) {
        throw Object.assign(new Error('bot.unavailable'), {
          data: { detail: 'Bot context not available' },
        });
      }
      const result = await parser.execute(
        compiled,
        this.leafFactory,
        ctx,
        undefined
      );
      if (result.status !== 'success') {
        throw Object.assign(new Error('option.failed'), {
          data: result.error ?? { code: 'unknown' },
        });
      }
      return { status: 'success', metrics: result.metrics ?? {} };
    }

    // Handle Minecraft tools
    const m = name.match(/^minecraft\.([^@]+)(?:@(.+))?$/);
    if (!m) {
      throw Object.assign(new Error('tool.not_found'), {
        data: { detail: `Unknown tool: ${name}` },
      });
    }

    const [, leafName, version] = m;
    const key = version
      ? `minecraft.${leafName}@${version}`
      : this.resolveLatestKey(`minecraft.${leafName}`);
    if (!key) {
      throw Object.assign(new Error('tool.not_found'), {
        data: { detail: `Tool not found: ${name}` },
      });
    }

    const def: MCPToolDefinition | undefined = this.tools?.get(key);
    if (!def) {
      throw Object.assign(new Error('tool.not_found'), {
        data: { detail: `Tool not found: ${name}` },
      });
    }

    // Check permissions
    if (!this.isAllowedTool(def, args?.goal)) {
      throw Object.assign(new Error('permission.denied'), {
        data: { detail: 'policy_restriction' },
      });
    }

    // Normalize inputs for common leaves before validation
    const normArgs = this.normalizeArgsForLeaf(leafName, args);

    // Validate input
    const val = this.validators.get(key);
    if (!val) {
      throw Object.assign(new Error('validation.missing'), {
        data: { detail: `No validator found for ${leafName}` },
      });
    }
    if (!val.in(normArgs)) {
      throw Object.assign(new Error('validation.failed'), {
        data: { detail: this.ajv.errorsText(val.in.errors ?? []) },
      });
    }

    // PATCH 2: Execute the tool via LeafFactory.run()
    const [, v] = (key as string).split('@');
    if (!v) {
      throw Object.assign(new Error('validation.missing'), {
        data: { detail: `No version found for ${leafName}` },
      });
    }
    const ctx = this.deps.bot ? createLeafContext(this.deps.bot) : undefined;
    if (!ctx) {
      throw Object.assign(new Error('bot.unavailable'), {
        data: { detail: 'Bot context not available' },
      });
    }
    const res = await this.leafFactory.run(leafName, v, ctx, normArgs, {
      idempotencyKey: (args as any)?.idempotencyKey,
    } as any);

    if (res.status === 'failure') {
      // Let the MCP transport surface a proper error; include your typed error as data
      const err = res.error ?? {
        code: 'unknown',
        retryable: false,
        detail: 'leaf_failed',
      };
      // Throwing causes MCP to emit an error response; do NOT wrap as a success JSON payload
      throw Object.assign(new Error(err.code), { data: err as any });
    }

    const payload = res.result ?? null;
    // Output validation (kept)
    if (def.outputSchema && val && val.out && !val.out(payload as any)) {
      throw Object.assign(new Error('tool.output_schema_mismatch'), {
        data: { detail: this.ajv.errorsText(val.out.errors ?? []) },
      });
    }
    return payload;
  }

  // PATCH 4a: register_option via registry
  private async handleRegisterOption(args: any): Promise<any> {
    const {
      id,
      version = '1.0.0',
      name: optionName,
      description,
      btDefinition,
      permissions = [],
    } = args;
    try {
      const normalized = this.normalizeBT(btDefinition.root);
      const computed = this.computeOptionPermissions(normalized);
      const escalation =
        permissions.length &&
        permissions.some((p: string) => !computed.includes(p));
      if (escalation) {
        return {
          status: 'failure',
          error: {
            code: 'permission.escalation',
            detail: permissions
              .filter((p: string) => !computed.includes(p))
              .join(','),
          },
        };
      }

      if (this.deps.registry?.registerOption) {
        const provenance = {
          author: 'llm',
          codeHash: '',
          createdAt: new Date().toISOString(),
        };
        const res = this.deps.registry.registerOption(
          {
            name: id,
            version,
            root: normalized,
            description: optionName ?? description,
          },
          provenance,
          { successThreshold: 0.8, failureThreshold: 0.3, maxShadowRuns: 10 }
        );
        return res.ok
          ? { status: 'success', optionId: res.id }
          : {
              status: 'failure',
              error: {
                code: res.error ?? 'register.failed',
                detail: res['detail'],
              },
            };
      }

      // Fallback: your previous in-memory resource storage (unchanged)
      const optionKey = `${id}@${version}`;
      const uri = `mcp+bt://options/${optionKey}`;
      if (this.resources.has(uri))
        return {
          status: 'failure',
          error: { code: 'version_exists', detail: optionKey },
        };
      this.resources.set(uri, {
        uri,
        name: `${optionName} (${version})`,
        description,
        mimeType: 'application/json',
        metadata: {
          id,
          version,
          status: 'shadow',
          permissions: computed,
          shadow: {
            success_threshold: 0.8,
            failure_threshold: 0.3,
            max_shadow_runs: 10,
          },
          provenance: {
            authored_by: 'llm',
            created_at: new Date().toISOString(),
          },
          btDefinition: { ...btDefinition, root: normalized },
        },
      });
      return { status: 'success', optionId: optionKey };
    } catch (e: any) {
      return {
        status: 'failure',
        error: {
          code: 'bt.validation_failed',
          detail: String(e?.message ?? e),
        },
      };
    }
  }

  // PATCH 4b: promote_option via registry
  private async handlePromoteOption(args: any): Promise<any> {
    const { optionId } = args;
    if (this.deps.registry?.promoteOption) {
      const ok = await this.deps.registry.promoteOption(optionId, 'manual');
      return ok
        ? { status: 'success', optionId }
        : {
            status: 'failure',
            error: { code: 'illegal_transition', detail: optionId },
          };
    }
    // fallback (your current resource mutation)...
    const uri = `mcp+bt://options/${optionId}`;
    const resource = this.resources.get(uri);

    if (!resource) {
      return {
        status: 'failure',
        error: {
          code: 'option.not_found',
          detail: `Option '${optionId}' not found`,
        },
      };
    }

    if (resource.metadata.status !== 'shadow') {
      return {
        status: 'failure',
        error: {
          code: 'illegal_transition',
          detail: `Cannot promote ${optionId} from ${resource.metadata.status}`,
        },
      };
    }

    resource.metadata.status = 'active';
    this.resources.set(uri, resource);

    return { status: 'success', optionId };
  }

  // PATCH 4c: list_options via registry
  private handleListOptions(args: any): any {
    const status = args?.status ?? 'all';
    if (this.deps.registry?.getActiveOptionsDetailed) {
      const active = this.deps.registry.getActiveOptionsDetailed();
      const shadow = this.deps.registry.getShadowOptionsDetailed?.() ?? [];
      const all = [...active, ...shadow];
      const filtered =
        status === 'all' ? all : all.filter((o) => o.spec.status === status);
      return {
        options: filtered.map((o) => ({
          id: `${o.spec.name}@${o.spec.version}`,
          name: o.spec.name,
          status: o.spec.status,
          permissions: o.spec.permissions,
        })),
      };
    }
    // fallback to your resource map...
    const options = Array.from(this.resources.entries())
      .filter(([uri]) => uri.startsWith('mcp+bt://options/'))
      .filter(([_uri, resource]) => {
        if (status === 'all') return true;
        return resource.metadata.status === status;
      })
      .map(([_uri, resource]) => ({
        id: resource.metadata.id,
        name: resource.name,
        status: resource.metadata.status,
        permissions: resource.metadata.permissions,
      }));

    return { options };
  }

  // PATCH 7: enforce a minimal safe policy
  private isAllowedTool(def: MCPToolDefinition, _goal?: string): boolean {
    if (!def) return false;
    const perms = new Set<string>(def?.metadata?.permissions ?? []);
    // Minimal deny-by-default for risky ops; make this data-driven later
    if (perms.has('container.write')) return false;
    return true;
  }

  // PATCH 3: Compute option permissions from real leaves, with graceful fallback
  private computeOptionPermissions(root: any): string[] {
    // Traverse a normalized BT-DSL JSON node (not compiled) and collect permissions
    const perms = new Set<string>();

    const inferPermsFromName = (leafName: string): string[] => {
      // Heuristic mapping when leaf implementations are not yet registered in-process
      const name = String(leafName).toLowerCase();
      if (['move_to', 'step_forward_safely', 'follow_entity'].includes(name)) {
        return ['movement'];
      }
      if (name === 'dig_block') return ['dig'];
      if (
        ['place_block', 'place_torch_if_needed', 'retreat_and_block'].includes(
          name
        )
      ) {
        return ['place'];
      }
      if (['sense_hostiles', 'get_light_level'].includes(name))
        return ['sense'];
      if (name === 'chat') return ['chat'];
      if (['craft_recipe', 'smelt'].includes(name)) return ['craft'];
      // wait / consume_food or unknown → no explicit permissions
      return [];
    };

    const visit = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'Leaf' && n.leafName) {
        const impl = this.leafFactory.get?.(n.leafName);
        if (impl && impl.spec) {
          (impl.spec.permissions || []).forEach((p: string) => perms.add(p));
        } else {
          // Gracefully handle unknown leaves by inferring a safe minimal set
          const inferred = inferPermsFromName(n.leafName);
          inferred.forEach((p) => perms.add(p));
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[MCP] Permission inference: unknown leaf '${n.leafName}', inferred perms: ${inferred.join(',')}`
            );
          }
        }
      }
      const kids: any[] = Array.isArray(n.children) ? n.children : [];
      kids.forEach(visit);
      if (n.child) visit(n.child);
    };
    visit(root);
    return [...perms];
  }

  // PATCH 8: harden normalizeBT
  private normalizeBT(node: any): any {
    // Accept either canonical BT-DSL shapes or a lighter, lowercase variant and
    // normalize to the canonical schema expected by the core parser.
    if (!node || typeof node !== 'object') return node;
    const rawType = String(node.type || '');
    const t = rawType.toLowerCase();

    // Canonical pass-through: if already a valid canonical type, shallowly normalize children
    if (
      rawType === 'Sequence' ||
      rawType === 'Selector' ||
      rawType === 'Repeat.Until' ||
      rawType === 'Decorator.Timeout' ||
      rawType === 'Decorator.FailOnTrue' ||
      rawType === 'Leaf'
    ) {
      if (rawType === 'Leaf') {
        return {
          type: 'Leaf',
          leafName: node.leafName ?? node.action, // support legacy 'action'
          leafVersion: node.leafVersion,
          args: node.args ?? {},
        };
      }
      if (rawType === 'Sequence' || rawType === 'Selector') {
        const children = (node.children || []).map((c: any) =>
          this.normalizeBT(c)
        );
        return { type: rawType, children };
      }
      if (rawType === 'Repeat.Until') {
        return {
          type: 'Repeat.Until',
          child: this.normalizeBT(node.child),
          condition: node.condition,
          maxIterations: node.maxIterations,
        };
      }
      if (rawType === 'Decorator.Timeout') {
        return {
          type: 'Decorator.Timeout',
          child: this.normalizeBT(node.child),
          timeoutMs: node.timeoutMs,
        };
      }
      if (rawType === 'Decorator.FailOnTrue') {
        return {
          type: 'Decorator.FailOnTrue',
          child: this.normalizeBT(node.child),
          condition: node.condition,
        };
      }
    }

    // Lowercase/compact aliases
    if (t === 'sequence' || t === 'selector') {
      const children = (node.children || []).map((c: any) =>
        this.normalizeBT(c)
      );
      return {
        type: t[0].toUpperCase() + t.slice(1),
        children,
      };
    }
    if (t === 'action' || t === 'leaf') {
      return {
        type: 'Leaf',
        leafName: node.leafName ?? node.action,
        args: node.args ?? {},
      };
    }
    if (t === 'repeat.until' || t === 'repeat_until') {
      return {
        type: 'Repeat.Until',
        child: this.normalizeBT(node.child),
        condition: node.condition,
        maxIterations: node.maxIterations,
      };
    }
    if (t === 'decorator.timeout' || t === 'timeout') {
      return {
        type: 'Decorator.Timeout',
        child: this.normalizeBT(node.child),
        timeoutMs: node.timeoutMs,
      };
    }
    if (
      t === 'decorator.failontrue' ||
      t === 'fail_on_true' ||
      t === 'failontrue'
    ) {
      return {
        type: 'Decorator.FailOnTrue',
        child: this.normalizeBT(node.child),
        condition: node.condition,
      };
    }

    // Unsupported or unknown
    throw new Error(`BT-DSL node type not allowed: ${node.type}`);
  }

  // PATCH 6: replace createWorldSnapshot()
  private async createWorldSnapshot(): Promise<any> {
    console.log('[MCP] createWorldSnapshot called');

    // Always use the fallback method since bot context snapshot is failing
    // if (this.deps.bot) {
    //   const ctx = createLeafContext(this.deps.bot);
    //   return ctx.snapshot();
    // }

    // Return actual world state from minecraft interface
    try {
      console.log('[MCP] Fetching world state from minecraft interface...');
      const response = await fetch('http://localhost:3005/state');
      if (!response.ok) {
        throw new Error(
          `Minecraft interface responded with ${response.status}`
        );
      }
      const data = (await response.json()) as any;
      console.log(
        '[MCP] Received data from minecraft interface:',
        JSON.stringify(data, null, 2)
      );

      if (data.success && data.data?.worldState) {
        const worldState = data.data.worldState;
        console.log('[MCP] Creating snapshot from world state...');
        const invItems = Array.isArray(worldState.inventory?.items)
          ? worldState.inventory.items
          : [];
        const normalizedItems = invItems.map((it: any) => ({
          // normalize common fields used across the app
          name: it.name ?? it.type ?? it.displayName ?? undefined,
          type: it.type ?? it.name ?? undefined,
          displayName: it.displayName ?? it.name ?? it.type ?? undefined,
          count: typeof it.count === 'number' ? it.count : (it.quantity ?? 1),
          slot: it.slot,
        }));

        const totalSlots = worldState.inventory?.space?.total ?? 36;
        const freeSlots =
          worldState.inventory?.space?.free ??
          Math.max(0, totalSlots - normalizedItems.length);

        const snapshot = {
          position:
            worldState.player?.position ??
            worldState.playerPosition ??
            worldState.agentPosition ??
            { x: 0, y: 64, z: 0 },
          biome: worldState.biome || 'plains',
          time: worldState.timeOfDay ?? worldState.time ?? 0,
          lightLevel: worldState.lightLevel ?? 15,
          nearbyHostiles: Array.isArray(worldState.nearbyHostiles)
            ? worldState.nearbyHostiles
            : [],
          weather: worldState.weather || 'clear',
          inventory: {
            items: normalizedItems,
            selectedSlot: worldState.inventory?.selectedSlot ?? 0,
            totalSlots,
            freeSlots,
          },
          toolDurability: {},
          waypoints: Array.isArray(worldState.waypoints)
            ? worldState.waypoints
            : [],
          vitals: {
            health: worldState.vitals?.health ?? worldState.health ?? 20,
            food: worldState.vitals?.food ?? worldState.hunger ?? 20,
          },
          // legacy top-level fields kept for compatibility
          health: worldState.health ?? worldState.vitals?.health ?? 20,
          hunger: worldState.hunger ?? worldState.vitals?.food ?? 20,
        };
        console.log(
          '[MCP] Snapshot created successfully:',
          JSON.stringify(snapshot, null, 2)
        );
        return snapshot;
      }
    } catch (error) {
      console.warn(
        '[MCP] Failed to fetch world state from minecraft interface:',
        error
      );
    }

    console.log('[MCP] Using fallback demo data');
    // Fallback to demo data
    return {
      position: { x: 53.5, y: 66, z: -55.5 },
      biome: 'plains',
      time: 1239,
      lightLevel: 15,
      nearbyHostiles: [],
      weather: 'clear',
      inventory: { items: [], selectedSlot: 0, totalSlots: 36, freeSlots: 30 },
      toolDurability: {},
      waypoints: [],
      vitals: { health: 20, food: 20 },
      health: 20,
      hunger: 20,
    };
  }

  // helper for version pinning heuristic
  private resolveLatestKey(prefix: string): string | undefined {
    const keys = [...this.tools.keys()].filter((k) =>
      k.startsWith(prefix + '@')
    );
    if (!keys.length) return undefined;
    // naive semver sort is fine to start; replace with a real semver lib later
    return keys.sort().at(-1);
  }
}

// Create and start the server
async function main() {
  // Create demo dependencies for testing
  const demoDeps: MCPServerDependencies = {
    leafFactory: new LeafFactory(),
    policyBuckets: {
      Tactical: { maxMs: 60_000, checkpointEveryMs: 15_000 },
      Short: { maxMs: 240_000, checkpointEveryMs: 60_000 },
      Standard: { maxMs: 600_000, checkpointEveryMs: 60_000 },
      Long: { maxMs: 1_500_000, checkpointEveryMs: 90_000 },
      Expedition: { maxMs: 3_000_000, checkpointEveryMs: 120_000 },
    },
  };

  const server = new ConsciousBotMCPServer(demoDeps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Conscious Bot MCP Server started');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ConsciousBotMCPServer };
