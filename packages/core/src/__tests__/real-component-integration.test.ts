/**
 * Real Component Integration Tests
 *
 * Tests the integration with actual components:
 * - Python HRM Bridge (Sapient HRM)
 * - Ollama LLM Service
 * - GOAP Planning System
 *
 * This validates that our architecture works with real services
 * and provides performance benchmarks for production use.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridHRMRouter } from '../mcp-capabilities/hybrid-hrm-integration';
import { EnhancedRegistry } from '../mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';
import { MCPCapabilitiesAdapter } from '../../../planning/src/skill-integration/mcp-capabilities-adapter';
import { HybridSkillPlanner } from '../../../planning/src/skill-integration/hybrid-skill-planner';

// ============================================================================
// Real Component Configuration
// ============================================================================

/**
 * Real component configuration for production-like testing
 */
const REAL_COMPONENT_CONFIG = {
  // Python HRM Configuration
  pythonHRM: {
    modelPath: './mock-hrm-model', // Will use actual HRM bridge
    device: 'cpu' as const,
    maxSteps: 10,
    confidenceThreshold: 0.7,
  },

  // LLM Configuration - Using real Ollama models
  llm: {
    model: 'qwen3:0.6b', // Fastest model for quick responses
    maxTokens: 100,
    temperature: 0.3,
    timeout: 5000,
  },

  // GOAP Configuration
  goap: {
    maxPlanLength: 5,
    planningBudgetMs: 50,
    heuristicWeight: 1.0,
    repairThreshold: 0.8,
    enablePlanCaching: true,
  },
};

// ============================================================================
// Service Health Checks
// ============================================================================

/**
 * Check if all real services are available
 */
