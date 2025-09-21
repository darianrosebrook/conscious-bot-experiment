/**
 * Modular Server Test
 *
 * Tests for the new modular server implementation.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServerConfiguration } from './modules/server-config';
import { MCPIntegration } from './modules/mcp-integration';
import {
  createPlanningEndpoints,
  PlanningSystem,
} from './modules/planning-endpoints';

describe('Modular Server', () => {
  let serverConfig: ServerConfiguration;
  let mcpIntegration: MCPIntegration;

  beforeEach(() => {
    serverConfig = new ServerConfiguration({
      port: 3007, // Use different port for testing
      enableMCP: true,
    });

    mcpIntegration = new MCPIntegration();
  });

  afterEach(() => {
    // Clean up any resources
  });

  it('should create server configuration', () => {
    expect(serverConfig).toBeDefined();
    expect(serverConfig.getConfig().port).toBe(3007);
    expect(serverConfig.getConfig().enableMCP).toBe(true);
  });

  it('should create MCP integration', () => {
    expect(mcpIntegration).toBeDefined();
    expect(mcpIntegration.getStatus().enabled).toBe(true);
  });

  it('should create planning endpoints', () => {
    const mockPlanningSystem: PlanningSystem = {
      goalFormulation: {
        getCurrentGoals: () => [],
        getActiveGoals: () => [],
        getGoalCount: () => 0,
        getCurrentTasks: () => [],
        addTask: () => {},
        getCompletedTasks: () => [],
      },
      execution: {
        executeGoal: async () => ({ success: true }),
        executeTask: async () => ({ success: true }),
      },
    };

    const router = createPlanningEndpoints(mockPlanningSystem);
    expect(router).toBeDefined();
  });

  it('should handle MCP tool execution', async () => {
    await mcpIntegration.initialize();

    const result = await mcpIntegration.executeTool('test_tool', {
      test: 'data',
    });
    expect(result.success).toBe(false); // Should fail without proper setup
    expect(result.error).toBeDefined();
  });

  it('should handle MCP option registration', async () => {
    await mcpIntegration.initialize();

    const result = await mcpIntegration.registerOption({
      id: 'test_option',
      name: 'Test Option',
      description: 'A test option',
      btDefinition: {
        root: {
          type: 'sequence',
          children: [],
        },
      },
    });

    // The registration should succeed with the fallback in-memory storage
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should list tools from MCP', async () => {
    await mcpIntegration.initialize();

    const tools = await mcpIntegration.listTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should list options from MCP', async () => {
    await mcpIntegration.initialize();

    const options = await mcpIntegration.listOptions();
    expect(Array.isArray(options)).toBe(true);
  });
});
