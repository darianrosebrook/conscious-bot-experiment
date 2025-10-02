/**
 * MCP Integration Module
 *
 * Handles integration between the planning server and the MCP server.
 * Provides a clean interface for MCP operations and manages the connection.
 *
 * Notes on this revision:
 * - Stronger typing (fallback shim interface) and safer dynamic import.
 * - Debounced logging helpers; consistent return envelopes.
 * - Canonical LeafSpec construction and LeafFactory hydration.
 * - Option version resolution & BT runner integration.
 * - Tool/resource listing that works for both real server and fallback.
 * - No network port assumption: MCP uses stdio transport.
 *
 * @author
 *   @darianrosebrook (original)
 *   revision by: architectural cleanups & typing pass
 */

// ---------------------------------------------------------------------------
// Imports & Local Types
// ---------------------------------------------------------------------------

import type {
  ConsciousBotMCPServer,
  MCPServerDependencies,
} from '@conscious-bot/mcp-server';
import type { LeafImpl, LeafSpec } from '@conscious-bot/executor-contracts';
import { LeafFactory } from '@conscious-bot/executor-contracts';

export interface MCPIntegrationConfig {
  enableMCP?: boolean;
  registryEndpoint?: string; // reserved for future use
  botEndpoint?: string; // reserved for future use
  // NEW: MCP tool discovery configuration
  enableToolDiscovery?: boolean;
  toolDiscoveryEndpoint?: string;
  maxToolsPerGoal?: number;
  toolTimeoutMs?: number;
  retryAttempts?: number;
}

export interface MCPToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metrics?: Record<string, any>;
}

export interface MCPOptionRegistration {
  id: string; // logical name, version optional (id@version)
  name: string;
  description: string;
  btDefinition: any; // behavior tree JSON
  permissions?: string[];
}

// NEW: MCP Tool Discovery and Execution Interfaces
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  metadata: {
    version: string;
    timeoutMs?: number;
    retries?: number;
    permissions: string[];
    category?: string;
    tags?: string[];
    complexity?: 'simple' | 'moderate' | 'complex';
  };
}

export interface GoalToolMatch {
  tool: MCPTool;
  relevance: number; // 0-1, how relevant this tool is to the goal
  confidence: number; // 0-1, confidence in tool execution success
  reasoning: string; // Why this tool was selected
  estimatedDuration: number; // Estimated execution time in ms
}

export interface ToolDiscoveryResult {
  goalId: string;
  goalDescription: string;
  availableTools: MCPTool[];
  matchedTools: GoalToolMatch[];
  discoveryTime: number;
  totalTools: number;
  matchedCount: number;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  executionTime: number;
  result?: any;
  error?: string;
  metrics?: Record<string, any>;
  evaluation: {
    completed: boolean;
    effectiveness: number; // 0-1, how well the tool achieved the goal
    sideEffects: string[];
    recommendation: 'success' | 'partial_success' | 'failure' | 'retry';
  };
}

export interface ToolEvaluationFeedback {
  toolName: string;
  goalId: string;
  executionId: string;
  success: boolean;
  effectiveness: number;
  userFeedback?: 'positive' | 'neutral' | 'negative';
  notes?: string;
  timestamp: number;
}

// Fallback shim interface for the local MCP server mock
interface MCPServerShim {
  deps: MCPServerDependencies;
  tools: Map<string, any>;
  validators: Map<string, any>;
  resources: Map<string, any>;

  // population
  hydrateToolsFromLeafFactory: () => void;
  registerLeaf: (leaf: LeafImpl) => Promise<boolean>;

  // generic tool execution
  executeTool: (toolName: string, args: Record<string, any>) => Promise<any>;

  // option lifecycle
  handleListOptions: (args: { status?: string }) => { options: any[] };
  handlePromoteOption: (args: { optionId: string }) => Promise<{
    status: 'success' | 'failure';
    optionId?: string;
    error?: { code: string; detail?: string };
  }>;

  // resource API
  getTools: () => any[];
  getResources: () => any[];
  readResource: (uri: string) => Promise<any>;

  // runtime updates
  updateBotInstance: (bot: any) => Promise<void> | void;
  start: () => void;
  stop: () => void;
}

// Extend global interface for rate limiting variables
declare global {
  // eslint-disable-next-line no-var
  var lastMcpWarnLog: number | undefined;
  // eslint-disable-next-line no-var
  var lastMcpBotWarnLog: number | undefined;
}

// ---------------------------------------------------------------------------
// MCP Integration
// ---------------------------------------------------------------------------

export class MCPIntegration {
  private mcpServer: ConsciousBotMCPServer | MCPServerShim | null = null;
  private leafFactory: LeafFactory;
  private config: MCPIntegrationConfig;
  private isInitialized = false;

  // NEW: Tool discovery and execution tracking
  private toolDiscoveryCache: Map<string, ToolDiscoveryResult> = new Map();
  private toolExecutionHistory: Map<string, ToolExecutionResult[]> = new Map();
  private evaluationFeedback: ToolEvaluationFeedback[] = [];

