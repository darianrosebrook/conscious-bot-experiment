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

  constructor(config: MCPIntegrationConfig = {}) {
    this.config = {
      enableMCP: true,
      ...config,
    };

    this.leafFactory = new LeafFactory();
  }

  // -- Helpers ---------------------------------------------------------------

  private buildLeafSpec(leaf: LeafImpl): LeafSpec {
    const source: any = leaf && typeof leaf === 'object' ? (leaf as any).spec ?? leaf : {};
    const name: string | undefined = source.name ?? (leaf as any).name;
    if (!name) {
      throw new Error('Leaf registration failed: spec.name is required');
    }

    const version: string =
      source.version ?? (leaf as any).version ?? '1.0.0';
    const description: string =
      source.description ?? (leaf as any).description ?? name ?? 'leaf';

    const inputSchema = source.inputSchema ?? (leaf as any).inputSchema ?? {
      type: 'object',
      additionalProperties: true,
    };
    const outputSchema = source.outputSchema ?? (leaf as any).outputSchema;
    const timeoutMs = source.timeoutMs ?? (leaf as any).timeoutMs ?? 10_000;
    const retries = source.retries ?? (leaf as any).retries ?? 3;
    const permissionsSource =
      source.permissions ?? (leaf as any).permissions ?? ['sense'];
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