async function checkServiceHealth() {
  const health = {
    pythonHRM: false,
    ollama: false,
    models: [] as string[],
  };

  try {
    // Check Python HRM Bridge
    const hrmResponse = await fetch('http://localhost:5001/health');
    if (hrmResponse.ok) {
      const hrmHealth = await hrmResponse.json();
      health.pythonHRM = hrmHealth.hrm_available && hrmHealth.model_initialized;
    }
  } catch (error) {
    console.warn('Python HRM bridge not available:', error);
  }

  try {
    // Check Ollama
    const ollamaResponse = await fetch('http://localhost:11434/api/tags');
    if (ollamaResponse.ok) {
      const ollamaData = await ollamaResponse.json();
      health.ollama = true;
      health.models = ollamaData.models.map((m: any) => m.name);
    }
  } catch (error) {
    console.warn('Ollama not available:', error);
  }

  return health;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Real Component Integration', () => {
  let hybridRouter: HybridHRMRouter;
  let registry: EnhancedRegistry;
  let dynamicFlow: DynamicCreationFlow;
  let mcpAdapter: MCPCapabilitiesAdapter;
  let hybridPlanner: HybridSkillPlanner;
  let serviceHealth: any;

  beforeEach(async () => {
    // Check service health before running tests
    serviceHealth = await checkServiceHealth();
    console.log('🔍 Service Health Check:', serviceHealth);

    // Initialize components with real configuration
    hybridRouter = new HybridHRMRouter(REAL_COMPONENT_CONFIG.pythonHRM);
    await hybridRouter.initialize();

    registry = new EnhancedRegistry();
    dynamicFlow = new DynamicCreationFlow(registry, {
      isAvailable: () => serviceHealth.ollama,
      generate: async (prompt: string) => {
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: REAL_COMPONENT_CONFIG.llm.model,
            prompt,
            stream: false,
            options: {
              temperature: REAL_COMPONENT_CONFIG.llm.temperature,
              max_tokens: REAL_COMPONENT_CONFIG.llm.maxTokens,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama request failed: ${response.statusText}`);
        }

        const result = await response.json();
        return {
          response: result.response,
          confidence: 0.8,
        };
      },
      proposeOption: async (request: any) => {
        const prompt = `Create a Minecraft capability for: ${request.currentTask}. Return ONLY a valid JSON BT-DSL object with available leaves: check_inventory, place_torch, check_water_source, mine_block, place_block, move_to, collect_item. Use this exact format:
{
  "name": "opt.generated_capability",
  "version": "1.0.0",
  "btDsl": {
    "name": "opt.generated_capability",
    "version": "1.0.0",
    "root": {
      "type": "Sequence",
      "children": [
        {
          "type": "Leaf",
          "leafName": "check_inventory",
          "args": {}
        }
      ]
    }
  }
}`;
        const result = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: REAL_COMPONENT_CONFIG.llm.model,
            prompt,
            stream: false,
            options: {
              temperature: REAL_COMPONENT_CONFIG.llm.temperature,
              max_tokens: REAL_COMPONENT_CONFIG.llm.maxTokens,
            },
          }),
        });

        if (!result.ok) {
          throw new Error(`Ollama request failed: ${result.statusText}`);
        }

        const response = await result.json();
        return {
          name: 'opt.generated_capability',
          version: '1.0.0',
          btDsl: {
            name: 'opt.generated_capability',
            version: '1.0.0',
            root: {
              type: 'Sequence',
              children: [
                {
                  type: 'Leaf',
                  leafName: 'execute_action',
                  args: { action: response.response },
                },
              ],
            },
          },
          confidence: 0.7,
          estimatedSuccessRate: 0.8,
          reasoning: response.response,
        };
      },
    });

    mcpAdapter = new MCPCapabilitiesAdapter(registry, dynamicFlow);
    hybridPlanner = new HybridSkillPlanner();
    (hybridPlanner as any).mcpCapabilitiesAdapter = mcpAdapter;
  });

  afterEach(async () => {
    // Cleanup
    registry.clear();
  });

  describe('Service Availability', () => {
    it('should have Python HRM bridge available', () => {
      expect(serviceHealth.pythonHRM).toBe(true);
    });

    it('should have Ollama service available', () => {
      expect(serviceHealth.ollama).toBe(true);
    });

    it('should have required models available', () => {
      expect(serviceHealth.models).toContain(REAL_COMPONENT_CONFIG.llm.model);
    });
  });

  describe('Python HRM Integration', () => {
    it('should perform structured reasoning with real Python HRM', async () => {
      const task = 'Optimize resource gathering path through multiple biomes';
      const context = {
        bot: {
          entity: { position: { x: 0, y: 64, z: 0 } },
        },
        position: { x: 0, y: 64, z: 0 },
        biomes: [
          { type: 'forest', resources: ['wood', 'apples'] },
          { type: 'desert', resources: ['sand', 'cactus'] },
          { type: 'mountains', resources: ['stone', 'iron'] },
        ],
        inventory: vi.fn().mockResolvedValue([]),
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 1000,
        maxComplexity: 7,
      });

      expect(result.primarySystem).toBe('python-hrm');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.executionTime).toBeLessThan(1000);
      expect(result.result).toBeDefined();
    }, 10000); // 10 second timeout for real inference

    it('should handle complex optimization tasks', async () => {
      const task = 'Find the most efficient route to collect iron, coal, and wood';
      const context = {
        bot: {
          entity: { position: { x: 0, y: 64, z: 0 } },
        },
        resources: {
          iron: { position: { x: 10, y: 32, z: 5 }, quantity: 5 },
          coal: { position: { x: -5, y: 40, z: 15 }, quantity: 8 },
          wood: { position: { x: 20, y: 64, z: -10 }, quantity: 10 },
        },
        inventory: vi.fn().mockResolvedValue([]),
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 2000,
        maxComplexity: 8,
      });

      expect(result.primarySystem).toBe('python-hrm');
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.executionTime).toBeLessThan(2000);
    }, 15000);
  });

  describe('LLM Integration', () => {
    it('should generate creative responses with real Ollama', async () => {
      const task = 'Design a unique building style for a medieval castle';
      const context = {
        bot: {
          entity: { position: { x: 0, y: 64, z: 0 } },
        },
        style: 'medieval',
        materials: ['stone', 'wood', 'iron'],
        constraints: ['defensive', 'aesthetic', 'functional'],
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 5000,
        maxComplexity: 6,
      });

      expect(result.primarySystem).toBe('llm');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.executionTime).toBeLessThan(5000);
      expect(result.result).toBeDefined();
    }, 10000);

    it('should handle social interaction tasks', async () => {
      const task = 'Respond to a player asking for help with building a house';
      const context = {
        bot: {
          entity: { position: { x: 0, y: 64, z: 0 } },
        },
        player: {
          name: 'Steve',
          message: 'Can you help me build a house?',
          position: { x: 5, y: 64, z: 5 },
        },
        inventory: vi.fn().mockResolvedValue([]),
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 3000,
        maxComplexity: 4,
      });

      expect(result.primarySystem).toBe('llm');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.executionTime).toBeLessThan(3000);
    }, 8000);
  });

  describe('GOAP Integration', () => {
    it('should perform reactive planning for emergency situations', async () => {
      const task = 'Emergency escape from hostile mobs';
      const context = {
        bot: {
          entity: { position: { x: 0, y: 64, z: 0 } },
          health: 5,
        },
        threats: [
          { type: 'zombie', position: { x: 2, y: 64, z: 0 }, distance: 2 },
          { type: 'skeleton', position: { x: -1, y: 64, z: 3 }, distance: 3 },
        ],
        inventory: vi.fn().mockResolvedValue([]),
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 100,
        maxComplexity: 3,
      });

      expect(result.primarySystem).toBe('goap');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.executionTime).toBeLessThan(100);
      expect(result.result).toBeDefined();
    }, 5000);

    it('should handle immediate survival needs', async () => {
      const task = 'Find food immediately - hunger critical';
      const context = {
        bot: {
          entity: { position: { x: 0, y: 64, z: 0 } },
          health: 10,
          food: 2,
        },
        nearbyFood: [
          { type: 'apple', position: { x: 5, y: 64, z: 0 }, distance: 5 },
          { type: 'bread', position: { x: -3, y: 64, z: 2 }, distance: 3 },
        ],
        inventory: vi.fn().mockResolvedValue([]),
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 50,
        maxComplexity: 2,
      });

      expect(result.primarySystem).toBe('goap');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.executionTime).toBeLessThan(50);
    }, 3000);
  });

  describe('MCP Capability Integration', () => {
    it('should create capabilities using real LLM', async () => {
      const goal = 'Create a torch corridor for safe cave exploration';
      const context = {
        leafContext: {
          position: { x: 0, y: 32, z: 0 },
          inventory: [{ type: 'torch', quantity: 20 }],
        },
        availableCapabilities: [],
        registry,
        dynamicFlow,
        worldState: { 
          inventory: [{ type: 'torch', quantity: 20 }], 
          position: { x: 0, y: 32, z: 0 } 
        },
        goalRequirements: {
          lighting: 'systematic',
          spacing: 8,
          safety: 'high',
        },
      };

      // Mock impasse detection to trigger capability creation
      vi.spyOn(dynamicFlow, 'checkImpasse').mockReturnValue({
        isImpasse: true,
        reason: 'Torch corridor requires specialized placement logic',
        confidence: 0.8,
      });

      const plan = await mcpAdapter.generateCapabilityPlan(goal, context);

      expect(plan.nodes.length).toBeGreaterThan(0);
      expect(plan.confidence).toBeGreaterThan(0.5);
      expect(plan.estimatedLatency).toBeGreaterThan(0);
    }, 20000);

    it('should handle complex capability creation', async () => {
      const goal = 'Build an automated wheat farm with water channels and lighting';
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

      expect(plan.nodes.length).toBeGreaterThan(0);
      expect(plan.confidence).toBeGreaterThan(0.5);
    }, 25000);
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance targets for structured reasoning', async () => {
      const task = 'Calculate optimal mining path for maximum efficiency';
      const context = {
        bot: { entity: { position: { x: 0, y: 64, z: 0 } } },
        resources: [
          { type: 'iron', position: { x: 10, y: 32, z: 0 }, value: 5 },
          { type: 'coal', position: { x: -5, y: 40, z: 10 }, value: 3 },
          { type: 'diamond', position: { x: 15, y: 16, z: 5 }, value: 10 },
        ],
        inventory: vi.fn().mockResolvedValue([]),
      };

      const startTime = performance.now();
      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 500,
        maxComplexity: 6,
      });
      const endTime = performance.now();

      expect(result.primarySystem).toBe('python-hrm');
      expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
      expect(result.confidence).toBeGreaterThan(0.6);
    }, 10000);

    it('should meet performance targets for creative reasoning', async () => {
      const task = 'Explain the architectural principles behind medieval castle design';
      const context = {
        bot: { entity: { position: { x: 0, y: 64, z: 0 } } },
        theme: 'architecture',
        style: 'medieval',
        inventory: vi.fn().mockResolvedValue([]),
      };

      const startTime = performance.now();
      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 2000,
        maxComplexity: 5,
      });
      const endTime = performance.now();

      expect(result.primarySystem).toBe('llm');
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2s
      expect(result.confidence).toBeGreaterThan(0.5);
    }, 8000);

    it('should meet performance targets for reactive responses', async () => {
      const task = 'Immediate response to falling into lava';
      const context = {
        bot: { 
          entity: { position: { x: 0, y: 64, z: 0 } },
          health: 15,
        },
        environment: {
          inLava: true,
          lavaLevel: 10,
        },
        inventory: vi.fn().mockResolvedValue([{ type: 'water_bucket', quantity: 1 }]),
      };

      const startTime = performance.now();
      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 50,
        maxComplexity: 2,
      });
      const endTime = performance.now();

      expect(result.primarySystem).toBe('goap');
      expect(endTime - startTime).toBeLessThan(50); // Should complete within 50ms
      expect(result.confidence).toBeGreaterThan(0.5);
    }, 3000);
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle Python HRM failures gracefully', async () => {
      // Temporarily break the HRM connection
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('HRM connection failed'));

      const task = 'Optimize resource gathering path';
      const context = {
        bot: { entity: { position: { x: 0, y: 64, z: 0 } } },
        inventory: vi.fn().mockResolvedValue([]),
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 1000,
        maxComplexity: 5,
      });

      // Should still route to Python HRM but fail gracefully
      expect(result.primarySystem).toBe('python-hrm');
      expect(result.fallbackUsed).toBe(true);
      expect(result.confidence).toBeLessThan(0.5);

      // Restore fetch
      global.fetch = originalFetch;
    }, 8000);

    it('should handle LLM failures gracefully', async () => {
      // Temporarily break the LLM connection
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('LLM connection failed'));

      const task = 'Creative building design';
      const context = {
        bot: { entity: { position: { x: 0, y: 64, z: 0 } } },
        style: 'modern',
        inventory: vi.fn().mockResolvedValue([]),
      };

      const result = await hybridRouter.reason(task, context, {
        maxTimeMs: 1000,
        maxComplexity: 4,
      });

      // Should route to GOAP as fallback when LLM fails
      expect(result.primarySystem).toBe('goap');
      expect(result.fallbackUsed).toBe(true);
      expect(result.confidence).toBeLessThan(0.5);

      // Restore fetch
      global.fetch = originalFetch;
    }, 5000);
  });
});
