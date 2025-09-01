/**
 * MCP Integration Module
 *
 * Handles integration between the planning server and the MCP server.
 * Provides a clean interface for MCP operations and manages the connection.
 *
 * @author @darianrosebrook
 */

import { LeafFactory, createLeafContext } from '@conscious-bot/core';
import type {
  ConsciousBotMCPServer,
  MCPServerDependencies,
} from '@conscious-bot/mcp-server';

// Use the imported interface from MCP server

export interface MCPIntegrationConfig {
  mcpServerPort?: number;
  enableMCP?: boolean;
  registryEndpoint?: string;
  botEndpoint?: string;
}

export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metrics?: Record<string, any>;
}

export interface MCPOptionRegistration {
  id: string;
  name: string;
  description: string;
  btDefinition: any;
  permissions?: string[];
}

export class MCPIntegration {
  private mcpServer: ConsciousBotMCPServer | null = null;
  private leafFactory: LeafFactory;
  private config: MCPIntegrationConfig;
  private isInitialized = false;

  constructor(config: MCPIntegrationConfig = {}) {
    this.config = {
      enableMCP: true,
      // MCP server uses stdio transport, not network port
      // mcpServerPort: 3006, // Removed - misleading configuration
      ...config,
    };

    // Initialize leaf factory
    this.leafFactory = new LeafFactory();
  }

  /**
   * Initialize the MCP integration
   */
  async initialize(bot?: any, registry?: any): Promise<void> {
    if (!this.config.enableMCP) {
      console.log('[MCP] Integration disabled by configuration');
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

      // Dynamically import ESM MCP server to support both ESM/CJS consumers
      const m = (await import('@conscious-bot/mcp-server')) as any;
      const ServerCtor = (m.ConsciousBotMCPServer || m.default || m) as {
        new (deps: MCPServerDependencies): ConsciousBotMCPServer;
      };
      this.mcpServer = new ServerCtor(deps);
      this.isInitialized = true;

      console.log('[MCP] Integration initialized successfully');
    } catch (error) {
      console.error('[MCP] Failed to initialize integration:', error);
      // Don't throw - allow server to start without MCP
      this.isInitialized = false;
    }
  }

