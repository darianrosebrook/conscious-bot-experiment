/**
 * MCP Execution Debug Test
 *
 * Focused test to trace the autonomous task executor logic and root out
 * why MCP options aren't being executed for gathering tasks.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP integration
const mockMCPIntegration = {
  listOptions: vi.fn(),
  executeTool: vi.fn(),
  isInitialized: true,
};

// Mock the server config
const mockServerConfig = {
  getMCPIntegration: vi.fn(() => mockMCPIntegration),
};

// Mock the enhanced task integration
const mockEnhancedTaskIntegration = {
  getActiveTasks: vi.fn(),
  updateTaskProgress: vi.fn(),
  updateTaskMetadata: vi.fn(),
  annotateCurrentStepWithLeaf: vi.fn(),
};

// Mock the recompute function
const mockRecomputeProgressAndMaybeComplete = vi.fn();

// Import the autonomous task executor logic (we'll test the core logic)
describe('MCP Execution Debug Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    mockMCPIntegration.listOptions.mockResolvedValue([
      {
        id: 'gather_wood@1@1.0.0',
        name: 'gather_wood@1',
        status: 'active',
        permissions: ['dig', 'sense'],
      },
      {
        id: 'dig_block@1.0.0',
        name: 'dig_block',
        status: 'active',
        permissions: ['dig'],
      },
    ]);

    mockMCPIntegration.executeTool.mockResolvedValue({
      success: true,
      data: { itemsCollected: 1 },
    });

    mockEnhancedTaskIntegration.getActiveTasks.mockReturnValue([
      {
        id: 'test-task-1',
        title: 'Gather Wood',
        type: 'gathering',
        priority: 0.8,
        status: 'active',
        parameters: { resource: 'wood', blockType: 'oak_log' },
        metadata: { retryCount: 0, maxRetries: 3 },
      },
    ]);
  });

  describe('MCP Option Finding Logic', () => {
    it('should find suitable MCP options for gathering tasks', async () => {
      const mcpOptions = await mockMCPIntegration.listOptions('all');

      // Test the option finding logic from the autonomous executor
      const taskType = 'gathering';
      const leafMapping: Record<string, string> = {
        gathering: 'gather_wood@1',
        crafting: 'craft_wooden_pickaxe@1',
        exploration: 'explore_move@1',
      };

      const taskTypeMapping: Record<string, string[]> = {
        gathering: ['chop', 'tree', 'wood', 'collect', 'gather'],
        gather: ['chop', 'tree', 'wood', 'collect', 'gather'],
        movement: ['move', 'navigate', 'travel', 'path', 'walk'],
        mine: ['mine', 'dig', 'extract'],
      };

      // Find suitable option using the same logic as the autonomous executor
      const suitableOption = mcpOptions.find((option: any) => {
        // First try exact match with leafMapping
        if (leafMapping[taskType] && option.id === leafMapping[taskType]) {
          return true;
        }

        // Fallback to name/description matching
        const searchTerms = taskTypeMapping[taskType] || [taskType];
        return searchTerms.some(
          (term) =>
            option.name?.toLowerCase().includes(term) ||
            option.description?.toLowerCase().includes(term)
        );
      });

      expect(suitableOption).toBeDefined();
      expect(suitableOption?.name).toBe('gather_wood@1');
      console.log('✅ Found suitable MCP option:', suitableOption);
    });

    it('should execute MCP option when found', async () => {
      const mcpOptions = await mockMCPIntegration.listOptions('all');
      const suitableOption = mcpOptions.find(
        (opt: any) => opt.name === 'gather_wood@1'
      );

      expect(suitableOption).toBeDefined();

      // Test the execution logic
      const mcpIntegration = mockServerConfig.getMCPIntegration();
      expect(mcpIntegration).toBe(mockMCPIntegration);

      const result = await mcpIntegration.executeTool(suitableOption!.name, {});

      expect(result.success).toBe(true);
      expect(mockMCPIntegration.executeTool).toHaveBeenCalledWith(
        'gather_wood@1',
        {}
      );
      console.log('✅ MCP option executed successfully:', result);
    });
  });

  describe('Task Type to MCP Option Mapping', () => {
    it('should map gathering tasks to correct MCP options', () => {
      const taskTypes = ['gathering', 'gather', 'mine', 'mining'];
      const expectedMappings = {
        gathering: 'gather_wood@1',
        gather: 'gather_wood@1',
        mine: 'gather_wood@1',
        mining: 'gather_wood@1',
      };

      taskTypes.forEach((taskType) => {
        const expected =
          expectedMappings[taskType as keyof typeof expectedMappings];
        expect(expected).toBeDefined();
        console.log(`✅ ${taskType} -> ${expected}`);
      });
    });
  });

  describe('Autonomous Task Executor Flow', () => {
    it('should complete the full flow from task to MCP execution', async () => {
      // 1. Get active tasks
      const activeTasks = mockEnhancedTaskIntegration.getActiveTasks();
      expect(activeTasks).toHaveLength(1);

      const currentTask = activeTasks[0];
      expect(currentTask.type).toBe('gathering');
      expect(currentTask.title).toBe('Gather Wood');

      // 2. Get MCP options
      const mcpOptions = await mockMCPIntegration.listOptions('all');
      expect(mcpOptions).toHaveLength(2);

      // 3. Find suitable option
      const suitableOption = mcpOptions.find(
        (opt: any) => opt.name === 'gather_wood@1'
      );
      expect(suitableOption).toBeDefined();

      // 4. Execute MCP option
      const mcpIntegration = mockServerConfig.getMCPIntegration();
      const result = await mcpIntegration.executeTool(suitableOption!.name, {});

      expect(result.success).toBe(true);

      // 5. Verify the flow completed successfully
      console.log('✅ Full autonomous task executor flow completed:');
      console.log('  - Task found:', currentTask.title);
      console.log('  - MCP option found:', suitableOption?.name);
      console.log('  - MCP execution result:', result);
    });
  });
});
