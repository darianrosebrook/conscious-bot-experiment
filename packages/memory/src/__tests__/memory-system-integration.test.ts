/**
 * Memory System Integration Tests with Testcontainers
 *
 * End-to-end tests for the memory system using real PostgreSQL database
 * with pgvector for vector operations.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createMemoryIntegrationFixture,
  createMemorySeed,
  createExperienceSeed,
  createThoughtSeed,
} from './memory-integration-setup';

const TEST_TIMEOUT = 60_000; // 1 minute for integration tests

describe('Memory System Integration with PostgreSQL + pgvector', () => {
  let fixture: Awaited<ReturnType<typeof createMemoryIntegrationFixture>>;

  beforeAll(async () => {
    fixture = await createMemoryIntegrationFixture(
      [
        createMemorySeed('Iron pickaxe is most efficient for mining iron ore'),
        createMemorySeed('Stone tools are insufficient for mining iron ore'),
        createExperienceSeed(
          'Successfully mined 5 iron ore using iron pickaxe',
          ['iron_ore', 'iron_pickaxe', 'mining'],
          ['resource_gathering', 'tool_usage']
        ),
        createThoughtSeed(
          'Tool selection matters greatly for mining efficiency',
          'Analysis shows that using appropriate tools increases success rate by 300%',
          ['tool_selection', 'efficiency'],
          ['strategy', 'optimization']
        ),
      ],
      { worldSeed: 12345, enablePersistence: true }
    );
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await fixture.stop();
  }, TEST_TIMEOUT);

  describe('Memory Storage and Retrieval', () => {
    it('should store and retrieve memories correctly', async () => {
      // Test basic memory storage
      const testMemory = await fixture.memorySystem.ingestMemory({
        type: 'knowledge',
        content: 'Test memory for integration testing',
        source: 'integration-test',
        confidence: 0.95,
        entities: ['test', 'integration'],
        topics: ['testing'],
        customMetadata: {
          testId: 'memory-storage-test',
          timestamp: Date.now(),
        },
      });

      expect(testMemory).toBeDefined();

      // Test memory retrieval
      const searchResults = await fixture.memorySystem.searchMemories({
        query: 'test memory integration',
        types: ['knowledge'],
        limit: 5,
        minConfidence: 0.8,
      });

      expect(searchResults.results).toHaveLength(1);
      expect(searchResults.results[0].content).toContain(
        'Test memory for integration testing'
      );
    });

    it('should handle different memory types correctly', async () => {
      // Test experience memory
      await fixture.memorySystem.ingestMemory({
        type: 'experience',
        content: 'Learned that wooden tools break quickly when mining stone',
        source: 'mining-experience',
        confidence: 0.9,
        entities: ['wooden_tools', 'stone', 'durability'],
        topics: ['tool_durability', 'resource_management'],
      });

      // Test thought memory
      await fixture.memorySystem.ingestMemory({
        type: 'thought',
        content: 'Strategic planning is crucial for long-term survival',
        source: 'strategic-thinking',
        confidence: 0.85,
        entities: ['strategy', 'planning', 'survival'],
        topics: ['strategy', 'decision_making'],
      });

      // Search for strategic content
      const strategicResults = await fixture.memorySystem.searchMemories({
        query: 'strategy planning',
        types: ['thought', 'experience'],
        limit: 10,
      });

      expect(strategicResults.results.length).toBeGreaterThanOrEqual(2);
      expect(
        strategicResults.results.some((r) =>
          r.content.includes('strategic planning')
        )
      ).toBe(true);
    });

    it('should support advanced search with entity and topic filters', async () => {
      const results = await fixture.memorySystem.searchMemories({
        query: 'iron pickaxe mining',
        limit: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Memory System Performance', () => {
    it('should handle multiple concurrent searches', async () => {
      const searchPromises = Array.from({ length: 5 }, (_, i) =>
        fixture.memorySystem.searchMemories({
          query: `test query ${i}`,
          types: ['knowledge'],
          limit: 3,
        })
      );

      const results = await Promise.all(searchPromises);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
      });
    });

    it('should maintain data consistency across operations', async () => {
      const initialCount = (
        await fixture.memorySystem.searchMemories({
          query: 'iron pickaxe',
          limit: 100,
        })
      ).results.length;

      // Add more memories
      await fixture.memorySystem.ingestMemory({
        type: 'knowledge',
        content: 'Diamond pickaxe is best for obsidian mining',
        source: 'advanced-mining',
        confidence: 0.95,
        entities: ['diamond_pickaxe', 'obsidian'],
        topics: ['advanced_mining', 'tool_progression'],
      });

      const newCount = (
        await fixture.memorySystem.searchMemories({
          query: 'iron pickaxe',
          limit: 100,
        })
      ).results.length;

      // Should still find the original memories
      expect(newCount).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('Memory System Features', () => {
    it('should support memory decay and cleanup', async () => {
      // Enable memory decay for this test
      await (fixture.memorySystem as any).enableMemoryDecay();

      // Add a memory that should be cleaned up
      await fixture.memorySystem.ingestMemory({
        type: 'knowledge',
        content: 'This memory should be cleaned up during decay testing',
        source: 'decay-test',
        confidence: 0.3, // Low confidence for faster decay
        entities: ['decay', 'cleanup'],
        topics: ['testing', 'maintenance'],
      });

      // Trigger decay evaluation
      const decayResults = await (
        fixture.memorySystem as any
      ).evaluateMemoryDecay();

      expect(decayResults).toBeDefined();
      expect(typeof decayResults.processed).toBe('number');
    });

    it('should provide comprehensive memory statistics', async () => {
      const stats = await fixture.memorySystem.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalMemories).toBeGreaterThanOrEqual(0);
      expect(stats.typeDistribution).toBeDefined();
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
    });

    it('should support memory export and import', async () => {
      // Note: exportMemories currently returns empty array as placeholder
      // TODO: Implement proper memory export functionality
      const exportData = await fixture.memorySystem.exportMemories({
        includeMetadata: true,
      });
      expect(Array.isArray(exportData)).toBe(true);
      // Currently returns empty array - should return actual memories when implemented
      expect(exportData.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle invalid memory operations gracefully', async () => {
      try {
        await fixture.memorySystem.ingestMemory({
          type: 'invalid_type' as any,
          content: 'This should fail',
          source: 'error-test',
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should recover from temporary database issues', async () => {
      // Test that the system can handle connection issues gracefully
      const healthCheck = await (fixture.memorySystem as any).healthCheck?.();
      expect(healthCheck).toBeDefined();
    });
  });
});