  /**
   * Register a leaf with the MCP server
   */
  async registerLeaf(leaf: any): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn('[MCP] Integration not initialized');
      return false;
    }

    try {
      const result = this.leafFactory.register(leaf);

      // Refresh the MCP server's tools after registering a leaf
      if (result.ok && this.mcpServer) {
        await this.refreshMCPServerTools();
      }

      return result.ok;
    } catch (error) {
      console.error('[MCP] Failed to register leaf:', error);
      return false;
    }
  }

  /**
   * Refresh the MCP server's tools from the leaf factory
   */
  private async refreshMCPServerTools(): Promise<void> {
    if (!this.mcpServer) return;

    try {
      // Clear existing tools and re-hydrate from leaf factory
      (this.mcpServer as any).tools.clear();
      (this.mcpServer as any).validators.clear();
      (this.mcpServer as any).hydrateToolsFromLeafFactory();
    } catch (error) {
      console.error('[MCP] Failed to refresh tools:', error);
    }
  }

  /**
   * Register a BT option via MCP
   */
  async registerOption(option: MCPOptionRegistration): Promise<MCPToolResult> {
    if (!this.isInitialized || !this.mcpServer) {
      return {
        success: false,
        error: 'MCP integration not initialized',
      };
    }

    try {
      // Use the executeTool method to call register_option
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

      return {
        success: result.status === 'success',
        data: result.optionId,
        error: result.status === 'failure' ? result.error?.detail : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute a tool via MCP
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolResult> {
    if (!this.isInitialized || !this.mcpServer) {
      return {
        success: false,
        error: 'MCP integration not initialized',
      };
    }

    try {
      const result = await (this.mcpServer as any).executeTool(toolName, args);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Tool execution failed',
        data: error.data,
      };
    }
  }

  /**
   * List available tools from MCP
   */
  async listTools(): Promise<string[]> {
    if (!this.isInitialized || !this.mcpServer) {
      return [];
    }

    try {
      // Use the new public method to get tools
      const tools = this.mcpServer.getTools();
      return tools.map((tool) => tool.name);
    } catch (error) {
      console.error('[MCP] Failed to list tools:', error);
      return [];
    }
  }

  /**
   * List available resources from MCP
   */
  async listResources(): Promise<any[]> {
    if (!this.isInitialized || !this.mcpServer) {
      return [];
    }

    try {
      // Use the new public method to get resources
      const resources = this.mcpServer.getResources();
      return resources;
    } catch (error) {
      console.error('[MCP] Failed to list resources:', error);
      return [];
    }
  }

  /**
   * Read a specific resource from MCP
   */
  async readResource(uri: string): Promise<any> {
    if (!this.isInitialized || !this.mcpServer) {
      throw new Error('MCP integration not initialized');
    }

    try {
      // Use the new public method to read resources
      const result = await this.mcpServer.readResource(uri);
      return result;
    } catch (error) {
      console.error('[MCP] Failed to read resource:', error);
      throw error;
    }
  }

  /**
   * Update the MCP server with the bot instance
   */
  async updateBotInstance(bot: any): Promise<void> {
    if (!this.isInitialized || !this.mcpServer) {
      console.warn(
        '[MCP] Integration not initialized, cannot update bot instance'
      );
      return;
    }

    try {
      // Update the bot instance in the MCP server
      (this.mcpServer as any).deps.bot = bot;
      console.log('[MCP] Bot instance updated successfully');
    } catch (error) {
      console.error('[MCP] Failed to update bot instance:', error);
    }
  }

  /**
   * List available options from MCP
   */
  async listOptions(status: string = 'all'): Promise<any[]> {
    if (!this.isInitialized || !this.mcpServer) {
      return [];
    }

    try {
      const result = await (this.mcpServer as any).handleListOptions({
        status,
      });
      return result.options || [];
    } catch (error) {
      console.error('[MCP] Failed to list options:', error);
      return [];
    }
  }

  /**
   * Promote an option via MCP
   */
  async promoteOption(optionId: string): Promise<MCPToolResult> {
    if (!this.isInitialized || !this.mcpServer) {
      return {
        success: false,
        error: 'MCP integration not initialized',
      };
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
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run an option via MCP with version resolution
   */
  async runOption(
    optionId: string,
    args?: Record<string, any>
  ): Promise<MCPToolResult> {
    if (!this.isInitialized || !this.mcpServer) {
      return {
        success: false,
        error: 'MCP integration not initialized',
      };
    }

    try {
      // First, try to resolve the option ID to a stable version
      const resolvedOptionId = await this.resolveOptionVersion(optionId);

      // Check if we have a behavior tree runner connected
      if ((this as any).btRunner) {
        console.log(`[MCP] Executing option ${resolvedOptionId} via behavior tree runner`);
        
        try {
          const result = await (this as any).btRunner.runOption(resolvedOptionId, args || {});
          return {
            success: true,
            data: result,
          };
        } catch (btError: any) {
          console.warn(`[MCP] Behavior tree execution failed for ${resolvedOptionId}:`, btError);
          return {
            success: false,
            error: btError.message || 'Behavior tree execution failed',
            data: btError,
          };
        }
      }

      // Fallback to MCP server tool execution
      console.log(`[MCP] Executing option ${resolvedOptionId} via MCP server tool`);
      const result = await (this.mcpServer as any).executeTool('run_option', {
        id: resolvedOptionId,
        args: args || {},
      });

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Option execution failed',
        data: error.data,
      };
    }
  }

  /**
   * Resolve option version to a stable call signature
   */
  private async resolveOptionVersion(optionId: string): Promise<string> {
    // If optionId already has a version, return it
    if (optionId.includes('@')) {
      return optionId;
    }

    // Try to find the latest version of this option
    try {
      const options = await this.listOptions('active');
      const matchingOptions = options.filter(
        (opt: any) =>
          opt.name === optionId || opt.id?.startsWith(optionId + '@')
      );

      if (matchingOptions.length > 0) {
        // Return the first available option with version
        return matchingOptions[0].id || optionId;
      }
    } catch (error) {
      console.warn('[MCP] Failed to resolve option version:', error);
    }

    // Fallback: return the original optionId
    return optionId;
  }

  /**
   * Get MCP server status
   */
  getStatus(): { initialized: boolean; enabled: boolean } {
    return {
      initialized: this.isInitialized,
      enabled: this.config.enableMCP || false,
    };
  }

  /**
   * Get the underlying MCP server instance
   */
  getMCPServer(): ConsciousBotMCPServer | null {
    return this.mcpServer;
  }
}
