/**
 * Conscious Bot MCP Server Package
 *
 * Exports the production-ready MCP server implementation.
 *
 * @author @darianrosebrook
 */

export {
  ConsciousBotMCPServer,
  MCPServerDependencies,
} from './conscious-bot-mcp-server.js';
export { demoMCPServer } from './demo-mcp-server.js';

// Re-export core leaf factory types so consumers do not need to depend on core directly
export { LeafFactory } from '@conscious-bot/executor-contracts';
export type { LeafImpl } from '@conscious-bot/executor-contracts';

// Re-export MCP types for convenience
export type {
  Tool,
  Resource,
  Prompt,
} from '@modelcontextprotocol/sdk/types.js';