  constructor(config: MCPIntegrationConfig = {}) {
    this.config = {
      enableMCP: true,
      enableToolDiscovery: true,
      toolDiscoveryEndpoint:
        process.env.MCP_ENDPOINT || 'http://localhost:3000',
      maxToolsPerGoal: 5,
      toolTimeoutMs: 30000,
      retryAttempts: 3,
      ...config,
    };

    this.leafFactory = new LeafFactory();
  }

  // -- Helpers ---------------------------------------------------------------

  private buildLeafSpec(leaf: LeafImpl): LeafSpec {
    const source: any =
      leaf && typeof leaf === 'object' ? ((leaf as any).spec ?? leaf) : {};
    const name: string | undefined = source.name ?? (leaf as any).name;
    if (!name) {
      throw new Error('Leaf registration failed: spec.name is required');
    }

    const version: string = source.version ?? (leaf as any).version ?? '1.0.0';
    const description: string =
      source.description ?? (leaf as any).description ?? name ?? 'leaf';

    const inputSchema = source.inputSchema ??
      (leaf as any).inputSchema ?? {
        type: 'object',
        additionalProperties: true,
      };
    const outputSchema = source.outputSchema ?? (leaf as any).outputSchema;
    const timeoutMs = source.timeoutMs ?? (leaf as any).timeoutMs ?? 10_000;
    const retries = source.retries ?? (leaf as any).retries ?? 3;
    const permissionsSource = source.permissions ??
      (leaf as any).permissions ?? ['sense'];
    const permissions = Array.isArray(permissionsSource)
      ? permissionsSource
      : ['sense'];

    return {
      name,
      version,
      description,
      inputSchema,
      outputSchema,
      timeoutMs,
      retries,
      permissions,
      implementation: leaf,
    };
  }

  // -- Logging helpers -------------------------------------------------------
  private warnOnce(key: 'mcp' | 'mcpBot', msg: string, intervalMs = 60_000) {
    const now = Date.now();
    if (key === 'mcp') {
      if (!global.lastMcpWarnLog || now - global.lastMcpWarnLog > intervalMs) {
        console.warn(msg);
        global.lastMcpWarnLog = now;
      }
      return;
    }
    if (
      !global.lastMcpBotWarnLog ||
      now - global.lastMcpBotWarnLog > intervalMs
    ) {
      console.warn(msg);
      global.lastMcpBotWarnLog = now;
    }
  }

  // -- Lifecycle -------------------------------------------------------------

  /** Initialize the MCP integration. Safe to call multiple times. */
  async initialize(bot?: any, registry?: any): Promise<void> {
    if (!this.config.enableMCP) {
      console.log('[MCP] Integration disabled by configuration');
      this.isInitialized = false;
      return;
    }

    try {
      const deps: MCPServerDependencies = {
        leafFactory: this.leafFactory,
        registry,
        bot,
        policyBuckets: {
          Tactical: { maxMs: 60_000, checkpointEveryMs: 15_000 },
          Short: { maxMs: 240_000, checkpointEveryMs: 60_000 },
          Standard: { maxMs: 600_000, checkpointEveryMs: 60_000 },
          Long: { maxMs: 1_500_000, checkpointEveryMs: 90_000 },
          Expedition: { maxMs: 3_000_000, checkpointEveryMs: 120_000 },
        },
      };

      // Attempt ESM import of the MCP server; fallback to shim
      try {
        const mod: any = await import('@conscious-bot/mcp-server');
        console.log('[MCP] MCP server import successful');
        const Ctor = (mod.ConsciousBotMCPServer || mod.default || mod) as {
          new (deps: MCPServerDependencies): ConsciousBotMCPServer;
        };
        this.mcpServer = new Ctor(deps);
        this.isInitialized = true;
        console.log('[MCP] MCP server created successfully');
      } catch (err) {
        console.error('[MCP] Failed to import/create MCP server:', err);
        console.log('[MCP] Creating fallback MCP server...');
        this.createFallbackMCPServer(deps);
        this.isInitialized = true;
        console.log('[MCP] Fallback MCP server created successfully');
      }

      console.log('[MCP] Integration initialized successfully');
    } catch (error) {
      console.error('[MCP] Failed to initialize integration:', error);
      this.isInitialized = false; // allow app to run without MCP
    }
  }

