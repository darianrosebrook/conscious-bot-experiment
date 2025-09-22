/**
 * End-to-End MCP Integration Tests
 *
 * Tests the complete flow from thought processing to MCP tool discovery,
 * execution, and evaluation. This ensures the entire MCP integration
 * pipeline works correctly.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, jest } from 'vitest';
import { CognitiveThoughtProcessor } from '../cognitive-thought-processor';
import {
  MCPIntegration,
  ToolDiscoveryResult,
  GoalToolMatch,
  ToolExecutionResult,
} from '../modules/mcp-integration';
import { EnhancedReactiveExecutor } from '../reactive-executor/enhanced-reactive-executor';

// Mock the MCP server for testing
jest.mock('@conscious-bot/mcp-server', () => ({
  ConsciousBotMCPServer: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    getTools: jest.fn(),
    executeTool: jest.fn(),
    listTools: jest.fn(),
    getResources: jest.fn(),
    readResource: jest.fn(),
    listOptions: jest.fn(),
    promoteOption: jest.fn(),
  })),
}));

describe('End-to-End MCP Integration', () => {
  let thoughtProcessor: CognitiveThoughtProcessor;
  let mcpIntegration: MCPIntegration;
  let reactiveExecutor: EnhancedReactiveExecutor;

  beforeEach(() => {
    // Initialize components with MCP integration enabled
    thoughtProcessor = new CognitiveThoughtProcessor({
      enableMCPIntegration: true,
      enableToolDiscovery: true,
      mcpEndpoint: 'http://localhost:3000',
      maxToolsPerThought: 3,
    });

    mcpIntegration = new MCPIntegration({
      enableMCP: true,
      enableToolDiscovery: true,
      toolDiscoveryEndpoint: 'http://localhost:3000',
      maxToolsPerGoal: 5,
      toolTimeoutMs: 30000,
    });

    reactiveExecutor = new EnhancedReactiveExecutor({
      enableMCPExecution: true,
      mcpEndpoint: 'http://localhost:3000',
      enableToolDiscovery: true,
      preferMCPForTaskTypes: ['action', 'cognitive_reflection'],
      fallbackToMinecraft: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Discovery Flow', () => {
    it('should discover tools for a gathering task', async () => {
      const thought = {
        type: 'planning' as const,
        content: 'I need to gather wood for building tools',
        attribution: 'test',
        category: 'resource_gathering',
        priority: 'medium' as const,
        id: 'test-thought-1',
        timestamp: Date.now(),
      };

      // Mock MCP tool discovery
      const mockTools = [
        {
          name: 'minecraft.gather_logs@1.0.0',
          description: 'Gather logs from nearby trees',
          inputSchema: {
            type: 'object',
            properties: { count: { type: 'number' } },
          },
          outputSchema: {
            type: 'object',
            properties: { logs: { type: 'number' } },
          },
          metadata: {
            version: '1.0.0',
            permissions: ['movement', 'dig'],
            category: 'gathering',
            tags: ['wood', 'logs', 'forestry'],
            complexity: 'simple' as const,
          },
        },
      ];

      // Mock the listTools method
      jest.spyOn(mcpIntegration, 'listTools').mockResolvedValue(mockTools);

      const discoveryResult = await mcpIntegration.discoverToolsForGoal(
        thought.id,
        thought.content,
        {
          thoughtType: thought.type,
          category: thought.category,
          priority: thought.priority,
        }
      );

      expect(discoveryResult.goalId).toBe(thought.id);
      expect(discoveryResult.goalDescription).toBe(thought.content);
      expect(discoveryResult.availableTools).toHaveLength(1);
      expect(discoveryResult.matchedTools).toHaveLength(1);
      expect(discoveryResult.matchedTools[0].tool.name).toBe(
        'minecraft.gather_logs@1.0.0'
      );
      expect(discoveryResult.matchedTools[0].relevance).toBeGreaterThan(0.3);
      expect(discoveryResult.matchedTools[0].reasoning).toContain(
        'matches goal'
      );
    });

    it('should match tools based on goal complexity', async () => {
      const simpleThought = {
        type: 'planning' as const,
        content: 'I need to move to a safe location',
        attribution: 'test',
        category: 'safety',
        priority: 'low' as const,
        id: 'test-thought-simple',
        timestamp: Date.now(),
      };

      const complexThought = {
        type: 'planning' as const,
        content: 'I need to build a complex automated farm with redstone',
        attribution: 'test',
        category: 'building',
        priority: 'high' as const,
        id: 'test-thought-complex',
        timestamp: Date.now(),
      };

      const mockTools = [
        {
          name: 'minecraft.move_to@1.0.0',
          description: 'Move to a specific location',
          inputSchema: {
            type: 'object',
            properties: { position: { type: 'object' } },
          },
          outputSchema: {
            type: 'object',
            properties: { position: { type: 'object' } },
          },
          metadata: {
            version: '1.0.0',
            permissions: ['movement'],
            category: 'movement',
            complexity: 'simple' as const,
          },
        },
        {
          name: 'minecraft.build_farm@1.0.0',
          description: 'Build a complex automated farm system',
          inputSchema: {
            type: 'object',
            properties: { type: { type: 'string' } },
          },
          outputSchema: {
            type: 'object',
            properties: { farm: { type: 'object' } },
          },
          metadata: {
            version: '1.0.0',
            permissions: ['place', 'dig', 'craft'],
            category: 'building',
            complexity: 'complex' as const,
          },
        },
      ];

      jest.spyOn(mcpIntegration, 'listTools').mockResolvedValue(mockTools);

      const simpleDiscovery = await mcpIntegration.discoverToolsForGoal(
        simpleThought.id,
        simpleThought.content
      );

      const complexDiscovery = await mcpIntegration.discoverToolsForGoal(
        complexThought.id,
        complexThought.content
      );

      expect(simpleDiscovery.matchedTools[0].tool.metadata.complexity).toBe(
        'simple'
      );
      expect(complexDiscovery.matchedTools[0].tool.metadata.complexity).toBe(
        'complex'
      );
    });
  });

  describe('Tool Execution Flow', () => {
    it('should execute a tool with evaluation', async () => {
      const tool = {
        name: 'minecraft.gather_logs@1.0.0',
        description: 'Gather logs from nearby trees',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        metadata: {
          version: '1.0.0',
          timeoutMs: 30000,
          retries: 3,
          permissions: ['movement', 'dig'],
          category: 'gathering',
        },
      };

      const args = { count: 5 };

      // Mock successful tool execution
      const mockResult = {
        success: true,
        data: { logs: 5, position: { x: 10, y: 64, z: 10 } },
        metrics: { executionTime: 2500, blocksBroken: 5 },
      };

      jest.spyOn(mcpIntegration, 'executeTool').mockResolvedValue(mockResult);

      const executionResult = await mcpIntegration.executeToolWithEvaluation(
        tool,
        args,
        'test-goal-1',
        {
          worldState: {
            position: { x: 0, y: 64, z: 0 },
            inventory: { items: [], selectedSlot: 0 },
          },
          expectedOutcome: 'item_collected',
        }
      );

      expect(executionResult.success).toBe(true);
      expect(executionResult.toolName).toBe('minecraft.gather_logs@1.0.0');
      expect(executionResult.evaluation.completed).toBe(true);
      expect(executionResult.evaluation.effectiveness).toBeGreaterThan(0.5);
      expect(executionResult.evaluation.sideEffects).toEqual([]);
      expect(executionResult.evaluation.recommendation).toBe('success');
    });

    it('should handle tool execution failures', async () => {
      const tool = {
        name: 'minecraft.gather_logs@1.0.0',
        description: 'Gather logs from nearby trees',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        metadata: {
          version: '1.0.0',
          timeoutMs: 30000,
          retries: 3,
          permissions: ['movement', 'dig'],
          category: 'gathering',
        },
      };

      const args = { count: 5 };

      // Mock failed tool execution
      const mockResult = {
        success: false,
        error: 'No trees found in area',
        metrics: { executionTime: 1000 },
      };

      jest.spyOn(mcpIntegration, 'executeTool').mockResolvedValue(mockResult);

      const executionResult = await mcpIntegration.executeToolWithEvaluation(
        tool,
        args,
        'test-goal-1'
      );

      expect(executionResult.success).toBe(false);
      expect(executionResult.error).toBe('No trees found in area');
      expect(executionResult.evaluation.completed).toBe(false);
      expect(executionResult.evaluation.effectiveness).toBe(0);
      expect(executionResult.evaluation.sideEffects).toContain(
        'Tool execution failed'
      );
      expect(executionResult.evaluation.recommendation).toBe('failure');
    });

    it('should evaluate tool effectiveness correctly', async () => {
      const tool = {
        name: 'minecraft.gather_logs@1.0.0',
        description: 'Gather logs from nearby trees',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        metadata: {
          version: '1.0.0',
          timeoutMs: 10000, // Fast execution
          permissions: ['movement', 'dig'],
        },
      };

      const args = { count: 5 };

      // Mock successful but slow execution
      const mockResult = {
        success: true,
        data: { logs: 3 }, // Only got 3 instead of 5
        metrics: { executionTime: 15000 }, // Took longer than expected
      };

      jest.spyOn(mcpIntegration, 'executeTool').mockResolvedValue(mockResult);

      const executionResult = await mcpIntegration.executeToolWithEvaluation(
        tool,
        args,
        'test-goal-1',
        {
          expectedOutcome: 'item_collected',
          expectedCount: 5,
        }
      );

      expect(executionResult.success).toBe(true);
      expect(executionResult.evaluation.completed).toBe(true);
      expect(executionResult.evaluation.effectiveness).toBeLessThan(0.8); // Reduced due to partial success
      expect(executionResult.evaluation.sideEffects).toContain(
        'Tool execution took longer than expected'
      );
      expect(executionResult.evaluation.recommendation).toBe('partial_success');
    });
  });

  describe('Thought Processing with Tools', () => {
    it('should process a thought and discover/execute appropriate tools', async () => {
      const thought = {
        type: 'planning' as const,
        content: 'I need to gather wood for building tools and shelter',
        attribution: 'test',
        category: 'resource_gathering',
        priority: 'high' as const,
        id: 'test-thought-processing',
        timestamp: Date.now(),
      };

      // Mock world state
      const mockWorldState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: { items: [], selectedSlot: 0, freeSlots: 36 },
        environment: 'forest',
        time: 'day',
        biome: 'forest',
        nearbyEntities: [],
        threats: [],
      };

      thoughtProcessor.updateWorldState(mockWorldState);

      // Mock MCP tool discovery and execution
      const mockTools = [
        {
          name: 'minecraft.gather_logs@1.0.0',
          description: 'Gather logs from nearby trees',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          metadata: {
            version: '1.0.0',
            permissions: ['movement', 'dig'],
            category: 'gathering',
            tags: ['wood', 'logs'],
            complexity: 'simple' as const,
          },
        },
      ];

      const mockToolResult = {
        success: true,
        data: { logs: 8, position: { x: 5, y: 64, z: 5 } },
        metrics: { executionTime: 3000, blocksBroken: 8 },
      };

      jest.spyOn(mcpIntegration, 'listTools').mockResolvedValue(mockTools);
      jest
        .spyOn(mcpIntegration, 'executeTool')
        .mockResolvedValue(mockToolResult);

      const result = await thoughtProcessor.processThoughtWithTools(thought);

      expect(result.task).toBeDefined();
      expect(result.task.type).toBe('cognitive_reflection');
      expect(result.discoveredTools).toBeDefined();
      expect(result.discoveredTools.matchedTools).toHaveLength(1);
      expect(result.executedTools).toHaveLength(1);
      expect(result.executedTools[0].success).toBe(true);
      expect(result.toolEvaluation).toBeDefined();
      expect(result.toolEvaluation.overallSuccess).toBe(true);
      expect(result.toolEvaluation.effectiveness).toBeGreaterThan(0.5);
    });

    it('should handle tool discovery failures gracefully', async () => {
      const thought = {
        type: 'planning' as const,
        content: 'I need to do something impossible',
        attribution: 'test',
        category: 'impossible',
        priority: 'high' as const,
        id: 'test-thought-impossible',
        timestamp: Date.now(),
      };

      // Mock MCP failure
      jest
        .spyOn(mcpIntegration, 'listTools')
        .mockRejectedValue(new Error('MCP server unavailable'));

      const result = await thoughtProcessor.processThoughtWithTools(thought);

      expect(result.task).toBeDefined();
      expect(result.discoveredTools.matchedTools).toHaveLength(0);
      expect(result.executedTools).toHaveLength(0);
      expect(result.toolEvaluation.recommendations).toContain(
        'Try alternative tools or approaches'
      );
    });
  });

  describe('Reactive Executor MCP Integration', () => {
    it('should prefer MCP execution for certain task types', async () => {
      const task = {
        type: 'cognitive_reflection',
        title: 'Process cognitive reflection about wood gathering',
        description: 'Analyze the need for wood and plan gathering strategy',
        parameters: { topic: 'resource_gathering', resource: 'wood' },
        priority: 0.8,
        urgency: 0.6,
        id: 'test-task-mcp-preferred',
        metadata: {
          useMCP: true,
        },
      };

      // Mock successful MCP execution
      const mockMCPResult = {
        success: true,
        type: task.type,
        executionMethod: 'mcp',
        executionTime: 2500,
        toolResult: {
          toolName: 'minecraft.analyze_gathering@1.0.0',
          effectiveness: 0.9,
          sideEffects: [],
          recommendation: 'success',
        },
        result: {
          analysis: 'Wood gathering strategy planned',
          priority: 'high',
        },
      };

      jest.spyOn(reactiveExecutor, 'shouldUseMCPForTask').mockReturnValue(true);
      jest
        .spyOn(reactiveExecutor, 'executeTaskViaMCP')
        .mockResolvedValue(mockMCPResult);

      const result = await reactiveExecutor.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.executionMethod).toBe('mcp');
      expect(result.toolResult).toBeDefined();
      expect(result.toolResult.effectiveness).toBe(0.9);
    });

    it('should fall back to Minecraft execution when MCP fails', async () => {
      const task = {
        type: 'action',
        title: 'Gather wood',
        description: 'Collect wood logs from nearby trees',
        parameters: { count: 5 },
        priority: 0.7,
        urgency: 0.5,
        id: 'test-task-mcp-fallback',
      };

      // Mock MCP failure and Minecraft success
      jest.spyOn(reactiveExecutor, 'shouldUseMCPForTask').mockReturnValue(true);
      jest
        .spyOn(reactiveExecutor, 'executeTaskViaMCP')
        .mockRejectedValue(new Error('MCP unavailable'));

      // Mock Minecraft execution success
      const mockMinecraftResult = {
        success: true,
        type: task.type,
        executionMethod: 'minecraft',
        executionTime: 3000,
        result: { logs: 5 },
      };

      jest
        .spyOn(reactiveExecutor, 'executeGatherTask')
        .mockResolvedValue(mockMinecraftResult);

      const result = await reactiveExecutor.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.executionMethod).toBe('minecraft'); // Should fall back
    });
  });

  describe('Evaluation and Feedback Loop', () => {
    it('should collect and analyze tool execution statistics', async () => {
      const feedback1 = {
        toolName: 'minecraft.gather_logs@1.0.0',
        goalId: 'test-goal-1',
        executionId: 'exec_1',
        success: true,
        effectiveness: 0.9,
        userFeedback: 'positive' as const,
        notes: 'Tool worked perfectly',
        timestamp: Date.now(),
      };

      const feedback2 = {
        toolName: 'minecraft.gather_logs@1.0.0',
        goalId: 'test-goal-2',
        executionId: 'exec_2',
        success: false,
        effectiveness: 0.2,
        userFeedback: 'negative' as const,
        notes: 'Tool failed to find trees',
        timestamp: Date.now(),
      };

      mcpIntegration.submitEvaluationFeedback(feedback1);
      mcpIntegration.submitEvaluationFeedback(feedback2);

      const stats = mcpIntegration.getEvaluationStatistics();

      expect(stats.totalEvaluations).toBe(2);
      expect(stats.successRate).toBe(0.5); // 1 success out of 2
      expect(stats.averageEffectiveness).toBe(0.55); // (0.9 + 0.2) / 2
      expect(stats.toolStats['minecraft.gather_logs@1.0.0']).toBeDefined();
      expect(stats.toolStats['minecraft.gather_logs@1.0.0'].executions).toBe(2);
      expect(stats.toolStats['minecraft.gather_logs@1.0.0'].successRate).toBe(
        0.5
      );
    });

    it('should update task priority based on tool success', async () => {
      const originalTask = {
        type: 'action',
        title: 'Test Task',
        description: 'A test task',
        priority: 0.5,
        urgency: 0.5,
        parameters: {},
        id: 'test-task-feedback',
        metadata: {},
      };

      const executedTools: ToolExecutionResult[] = [
        {
          toolName: 'minecraft.test_tool@1.0.0',
          success: true,
          executionTime: 2000,
          result: { completed: true },
          evaluation: {
            completed: true,
            effectiveness: 0.9,
            sideEffects: [],
            recommendation: 'success',
          },
        },
      ];

      const toolEvaluation = {
        overallSuccess: true,
        effectiveness: 0.9,
        recommendations: ['Tool was highly effective'],
        nextActions: ['Continue with current approach'],
      };

      const enhancedTask = (thoughtProcessor as any).enhanceTaskWithToolResults(
        originalTask,
        executedTools,
        toolEvaluation
      );

      expect(enhancedTask.priority).toBeGreaterThan(originalTask.priority);
      expect(enhancedTask.metadata.toolExecution).toBeDefined();
      expect(enhancedTask.metadata.toolExecution.toolsExecuted).toBe(1);
      expect(enhancedTask.metadata.toolExecution.successfulTools).toBe(1);
      expect(enhancedTask.metadata.toolExecution.averageEffectiveness).toBe(
        0.9
      );
    });
  });

  describe('Integration Error Handling', () => {
    it('should handle MCP server unavailability gracefully', async () => {
      const thought = {
        type: 'planning' as const,
        content: 'I need to gather resources',
        attribution: 'test',
        category: 'resource_gathering',
        priority: 'high' as const,
        id: 'test-thought-unavailable',
        timestamp: Date.now(),
      };

      // Mock MCP server completely unavailable
      jest
        .spyOn(mcpIntegration, 'initialize')
        .mockRejectedValue(new Error('Connection failed'));

      const result = await thoughtProcessor.processThoughtWithTools(thought);

      expect(result.task).toBeDefined();
      expect(result.discoveredTools.matchedTools).toHaveLength(0);
      expect(result.executedTools).toHaveLength(0);
      expect(result.toolEvaluation.recommendations).toContain(
        'Try alternative tools or approaches'
      );
    });

    it('should handle partial MCP failures', async () => {
      const thought = {
        type: 'planning' as const,
        content: 'I need to gather wood and stone',
        attribution: 'test',
        category: 'resource_gathering',
        priority: 'high' as const,
        id: 'test-thought-partial',
        timestamp: Date.now(),
      };

      // Mock partial tool discovery success
      jest.spyOn(mcpIntegration, 'listTools').mockResolvedValue([]);
      jest.spyOn(mcpIntegration, 'discoverToolsForGoal').mockResolvedValue({
        goalId: thought.id,
        goalDescription: thought.content,
        availableTools: [],
        matchedTools: [],
        discoveryTime: 100,
        totalTools: 0,
        matchedCount: 0,
      });

      const result = await thoughtProcessor.processThoughtWithTools(thought);

      expect(result.task).toBeDefined();
      expect(result.discoveredTools.matchedTools).toHaveLength(0);
      expect(result.toolEvaluation.overallSuccess).toBe(false);
      expect(result.toolEvaluation.nextActions).toContain(
        'Try alternative tools or approaches'
      );
    });
  });
});
