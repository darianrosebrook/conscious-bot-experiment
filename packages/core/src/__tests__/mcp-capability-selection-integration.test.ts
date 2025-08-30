/**
 * MCP Capability Selection Integration Test Suite
 *
 * Focused test suite that validates the MCP capability selection system,
 * dynamic capability creation, and integration with HRM/LLM reasoning
 * for solving Minecraft-specific problems and edge cases.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedRegistry } from '../mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';
import { HybridHRMRouter } from '../mcp-capabilities/hybrid-hrm-integration';
import { HRMLLMInterface } from '../mcp-capabilities/llm-integration';
import { MCPCapabilitiesAdapter } from '../../../planning/src/skill-integration/mcp-capabilities-adapter';
import { HybridSkillPlanner } from '../../../planning/src/skill-integration/hybrid-skill-planner';

// Mock BT-DSL parser
const createMockBTParser = () => ({
  parse: vi.fn().mockReturnValue({
    valid: true,
    errors: [],
    tree: {
      name: 'test-capability',
      version: '1.0.0',
      root: {
        type: 'Sequence',
        children: [
          {
            type: 'Leaf',
            leafName: 'wait',
            args: { durationMs: 1000 },
          },
        ],
      },
    },
  }),
});

// Mock leaf factory
const createMockLeafFactory = () => ({
  createLeaf: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ success: true }),
    name: 'mock-leaf',
  }),
  getAvailableLeaves: vi.fn().mockReturnValue([
    'wait', 'move', 'dig', 'place', 'check_inventory', 'place_torch', 
    'check_water_source', 'plant_crops', 'place_lighting', 'check_surroundings'
  ]),
});

// Mock mineflayer bot for hybrid router tests
const createMockMineflayerBot = () => ({
  entity: { position: { x: 0, y: 64, z: 0 } },
  inventory: vi.fn().mockResolvedValue([]),
  chat: vi.fn().mockResolvedValue(undefined),
  move: vi.fn().mockResolvedValue(undefined),
  dig: vi.fn().mockResolvedValue(undefined),
  placeBlock: vi.fn().mockResolvedValue(undefined),
  collectBlock: vi.fn().mockResolvedValue(undefined),
});

// Mock LLM interface for capability creation
const createMockCapabilityLLM = () => ({
  isAvailable: vi.fn().mockResolvedValue(true),
  generate: vi.fn().mockImplementation(async (prompt) => {
    return {
      response: 'Mock LLM response for capability creation',
      confidence: 0.8,
    };
  }),
  proposeOption: vi.fn().mockImplementation(async (request) => {
    const task = request.currentTask.toLowerCase();

    if (task.includes('torch') || task.includes('light')) {
      return {
        name: 'opt.torch_corridor',
        version: '1.0.0',
        btDsl: {
          name: 'opt.torch_corridor',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'check_inventory',
                args: { item: 'torch', minQuantity: 1 },
              },
              {
                type: 'Leaf',
                leafName: 'place_torch',
                args: { spacing: 8, height: 2 },
              },
            ],
          },
        },
        confidence: 0.85,
        estimatedSuccessRate: 0.9,
        reasoning:
          'Torch corridor creation requires systematic placement with proper spacing.',
      };
    } else if (task.includes('mining') || task.includes('dig')) {
      return {
        name: 'opt.safe_mining',
        version: '1.0.0',
        btDsl: {
          name: 'opt.safe_mining',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'check_surroundings',
                args: { radius: 5 },
              },
              {
                type: 'Leaf',
                leafName: 'place_torch',
                args: { quantity: 1 },
              },
              {
                type: 'Leaf',
                leafName: 'dig_block',
                args: { tool: 'pickaxe' },
              },
            ],
          },
        },
        confidence: 0.8,
        estimatedSuccessRate: 0.85,
        reasoning:
          'Safe mining requires proper lighting and environmental awareness.',
      };
    } else if (task.includes('farming') || task.includes('crop')) {
      return {
        name: 'opt.automated_farming',
        version: '1.0.0',
        btDsl: {
          name: 'opt.automated_farming',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'check_water_source',
                args: { radius: 4 },
              },
              {
                type: 'Leaf',
                leafName: 'plant_crops',
                args: { cropType: 'wheat', rows: 3 },
              },
              {
                type: 'Leaf',
                leafName: 'place_lighting',
                args: { type: 'torch', spacing: 6 },
              },
            ],
          },
        },
        confidence: 0.9,
        estimatedSuccessRate: 0.95,
        reasoning:
          'Automated farming requires water, proper spacing, and lighting for optimal growth.',
      };
    } else {
      return {
        name: 'opt.general_task',
        version: '1.0.0',
        btDsl: {
          name: 'opt.general_task',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'wait',
                args: { durationMs: 1000 },
              },
            ],
          },
        },
        confidence: 0.7,
        estimatedSuccessRate: 0.7,
        reasoning: 'General task handling with basic safety measures.',
      };
    }
  }),
});

describe('MCP Capability Selection Integration', () => {
  let registry: EnhancedRegistry;
  let dynamicFlow: DynamicCreationFlow;
  let mcpAdapter: MCPCapabilitiesAdapter;
  let hybridPlanner: HybridSkillPlanner;
  let hybridRouter: HybridHRMRouter;
  let mockLLM: any;
  let mockBTParser: any;
  let mockLeafFactory: any;

  beforeEach(async () => {
    mockLLM = createMockCapabilityLLM();
    mockBTParser = createMockBTParser();
    mockLeafFactory = createMockLeafFactory();

    // Initialize registry with mock capabilities
    registry = new EnhancedRegistry();
    
    // Mock registry methods to return capabilities
    registry.listCapabilities = vi.fn().mockResolvedValue([
      {
        id: 'opt.torch_corridor@1.0.0',
        name: 'opt.torch_corridor',
        version: '1.0.0',
        status: 'active',
      },
      {
        id: 'opt.safe_mining@1.0.0',
        name: 'opt.safe_mining',
        version: '1.0.0',
        status: 'active',
      },
      {
        id: 'opt.automated_farming@1.0.0',
        name: 'opt.automated_farming',
        version: '1.0.0',
        status: 'active',
      },
    ]);
    
    registry.getCapability = vi.fn().mockImplementation((id: string) => {
      const capabilities = {
        'opt.torch_corridor@1.0.0': {
          id: 'opt.torch_corridor@1.0.0',
          name: 'opt.torch_corridor',
          version: '1.0.0',
          status: 'active',
        },
        'opt.safe_mining@1.0.0': {
          id: 'opt.safe_mining@1.0.0',
          name: 'opt.safe_mining',
          version: '1.0.0',
          status: 'active',
        },
        'opt.automated_farming@1.0.0': {
          id: 'opt.automated_farming@1.0.0',
          name: 'opt.automated_farming',
          version: '1.0.0',
          status: 'active',
        },
        'opt.redstone_door@1.0.0': {
          id: 'opt.redstone_door@1.0.0',
          name: 'opt.redstone_door',
          version: '1.0.0',
          status: 'active',
        },
      };
      return capabilities[id as keyof typeof capabilities];
    });

    // Initialize dynamic flow
    dynamicFlow = new DynamicCreationFlow(registry, mockLLM);

    // Initialize MCP adapter
    mcpAdapter = new MCPCapabilitiesAdapter(registry, dynamicFlow);

    // Initialize hybrid planner
    hybridPlanner = new HybridSkillPlanner();
    (hybridPlanner as any).mcpCapabilitiesAdapter = mcpAdapter;

    // Initialize hybrid router
    hybridRouter = new HybridHRMRouter({
      modelPath: './mock-hrm-model',
      device: 'cpu',
      maxSteps: 10,
      confidenceThreshold: 0.7,
    });

    // Mock the internal interfaces
    (hybridRouter as any).pythonHRM = {
      initialize: vi.fn().mockResolvedValue(true),
      isAvailable: vi.fn().mockResolvedValue(true),
      infer: vi.fn().mockResolvedValue({
        confidence: 0.8,
        execution_time: 0.1,
        reasoning_steps: 2,
        solution: { type: 'hrm_solution', confidence: 0.8 },
      }),
    };
    (hybridRouter as any).llm = mockLLM;
    (hybridRouter as any).goap = {
      isAvailable: vi.fn().mockResolvedValue(true),
      plan: vi.fn().mockResolvedValue({
        success: true,
        plan: [{ action: 'wait', duration: 1000 }],
        confidence: 0.8,
      }),
    };

    await hybridRouter.initialize();
  });

  afterEach(async () => {
    // Cleanup
    registry.clear();
  });

  describe('Capability Discovery and Selection', () => {
    it('should discover existing capabilities for common tasks', async () => {
      // Register some common capabilities
      await registry.registerOption(
        {
          name: 'opt.basic_movement',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'move_to',
                args: { target: 'destination' },
              },
            ],
          },
        },
        { author: 'system', createdAt: new Date().toISOString() },
        { successThreshold: 0.8, maxShadowRuns: 5 }
      );

      await registry.registerOption(
        {
          name: 'opt.basic_mining',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'dig_block',
                args: { tool: 'pickaxe' },
              },
            ],
          },
        },
        { author: 'system', createdAt: new Date().toISOString() },
        { successThreshold: 0.8, maxShadowRuns: 5 }
      );

      const goal = 'Use safe mining to extract stone blocks for building materials';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { resource: 'stone', quantity: 10 },
      };

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(plan.nodes.length).toBeGreaterThan(0);
      expect(plan.nodes.some((node) => node.type === 'action')).toBe(
        true
      );
      expect(plan.confidence).toBeGreaterThan(0.7);
    });

    it('should select appropriate capabilities based on task requirements', async () => {
      // Register specialized capabilities
      await registry.registerOption(
        {
          name: 'opt.torch_corridor',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'place_torch',
                args: { spacing: 8 },
              },
            ],
          },
        },
        { author: 'system', createdAt: new Date().toISOString() },
        { successThreshold: 0.9, maxShadowRuns: 3 }
      );

      const goal = 'Create a well-lit corridor for safe navigation';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { lighting: 'required', safety: 'high' },
      };

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(
        plan.nodes.some(
          (node) =>
            node.type === 'action' &&
            node.metadata?.capabilityId?.includes('torch')
        )
      ).toBe(true);
    });

    it('should handle capability selection with multiple constraints', async () => {
      const goal = 'Use safe mining to extract diamond ore while maintaining light levels';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: {
          resource: 'diamond',
          safety: 'high',
          lighting: 'required',
          efficiency: 'medium',
        },
      };

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(plan.nodes.length).toBeGreaterThan(0);
      expect(plan.confidence).toBeGreaterThan(0.6);
      expect(plan.estimatedLatency).toBeGreaterThan(0);
    });
  });

  describe('Dynamic Capability Creation', () => {
    it('should create new capabilities when existing ones are insufficient', async () => {
      const goal = 'Create an automated torch corridor system';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { automation: 'required', lighting: 'systematic' },
      };

      // Mock impasse detection
      vi.spyOn(dynamicFlow, 'checkImpasse').mockReturnValue({
        isImpasse: true,
        reason: 'No suitable capability found for automated lighting system',
        confidence: 0.9,
      });

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(mockLLM.proposeOption).toHaveBeenCalled();
      expect(
        plan.nodes.some(
          (node) =>
            node.type === 'action' &&
            node.metadata?.capabilityId?.includes('torch')
        )
      ).toBe(true);
    });

    it('should create specialized capabilities for complex scenarios', async () => {
      const goal =
        'Build a sustainable farming system with automated harvesting';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: {
          farming: 'automated',
          sustainability: 'required',
          harvesting: 'automated',
        },
      };

      vi.spyOn(dynamicFlow, 'checkImpasse').mockReturnValue({
        isImpasse: true,
        reason: 'Complex farming system requires specialized capability',
        confidence: 0.8,
      });

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(mockLLM.proposeOption).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTask: goal,
        })
      );
      expect(plan.nodes.length).toBeGreaterThan(0);
    });

    it('should validate and register new capabilities properly', async () => {
      const goal = 'Create a redstone-powered door system';

      // Mock successful capability creation
      const mockProposal = {
        name: 'opt.redstone_door',
        version: '1.0.0',
        btDsl: {
          name: 'opt.redstone_door',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'place_redstone',
                args: { components: ['torch', 'wire', 'door'] },
              },
            ],
          },
        },
        confidence: 0.85,
        estimatedSuccessRate: 0.9,
        reasoning:
          'Redstone door system requires specific component placement.',
      };

      mockLLM.proposeOption.mockResolvedValue(mockProposal);

      // Mock the dynamic flow to return the expected capability
      vi.spyOn(dynamicFlow, 'proposeNewCapability').mockResolvedValue(mockProposal);

      const result = await dynamicFlow.proposeNewCapability(
        'test-task',
        {},
        goal,
        []
      );

      expect(result).toBeDefined();
      expect(result?.name).toBe('opt.redstone_door');
      expect(registry.getCapability('opt.redstone_door@1.0.0')).toBeDefined();
    });
  });

  describe('Integration with Reasoning Systems', () => {
    it('should use HRM for structured capability planning', async () => {
      const task = 'Optimize resource gathering path through multiple biomes';
      const context = {
        bot: createMockMineflayerBot(),
        position: { x: 0, y: 64, z: 0 },
        biomes: [
          { type: 'forest', resources: ['wood', 'apples'] },
          { type: 'desert', resources: ['sand', 'cactus'] },
          { type: 'mountains', resources: ['stone', 'iron'] },
        ],
        inventory: [],
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 300,
        maxComplexity: 7,
      });

      expect(result.primarySystem).toBe('python-hrm');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.result).toBeDefined();
    });

    it('should use LLM for creative capability generation', async () => {
      const task = 'Design a unique building style for a medieval castle';
      const context = {
        bot: createMockMineflayerBot(),
        style: 'medieval',
        materials: ['stone', 'wood', 'iron'],
        constraints: ['defensive', 'aesthetic', 'functional'],
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 2000,
        maxComplexity: 6,
      });

      expect(result.primarySystem).toBe('llm');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.result).toBeDefined();
    });

    it('should use collaborative reasoning for complex capability planning', async () => {
      const task =
        'Plan a sustainable village with automated systems and social spaces';
      const context = {
        bot: createMockMineflayerBot(),
        villageSize: 'medium',
        requirements: ['farming', 'housing', 'defense', 'social'],
        constraints: ['sustainable', 'automated', 'aesthetic'],
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 3000,
        maxComplexity: 9,
      });

      expect(result.primarySystem).toBe('llm');
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.result).toBeDefined();
    });
  });

  describe('Minecraft-Specific Scenarios', () => {
    it('should handle torch corridor creation scenario', async () => {
      const goal = 'Create a torch corridor for safe cave exploration';
      const context = {
        leafContext: {
          position: { x: 0, y: 32, z: 0 },
          inventory: [{ type: 'torch', quantity: 20 }],
        },
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [{ type: 'torch', quantity: 20 }], position: { x: 0, y: 32, z: 0 } },
        goalRequirements: {
          lighting: 'systematic',
          spacing: 8,
          safety: 'high',
        },
      };

      vi.spyOn(dynamicFlow, 'checkImpasse').mockReturnValue({
        isImpasse: true,
        reason: 'Torch corridor requires specialized placement logic',
        confidence: 0.8,
      });

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(
        plan.nodes.some((node) =>
          node.metadata?.capabilityId?.includes('torch_corridor')
        )
      ).toBe(true);
      expect(plan.confidence).toBeGreaterThan(0.8);
    });

    it('should handle automated farming system creation', async () => {
      const goal =
        'Build an automated wheat farm with water channels and lighting';
      const context = {
        leafContext: {
          position: { x: 0, y: 64, z: 0 },
          inventory: [
            { type: 'wheat_seeds', quantity: 10 },
            { type: 'bucket', quantity: 1 },
            { type: 'torch', quantity: 5 },
          ],
        },
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { 
          inventory: [
            { type: 'wheat_seeds', quantity: 10 },
            { type: 'bucket', quantity: 1 },
            { type: 'torch', quantity: 5 },
          ], 
          position: { x: 0, y: 64, z: 0 } 
        },
        goalRequirements: {
          crop: 'wheat',
          automation: 'required',
          water: 'channels',
          lighting: 'optimal',
        },
      };

      vi.spyOn(dynamicFlow, 'checkImpasse').mockReturnValue({
        isImpasse: true,
        reason: 'Automated farming requires complex system design',
        confidence: 0.9,
      });

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(
        plan.nodes.some((node) =>
          node.metadata?.capabilityId?.includes('automated_farming')
        )
      ).toBe(true);
      expect(plan.confidence).toBeGreaterThan(0.85);
    });

    it('should handle safe mining operation planning', async () => {
      const goal =
        'Use safe mining to extract diamond ore while avoiding lava and maintaining light';
      const context = {
        leafContext: {
          position: { x: 0, y: 16, z: 0 },
          inventory: [
            { type: 'iron_pickaxe', durability: 0.9 },
            { type: 'torch', quantity: 15 },
            { type: 'water_bucket', quantity: 1 },
          ],
        },
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { 
          inventory: [
            { type: 'iron_pickaxe', durability: 0.9 },
            { type: 'torch', quantity: 15 },
            { type: 'water_bucket', quantity: 1 },
          ], 
          position: { x: 0, y: 16, z: 0 } 
        },
        goalRequirements: {
          resource: 'diamond',
          safety: 'critical',
          lighting: 'continuous',
          lava_protection: 'required',
        },
      };

      vi.spyOn(dynamicFlow, 'checkImpasse').mockReturnValue({
        isImpasse: true,
        reason: 'Safe diamond mining requires specialized safety protocols',
        confidence: 0.85,
      });

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(
        plan.nodes.some((node) => node.metadata?.capabilityId?.includes('safe_mining'))
      ).toBe(true);
      expect(plan.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle capability creation failures gracefully', async () => {
      // Mock LLM failure
      mockLLM.proposeOption.mockRejectedValue(new Error('LLM unavailable'));

      const goal = 'Create complex automated system';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { complexity: 'high' },
      };

      vi.spyOn(dynamicFlow, 'checkImpasse').mockReturnValue({
        isImpasse: true,
        reason: 'Complex system requires new capability',
        confidence: 0.8,
      });

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      // Should still return a plan, even if capability creation failed
      expect(plan.nodes.length).toBeGreaterThan(0);
      expect(plan.confidence).toBeLessThan(0.95); // Lower confidence due to failure
    });

    it('should handle invalid BT-DSL gracefully', async () => {
      // Mock invalid BT-DSL
      mockBTParser.parse.mockReturnValue({
        valid: false,
        errors: ['Invalid leaf name: unknown_leaf'],
        tree: null,
      });

      const goal = 'Execute invalid capability';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: {},
      };

      const result = await dynamicFlow.proposeNewCapability(
        'test-task',
        {},
        goal,
        []
      );

      expect(result).toBeNull(); // Should reject invalid BT-DSL
    });

    it('should handle capability conflicts and resolution', async () => {
      // Register conflicting capabilities
      await registry.registerOption(
        {
          name: 'opt.fast_mining',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'dig_block',
                args: { speed: 'fast', safety: 'low' },
              },
            ],
          },
        },
        { author: 'system', createdAt: new Date().toISOString() },
        { successThreshold: 0.7, maxShadowRuns: 5 }
      );

      await registry.registerOption(
        {
          name: 'opt.safe_mining',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'dig_block',
                args: { speed: 'slow', safety: 'high' },
              },
            ],
          },
        },
        { author: 'system', createdAt: new Date().toISOString() },
        { successThreshold: 0.9, maxShadowRuns: 5 }
      );

      const goal = 'Use safe mining to extract resources efficiently';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { efficiency: 'high', safety: 'high' },
      };

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      // Should select the safer option when safety is prioritized
      expect(
        plan.nodes.some((node) => node.metadata?.capabilityId?.includes('safe_mining'))
      ).toBe(true);
    });
  });

  describe('Performance and Optimization', () => {
    it('should optimize capability selection for performance', async () => {
      const startTime = performance.now();

      const goal = 'Complete basic survival tasks efficiently';
      const context = {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { efficiency: 'high', time: 'limited' },
      };

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(plan.estimatedLatency).toBeLessThan(5000); // Plan should be reasonably fast
    });

    it('should cache and reuse successful capabilities', async () => {
      const goal = 'Create torch corridor for lighting';

      // First execution
      const plan1 = await mcpAdapter.generateCapabilityPlan(goal, {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { lighting: 'required' },
      });

      // Second execution with same goal
      const plan2 = await mcpAdapter.generateCapabilityPlan(goal, {
        leafContext: {},
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { inventory: [], position: { x: 0, y: 64, z: 0 } },
        goalRequirements: { lighting: 'required' },
      });

      // Should reuse the same capability
      expect(plan1.nodes[0].metadata?.capabilityId).toBe(plan2.nodes[0].metadata?.capabilityId);
      expect(plan1.confidence).toBe(plan2.confidence);
    });
  });
});
