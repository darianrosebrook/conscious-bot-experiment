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

// Re-export MCP types for convenience
export type {
  Tool,
  Resource,
  Prompt,
} from '@modelcontextprotocol/sdk/types.js';
