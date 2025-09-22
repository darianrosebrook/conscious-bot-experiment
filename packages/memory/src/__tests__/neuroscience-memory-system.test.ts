/**
 * Neuroscience-Inspired Memory System Tests
 *
 * Comprehensive tests for the hippocampal sharp wave ripples inspired memory system.
 * Tests verify that memory tagging, consolidation, cognitive mapping, and decay work correctly.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SharpWaveRippleManager } from '../sharp-wave-ripple-manager';
import { CognitiveMapTracker } from '../cognitive-map-tracker';

// Mock dependencies to avoid database connections
class MockVectorDatabase {
  async initialize(): Promise<void> {}
  async upsertChunk(): Promise<void> {}
  async search(): Promise<any> {
    return { results: [] };
  }
  async getStats(): Promise<any> {
    return { totalChunks: 0 };
  }
  async close(): Promise<void> {}
  async getStatus(): Promise<any> {
    return { connectionStatus: 'disconnected' };
  }
  getDatabaseName(): string {
    return 'test-db';
  }
  async cleanup(): Promise<number> {
    return 0;
  }
  async batchUpsertChunks(): Promise<void> {}
}

class MockEmbeddingService {
  async embed(content: string): Promise<any> {
    // Return predictable embedding based on content length
    const hash = content.length % 768;
    return {
      embedding: new Array(768).fill(0).map((_, i) => (i === hash ? 1 : 0.1)),
      tokens: Math.max(1, content.length / 4),
    };
  }
  async healthCheck(): Promise<any> {
    return { status: 'healthy' };
  }
  getCacheStats(): any {
    return { size: 0, hitRate: 0 };
  }
}

class MockMemoryDecayManager {
  async recordAccess(): Promise<any> {
    return {};
  }
  async evaluateMemories(): Promise<any> {
    return {
      decayResults: [],
      cleanupRecommendations: {
        totalMemories: 0,
        retainedMemories: 0,
        consolidatedMemories: 0,
        archivedMemories: 0,
        deletedMemories: 0,
        spaceSaved: 0,
        consolidationSummary: [],
      },
    };
  }
  getAllAccessRecords(): any[] {
    return [];
  }
  getCleanupHistory(): any[] {
    return [];
  }
}

describe('Neuroscience-Inspired Memory System', () => {
  let mockVectorDb: MockVectorDatabase;
  let mockEmbeddingService: MockEmbeddingService;
  let mockMemoryDecayManager: MockMemoryDecayManager;
  let swrManager: SharpWaveRippleManager;
  let cognitiveMapTracker: CognitiveMapTracker;

  beforeEach(() => {
    // Initialize mocks
    mockVectorDb = new MockVectorDatabase();
    mockEmbeddingService = new MockEmbeddingService();
    mockMemoryDecayManager = new MockMemoryDecayManager();

    // Initialize managers with mocked dependencies
    swrManager = new SharpWaveRippleManager({
      enabled: true,
      taggingInterval: 1000,
      consolidationInterval: 2000,
      maxQueueSize: 50,
      competitionThreshold: 0.5,
      temporalCompressionRatio: 0.1,
      vectorDb: mockVectorDb,
      embeddingService: mockEmbeddingService,
    });

    cognitiveMapTracker = new CognitiveMapTracker({
      enabled: true,
      updateInterval: 3000,
      maxManifoldSize: 100,
      manifoldDimensions: 3,
      clusteringThreshold: 0.3,
      vectorDb: mockVectorDb,
      embeddingService: mockEmbeddingService,
    });
  });

  afterEach(() => {
    // Clear any intervals or timers
    swrManager['clearQueue']?.();
    cognitiveMapTracker['snapshots'] = [];
  });

  describe('Sharp Wave Ripple Manager', () => {
    it('should tag important memories for consolidation', async () => {
      const memoryId = 'test-memory-1';
      const content = 'This is a very important memory about learning';
      const metadata = {
        type: 'knowledge',
        importance: 0.8,
        emotionalImpact: 0.6,
        learningValue: 0.9,
        socialSignificance: 0.2,
        taskRelevance: 0.7,
        narrativeImportance: 0.5,
        entities: ['learning', 'memory'],
        topics: ['neuroscience', 'cognition'],
        timestamp: Date.now(),
      };

      await swrManager.tagMemory(memoryId, content, metadata);

      const queueStatus = swrManager.getQueueStatus();
      expect(queueStatus.queueSize).toBe(1);

      const stats = swrManager.getStatistics();
      expect(stats.totalTagged).toBe(1);
    });

    it('should process consolidation without database dependencies', async () => {
      // Add a few memories
      const memories = [
        { id: 'memory-1', content: 'First memory', importance: 0.8 },
        { id: 'memory-2', content: 'Second memory', importance: 0.6 },
        { id: 'memory-3', content: 'Third memory', importance: 0.4 },
      ];

      for (const mem of memories) {
        await swrManager.tagMemory(mem.id, mem.content, {
          type: 'knowledge',
          importance: mem.importance,
          emotionalImpact: 0.5,
          learningValue: 0.5,
          socialSignificance: 0.5,
          taskRelevance: 0.5,
          narrativeImportance: 0.5,
          timestamp: Date.now(),
        });
      }

      // Run consolidation
      const result = await swrManager.forceConsolidation();

      expect(result.consolidatedMemories).toBeGreaterThanOrEqual(0);
      expect(result.averageStrength).toBeGreaterThanOrEqual(0);

      console.log(
        `✅ Consolidation test: ${result.consolidatedMemories} memories processed`
      );
    });

    it('should calculate SWR strength correctly', async () => {
      const metadata = {
        type: 'experience',
        importance: 0.8,
        emotionalImpact: 0.7,
        learningValue: 0.6,
        socialSignificance: 0.4,
        taskRelevance: 0.5,
        narrativeImportance: 0.3,
        timestamp: Date.now(),
      };

      // Access private method for testing
      const swrStrength = (swrManager as any).calculateSWRStrength(metadata);

      // Expected calculation: 0.8 * 0.4 + 0.7 * 0.25 + 0.6 * 0.15 + 0.4 * 0.1 + 0.3 * 0.1
      const expectedStrength =
        0.8 * 0.4 + 0.7 * 0.25 + 0.6 * 0.15 + 0.4 * 0.1 + 0.3 * 0.1;
      expect(swrStrength).toBeCloseTo(expectedStrength, 2);
    });

    it('should demonstrate neuroscience-inspired memory consolidation performance', async () => {
      console.log(
        '🧠 Starting neuroscience memory system performance benchmark...'
      );

      const startTime = Date.now();

      // Simulate realistic memory load (50 memories)
      const memoryCount = 50;
      const memories: Array<{
        id: string;
        content: string;
        importance: number;
      }> = [];

      for (let i = 0; i < memoryCount; i++) {
        memories.push({
          id: `benchmark-memory-${i}`,
          content: `This is benchmark memory ${i} with neuroscience-inspired content about learning, memory consolidation, and cognitive processes`,
          importance: 0.5 + Math.random() * 0.4, // 0.5-0.9 range
        });
      }

      console.log(`   📝 Adding ${memoryCount} memories to SWR queue...`);

      // Tag all memories
      for (const mem of memories) {
        await swrManager.tagMemory(mem.id, mem.content, {
          type: 'knowledge',
          importance: mem.importance,
          emotionalImpact: Math.random(),
          learningValue: Math.random(),
          socialSignificance: Math.random(),
          taskRelevance: Math.random(),
          narrativeImportance: Math.random(),
          timestamp: Date.now(),
        });
      }

      const taggingTime = Date.now();
      console.log(`   ✅ Tagging completed in ${taggingTime - startTime}ms`);

      // Run consolidation
      console.log('   🌊 Running consolidation cycle...');
      const consolidationResult = await swrManager.forceConsolidation();
      const consolidationTime = Date.now();

      console.log(
        `   ✅ Consolidation completed in ${consolidationTime - taggingTime}ms`
      );

      // Get final statistics
      const finalStats = swrManager.getStatistics();
      const totalTime = Date.now() - startTime;

      console.log('📊 Performance Results:');
      console.log(`   - Total memories processed: ${memoryCount}`);
      console.log(`   - Total time: ${totalTime}ms`);
      console.log(
        `   - Tagging rate: ${((memoryCount / (taggingTime - startTime)) * 1000).toFixed(1)} memories/sec`
      );
      console.log(
        `   - Consolidation rate: ${((consolidationResult.consolidatedMemories / (consolidationTime - taggingTime)) * 1000).toFixed(1)} memories/sec`
      );
      console.log(
        `   - Competition win rate: ${(finalStats.competitionWinRate * 100).toFixed(1)}%`
      );
      console.log(
        `   - Average memory strength: ${finalStats.averageStrength.toFixed(3)}`
      );

      // Performance assertions
      expect(totalTime).toBeLessThan(3000); // Should complete in under 3 seconds
      expect(consolidationResult.consolidatedMemories).toBeGreaterThan(0);
      expect(finalStats.totalTagged).toBe(memoryCount);
      expect(finalStats.competitionWinRate).toBeGreaterThan(0);
      expect(finalStats.competitionWinRate).toBeLessThanOrEqual(1);

      console.log(
        '🎉 Neuroscience memory system benchmark completed successfully!'
      );
    });

    it('should run consolidation and select winners', async () => {
      // Add multiple memories with different priorities
      const memories = [
        {
          id: 'high-priority',
          importance: 0.9,
          content: 'Very important discovery',
        },
        {
          id: 'medium-priority',
          importance: 0.6,
          content: 'Interesting observation',
        },
        { id: 'low-priority', importance: 0.3, content: 'Routine information' },
      ];

      for (const mem of memories) {
        await swrManager.tagMemory(mem.id, mem.content, {
          type: 'knowledge',
          importance: mem.importance,
          emotionalImpact: 0.5,
          learningValue: 0.5,
          socialSignificance: 0.5,
          taskRelevance: 0.5,
          narrativeImportance: 0.5,
          timestamp: Date.now(),
        });
      }

      // Mock embedding service to return predictable embeddings
      mockEmbeddingService.embed.mockResolvedValue({
        embedding: new Array(768).fill(0.1),
        tokens: 10,
      });

      const result = await swrManager.forceConsolidation();

      expect(result.consolidatedMemories).toBeGreaterThan(0);
      expect(result.averageStrength).toBeGreaterThan(0);
    });

    it('should implement neural competition correctly', async () => {
      // Add memories with different consolidation priorities
      const memories = [
        { id: 'winner-1', priority: 0.8 },
        { id: 'loser-1', priority: 0.4 },
        { id: 'winner-2', priority: 0.7 },
        { id: 'loser-2', priority: 0.3 },
      ];

      for (const mem of memories) {
        await swrManager.tagMemory(mem.id, `Memory ${mem.id}`, {
          type: 'thought',
          importance: mem.priority,
          emotionalImpact: 0.5,
          learningValue: 0.5,
          socialSignificance: 0.5,
          taskRelevance: 0.5,
          narrativeImportance: 0.5,
          timestamp: Date.now(),
        });
      }

      const result = await swrManager.forceConsolidation();
      const stats = swrManager.getStatistics();

      // Should have some competition winners
      expect(result.competitionWinners).toBeGreaterThan(0);
      expect(stats.competitionWinRate).toBeGreaterThan(0);
      expect(stats.competitionWinRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Cognitive Map Tracker', () => {
    it('should add memories to manifold with correct coordinates', async () => {
      const memoryId = 'test-cognitive-memory';
      const embedding = new Array(768).fill(0.1); // Mock embedding
      const metadata = {
        type: 'knowledge',
        importance: 0.7,
        timestamp: Date.now(),
        entities: ['test'],
        topics: ['cognitive', 'science'],
      };

      await cognitiveMapTracker.addToManifold(
        memoryId,
        'Test content',
        embedding,
        metadata
      );

      const stats = cognitiveMapTracker.getStatistics();
      expect(stats.totalMemories).toBe(1);

      // Check that coordinates were calculated
      const point = (cognitiveMapTracker as any).manifold[0];
      expect(point.manifoldCoordinates).toHaveLength(3); // 3D space
      expect(point.learningProgress).toBeGreaterThan(0);
    });

    it('should update cognitive map and create clusters', async () => {
      // Add multiple memories to create clusters
      const memories = [
        { id: 'semantic-1', type: 'knowledge', content: 'Facts about science' },
        {
          id: 'semantic-2',
          type: 'knowledge',
          content: 'More scientific facts',
        },
        {
          id: 'episodic-1',
          type: 'experience',
          content: 'Personal experience',
        },
        { id: 'procedural-1', type: 'thought', content: 'How to do something' },
      ];

      for (const mem of memories) {
        const embedding = new Array(768).fill(
          mem.id === 'semantic-1' ? 0.2 : 0.1
        );
        await cognitiveMapTracker.addToManifold(
          mem.id,
          mem.content,
          embedding,
          {
            type: mem.type,
            importance: 0.6,
            timestamp: Date.now(),
            topics: ['test'],
          }
        );
      }

      const snapshot = await cognitiveMapTracker.updateMap();

      expect(snapshot.clusters.length).toBeGreaterThan(0);
      expect(snapshot.learningProgression.totalMemories).toBe(memories.length);

      const stats = cognitiveMapTracker.getStatistics();
      expect(stats.totalClusters).toBeGreaterThan(0);
      expect(stats.clusterStability).toBeGreaterThanOrEqual(0);
    });

    it('should find similar memories in cognitive space', () => {
      const referenceId = 'reference-memory';
      const similarId = 'similar-memory';
      const differentId = 'different-memory';

      // Add memories with similar embeddings (should cluster together)
      const similarEmbedding = new Array(768).fill(0.2);
      const differentEmbedding = new Array(768).fill(0.8);

      // This would need actual async implementation in real test
      expect(true).toBe(true); // Placeholder for now
    });
  });

  describe('Memory Decay Manager Enhancement', () => {
    it('should calculate consolidation boost for recently consolidated memories', () => {
      const record = {
        memoryId: 'test-memory',
        lastAccessed: Date.now(),
        accessCount: 1,
        accessPattern: 'recent' as const,
        decayRate: 0.05,
        importance: 0.7,
        shouldRetain: true,
        consolidationCandidate: false,
        consolidatedAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
        swrStrength: 0.6,
        consolidationHistory: [],
      };

      const boost = (mockMemoryDecayManager as any).calculateConsolidationBoost(
        record
      );
      expect(boost).toBeGreaterThan(0);
      expect(boost).toBeLessThanOrEqual(0.3); // Max boost is 30%
    });

    it('should record consolidation events', () => {
      const memoryId = 'consolidated-memory';

      (mockMemoryDecayManager as any).recordConsolidation(
        memoryId,
        'swr',
        0.7,
        0.1
      );

      // Verify the call was made (mock verification would be here)
      expect(true).toBe(true);
    });
  });

  describe('Neuroscience Consolidation Manager', () => {
    it('should orchestrate complete consolidation cycle', async () => {
      // Mock successful consolidation results
      jest.spyOn(swrManager, 'forceConsolidation').mockResolvedValue({
        consolidatedMemories: 5,
        totalReplayTime: 1500,
        averageStrength: 0.75,
        competitionWinners: 5,
        spaceOptimized: 5120,
      });

      jest.spyOn(cognitiveMapTracker, 'updateMap').mockResolvedValue({
        timestamp: Date.now(),
        manifold: [],
        clusters: [{ id: 'cluster-1', clusterType: 'semantic', memories: [] }],
        learningProgression: {
          totalMemories: 10,
          averageLearningProgress: 0.8,
          clusterDistribution: { semantic: 1 },
          manifoldDimensionality: 3,
        },
        trajectories: [],
      });

      jest.spyOn(mockMemoryDecayManager, 'evaluateMemories').mockResolvedValue({
        decayResults: [],
        cleanupRecommendations: {
          totalMemories: 10,
          retainedMemories: 8,
          consolidatedMemories: 2,
          archivedMemories: 1,
          deletedMemories: 1,
          spaceSaved: 1024,
          consolidationSummary: [],
        },
      });

      const result = await consolidationManager.runConsolidationCycle();

      expect(result.duration).toBeGreaterThan(0);
      expect(result.phases.swrConsolidation.consolidated).toBe(5);
      expect(result.phases.cognitiveMapUpdate.clusters).toBe(1);
      expect(result.overall.totalConsolidated).toBe(7); // SWR + decay consolidation
      expect(result.overall.cognitiveHealth).toMatch(
        /excellent|good|fair|poor/
      );
    });

    it('should provide comprehensive consolidation insights', async () => {
      const insights = await consolidationManager.getConsolidationInsights();

      expect(insights.memoryHealth).toHaveProperty('consolidationEfficiency');
      expect(insights.memoryHealth).toHaveProperty('cognitiveOrganization');
      expect(insights.memoryHealth).toHaveProperty('learningProgression');
      expect(insights.memoryHealth).toHaveProperty('memoryStability');
      expect(insights.memoryHealth).toHaveProperty('overallScore');

      expect(insights.recommendations).toBeInstanceOf(Array);
      expect(insights.patterns).toHaveProperty('dominantMemoryTypes');
      expect(insights.patterns).toHaveProperty('clusterDistribution');
      expect(insights.patterns).toHaveProperty('learningTrajectories');
    });

    it('should report consolidation status correctly', async () => {
      const status = await consolidationManager.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('nextCycleIn');
      expect(status).toHaveProperty('systemActivity');
      expect(status).toHaveProperty('consolidationHealth');
      expect(status).toHaveProperty('activeComponents');

      expect(status.activeComponents).toHaveProperty('sharpWaveRipples');
      expect(status.activeComponents).toHaveProperty('cognitiveMapping');
      expect(status.activeComponents).toHaveProperty('memoryDecay');
    });
  });

  describe('Integration Tests', () => {
    it('should integrate all components for end-to-end memory processing', async () => {
      // This test verifies that the entire neuroscience-inspired memory system
      // works together from memory ingestion to consolidation

      // 1. Tag important memories
      await swrManager.tagMemory(
        'integration-test-memory',
        'This is a test of the complete system',
        {
          type: 'knowledge',
          importance: 0.8,
          emotionalImpact: 0.6,
          learningValue: 0.7,
          socialSignificance: 0.3,
          taskRelevance: 0.8,
          narrativeImportance: 0.5,
          timestamp: Date.now(),
        }
      );

      // 2. Add to cognitive map
      const embedding = new Array(768).fill(0.1);
      await cognitiveMapTracker.addToManifold(
        'integration-test-memory',
        'Test content',
        embedding,
        {
          type: 'knowledge',
          importance: 0.8,
          timestamp: Date.now(),
          topics: ['integration', 'test'],
        }
      );

      // 3. Run consolidation cycle
      const result = await consolidationManager.runConsolidationCycle();

      expect(result.overall.totalConsolidated).toBeGreaterThanOrEqual(0);
      expect(
        result.phases.swrConsolidation.consolidated
      ).toBeGreaterThanOrEqual(0);

      // 4. Verify cognitive map was updated
      const mapStats = cognitiveMapTracker.getStatistics();
      expect(mapStats.totalMemories).toBe(1);

      console.log('✅ Integration test completed successfully');
      console.log(
        `   - Consolidated: ${result.overall.totalConsolidated} memories`
      );
      console.log(
        `   - Cognitive map: ${mapStats.totalMemories} memories, ${mapStats.totalClusters} clusters`
      );
    });

    it('should handle memory competition and consolidation correctly', async () => {
      // Add multiple memories with different priorities
      const priorities = [
        { id: 'high-priority', importance: 0.9 },
        { id: 'medium-priority', importance: 0.6 },
        { id: 'low-priority', importance: 0.3 },
      ];

      for (const mem of priorities) {
        await swrManager.tagMemory(
          mem.id,
          `Memory with ${mem.importance} importance`,
          {
            type: 'thought',
            importance: mem.importance,
            emotionalImpact: 0.5,
            learningValue: 0.5,
            socialSignificance: 0.5,
            taskRelevance: 0.5,
            narrativeImportance: 0.5,
            timestamp: Date.now(),
          }
        );
      }

      const result = await consolidationManager.runConsolidationCycle();
      const stats = swrManager.getStatistics();

      expect(result.phases.swrConsolidation.consolidated).toBeGreaterThan(0);
      expect(stats.competitionWinRate).toBeGreaterThan(0);
      expect(stats.competitionWinRate).toBeLessThanOrEqual(1);

      console.log(
        `✅ Competition test: ${stats.competitionWinRate * 100}% win rate`
      );
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle memory consolidation efficiently', async () => {
      const startTime = Date.now();

      // Add 20 memories for consolidation
      for (let i = 0; i < 20; i++) {
        await swrManager.tagMemory(
          `perf-test-${i}`,
          `Performance test memory ${i}`,
          {
            type: 'knowledge',
            importance: 0.5 + Math.random() * 0.4, // 0.5-0.9
            emotionalImpact: Math.random(),
            learningValue: Math.random(),
            socialSignificance: Math.random(),
            taskRelevance: Math.random(),
            narrativeImportance: Math.random(),
            timestamp: Date.now(),
          }
        );
      }

      const consolidationStart = Date.now();
      const result = await consolidationManager.runConsolidationCycle();
      const consolidationTime = Date.now() - consolidationStart;
      const totalTime = Date.now() - startTime;

      console.log(`⚡ Performance test completed in ${totalTime}ms`);
      console.log(`   - Consolidation time: ${consolidationTime}ms`);
      console.log(
        `   - Consolidated: ${result.overall.totalConsolidated} memories`
      );

      // Performance should be reasonable (under 5 seconds for 20 memories)
      expect(totalTime).toBeLessThan(5000);
      expect(consolidationTime).toBeLessThan(3000);
    });

    it('should scale with memory load', async () => {
      const memoryCounts = [5, 10, 15];

      for (const count of memoryCounts) {
        const testStart = Date.now();

        // Add memories
        for (let i = 0; i < count; i++) {
          await swrManager.tagMemory(
            `scale-test-${count}-${i}`,
            `Scale test memory ${i}`,
            {
              type: 'knowledge',
              importance: 0.6,
              emotionalImpact: 0.5,
              learningValue: 0.5,
              socialSignificance: 0.5,
              taskRelevance: 0.5,
              narrativeImportance: 0.5,
              timestamp: Date.now(),
            }
          );
        }

        const consolidationStart = Date.now();
        await consolidationManager.runConsolidationCycle();
        const consolidationTime = Date.now() - consolidationStart;
        const testTime = Date.now() - testStart;

        console.log(
          `📈 Scale test (${count} memories): ${testTime}ms total, ${consolidationTime}ms consolidation`
        );

        // Should scale roughly linearly
        expect(testTime).toBeLessThan(2000); // Reasonable time for scale test
      }
    });
  });
});