  /** Create a fallback MCP server when the full implementation isn't available */
  private createFallbackMCPServer(deps: MCPServerDependencies): void {
    const tools = new Map<string, any>();
    const validators = new Map<string, any>();
    const resources = new Map<string, any>();
    const options = new Map<string, any>();

    const hydrate = () => {
      tools.clear();
      validators.clear();
      try {
        const leaves = this.leafFactory.listLeaves();
        for (const leaf of leaves) {
          const name = `minecraft.${leaf.spec.name}@${leaf.spec.version}`;
          const def = {
            name,
            description: leaf.spec.description ?? leaf.spec.name,
            inputSchema: leaf.spec.inputSchema,
            outputSchema: leaf.spec.outputSchema ?? { type: 'null' },
            metadata: {
              version: leaf.spec.version,
              permissions: leaf.spec.permissions ?? [],
            },
          };
          tools.set(name, def);
        }
      } catch (error) {
        console.error('[MCP] Fallback: Failed to hydrate tools', error);
      }
    };

    const registerLeaf = async (leaf: LeafImpl): Promise<boolean> => {
      try {
        const spec = this.buildLeafSpec(leaf);
        const res = this.leafFactory.register(spec);
        if (!res.ok) {
          console.warn(
            `[MCP] Fallback: Leaf registration failed for ${spec.name}@${spec.version}: ${res.error}`
          );
          return false;
        }
        console.log(
          `[MCP] Fallback: Registered leaf: ${spec.name}@${spec.version}`
        );
        return true;
      } catch (error) {
        console.error('[MCP] Fallback: Leaf registration threw', error);
        return false;
      }
    };

    const executeTool = async (toolName: string, args: Record<string, any>) => {
      switch (toolName) {
        case 'register_option': {
          const optionId = `${args.id}@${args.version ?? '1.0.0'}`;
          const uri = `mcp+bt://options/${optionId}`;
          options.set(optionId, {
            id: optionId,
            status: 'shadow',
            metadata: args.btDefinition,
          });
          resources.set(uri, {
            uri,
            name: `${args.name ?? args.id} (${args.version ?? '1.0.0'})`,
            description: args.description,
            mimeType: 'application/json',
            metadata: args.btDefinition,
          });
          return { status: 'success', optionId };
        }
        case 'run_option': {
          const option = options.get(args.id);
          if (!option) {
            const err: any = new Error('option.not_found');
            err.data = { detail: args.id };
            throw err;
          }
          return {
            status: 'failure',
            error: {
              code: 'unknown',
              detail: 'run_option not supported in fallback',
            },
          };
        }
        default:
          throw new Error(
            `Fallback MCP server does not support tool ${toolName}`
          );
      }
    };

    const handleListOptions = ({ status = 'all' }) => {
      const entries = Array.from(options.entries()).map(([id, meta]) => ({
        id,
        status: meta.status,
        name: id,
        permissions: [],
      }));
      const filtered =
        status === 'all' ? entries : entries.filter((e) => e.status === status);
      return { options: filtered };
    };

    const shim: MCPServerShim = {
      deps,
      tools,
      validators,
      resources,
      hydrateToolsFromLeafFactory: hydrate,
      registerLeaf,
      executeTool,
      handleListOptions,
      handlePromoteOption: async ({ optionId }) => {
        if (options.has(optionId)) {
          options.get(optionId)!.status = 'active';
          return { status: 'success', optionId };
        }
        return {
          status: 'failure',
          error: { code: 'option.not_found', detail: optionId },
        };
      },
      getTools: () => Array.from(tools.values()),
      getResources: () => Array.from(resources.values()),
      readResource: async (uri: string) => {
        const res = resources.get(uri);
        if (!res) throw new Error(`Resource not found: ${uri}`);
        return res;
      },
      updateBotInstance: async (bot: any) => {
        (shim.deps as any).bot = bot;
        console.log('[MCP] Fallback: Bot instance updated');
      },
      start: () => console.log('[MCP] Fallback: Server started'),
      stop: () => console.log('[MCP] Fallback: Server stopped'),
    };

    this.mcpServer = shim;
    hydrate();
  }

  // -- Registration ----------------------------------------------------------

  /** Register a leaf with the MCP server and refresh tool registry */
  async registerLeaf(leaf: LeafImpl): Promise<boolean> {
    if (!this.isInitialized) {
      if ((this.mcpServer as MCPServerShim | null)?.registerLeaf) {
        return await (this.mcpServer as MCPServerShim).registerLeaf(leaf);
      }
      this.warnOnce('mcp', '[MCP] Integration not initialized');
      return false;
    }

    try {
      const spec = this.buildLeafSpec(leaf);

      const result = this.leafFactory.register(spec);
      if (!result.ok) {
        console.warn(
          `[MCP] Failed to register leaf ${spec.name}@${spec.version}: ${result.error}`
        );
        return false;
      }

      if (this.mcpServer) await this.refreshMCPServerTools();
      return true;
    } catch (error) {
      console.error('[MCP] Failed to register leaf:', error);
      return false;
    }
  }

  /** Refresh the MCP server's tools from the leaf factory */
  private async refreshMCPServerTools(): Promise<void> {
    if (!this.mcpServer) return;
    try {
      const server: any = this.mcpServer as any;
      if (typeof server.hydrateToolsFromLeafFactory === 'function') {
        server.hydrateToolsFromLeafFactory();
        return;
      }
      // Manual maps exposed: clear & rehydrate
      if (server.tools?.clear) server.tools.clear();
      if (server.validators?.clear) server.validators.clear();
      if (typeof server.hydrateToolsFromLeafFactory === 'function') {
        server.hydrateToolsFromLeafFactory();
      }
    } catch (error) {
      console.error('[MCP] Failed to refresh tools:', error);
    }
  }

  // -- Options API -----------------------------------------------------------

