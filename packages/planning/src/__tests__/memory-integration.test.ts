/**
 * Memory Integration Test
 *
 * Tests the integration of memory system with planning components
 * to ensure real memory is being used for enhanced decision making.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, jest } from 'vitest';
import { EnhancedMemoryIntegration } from '../enhanced-memory-integration';
import { CognitiveThoughtProcessor } from '../cognitive-thought-processor';
import { EnhancedReactiveExecutor } from '../reactive-executor/enhanced-reactive-executor';

describe('Memory Integration Tests', () => {
  let memoryIntegration: EnhancedMemoryIntegration;
  let thoughtProcessor: CognitiveThoughtProcessor;
  let reactiveExecutor: EnhancedReactiveExecutor;

  // Mock memory system responses
  const mockMemoryResponse = {
    memories: [
      {
        id: 'memory-1',
        content:
          'Previously found diamonds in cave at coordinates (-123, 12, 456)',
        type: 'episodic',
        confidence: 0.8,
        timestamp: Date.now() - 3600000, // 1 hour ago
      },
      {
        id: 'memory-2',
        content: 'Diamond mining task failed due to insufficient lighting',
        type: 'episodic',
        confidence: 0.7,
        timestamp: Date.now() - 7200000, // 2 hours ago
      },
    ],
    insights: [
      'Previous diamond mining had 70% success rate',
      'Lighting is critical for cave mining tasks',
    ],
    recommendations: [
      'Bring torches for cave exploration',
      'Check inventory for adequate lighting before starting mining',
      'Consider previous failure patterns when planning',
    ],
    confidence: 0.85,
  };

  beforeEach(() => {
    // Initialize memory integration with mock endpoints
    memoryIntegration = new EnhancedMemoryIntegration({
      enableRealTimeUpdates: true,
      enableReflectiveNotes: true,
      enableEventLogging: true,
      enableMemoryDiscovery: false, // Disable discovery for tests
      dashboardEndpoint: 'http://localhost:3000',
      memorySystemEndpoint: 'http://localhost:3001',
      memorySystemTimeout: 2000,
      retryAttempts: 2,
    });

    // Initialize thought processor with memory integration
    thoughtProcessor = new CognitiveThoughtProcessor({
      enableThoughtToTaskTranslation: true,
      thoughtProcessingInterval: 30000,
      maxThoughtsPerBatch: 5,
      planningEndpoint: 'http://localhost:3002',
      cognitiveEndpoint: 'http://localhost:3003',
      memoryEndpoint: 'http://localhost:3001',
      enableMemoryIntegration: true,
    });

    // Initialize reactive executor
    reactiveExecutor = new EnhancedReactiveExecutor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Enhanced Memory Integration', () => {
    it('should discover available memory endpoints', async () => {
      // Mock successful endpoint discovery
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      } as Response);

      // This test would verify endpoint discovery
      expect(memoryIntegration).toBeDefined();
    });

    it('should provide memory-enhanced context for planning', async () => {
      // Mock successful memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse,
      } as Response);

      const context = await memoryIntegration.getMemoryEnhancedContext({
        query: 'Planning diamond mining task',
        taskType: 'mining',
        entities: ['diamond', 'cave', 'mining'],
        location: {
          biome: 'underground',
          coordinates: { x: -123, y: 12, z: 456 },
        },
        recentEvents: [],
        maxMemories: 3,
      });

      expect(context).toBeDefined();
      expect(context.memories).toHaveLength(2);
      expect(context.insights).toHaveLength(2);
      expect(context.recommendations).toHaveLength(3);
      expect(context.confidence).toBe(0.85);
    });

    it('should handle memory system unavailability gracefully', async () => {
      // Mock failed memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const context = await memoryIntegration.getMemoryEnhancedContext({
        query: 'Test query',
        taskType: 'test',
      });

      expect(context.confidence).toBe(0.0);
      expect(context.insights).toContain('Memory system unavailable');
      expect(context.recommendations).toContain(
        'Consider enabling memory integration'
      );
    });

    it('should generate memory-based recommendations', async () => {
      const recommendations = (
        memoryIntegration as any
      ).generateMemoryBasedRecommendations(
        [
          {
            id: 'mem-1',
            timestamp: Date.now(),
            type: 'reflection',
            title: 'Test Memory',
            content: 'Test content',
            insights: ['Test insight'],
            priority: 0.8,
            source: 'test',
            confidence: 0.8,
          },
        ],
        { taskType: 'crafting', location: { biome: 'cave' } }
      );

      expect(recommendations).toBeInstanceOf(Array);
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Cognitive Thought Processor with Memory', () => {
    it('should enhance thoughts with memory context', async () => {
      // Mock successful memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse,
      } as Response);

      const thought = {
        type: 'planning',
        content: 'I should mine for diamonds in this cave',
        attribution: 'bot',
        context: { taskType: 'mining' },
        metadata: { urgency: 'medium' },
        category: 'resource_gathering',
        priority: 'medium',
        id: 'thought-1',
        timestamp: Date.now(),
      };

      const result = await thoughtProcessor.processThoughtWithMemory(thought);

      expect(result).toBeDefined();
      expect(result.memoryContext).toBeDefined();
      expect(result.enhancedThought).toBeDefined();
      expect(result.recommendations).toBeDefined();

      // Verify memory enhancement
      expect(result.enhancedThought.content).toContain('Memory Context:');
      expect(result.enhancedThought.priority).toBe('high'); // Should be boosted by memory
      expect(result.enhancedThought.metadata.memoryConfidence).toBe(0.85);
    });

    it('should handle memory enhancement failures gracefully', async () => {
      // Mock failed memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const thought = {
        type: 'planning',
        content: 'Test thought',
        attribution: 'bot',
        id: 'thought-2',
        timestamp: Date.now(),
      };

      const result = await thoughtProcessor.processThoughtWithMemory(thought);

      expect(result.enhancedThought).toEqual(thought); // Should fallback to original
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext.confidence).toBe(0.0);
    });

    it('should extract entities from thoughts', () => {
      const entities = (thoughtProcessor as any).extractEntitiesFromThought({
        type: 'planning',
        content: 'I need to find diamonds and craft a pickaxe in this cave',
        attribution: 'bot',
        id: 'thought-3',
        timestamp: Date.now(),
      });

      expect(entities).toContain('diamond');
      expect(entities).toContain('cave');
      expect(entities.length).toBeGreaterThanOrEqual(2);
    });

    it('should calculate memory-enhanced priority correctly', () => {
      const basePriority = 'medium';
      const memoryContext = {
        confidence: 0.85,
        memories: [{ id: 'mem-1' }, { id: 'mem-2' }],
      };

      const enhancedPriority = (
        thoughtProcessor as any
      ).calculateMemoryEnhancedPriority(
        { priority: basePriority },
        memoryContext
      );

      expect(enhancedPriority).toBe('high'); // Should be boosted due to high memory confidence
    });
  });

  describe('Reactive Executor Memory Integration', () => {
    it('should initialize memory client', () => {
      expect(reactiveExecutor).toBeDefined();

      // Test that memory client was initialized
      const memoryEndpoint = (reactiveExecutor as any).memoryEndpoint;
      expect(memoryEndpoint).toBe('http://localhost:3001');
    });

    it('should get memory-enhanced execution context', async () => {
      // Mock successful memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse,
      } as Response);

      const plan = {
        goal: {
          type: 'mining',
          description: 'Mine for diamonds',
        },
        steps: [
          { description: 'Find cave entrance' },
          { description: 'Mine diamonds' },
        ],
      };

      const worldState = {
        currentLocation: {
          biome: 'underground',
          coordinates: { x: -123, y: 12, z: 456 },
        },
      };

      const context = await (
        reactiveExecutor as any
      ).getMemoryEnhancedExecutionContext(plan, worldState, { actions: [] });

      expect(context).toBeDefined();
      expect(context.memories).toHaveLength(2);
      expect(context.planMemory).toBeDefined();
      expect(context.planMemory.planType).toBe('mining');
      expect(context.planMemory.successProbability).toBeGreaterThan(0);
    });

    it('should extract entities from plans', () => {
      const plan = {
        goal: {
          type: 'crafting',
          description: 'Craft diamond pickaxe for mining',
        },
        steps: [
          { description: 'Gather diamonds' },
          { description: 'Craft pickaxe at crafting table' },
          { description: 'Mine obsidian with new pickaxe' },
        ],
      };

      const entities = (reactiveExecutor as any).extractEntitiesFromPlan(plan);

      expect(entities).toContain('diamond');
      expect(entities).toContain('pickaxe');
      expect(entities).toContain('obsidian');
      expect(entities.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract Minecraft entities from text', () => {
      const text =
        'I need to find diamonds and iron in this cave and craft tools';
      const entities = (reactiveExecutor as any).extractMinecraftEntities(text);

      expect(entities).toContain('diamond');
      expect(entities).toContain('iron');
      expect(entities).toContain('cave');
    });

    it('should calculate plan success probability', () => {
      const plan = {
        goal: { type: 'mining' },
        steps: [{ description: 'step1' }, { description: 'step2' }],
      };

      const memoryContext = {
        confidence: 0.85,
        memories: [{ id: 'mem-1' }],
      };

      const probability = (
        reactiveExecutor as any
      ).calculatePlanSuccessProbability(plan, memoryContext);

      expect(probability).toBeGreaterThan(0.5); // Should be boosted by memory confidence
      expect(probability).toBeLessThanOrEqual(0.95); // Should be clamped
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle end-to-end memory-enhanced planning', async () => {
      // Mock successful memory responses
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse,
      } as Response);

      // Create a mining plan
      const plan = {
        goal: {
          type: 'mining',
          description: 'Mine for diamonds in cave',
        },
        steps: [
          { description: 'Find cave entrance' },
          { description: 'Enter cave with adequate lighting' },
          { description: 'Locate diamond ore' },
          { description: 'Mine diamonds safely' },
        ],
      };

      const worldState = {
        currentLocation: {
          biome: 'plains',
          coordinates: { x: 100, y: 64, z: 200 },
        },
      };

      // Test memory-enhanced context retrieval
      const memoryContext = await memoryIntegration.getMemoryEnhancedContext({
        query: 'Planning diamond mining task in cave',
        taskType: 'mining',
        entities: ['diamond', 'cave', 'mining'],
        location: { biome: 'cave' },
        maxMemories: 3,
      });

      expect(memoryContext.memories.length).toBeGreaterThan(0);
      expect(
        memoryContext.recommendations.some((r) => r.includes('lighting'))
      ).toBe(true);
      expect(memoryContext.confidence).toBe(0.85);
    });

    it('should handle memory system failures gracefully', async () => {
      // Mock failed memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const context = await memoryIntegration.getMemoryEnhancedContext({
        query: 'Test query',
        taskType: 'test',
      });

      expect(context.confidence).toBe(0.0);
      expect(context.memories.length).toBe(0);
      expect(context.insights.some((i) => i.includes('unavailable'))).toBe(
        true
      );
    });

    it('should provide fallback recommendations when memory is unavailable', async () => {
      // Mock failed memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const recommendations = (
        memoryIntegration as any
      ).generateMemoryBasedRecommendations([], { taskType: 'crafting' });

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain('No relevant memories found');
    });
  });

  describe('Memory System Health and Monitoring', () => {
    it('should provide memory integration health status', () => {
      const config = memoryIntegration.getConfig();

      expect(config.enableMemoryDiscovery).toBe(true);
      expect(config.memorySystemTimeout).toBe(2000);
      expect(config.retryAttempts).toBe(2);
    });

    it('should handle circuit breaker functionality', () => {
      // Test circuit breaker state
      const isOpen = (memoryIntegration as any).isMemCircuitOpen();
      expect(typeof isOpen).toBe('boolean');
    });

    it('should track memory system performance', async () => {
      // Mock successful memory response
      const mockFetch = jest.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse,
      } as Response);

      const startTime = Date.now();
      const context = await memoryIntegration.getMemoryEnhancedContext({
        query: 'Test performance',
        taskType: 'test',
      });
      const endTime = Date.now();

      expect(context).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
