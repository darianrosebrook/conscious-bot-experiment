/**
 * Dynamic Thought Generation Test
 *
 * Tests the enhanced cognitive thought processor's ability to generate
 * thoughts dynamically based on context and memory rather than relying
 * on hard-coded or pre-loaded understanding.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CognitiveThoughtProcessor } from '../cognitive-thought-processor';
import { CognitiveThought } from '../cognitive-thought-processor';

describe('Dynamic Thought Generation Tests', () => {
  let thoughtProcessor: CognitiveThoughtProcessor;

  // Mock memory client responses
  const mockMemoryResponse = {
    memories: [
      {
        id: 'memory-1',
        content:
          'Previously found diamonds in cave at coordinates (-123, 12, 456)',
        type: 'episodic',
        confidence: 0.8,
      },
      {
        id: 'memory-2',
        content: 'Diamond mining task failed due to insufficient lighting',
        type: 'episodic',
        confidence: 0.7,
      },
    ],
    insights: [
      'Previous diamond mining had 70% success rate',
      'Lighting is critical for cave mining tasks',
      'Health is important for underground exploration',
    ],
    recommendations: [
      'Bring torches for cave exploration',
      'Check health before entering dangerous areas',
      'Consider previous failure patterns when planning',
    ],
    confidence: 0.85,
  };

  beforeEach(() => {
    // Initialize thought processor with memory integration enabled
    thoughtProcessor = new CognitiveThoughtProcessor({
      enableThoughtToTaskTranslation: true,
      thoughtProcessingInterval: 30000,
      maxThoughtsPerBatch: 5,
      planningEndpoint: 'http://localhost:3002',
      cognitiveEndpoint: 'http://localhost:3003',
      memoryEndpoint: 'http://localhost:3001',
      enableMemoryIntegration: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Dynamic Context-Based Thought Generation', () => {
    it('should generate thoughts based on health status', async () => {
      // Mock world state with low health
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 71, z: 29.5 },
          health: 12, // Low health
          inventoryCount: 0,
          environment: 'surface',
          time: 'day',
          biome: 'plains',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      expect(thoughts.length).toBeGreaterThan(0);

      const healthThoughts = thoughts.filter((t) =>
        t.content.includes('Health is critically low')
      );
      expect(healthThoughts.length).toBeGreaterThan(0);
      expect(healthThoughts[0].priority).toBe('high');
      expect(healthThoughts[0].category).toBe('survival');
    });

    it('should generate thoughts based on inventory status', async () => {
      // Mock world state with empty inventory
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 71, z: 29.5 },
          health: 20,
          inventoryCount: 0, // Empty inventory
          environment: 'surface',
          time: 'day',
          biome: 'forest',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      const inventoryThoughts = thoughts.filter((t) =>
        t.content.includes('inventory is empty')
      );
      expect(inventoryThoughts.length).toBeGreaterThan(0);
      expect(inventoryThoughts[0].content).toContain(
        'gather wood and basic materials'
      );
      expect(inventoryThoughts[0].priority).toBe('medium');
      expect(inventoryThoughts[0].category).toBe('resource_gathering');
    });

    it('should generate thoughts based on environmental factors', async () => {
      // Mock world state with night time
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 71, z: 29.5 },
          health: 20,
          inventoryCount: 5,
          environment: 'surface',
          time: 'night',
          biome: 'plains',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      const nightThoughts = thoughts.filter((t) =>
        t.content.includes('Night time')
      );
      expect(nightThoughts.length).toBeGreaterThan(0);
      expect(nightThoughts[0].content).toContain('Visibility will be reduced');
      expect(nightThoughts[0].priority).toBe('medium');
      expect(nightThoughts[0].category).toBe('survival');
    });

    it('should generate thoughts based on biome-specific opportunities', async () => {
      // Mock world state in desert biome
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 71, z: 29.5 },
          health: 20,
          inventoryCount: 5,
          environment: 'surface',
          time: 'day',
          biome: 'desert',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      const biomeThoughts = thoughts.filter((t) =>
        t.content.includes('desert')
      );
      expect(biomeThoughts.length).toBeGreaterThan(0);
      expect(biomeThoughts[0].content).toContain('Scarce water and food');
      expect(biomeThoughts[0].content).toContain('Cacti provide green dye');
    });

    it('should generate thoughts based on position and elevation', async () => {
      // Mock world state at high elevation
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 85, z: 29.5 }, // High elevation
          health: 20,
          inventoryCount: 5,
          environment: 'surface',
          time: 'day',
          biome: 'mountain',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      const positionThoughts = thoughts.filter((t) =>
        t.content.includes('high elevation')
      );
      expect(positionThoughts.length).toBeGreaterThan(0);
      expect(positionThoughts[0].content).toContain('Good vantage point');
      expect(positionThoughts[0].content).toContain('watch for falls');
    });

    it('should generate thoughts based on underground position', async () => {
      // Mock world state underground
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 45, z: 29.5 }, // Underground
          health: 20,
          inventoryCount: 5,
          environment: 'underground',
          time: 'day',
          biome: 'cave',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      const undergroundThoughts = thoughts.filter((t) =>
        t.content.includes('underground level')
      );
      expect(undergroundThoughts.length).toBeGreaterThan(0);
      expect(undergroundThoughts[0].content).toContain(
        'Cave exploration opportunities'
      );
      expect(undergroundThoughts[0].content).toContain(
        'be cautious of dark areas'
      );
    });
  });

  describe('Memory-Based Thought Generation', () => {
    it('should generate thoughts from memory insights', async () => {
      // Mock successful memory response
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse,
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromMemory();

      expect(thoughts.length).toBeGreaterThan(0);

      const memoryInsights = thoughts.filter((t) =>
        t.content.includes('Memory insight:')
      );
      expect(memoryInsights.length).toBeGreaterThan(0);
      expect(memoryInsights[0].attribution).toBe('memory-system');
      expect(memoryInsights[0].priority).toBe('high');
      expect(memoryInsights[0].category).toBe('analysis');
    });

    it('should generate thoughts from memory recommendations', async () => {
      // Mock successful memory response
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMemoryResponse,
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromMemory();

      const recommendations = thoughts.filter((t) =>
        t.content.includes('Memory-based recommendation:')
      );
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].attribution).toBe('memory-system');
      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[0].category).toBe('planning');
    });

    it('should handle memory system unavailability gracefully', async () => {
      // Mock failed memory response
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromMemory();

      expect(thoughts.length).toBe(0);
    });
  });

  describe('Context Analysis Methods', () => {
    it('should provide context-aware inventory advice', () => {
      const advice = (thoughtProcessor as any).getInventoryAdvice({
        biome: 'forest',
        time: 'night',
      });

      expect(advice).toContain('prioritize finding shelter');
      expect(advice).toContain('basic survival items');
    });

    it('should provide biome-specific advice', () => {
      const biomeAdvice = (thoughtProcessor as any).getBiomeOpportunities(
        'desert',
        {
          biome: 'desert',
          time: 'day',
        }
      );

      expect(biomeAdvice).toBeDefined();
      expect(biomeAdvice?.content).toContain('Scarce water and food');
      expect(biomeAdvice?.content).toContain('Cacti provide green dye');
      expect(biomeAdvice?.priority).toBe('medium'); // Due to desert risks
    });

    it('should provide elevation-based advice', () => {
      const positionAdvice = (thoughtProcessor as any).analyzePosition({
        position: { x: 10.5, y: 85, z: 29.5 },
      });

      expect(positionAdvice).toBeDefined();
      expect(positionAdvice?.content).toContain('high elevation');
      expect(positionAdvice?.content).toContain('Good vantage point');
      expect(positionAdvice?.content).toContain('watch for falls');
    });

    it('should extract relevant entities from context', () => {
      const entities = (thoughtProcessor as any).extractCurrentEntities({
        environment: 'surface',
        position: { x: 10.5, y: 45, z: 29.5 },
        inventoryCount: 0,
      });

      expect(entities).toContain('surface');
      expect(entities).toContain('cave');
      expect(entities).toContain('underground');
      expect(entities).toContain('resources');
      expect(entities).toContain('gathering');
    });
  });

  describe('Integration Scenarios', () => {
    it('should generate comprehensive thoughts for dangerous situation', async () => {
      // Mock world state with multiple concerns
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 45, z: 29.5 }, // Underground
          health: 12, // Low health
          inventoryCount: 0, // Empty inventory
          environment: 'underground',
          time: 'night',
          biome: 'cave',
          threats: ['hostile mobs nearby'],
          nearbyEntities: [{ type: 'hostile' }],
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      expect(thoughts.length).toBeGreaterThan(0);

      // Should generate high-priority survival thoughts
      const survivalThoughts = thoughts.filter(
        (t) => t.category === 'survival'
      );
      expect(survivalThoughts.length).toBeGreaterThan(0);

      // Should include health concerns
      const healthThoughts = thoughts.filter((t) =>
        t.content.includes('Health is critically low')
      );
      expect(healthThoughts.length).toBeGreaterThan(0);

      // Should include threat awareness
      const threatThoughts = thoughts.filter((t) =>
        t.content.includes('threats')
      );
      expect(threatThoughts.length).toBeGreaterThan(0);
    });

    it('should generate exploration-focused thoughts for safe situation', async () => {
      // Mock world state with good conditions
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 71, z: 29.5 }, // Surface
          health: 20, // Full health
          inventoryCount: 5, // Has items
          environment: 'surface',
          time: 'day',
          biome: 'forest',
          threats: [],
          nearbyEntities: [],
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      expect(thoughts.length).toBeGreaterThan(0);

      // Should generate exploration-focused thoughts
      const explorationThoughts = thoughts.filter(
        (t) => t.category === 'exploration'
      );
      expect(explorationThoughts.length).toBeGreaterThan(0);

      // Should include biome-specific opportunities
      const biomeThoughts = thoughts.filter((t) =>
        t.content.includes('forest')
      );
      expect(biomeThoughts.length).toBeGreaterThan(0);
      expect(biomeThoughts[0].content).toContain('Abundant wood and food');
    });

    it('should prioritize thoughts based on urgency', async () => {
      // Mock world state with critical health
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 45, z: 29.5 },
          health: 8, // Very low health
          inventoryCount: 0,
          environment: 'underground',
          time: 'night',
          biome: 'cave',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      const highPriorityThoughts = thoughts.filter(
        (t) => t.priority === 'high'
      );
      expect(highPriorityThoughts.length).toBeGreaterThan(0);

      // Health concerns should be highest priority
      const healthThoughts = highPriorityThoughts.filter((t) =>
        t.content.includes('Health is critically low')
      );
      expect(healthThoughts.length).toBeGreaterThan(0);
    });
  });

  describe('Thought Generation Quality', () => {
    it('should generate thoughts with proper structure', async () => {
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 71, z: 29.5 },
          health: 20,
          inventoryCount: 5,
          environment: 'surface',
          time: 'day',
          biome: 'forest',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      thoughts.forEach((thought) => {
        expect(thought).toHaveProperty('type');
        expect(thought).toHaveProperty('content');
        expect(thought).toHaveProperty('attribution');
        expect(thought).toHaveProperty('context');
        expect(thought).toHaveProperty('category');
        expect(thought).toHaveProperty('priority');
        expect(thought).toHaveProperty('id');
        expect(thought).toHaveProperty('timestamp');

        // Content should be meaningful and contextual
        expect(thought.content.length).toBeGreaterThan(10);
        expect(thought.content).toMatch(
          /should|need to|consider|good for|watch for/
        );
      });
    });

    it('should generate thoughts with appropriate priorities', async () => {
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          hasPosition: true,
          position: { x: 10.5, y: 71, z: 29.5 },
          health: 20,
          inventoryCount: 0,
          environment: 'surface',
          time: 'night',
          biome: 'plains',
        }),
      } as Response);

      const thoughts = await (
        thoughtProcessor as any
      ).generateThoughtsFromContext();

      const priorities = thoughts.map((t) => t.priority);
      const highPriorityCount = priorities.filter((p) => p === 'high').length;
      const mediumPriorityCount = priorities.filter(
        (p) => p === 'medium'
      ).length;
      const lowPriorityCount = priorities.filter((p) => p === 'low').length;

      // Should have a mix of priorities based on context
      expect(
        highPriorityCount + mediumPriorityCount + lowPriorityCount
      ).toBeGreaterThan(0);

      // Night time should generate some medium-priority thoughts
      const nightThoughts = thoughts.filter((t) => t.content.includes('Night'));
      expect(nightThoughts.length).toBeGreaterThan(0);
      expect(nightThoughts.some((t) => t.priority === 'medium')).toBe(true);
    });
  });
});
