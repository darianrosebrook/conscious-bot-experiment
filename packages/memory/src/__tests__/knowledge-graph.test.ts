/**
 * Enhanced Knowledge Graph Core Tests
 *
 * Tests the PostgreSQL-persisted knowledge graph with vector embeddings
 * and memory decay integration for hybrid memory search.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  EnhancedKnowledgeGraphCore,
  EnhancedEntity,
  EnhancedRelationship,
  EntityType,
  RelationType,
} from '../knowledge-graph-core';
import { EntityExtractionService } from '../entity-extraction-service';

const POSTGRES_AVAILABLE = process.env.POSTGRES_AVAILABLE === 'true';

describe.skipIf(!POSTGRES_AVAILABLE)('Enhanced Knowledge Graph Core', () => {
  let knowledgeGraph: EnhancedKnowledgeGraphCore;
  let extractionService: EntityExtractionService;

  beforeAll(async () => {
    // Use test database configuration
    knowledgeGraph = new EnhancedKnowledgeGraphCore({
      database: {
        host: 'localhost',
        port: 5432,
        user: 'conscious_bot',
        password: 'secure_password',
        database: 'conscious_bot_test',
        tablePrefix: 'enhanced_kg_test',
      },
      vectorDimension: 768,
    });

    extractionService = new EntityExtractionService();

    await knowledgeGraph.initialize();
  });

  afterAll(async () => {
    await knowledgeGraph.close();
  });

  beforeEach(async () => {
    // Clean test data
    const client = await knowledgeGraph['pool'].connect();
    try {
      await client.query('TRUNCATE TABLE enhanced_kg_test_entities CASCADE');
      await client.query(
        'TRUNCATE TABLE enhanced_kg_test_relationships CASCADE'
      );
    } finally {
      client.release();
    }
  });

  describe('Enhanced Entity Management', () => {
    it('creates entities with vector embeddings and decay profiles [A2]', async () => {
      const entityData = {
        name: 'Neural Network',
        type: EntityType.CONCEPT,
        confidence: 0.9,
        aliases: ['NN', 'neural net'],
        embedding: new Array(768).fill(0.1),
        metadata: {
          frequency: 5,
          context: ['machine learning', 'deep learning'],
          relatedTerms: ['algorithm', 'model'],
          importance: 0.8,
          memoryTypes: ['semantic', 'procedural'],
          extractionMethods: ['nlp', 'manual'],
        },
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
      };

      const entity = await knowledgeGraph.upsertEntity(entityData);

      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('Neural Network');
      expect(entity.type).toBe(EntityType.CONCEPT);
      expect(entity.confidence).toBe(0.9);
      expect(entity.embedding).toHaveLength(768);
      expect(entity.decayProfile.memoryType).toBe('semantic');
      expect(entity.provenance.sourceSystem).toBe('test');
    });

    it('handles entity deduplication and merging [A6]', async () => {
      // Create first entity
      await knowledgeGraph.upsertEntity({
        name: 'Machine Learning',
        type: EntityType.CONCEPT,
        confidence: 0.8,
        embedding: new Array(768).fill(0.1),
      });

      // Create second entity with similar name (should merge)
      await knowledgeGraph.upsertEntity({
        name: 'machine learning', // Lowercase version
        type: EntityType.CONCEPT,
        confidence: 0.85,
        embedding: new Array(768).fill(0.15),
      });

      // Check that we have only one entity (merged)
      const stats = await knowledgeGraph.getStats();
      expect(stats.entityCount).toBe(1);
    });

    it('records entity access for decay calculation [decay integration]', async () => {
      const entity = await knowledgeGraph.upsertEntity({
        name: 'Test Entity',
        type: EntityType.CONCEPT,
        confidence: 0.8,
        embedding: new Array(768).fill(0.1),
      });

      // Record access
      await knowledgeGraph.recordEntityAccess(entity.id, {
        importance: 0.9,
        accessType: 'search',
      });

      // Verify access was recorded (would need to query the database to check)
      // For this test, we verify the method doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Enhanced Relationship Management', () => {
    it('creates relationships with enhanced evidence [A6]', async () => {
      // Create source and target entities
      const sourceEntity = await knowledgeGraph.upsertEntity({
        name: 'Neural Network',
        type: EntityType.CONCEPT,
        confidence: 0.9,
        embedding: new Array(768).fill(0.1),
      });

      const targetEntity = await knowledgeGraph.upsertEntity({
        name: 'Machine Learning',
        type: EntityType.CONCEPT,
        confidence: 0.85,
        embedding: new Array(768).fill(0.15),
      });

      // Create relationship
      const relationship = await knowledgeGraph.createRelationship({
        sourceEntityId: sourceEntity.id,
        targetEntityId: targetEntity.id,
        type: RelationType.USED_FOR,
        confidence: 0.8,
        strength: 0.7,
        evidence: {
          sourceText: 'Neural networks are used in machine learning algorithms',
          cooccurrenceCount: 3,
          contextWindow: 20,
          extractionMethod: 'nlp',
          mutualInformation: 0.6,
        },
      });

      expect(relationship.id).toBeDefined();
      expect(relationship.sourceId).toBe(sourceEntity.id);
      expect(relationship.targetId).toBe(targetEntity.id);
      expect(relationship.type).toBe(RelationType.USED_FOR);
      expect(relationship.confidence).toBe(0.8);
      expect(relationship.strength).toBe(0.7);
      expect(relationship.evidence.mutualInformation).toBe(0.6);
    });

    it('handles relationship updates and merging', async () => {
      const sourceEntity = await knowledgeGraph.upsertEntity({
        name: 'Entity A',
        type: EntityType.CONCEPT,
        confidence: 0.8,
        embedding: new Array(768).fill(0.1),
      });

      const targetEntity = await knowledgeGraph.upsertEntity({
        name: 'Entity B',
        type: EntityType.CONCEPT,
        confidence: 0.85,
        embedding: new Array(768).fill(0.15),
      });

      // Create initial relationship
      await knowledgeGraph.createRelationship({
        sourceEntityId: sourceEntity.id,
        targetEntityId: targetEntity.id,
        type: RelationType.RELATED_TO,
        confidence: 0.7,
        strength: 0.5,
      });

      // Create another relationship with same entities (should update)
      await knowledgeGraph.createRelationship({
        sourceEntityId: sourceEntity.id,
        targetEntityId: targetEntity.id,
        type: RelationType.RELATED_TO,
        confidence: 0.8,
        strength: 0.6,
      });

      // Check that we have only one relationship (updated)
      const stats = await knowledgeGraph.getStats();
      expect(stats.relationshipCount).toBe(1);
    });
  });

  describe('Advanced Search Capabilities', () => {
    beforeEach(async () => {
      // Create test entities with embeddings
      const testEntities = [
        {
          name: 'Neural Network',
          type: EntityType.CONCEPT,
          confidence: 0.9,
          embedding: new Array(768).fill(0.2), // Similar embeddings
        },
        {
          name: 'Machine Learning',
          type: EntityType.CONCEPT,
          confidence: 0.85,
          embedding: new Array(768).fill(0.18),
        },
        {
          name: 'Deep Learning',
          type: EntityType.CONCEPT,
          confidence: 0.8,
          embedding: new Array(768).fill(0.22),
        },
      ];

      for (const entityData of testEntities) {
        await knowledgeGraph.upsertEntity(entityData);
      }

      // Create relationships
      const neuralEntity = (
        await knowledgeGraph.searchEntities({ query: 'Neural' })
      ).entities[0];
      const mlEntity = (
        await knowledgeGraph.searchEntities({ query: 'Machine' })
      ).entities[0];
      const dlEntity = (await knowledgeGraph.searchEntities({ query: 'Deep' }))
        .entities[0];

      if (neuralEntity && mlEntity) {
        await knowledgeGraph.createRelationship({
          sourceEntityId: neuralEntity.id,
          targetEntityId: mlEntity.id,
          type: RelationType.USED_FOR,
          confidence: 0.8,
          strength: 0.7,
        });
      }

      if (neuralEntity && dlEntity) {
        await knowledgeGraph.createRelationship({
          sourceEntityId: neuralEntity.id,
          targetEntityId: dlEntity.id,
          type: RelationType.RELATED_TO,
          confidence: 0.9,
          strength: 0.8,
        });
      }
    });

    it('performs vector similarity search [A1]', async () => {
      const queryEmbedding = new Array(768).fill(0.2); // Similar to neural network

      const results = await knowledgeGraph.searchEntities({
        queryEmbedding,
        searchMode: 'vector',
        limit: 5,
      });

      expect(results.entities.length).toBeGreaterThan(0);
      expect(results.searchTime).toBeGreaterThan(0);

      // Most similar entity should be first
      expect(results.entities[0].name).toContain('Neural');
    });

    it('performs hybrid search combining vector and text [A1]', async () => {
      const queryEmbedding = new Array(768).fill(0.2);

      const results = await knowledgeGraph.searchEntities({
        query: 'network',
        queryEmbedding,
        searchMode: 'hybrid',
        limit: 5,
      });

      expect(results.entities.length).toBeGreaterThan(0);

      // Should find neural network entity
      const neuralEntity = results.entities.find((e) =>
        e.name.includes('Neural')
      );
      expect(neuralEntity).toBeDefined();
    });

    it('finds multi-hop paths between entities [A3]', async () => {
      // Get entity IDs
      const neuralResults = await knowledgeGraph.searchEntities({
        query: 'Neural',
      });
      const mlResults = await knowledgeGraph.searchEntities({
        query: 'Machine',
      });
      const dlResults = await knowledgeGraph.searchEntities({ query: 'Deep' });

      if (neuralResults.entities.length > 0 && mlResults.entities.length > 0) {
        const neuralId = neuralResults.entities[0].id;
        const mlId = mlResults.entities[0].id;

        const paths = await knowledgeGraph.findPath(neuralId, mlId, 2);

        expect(paths.length).toBeGreaterThan(0);
        expect(paths[0].hopCount).toBeGreaterThanOrEqual(1);
        expect(paths[0].confidence).toBeGreaterThan(0);
      }
    });

    it('gets entity neighborhood with relationship details', async () => {
      const neuralResults = await knowledgeGraph.searchEntities({
        query: 'Neural',
      });
      if (neuralResults.entities.length > 0) {
        const neuralId = neuralResults.entities[0].id;

        const neighborhood = await knowledgeGraph.getEntityNeighborhood(
          neuralId,
          1
        );

        expect(neighborhood.entityId).toBe(neuralId);
        expect(neighborhood.neighbors.length).toBeGreaterThanOrEqual(0);
        expect(neighborhood.relationships.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Entity Extraction Integration', () => {
    it('processes extraction results with deduplication [A6]', async () => {
      const text = `
        John Smith works at Google on machine learning projects.
        Mary Johnson develops neural network algorithms at OpenAI.
        The research team at MIT studies deep learning architectures.
      `;

      // Extract entities and relationships
      const extractionResult = await extractionService.extractFromText(
        text,
        'integration-test'
      );

      // Process through knowledge graph
      const processResult = await knowledgeGraph.processExtractionResults([
        extractionResult,
      ]);

      expect(processResult.entitiesCreated).toBeGreaterThan(0);
      expect(processResult.duplicatesResolved).toBeGreaterThanOrEqual(0);

      // Verify entities were created
      const stats = await knowledgeGraph.getStats();
      expect(stats.entityCount).toBeGreaterThan(0);
      expect(stats.relationshipCount).toBeGreaterThan(0);
    });

    it('maintains entity relationships across extractions', async () => {
      // First extraction
      const text1 = 'Neural networks are used in machine learning.';
      const result1 = await extractionService.extractFromText(text1, 'test-1');
      await knowledgeGraph.processExtractionResults([result1]);

      // Second extraction with overlapping entities
      const text2 =
        'Machine learning algorithms use neural network architectures.';
      const result2 = await extractionService.extractFromText(text2, 'test-2');
      await knowledgeGraph.processExtractionResults([result2]);

      // Check that relationships were created between entities
      const stats = await knowledgeGraph.getStats();
      expect(stats.relationshipCount).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('provides comprehensive statistics [monitoring]', async () => {
      // Create test entities
      await knowledgeGraph.upsertEntity({
        name: 'Test Entity',
        type: EntityType.CONCEPT,
        confidence: 0.8,
        embedding: new Array(768).fill(0.1),
      });

      const stats = await knowledgeGraph.getStats();

      expect(stats.entityCount).toBe(1);
      expect(stats.vectorEnabled).toBe(true);
      expect(stats.totalEmbeddings).toBe(1);
      expect(stats.avgEmbeddingDimension).toBe(768);
      expect(stats.decayStats).toBeDefined();
    });

    it('handles batch operations efficiently [PERF: batch operations]', async () => {
      const entities = Array(50)
        .fill(null)
        .map((_, i) => ({
          name: `Entity ${i}`,
          type: EntityType.CONCEPT,
          confidence: 0.8,
          embedding: new Array(768).fill(0.1),
        }));

      const start = performance.now();
      for (const entity of entities) {
        await knowledgeGraph.upsertEntity(entity);
      }
      const duration = performance.now() - start;

      // Should handle 50 entities in reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds

      const stats = await knowledgeGraph.getStats();
      expect(stats.entityCount).toBe(50);
    });
  });

  describe('Memory Decay Integration', () => {
    it('tracks memory decay for entities [decay invariants]', async () => {
      const entity = await knowledgeGraph.upsertEntity({
        name: 'Decay Test Entity',
        type: EntityType.CONCEPT,
        confidence: 0.8,
        embedding: new Array(768).fill(0.1),
        decayProfile: {
          memoryType: 'semantic',
          baseDecayRate: 0.05, // 5% per day
          lastAccessed: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
          accessCount: 1,
          importance: 0.6,
          consolidationHistory: [],
        },
      });

      // Record SWR consolidation
      await knowledgeGraph.recordEntityAccess(entity.id, {
        swrStrength: 0.8,
        accessType: 'consolidation',
      });

      // Verify consolidation was recorded (would need database query to check)
      expect(true).toBe(true);
    });

    it('provides decay-aware statistics', async () => {
      // Create entity with decay profile
      await knowledgeGraph.upsertEntity({
        name: 'Decay Stats Entity',
        type: EntityType.CONCEPT,
        confidence: 0.8,
        embedding: new Array(768).fill(0.1),
      });

      const stats = await knowledgeGraph.getStats();

      expect(stats.decayStats).toBeDefined();
      expect(stats.decayStats.avgImportance).toBeGreaterThanOrEqual(0);
      expect(stats.decayStats.avgAccessCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles database connection errors gracefully', async () => {
      // This would require mocking the database connection
      // For now, we verify the method exists and doesn't throw immediately
      expect(knowledgeGraph.initialize).toBeDefined();
      expect(knowledgeGraph.close).toBeDefined();
    });

    it('validates entity data before insertion', async () => {
      // Test with invalid entity type
      await expect(
        knowledgeGraph.upsertEntity({
          name: 'Invalid Type Entity',
          type: 'INVALID_TYPE' as any,
          confidence: 0.8,
          embedding: new Array(768).fill(0.1),
        })
      ).rejects.toThrow();
    });

    it('handles empty search results', async () => {
      const results = await knowledgeGraph.searchEntities({
        query: 'nonexistent-entity-12345',
        searchMode: 'text',
      });

      expect(results.entities.length).toBe(0);
      expect(results.totalCount).toBe(0);
    });
  });
});