  /** Register a BT option via MCP */
  async registerOption(
    option: MCPOptionRegistration
  ): Promise<MCPToolResult<string>> {
    if (!this.isInitialized || !this.mcpServer) {
      return { success: false, error: 'MCP integration not initialized' };
    }

    try {
      const result = await (this.mcpServer as any).executeTool(
        'register_option',
        {
          id: option.id,
          name: option.name,
          description: option.description,
          btDefinition: option.btDefinition,
          permissions: option.permissions || [],
        }
      );

      // Store inline BT definition for immediate local use, if a runner exists
      try {
        if ((this as any).btRunner && option.btDefinition) {
          const optId: string =
            (result?.optionId as string) || option.id || option.name;
          (this as any).btRunner.storeInlineDefinition(
            optId,
            option.btDefinition
          );
        }
      } catch (e) {
        console.error('[MCP] Failed to store inline definition:', e);
      }

      return {
        success: result.status === 'success',
        data: result.optionId,
        error: result.status === 'failure' ? result.error?.detail : undefined,
      };
    } catch (error: any) {
      return { success: false, error: error.message ?? 'Unknown error' };
    }
  }

  /** Execute a tool via MCP */
  async executeTool<T = any>(
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolResult<T>> {
    if (!this.isInitialized || !this.mcpServer) {
      return { success: false, error: 'MCP integration not initialized' };
    }

    try {
      const result = await (this.mcpServer as any).executeTool(toolName, args);
      return { success: true, data: result };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Tool execution failed',
        data: error.data,
      };
    }
  }

  /** List available tools from MCP */
  async listTools(): Promise<string[]> {
    if (!this.isInitialized || !this.mcpServer) return [];
    try {
      const tools = (this.mcpServer as any).getTools?.();
      if (Array.isArray(tools)) return tools.map((t: any) => t.name);
      return [];
    } catch (error) {
      console.error('[MCP] Failed to list tools:', error);
      return [];
    }
  }

  /** List available resources from MCP */
  async listResources(): Promise<any[]> {
    if (!this.isInitialized || !this.mcpServer) return [];
    try {
      const resources = (this.mcpServer as any).getResources?.();
      return Array.isArray(resources) ? resources : [];
    } catch (error) {
      console.error('[MCP] Failed to list resources:', error);
      return [];
    }
  }

  /** Read a specific resource from MCP */
  async readResource(uri: string): Promise<any> {
    if (!this.isInitialized || !this.mcpServer) {
      throw new Error('MCP integration not initialized');
    }
    try {
      const result = await (this.mcpServer as any).readResource(uri);
      return result;
    } catch (error) {
      console.error('[MCP] Failed to read resource:', error);
      throw error;
    }
  }

  /** Update the MCP server with the bot instance */
  async updateBotInstance(bot: any): Promise<void> {
    if (!this.isInitialized || !this.mcpServer) {
      const hasFallback = Boolean(
        (this.mcpServer as MCPServerShim | null)?.updateBotInstance
      );
      if (hasFallback) {
        await (this.mcpServer as MCPServerShim).updateBotInstance(bot);
        return;
      }
      this.warnOnce(
        'mcpBot',
        '[MCP] Integration not initialized, cannot update bot instance'
      );
      return;
    }

    try {
      (this.mcpServer as any).deps.bot = bot;
      console.log('[MCP] Bot instance updated successfully');
    } catch (error) {
      console.error('[MCP] Failed to update bot instance:', error);
    }
  }

  /** List available options from MCP */
  async listOptions(status: string = 'all'): Promise<any[]> {
    if (!this.isInitialized || !this.mcpServer) return [];
    try {
      const result = await (this.mcpServer as any).handleListOptions({
        status,
      });
      return result?.options ?? [];
    } catch (error) {
      console.error('[MCP] Failed to list options:', error);
      return [];
    }
  }

  /** Promote an option via MCP */
  async promoteOption(optionId: string): Promise<MCPToolResult<string>> {
    if (!this.isInitialized || !this.mcpServer) {
      return { success: false, error: 'MCP integration not initialized' };
    }
    try {
      const result = await (this.mcpServer as any).handlePromoteOption({
        optionId,
      });
      return {
        success: result.status === 'success',
        data: result.optionId,
        error: result.status === 'failure' ? result.error?.detail : undefined,
      };
    } catch (error: any) {
      return { success: false, error: error.message ?? 'Unknown error' };
    }
  }

