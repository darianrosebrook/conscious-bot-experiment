/**
 * Enhanced Vector Database Integration Tests
 *
 * Tests the enhanced vector database with knowledge graph and memory decay integration.
 * Follows CAWS Tier 2 requirements with comprehensive testing.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  EnhancedVectorDatabase,
  EnhancedMemoryChunk,
  EnhancedSearchOptions,
} from '../vector-database';

describe('Enhanced Vector Database', () => {
  let db: EnhancedVectorDatabase;

  beforeAll(async () => {
    // Use test database configuration
    db = new EnhancedVectorDatabase({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'conscious_bot_test',
      tableName: 'enhanced_memory_chunks_test',
      dimension: 768,
    });

    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean test data
    const client = await db['pool'].connect();
    try {
      await client.query(`TRUNCATE TABLE ${db['config'].tableName}`);
    } finally {
      client.release();
    }
  });

  describe('Enhanced Schema and Storage', () => {
    it('stores enhanced memory chunks with entity and relationship data [A2]', async () => {
      const chunk: EnhancedMemoryChunk = {
        id: 'test-chunk-1',
        content: 'Neural network optimization techniques for AI systems',
        embedding: new Array(768).fill(0.1),
        metadata: {
          type: 'semantic',
          confidence: 0.9,
          timestamp: Date.now(),
        },
        entities: [
          {
            entityId: 'entity-neural-network',
            entityName: 'Neural Network',
            entityType: 'TECHNOLOGY',
            confidence: 0.85,
          },
          {
            entityId: 'entity-optimization',
            entityName: 'Optimization',
            entityType: 'CONCEPT',
            confidence: 0.75,
          },
        ],
        relationships: [
          {
            relationshipId: 'rel-neural-optimization',
            sourceEntityId: 'entity-neural-network',
            targetEntityId: 'entity-optimization',
            relationshipType: 'USES',
            confidence: 0.8,
            strength: 0.7,
          },
        ],
        decayProfile: {
          memoryType: 'semantic',
          baseDecayRate: 0.01,
          lastAccessed: Date.now(),
          accessCount: 1,
          importance: 0.8,
          consolidationHistory: [],
        },
        provenance: {
          sourceSystem: 'test',
          extractionMethod: 'nlp',
          confidence: 0.9,
          processingTime: 150,
          version: '1.0.0',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.upsertChunk(chunk);

      // Verify storage
      const retrieved = await db.getChunk('test-chunk-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.entities).toHaveLength(2);
      expect(retrieved!.relationships).toHaveLength(1);
      expect(retrieved!.decayProfile.memoryType).toBe('semantic');
    });

    it('updates memory access for decay calculation [decay integration]', async () => {
      // Insert test chunk
      const chunk: EnhancedMemoryChunk = {
        id: 'test-chunk-decay',
        content: 'Memory decay test content',
        embedding: new Array(768).fill(0.1),
        metadata: { type: 'episodic', confidence: 0.8 },
        entities: [],
        relationships: [],
        decayProfile: {
          memoryType: 'episodic',
          baseDecayRate: 0.05,
          lastAccessed: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
          accessCount: 0,
          importance: 0.6,
          consolidationHistory: [],
        },
        provenance: {
          sourceSystem: 'test',
          extractionMethod: 'manual',
          confidence: 0.8,
          processingTime: 100,
          version: '1.0.0',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.upsertChunk(chunk);

      // Record access
      await db.recordAccess('test-chunk-decay', {
        importance: 0.7,
        accessType: 'search',
      });

      // Verify access was recorded
      const updated = await db.getChunk('test-chunk-decay');
      expect(updated!.decayProfile.accessCount).toBe(1);
      expect(updated!.decayProfile.lastAccessed).toBeGreaterThan(
        chunk.decayProfile.lastAccessed
      );
    });
  });

  describe('Enhanced Search Capabilities', () => {
    beforeEach(async () => {
      // Insert test data
      const testChunks: EnhancedMemoryChunk[] = [
        {
          id: 'chunk-neural-1',
          content: 'Neural network training with backpropagation',
          embedding: new Array(768).fill(0.2),
          metadata: { type: 'semantic', confidence: 0.9 },
          entities: [
            {
              entityId: 'neural-network',
              entityName: 'Neural Network',
              entityType: 'TECHNOLOGY',
              confidence: 0.9,
            },
          ],
          relationships: [],
          decayProfile: {
            memoryType: 'semantic',
            baseDecayRate: 0.01,
            lastAccessed: Date.now(),
            accessCount: 5,
            importance: 0.8,
            consolidationHistory: [],
          },
          provenance: {
            sourceSystem: 'test',
            extractionMethod: 'nlp',
            confidence: 0.9,
            processingTime: 120,
            version: '1.0.0',
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'chunk-optimization-1',
          content: 'Mathematical optimization algorithms',
          embedding: new Array(768).fill(0.15),
          metadata: { type: 'semantic', confidence: 0.85 },
          entities: [
            {
              entityId: 'optimization',
              entityName: 'Optimization',
              entityType: 'CONCEPT',
              confidence: 0.85,
            },
          ],
          relationships: [
            {
              relationshipId: 'neural-optimization-rel',
              sourceEntityId: 'neural-network',
              targetEntityId: 'optimization',
              relationshipType: 'USES',
              confidence: 0.8,
              strength: 0.7,
            },
          ],
          decayProfile: {
            memoryType: 'semantic',
            baseDecayRate: 0.01,
            lastAccessed: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
            accessCount: 2,
            importance: 0.7,
            consolidationHistory: [],
          },
          provenance: {
            sourceSystem: 'test',
            extractionMethod: 'nlp',
            confidence: 0.85,
            processingTime: 110,
            version: '1.0.0',
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      await db.batchUpsertChunks(testChunks);
    });

    it('performs hybrid search with entity and relationship awareness [A1]', async () => {
      const queryEmbedding = new Array(768).fill(0.18); // Similar to both chunks

      const options: EnhancedSearchOptions = {
        queryEmbedding,
        limit: 10,
        searchMode: 'hybrid',
        includeExplanations: true,
      };

      const results = await db.search(options);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchedEntities.length).toBeGreaterThan(0);

      // Should include explanation
      expect(results[0].explanation).toBeDefined();
      expect(results[0].explanation!.reasoning).toContain(
        'entity relationships'
      );
    });

    it('applies decay-aware ranking [decay integration]', async () => {
      const queryEmbedding = new Array(768).fill(0.18);

      const options: EnhancedSearchOptions = {
        queryEmbedding,
        searchMode: 'decay_aware',
        recentAccess: true,
      };

      const results = await db.search(options);

      // More recently accessed chunk should rank higher due to decay awareness
      expect(results.length).toBeGreaterThan(1);
      expect(results[0].decayFactors.recencyBoost).toBeGreaterThan(0);
    });

    it('filters by entity types and relationships [graph integration]', async () => {
      const queryEmbedding = new Array(768).fill(0.2);

      const options: EnhancedSearchOptions = {
        queryEmbedding,
        entityTypes: ['TECHNOLOGY'],
        minRelationshipStrength: 0.5,
        searchMode: 'graph_first',
      };

      const results = await db.search(options);

      // Should prioritize chunks with strong technology entities and relationships
      expect(results.length).toBeGreaterThan(0);
      const techEntities = results[0].matchedEntities.filter(
        (e) => e.entityType === 'TECHNOLOGY'
      );
      expect(techEntities.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Decay Integration', () => {
    it('calculates decay factors correctly [decay invariants]', async () => {
      const chunk: EnhancedMemoryChunk = {
        id: 'decay-test-chunk',
        content: 'Memory decay calculation test',
        embedding: new Array(768).fill(0.1),
        metadata: { type: 'episodic', confidence: 0.8 },
        entities: [],
        relationships: [],
        decayProfile: {
          memoryType: 'episodic',
          baseDecayRate: 0.05, // 5% per day
          lastAccessed: Date.now() - 48 * 60 * 60 * 1000, // 2 days ago
          accessCount: 1,
          importance: 0.6,
          consolidationHistory: [],
        },
        provenance: {
          sourceSystem: 'test',
          extractionMethod: 'manual',
          confidence: 0.8,
          processingTime: 100,
          version: '1.0.0',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.upsertChunk(chunk);

      // Test decay calculation
      const decayFactors = db['calculateDecayFactors'](chunk.decayProfile);

      expect(decayFactors.memoryDecay).toBeGreaterThan(0);
      expect(decayFactors.memoryDecay).toBeLessThan(1);
      expect(decayFactors.importanceProtection).toBeGreaterThan(0);
      expect(decayFactors.recencyBoost).toBeGreaterThan(0);
    });

    it('records SWR consolidation events [swr integration]', async () => {
      const chunk: EnhancedMemoryChunk = {
        id: 'swr-test-chunk',
        content: 'SWR consolidation test',
        embedding: new Array(768).fill(0.1),
        metadata: { type: 'episodic', confidence: 0.8 },
        entities: [],
        relationships: [],
        decayProfile: {
          memoryType: 'episodic',
          baseDecayRate: 0.05,
          lastAccessed: Date.now(),
          accessCount: 1,
          importance: 0.6,
          consolidationHistory: [],
        },
        provenance: {
          sourceSystem: 'test',
          extractionMethod: 'manual',
          confidence: 0.8,
          processingTime: 100,
          version: '1.0.0',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.upsertChunk(chunk);

      // Record SWR consolidation
      await db.recordAccess('swr-test-chunk', {
        swrStrength: 0.8,
        accessType: 'consolidation',
      });

      // Verify consolidation was recorded
      const updated = await db.getChunk('swr-test-chunk');
      expect(updated!.decayProfile.consolidationHistory).toHaveLength(1);
      expect(updated!.decayProfile.consolidationHistory[0].type).toBe('swr');
      expect(updated!.decayProfile.consolidationHistory[0].strength).toBe(0.8);
    });
  });

  describe('Performance and Scalability', () => {
    it('handles batch operations efficiently [PERF: batch operations]', async () => {
      const chunks: EnhancedMemoryChunk[] = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `batch-chunk-${i}`,
          content: `Batch test content ${i}`,
          embedding: new Array(768).fill(0.1),
          metadata: { type: 'episodic', confidence: 0.8 },
          entities: [],
          relationships: [],
          decayProfile: {
            memoryType: 'episodic',
            baseDecayRate: 0.05,
            lastAccessed: Date.now(),
            accessCount: 1,
            importance: 0.6,
            consolidationHistory: [],
          },
          provenance: {
            sourceSystem: 'test',
            extractionMethod: 'batch',
            confidence: 0.8,
            processingTime: 100,
            version: '1.0.0',
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

      const start = performance.now();
      await db.batchUpsertChunks(chunks);
      const duration = performance.now() - start;

      // Should handle 100 chunks in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds

      // Verify all chunks were inserted
      const stats = await db.getStats();
      expect(stats.totalChunks).toBe(100);
    });

    it('provides database statistics [monitoring]', async () => {
      // Insert test data
      await db.upsertChunk({
        id: 'stats-test-chunk',
        content: 'Statistics test content',
        embedding: new Array(768).fill(0.1),
        metadata: { type: 'semantic', confidence: 0.8 },
        entities: [
          {
            entityId: 'test-entity',
            entityName: 'Test Entity',
            entityType: 'CONCEPT',
            confidence: 0.8,
          },
        ],
        relationships: [],
        decayProfile: {
          memoryType: 'semantic',
          baseDecayRate: 0.01,
          lastAccessed: Date.now(),
          accessCount: 1,
          importance: 0.7,
          consolidationHistory: [],
        },
        provenance: {
          sourceSystem: 'test',
          extractionMethod: 'manual',
          confidence: 0.8,
          processingTime: 100,
          version: '1.0.0',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const stats = await db.getStats();

      expect(stats.totalChunks).toBe(1);
      expect(stats.entityCount).toBe(1);
      expect(stats.relationshipCount).toBe(0);
      expect(stats.memoryTypeDistribution).toHaveProperty('semantic');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles invalid embeddings gracefully', async () => {
      const invalidChunk: EnhancedMemoryChunk = {
        id: 'invalid-embedding',
        content: 'Invalid embedding test',
        embedding: new Array(512).fill(0.1), // Wrong dimension
        metadata: { type: 'episodic', confidence: 0.8 },
        entities: [],
        relationships: [],
        decayProfile: {
          memoryType: 'episodic',
          baseDecayRate: 0.05,
          lastAccessed: Date.now(),
          accessCount: 1,
          importance: 0.6,
          consolidationHistory: [],
        },
        provenance: {
          sourceSystem: 'test',
          extractionMethod: 'manual',
          confidence: 0.8,
          processingTime: 100,
          version: '1.0.0',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await expect(db.upsertChunk(invalidChunk)).rejects.toThrow(
        'Embedding dimension mismatch'
      );
    });

    it('handles empty search results gracefully', async () => {
      const queryEmbedding = new Array(768).fill(-1); // Very different embedding

      const options: EnhancedSearchOptions = {
        queryEmbedding,
        threshold: 0.9, // Very high threshold
      };

      const results = await db.search(options);
      expect(results).toHaveLength(0);
    });

    it('validates search options', async () => {
      const queryEmbedding = new Array(512).fill(0.1); // Wrong dimension

      const options: EnhancedSearchOptions = {
        queryEmbedding,
      };

      await expect(db.search(options)).rejects.toThrow(
        'Query embedding dimension mismatch'
      );
    });
  });
});