  /** Run an option via MCP with version resolution */
  async runOption(
    optionId: string,
    args?: Record<string, any>
  ): Promise<MCPToolResult<any>> {
    if (!this.isInitialized || !this.mcpServer) {
      return { success: false, error: 'MCP integration not initialized' };
    }

    try {
      const resolvedOptionId = await this.resolveOptionVersion(optionId);

      // Prefer local BT runner if present (lower latency, richer telemetry)
      if ((this as any).btRunner) {
        console.log(`[MCP] Executing option ${resolvedOptionId} via BT runner`);
        try {
          const result = await (this as any).btRunner.runOption(
            resolvedOptionId,
            args || {}
          );
          return { success: true, data: result };
        } catch (btError: any) {
          console.warn(
            `[MCP] BT execution failed for ${resolvedOptionId}:`,
            btError
          );
          return {
            success: false,
            error: btError.message || 'Behavior tree execution failed',
            data: btError,
          };
        }
      }

      // Fallback to MCP server tool execution
      console.log(
        `[MCP] Executing option ${resolvedOptionId} via MCP server tool`
      );
      const result = await (this.mcpServer as any).executeTool('run_option', {
        id: resolvedOptionId,
        args: args || {},
      });
      return { success: true, data: result };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Option execution failed',
        data: error.data,
      };
    }
  }

  /** Resolve option version to a stable call signature */
  private async resolveOptionVersion(optionId: string): Promise<string> {
    if (optionId.includes('@')) return optionId; // already versioned

    try {
      const options = await this.listOptions('active');
      const matching = options.filter(
        (opt: any) =>
          opt.name === optionId || opt.id?.startsWith(optionId + '@')
      );
      if (matching.length > 0) return matching[0].id || optionId;
    } catch (error) {
      console.warn('[MCP] Failed to resolve option version:', error);
    }
    return optionId; // fallback
  }

  // -- NEW: MCP Tool Discovery and Execution ---------------------------------

  /**
   * Discover tools from MCP server based on goal requirements
   */
  async discoverToolsForGoal(
    goalId: string,
    goalDescription: string,
    context?: Record<string, any>
  ): Promise<ToolDiscoveryResult> {
    if (!this.config.enableToolDiscovery || !this.isInitialized) {
      return {
        goalId,
        goalDescription,
        availableTools: [],
        matchedTools: [],
        discoveryTime: 0,
        totalTools: 0,
        matchedCount: 0,
      };
    }

    // Check cache first
    const cached = this.toolDiscoveryCache.get(goalId);
    if (cached) {
      return cached;
    }

    const startTime = Date.now();

    try {
      // Get all available tools from MCP server
      const tools = await this.listTools();

      // Convert to MCPTool format
      const availableTools: MCPTool[] = tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        metadata: {
          version: tool.metadata?.version || '1.0.0',
          timeoutMs: tool.metadata?.timeoutMs || this.config.toolTimeoutMs,
          retries: tool.metadata?.retries || this.config.retryAttempts,
          permissions: tool.metadata?.permissions || [],
          category: this.inferToolCategory(tool),
          tags: this.extractToolTags(tool),
          complexity: this.inferToolComplexity(tool),
        },
      }));

      // Match tools to goal
      const matchedTools = await this.matchToolsToGoal(
        availableTools,
        goalId,
        goalDescription,
        context
      );

      const result: ToolDiscoveryResult = {
        goalId,
        goalDescription,
        availableTools,
        matchedTools,
        discoveryTime: Date.now() - startTime,
        totalTools: availableTools.length,
        matchedCount: matchedTools.length,
      };

      // Cache the result
      this.toolDiscoveryCache.set(goalId, result);

      console.log(
        `[MCP] ✅ Discovered ${matchedTools.length}/${availableTools.length} tools for goal: ${goalDescription.substring(0, 80)}...`
      );

      if (matchedTools.length === 0) {
        console.warn(
          `[MCP] ⚠️ No tools matched for goal. Available tools: ${availableTools.map((t) => t.name).join(', ')}`
        );
      } else {
        console.log(
          `[MCP] Top matched tools: ${matchedTools
            .slice(0, 3)
            .map((m) => `${m.tool.name} (${m.relevance.toFixed(2)})`)
            .join(', ')}`
        );
      }

      return result;
    } catch (error) {
      console.error('[MCP] ❌ Tool discovery failed:', error);
      return {
        goalId,
        goalDescription,
        availableTools: [],
        matchedTools: [],
        discoveryTime: Date.now() - startTime,
        totalTools: 0,
        matchedCount: 0,
      };
    }
  }

  /**
   * Match available tools to a specific goal
   */
  private async matchToolsToGoal(
    tools: MCPTool[],
    goalId: string,
    goalDescription: string,
    context?: Record<string, any>
  ): Promise<GoalToolMatch[]> {
    const matches: GoalToolMatch[] = [];

    for (const tool of tools) {
      const relevance = this.calculateToolRelevance(
        tool,
        goalDescription,
        context
      );
      const confidence = this.calculateToolConfidence(tool, context);

      // Lower threshold for better tool discovery (was 0.3)
      // Use default of 0.2 if not configured
      const relevanceThreshold = 0.2;

      if (relevance > relevanceThreshold) {
        matches.push({
          tool,
          relevance,
          confidence,
          reasoning: this.generateMatchingReasoning(
            tool,
            goalDescription,
            relevance
          ),
          estimatedDuration:
            tool.metadata.timeoutMs || this.config.toolTimeoutMs || 30000,
        });
      } else if (relevance > 0.1) {
        // Log tools that are close but didn't match
        console.log(
          `[MCP] Tool "${tool.name}" has low relevance (${relevance.toFixed(2)}) for goal: ${goalDescription}`
        );
      }
    }

    // Sort by relevance and confidence
    matches.sort((a, b) => {
      const scoreA = a.relevance * 0.7 + a.confidence * 0.3;
      const scoreB = b.relevance * 0.7 + b.confidence * 0.3;
      return scoreB - scoreA;
    });

    // Limit results
    return matches.slice(0, this.config.maxToolsPerGoal);
  }

  /**
   * Calculate how relevant a tool is to a goal
   */
  private calculateToolRelevance(
    tool: MCPTool,
    goalDescription: string,
    context?: Record<string, any>
  ): number {
    let relevance = 0;

    const goalLower = goalDescription.toLowerCase();
    const toolDesc = tool.description.toLowerCase();
    const toolName = tool.name.toLowerCase();
    const toolTags = (tool.metadata.tags || []).map((tag) => tag.toLowerCase());

    // Keyword matching in goal vs tool description
    const goalKeywords = goalLower.match(/\b\w{3,}\b/g) || [];
    let keywordMatches = 0;

    for (const keyword of goalKeywords) {
      if (
        toolDesc.includes(keyword) ||
        toolName.includes(keyword) ||
        toolTags.includes(keyword)
      ) {
        keywordMatches++;
      }
    }

    relevance += (keywordMatches / Math.max(goalKeywords.length, 1)) * 0.6;

    // Category matching
    const goalCategory = this.inferGoalCategory(goalDescription);
    if (
      tool.metadata.category &&
      goalCategory &&
      tool.metadata.category === goalCategory
    ) {
      relevance += 0.2;
    }

    // Context-based relevance
    if (context) {
      // Check if tool permissions match context requirements
      const requiredPermissions =
        this.extractRequiredPermissions(goalDescription);
      const hasRequiredPerms = requiredPermissions.every((perm) =>
        tool.metadata.permissions.includes(perm)
      );

      if (hasRequiredPerms) {
        relevance += 0.1;
      }

      // Check complexity match
      const goalComplexity = this.inferGoalComplexity(goalDescription);
      if (goalComplexity && tool.metadata.complexity === goalComplexity) {
        relevance += 0.1;
      }
    }

    return Math.min(1, relevance);
  }

  /**
   * Calculate confidence in tool execution success
   */
  private calculateToolConfidence(
    tool: MCPTool,
    context?: Record<string, any>
  ): number {
    let confidence = 0.8; // Base confidence

    // Version stability
    if (tool.metadata.version && tool.metadata.version !== '1.0.0') {
      confidence += 0.1;
    }

    // Permission confidence
    if (tool.metadata.permissions && tool.metadata.permissions.length > 0) {
      confidence += 0.05;
    }

    // Complexity confidence (simpler tools are more reliable)
    switch (tool.metadata.complexity) {
      case 'simple':
        confidence += 0.05;
        break;
      case 'complex':
        confidence -= 0.05;
        break;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Generate reasoning for why a tool was selected
   */
  private generateMatchingReasoning(
    tool: MCPTool,
    goalDescription: string,
    relevance: number
  ): string {
    let reasoning = `Tool "${tool.name}" matches goal "${goalDescription}"`;

    if (relevance > 0.7) {
      reasoning += ' with high relevance';
    } else if (relevance > 0.5) {
      reasoning += ' with moderate relevance';
    } else {
      reasoning += ' with basic relevance';
    }

    if (tool.metadata.category) {
      reasoning += ` (category: ${tool.metadata.category})`;
    }

    return reasoning;
  }

  /**
   * Execute a tool with evaluation and feedback
   */
  async executeToolWithEvaluation<T = any>(
    tool: MCPTool,
    args: Record<string, any>,
    goalId?: string,
    context?: Record<string, any>
  ): Promise<ToolExecutionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      console.log(`[MCP] Executing tool: ${tool.name} for goal: ${goalId}`);

      // Execute the tool
      const result = await this.executeTool<T>(tool.name, args);

      const executionTime = Date.now() - startTime;

      // Evaluate the result
      const evaluation = await this.evaluateToolExecution(
        tool,
        result,
        args,
        executionTime,
        context
      );

      const toolResult: ToolExecutionResult = {
        toolName: tool.name,
        success: result.success,
        executionTime,
        result: result.data,
        error: result.error,
        metrics: result.metrics,
        evaluation,
      };

      // Store execution history
      if (tool.name) {
        if (!this.toolExecutionHistory.has(tool.name)) {
          this.toolExecutionHistory.set(tool.name, []);
        }
        this.toolExecutionHistory.get(tool.name)!.push(toolResult);
      }

      console.log(
        `[MCP] Tool execution completed: ${tool.name} (${result.success ? 'SUCCESS' : 'FAILED'}) in ${executionTime}ms`
      );

      return toolResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      const failedResult: ToolExecutionResult = {
        toolName: tool.name,
        success: false,
        executionTime,
        error: errorMsg,
        evaluation: {
          completed: false,
          effectiveness: 0,
          sideEffects: ['Tool execution failed'],
          recommendation: 'failure',
        },
      };

      // Store failed execution
      if (tool.name) {
        if (!this.toolExecutionHistory.has(tool.name)) {
          this.toolExecutionHistory.set(tool.name, []);
        }
        this.toolExecutionHistory.get(tool.name)!.push(failedResult);
      }

      console.error(`[MCP] Tool execution failed: ${tool.name}`, error);
      return failedResult;
    }
  }

  /**
   * Evaluate tool execution results
   */
  private async evaluateToolExecution(
    tool: MCPTool,
    result: MCPToolResult,
    args: Record<string, any>,
    executionTime: number,
    context?: Record<string, any>
  ): Promise<ToolExecutionResult['evaluation']> {
    let effectiveness = 0;
    let completed = result.success;
    let sideEffects: string[] = [];
    let recommendation: 'success' | 'partial_success' | 'failure' | 'retry' =
      'failure';

    if (result.success) {
      effectiveness = 0.8; // Base effectiveness for successful execution
      recommendation = 'success';

      // Check for performance issues
      if (executionTime > (tool.metadata.timeoutMs || 30000)) {
        sideEffects.push('Tool execution took longer than expected');
        effectiveness -= 0.2;
      }

      // Check result quality if available
      if (result.data) {
        // Simple heuristics for result quality
        if (typeof result.data === 'object' && result.data !== null) {
          const dataKeys = Object.keys(result.data);
          if (dataKeys.length > 0) {
            effectiveness += 0.1;
          }
        }
      }
    } else {
      effectiveness = 0;
      recommendation = 'failure';

      if (result.error) {
        if (result.error.includes('timeout')) {
          sideEffects.push('Tool execution timed out');
          recommendation = 'retry';
        } else if (result.error.includes('permission')) {
          sideEffects.push('Permission denied');
        } else if (result.error.includes('validation')) {
          sideEffects.push('Input validation failed');
          recommendation = 'retry';
        }
      }
    }

    // Context-aware evaluation
    if (context) {
      // Check if tool achieved the intended goal
      // This is a simplified evaluation - in practice, this would be more sophisticated
      const goalAchieved = this.evaluateGoalAchievement(tool, result, context);
      if (goalAchieved) {
        effectiveness = Math.max(effectiveness, 0.7);
      }
    }

    return {
      completed,
      effectiveness: Math.max(0, Math.min(1, effectiveness)),
      sideEffects,
      recommendation,
    };
  }

  /**
   * Evaluate if the tool achieved the goal
   */
  private evaluateGoalAchievement(
    tool: MCPTool,
    result: MCPToolResult,
    context: Record<string, any>
  ): boolean {
    // Simplified goal achievement evaluation
    // In practice, this would use more sophisticated analysis
    if (!result.success || !result.data) {
      return false;
    }

    // Check if the result contains expected outcomes
    const expectedOutcomes = this.extractExpectedOutcomes(tool, context);
    for (const outcome of expectedOutcomes) {
      if (this.resultContainsOutcome(result.data, outcome)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Helper methods for tool analysis
   */
  private inferToolCategory(tool: any): string {
    const name = tool.name.toLowerCase();
    const desc = tool.description.toLowerCase();

    if (
      name.includes('move') ||
      name.includes('navigate') ||
      desc.includes('move')
    ) {
      return 'movement';
    }
    if (
      name.includes('gather') ||
      name.includes('collect') ||
      desc.includes('gather')
    ) {
      return 'gathering';
    }
    if (
      name.includes('craft') ||
      name.includes('build') ||
      desc.includes('craft')
    ) {
      return 'crafting';
    }
    if (
      name.includes('mine') ||
      name.includes('dig') ||
      desc.includes('mine')
    ) {
      return 'mining';
    }
    if (
      name.includes('sense') ||
      name.includes('scan') ||
      desc.includes('detect')
    ) {
      return 'sensing';
    }
    if (
      name.includes('chat') ||
      name.includes('talk') ||
      desc.includes('communicate')
    ) {
      return 'communication';
    }

    return 'general';
  }

  private extractToolTags(tool: any): string[] {
    const tags: string[] = [];
    const name = tool.name.toLowerCase();

    // Extract tags from name
    if (name.includes('safe')) tags.push('safe');
    if (name.includes('fast')) tags.push('fast');
    if (name.includes('efficient')) tags.push('efficient');
    if (name.includes('auto')) tags.push('automated');
    if (name.includes('tree')) tags.push('forestry');
    if (name.includes('ore')) tags.push('mining');

    return tags;
  }

  private inferToolComplexity(tool: any): 'simple' | 'moderate' | 'complex' {
    const desc = tool.description.toLowerCase();

    if (
      desc.includes('complex') ||
      desc.includes('advanced') ||
      desc.includes('multi-step')
    ) {
      return 'complex';
    }
    if (
      desc.includes('simple') ||
      desc.includes('basic') ||
      desc.includes('single')
    ) {
      return 'simple';
    }

    return 'moderate';
  }

  private inferGoalCategory(goalDescription: string): string | null {
    const desc = goalDescription.toLowerCase();

    if (
      desc.includes('move') ||
      desc.includes('go to') ||
      desc.includes('navigate')
    ) {
      return 'movement';
    }
    if (
      desc.includes('gather') ||
      desc.includes('collect') ||
      desc.includes('get')
    ) {
      return 'gathering';
    }
    if (
      desc.includes('craft') ||
      desc.includes('make') ||
      desc.includes('build')
    ) {
      return 'crafting';
    }
    if (desc.includes('mine') || desc.includes('dig')) {
      return 'mining';
    }

    return null;
  }

  private extractRequiredPermissions(goalDescription: string): string[] {
    const permissions: string[] = [];
    const desc = goalDescription.toLowerCase();

    if (desc.includes('move') || desc.includes('navigate')) {
      permissions.push('movement');
    }
    if (
      desc.includes('dig') ||
      desc.includes('mine') ||
      desc.includes('break')
    ) {
      permissions.push('dig');
    }
    if (desc.includes('place') || desc.includes('build')) {
      permissions.push('place');
    }
    if (
      desc.includes('sense') ||
      desc.includes('scan') ||
      desc.includes('look')
    ) {
      permissions.push('sense');
    }

    return permissions;
  }

  private inferGoalComplexity(
    goalDescription: string
  ): 'simple' | 'moderate' | 'complex' | null {
    const desc = goalDescription.toLowerCase();

    if (
      desc.includes('complex') ||
      desc.includes('advanced') ||
      desc.includes('multi-step')
    ) {
      return 'complex';
    }
    if (
      desc.includes('simple') ||
      desc.includes('basic') ||
      desc.includes('single')
    ) {
      return 'simple';
    }

    return null;
  }

  private extractExpectedOutcomes(
    tool: MCPTool,
    context: Record<string, any>
  ): string[] {
    const outcomes: string[] = [];

    // Extract from tool output schema
    if (tool.outputSchema && tool.outputSchema.properties) {
      outcomes.push(...Object.keys(tool.outputSchema.properties));
    }

    // Context-based outcomes
    if (context) {
      if (context.expectedResult) {
        outcomes.push(context.expectedResult);
      }
    }

    return outcomes;
  }

  private resultContainsOutcome(result: any, outcome: string): boolean {
    if (!result) return false;

    const resultStr = JSON.stringify(result).toLowerCase();
    const outcomeLower = outcome.toLowerCase();

    return resultStr.includes(outcomeLower);
  }

  /**
   * Get tool execution history
   */
  getToolExecutionHistory(toolName?: string): ToolExecutionResult[] {
    if (toolName) {
      return this.toolExecutionHistory.get(toolName) || [];
    }

    const allHistory: ToolExecutionResult[] = [];
    for (const history of this.toolExecutionHistory.values()) {
      allHistory.push(...history);
    }
    return allHistory;
  }

  /**
   * Submit evaluation feedback
   */
  submitEvaluationFeedback(feedback: ToolEvaluationFeedback): void {
    this.evaluationFeedback.push(feedback);
    console.log(
      `[MCP] Evaluation feedback received for ${feedback.toolName}: ${feedback.userFeedback}`
    );
  }

  /**
   * Get evaluation statistics
   */
  getEvaluationStatistics(): {
    totalEvaluations: number;
    successRate: number;
    averageEffectiveness: number;
    toolStats: Record<
      string,
      { executions: number; successRate: number; avgEffectiveness: number }
    >;
  } {
    const stats = {
      totalEvaluations: this.evaluationFeedback.length,
      successRate: 0,
      averageEffectiveness: 0,
      toolStats: {} as Record<
        string,
        { executions: number; successRate: number; avgEffectiveness: number }
      >,
    };

    if (this.evaluationFeedback.length === 0) {
      return stats;
    }

    const toolExecutions = new Map<
      string,
      { count: number; successes: number; effectiveness: number[] }
    >();

    for (const feedback of this.evaluationFeedback) {
      if (!toolExecutions.has(feedback.toolName)) {
        toolExecutions.set(feedback.toolName, {
          count: 0,
          successes: 0,
          effectiveness: [],
        });
      }

      const toolStats = toolExecutions.get(feedback.toolName)!;
      toolStats.count++;
      if (feedback.success) {
        toolStats.successes++;
      }
      toolStats.effectiveness.push(feedback.effectiveness);
    }

    // Calculate tool-specific stats
    for (const [toolName, toolStats] of toolExecutions.entries()) {
      stats.toolStats[toolName] = {
        executions: toolStats.count,
        successRate:
          toolStats.count > 0 ? toolStats.successes / toolStats.count : 0,
        avgEffectiveness:
          toolStats.effectiveness.length > 0
            ? toolStats.effectiveness.reduce((sum, e) => sum + e, 0) /
              toolStats.effectiveness.length
            : 0,
      };
    }

    // Calculate overall stats
    let totalSuccesses = 0;
    let totalEffectiveness = 0;

    for (const toolStats of Object.values(stats.toolStats)) {
      totalSuccesses += toolStats.executions * toolStats.successRate;
      totalEffectiveness += toolStats.executions * toolStats.avgEffectiveness;
    }

    stats.successRate =
      stats.totalEvaluations > 0 ? totalSuccesses / stats.totalEvaluations : 0;
    stats.averageEffectiveness =
      stats.totalEvaluations > 0
        ? totalEffectiveness / stats.totalEvaluations
        : 0;

    return stats;
  }

  /**
   * Clear discovery cache
   */
  clearToolDiscoveryCache(): void {
    this.toolDiscoveryCache.clear();
    console.log('[MCP] Tool discovery cache cleared');
  }

  // -- Status & Access -------------------------------------------------------

  getStatus(): { initialized: boolean; enabled: boolean } {
    return {
      initialized: this.isInitialized,
      enabled: !!this.config.enableMCP,
    };
  }

  getMCPServer(): ConsciousBotMCPServer | MCPServerShim | null {
    return this.mcpServer;
  }
}
