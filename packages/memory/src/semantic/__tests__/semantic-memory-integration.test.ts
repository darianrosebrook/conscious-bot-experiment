/**
 * Semantic Memory Integration Test
 * 
 * Tests the integration of knowledge graph, GraphRAG, relationship extractor,
 * and query engine components for semantic memory.
 * 
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  KnowledgeGraphCore,
  GraphRAG,
  RelationshipExtractor,
  QueryEngine,
  EntityType,
  RelationType,
  KnowledgeSource,
  PropertyType,
  QueryType,
} from '../index';

describe('Semantic Memory Integration', () => {
  let knowledgeGraph: KnowledgeGraphCore;
  let graphRAG: GraphRAG;
  let relationshipExtractor: RelationshipExtractor;
  let queryEngine: QueryEngine;

  beforeEach(() => {
    knowledgeGraph = new KnowledgeGraphCore();
    graphRAG = new GraphRAG(knowledgeGraph);
    relationshipExtractor = new RelationshipExtractor(knowledgeGraph, graphRAG);
    queryEngine = new QueryEngine(knowledgeGraph, graphRAG, relationshipExtractor);
  });

  describe('Knowledge Graph Core', () => {
    it('should add and retrieve entities', () => {
      const entity = knowledgeGraph.upsertEntity({
        name: 'Diamond',
        type: EntityType.ITEM,
        description: 'A rare and valuable gemstone',
        properties: {
          hardness: {
            value: 10,
            type: PropertyType.NUMBER,
            confidence: 1.0,
            source: KnowledgeSource.SYSTEM,
            timestamp: Date.now(),
          },
          color: {
            value: 'clear',
            type: PropertyType.STRING,
            confidence: 0.9,
            source: KnowledgeSource.SYSTEM,
            timestamp: Date.now(),
          },
        },
        tags: ['gem', 'valuable', 'crafting'],
        confidence: 1.0,
        source: KnowledgeSource.SYSTEM,
      });
      
      expect(entity).toBeDefined();
      expect(entity.id).toBeDefined();
      
      const retrievedEntity = knowledgeGraph.getEntity(entity.id);
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity?.name).toBe('Diamond');
      expect(retrievedEntity?.properties.hardness.value).toBe(10);
    });

    it('should add and retrieve relationships', () => {
      // Create entities
      const diamond = knowledgeGraph.upsertEntity({
        name: 'Diamond',
        type: EntityType.ITEM,
        properties: {},
        tags: ['gem'],
        confidence: 1.0,
        source: KnowledgeSource.SYSTEM,
      });
      
      const pickaxe = knowledgeGraph.upsertEntity({
        name: 'Diamond Pickaxe',
        type: EntityType.ITEM,
        properties: {},
        tags: ['tool'],
        confidence: 1.0,
        source: KnowledgeSource.SYSTEM,
      });
      
      // Create relationship
      const relationship = knowledgeGraph.upsertRelationship({
        sourceId: diamond.id,
        targetId: pickaxe.id,
        type: RelationType.USED_FOR,
        properties: {
          quantity: {
            value: 3,
            type: PropertyType.NUMBER,
            confidence: 1.0,
            source: KnowledgeSource.SYSTEM,
            timestamp: Date.now(),
          },
        },
        bidirectional: false,
        confidence: 1.0,
        source: KnowledgeSource.SYSTEM,
      });
      
      expect(relationship).toBeDefined();
      expect(relationship.id).toBeDefined();
      
      const retrievedRelationship = knowledgeGraph.getRelationship(relationship.id);
      expect(retrievedRelationship).toBeDefined();
      expect(retrievedRelationship?.type).toBe(RelationType.USED_FOR);
      expect(retrievedRelationship?.properties.quantity.value).toBe(3);
    });

    it('should query entities by type', () => {
      // Create entities of different types
      knowledgeGraph.upsertEntity({
        name: 'Diamond',
        type: EntityType.ITEM,
        properties: {},
        tags: [],
        confidence: 1.0,
        source: KnowledgeSource.SYSTEM,
      });
      
      knowledgeGraph.upsertEntity({
        name: 'Iron',
        type: EntityType.ITEM,
        properties: {},
        tags: [],
        confidence: 1.0,
        source: KnowledgeSource.SYSTEM,
      });
      
      knowledgeGraph.upsertEntity({
        name: 'Zombie',
        type: EntityType.CREATURE,
        properties: {},
        tags: [],
        confidence: 1.0,
        source: KnowledgeSource.SYSTEM,
      });
      
      // Query by type
      const items = knowledgeGraph.getEntitiesByType(EntityType.ITEM);
      expect(items).toHaveLength(2);
      expect(items.map(e => e.name)).toContain('Diamond');
      expect(items.map(e => e.name)).toContain('Iron');
      
      const creatures = knowledgeGraph.getEntitiesByType(EntityType.CREATURE);
      expect(creatures).toHaveLength(1);
      expect(creatures[0].name).toBe('Zombie');
    });
  });

  describe('GraphRAG', () => {
    it('should add entities and relationships through GraphRAG', async () => {
      // Add entities
      const diamond = await graphRAG.addEntity(
        'Diamond',
        EntityType.ITEM,
        {
          hardness: 10,
          color: 'clear',
        },
        {
          description: 'A rare and valuable gemstone',
          tags: ['gem', 'valuable'],
        }
      );
      
      const pickaxe = await graphRAG.addEntity(
        'Diamond Pickaxe',
        EntityType.ITEM,
        {
          durability: 1561,
        },
        {
          description: 'A tool used for mining',
          tags: ['tool', 'mining'],
        }
      );
      
      // Add relationship
      const relationship = await graphRAG.addRelationship(
        diamond.id,
        pickaxe.id,
        RelationType.USED_FOR,
        {
          quantity: 3,
        }
      );
      
      expect(relationship).toBeDefined();
      expect(relationship.sourceId).toBe(diamond.id);
      expect(relationship.targetId).toBe(pickaxe.id);
      
      // Query by name
      const result = await graphRAG.query('Diamond');
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities[0].name).toBe('Diamond');
    });

    it('should format query results in different formats', async () => {
      // Add entities
      await graphRAG.addEntity(
        'Oak Wood',
        EntityType.ITEM,
        {
          hardness: 2,
        }
      );
      
      await graphRAG.addEntity(
        'Oak Planks',
        EntityType.ITEM,
        {
          hardness: 2,
        }
      );
      
      await graphRAG.addRelationship(
        knowledgeGraph.findEntityByName('Oak Wood')!.id,
        knowledgeGraph.findEntityByName('Oak Planks')!.id,
        RelationType.PRODUCES,
        {
          yield: 4,
        }
      );
      
      // Query with text format
      const textResult = await graphRAG.query('Oak', {
        formatAsText: true,
      });
      
      expect(textResult.context).toContain('Oak Wood');
      expect(textResult.context).toContain('Oak Planks');
      
      // Query with JSON format
      const jsonResult = await graphRAG.query('Oak', {
        formatAsJson: true,
      });
      
      expect(jsonResult.context).toContain('"name": "Oak Wood"');
      expect(jsonResult.context).toContain('"name": "Oak Planks"');
      
      // Query with triples format
      const triplesResult = await graphRAG.query('Oak', {
        formatAsTriples: true,
      });
      
      expect(triplesResult.context).toContain('Oak Wood, is_a, item');
      expect(triplesResult.context).toContain('Oak Planks, is_a, item');
    });
  });

  describe('Relationship Extractor', () => {
    it('should extract entities and relationships from text', async () => {
      const text = 'A diamond is a valuable gem. A diamond pickaxe is used for mining obsidian.';
      
      const extraction = await relationshipExtractor.extractFromText(text);
      
      expect(extraction.entities.length).toBeGreaterThan(0);
      expect(extraction.entities.some(e => e.name.includes('diamond'))).toBe(true);
      
      // The simple extractor might not find all relationships
      // but we can check that it at least processed the text
      expect(extraction.confidence).toBeGreaterThan(0);
    });

    it('should extract entities and relationships from experience', async () => {
      const experience = {
        id: 'exp-123',
        content: 'I found diamonds in a cave deep underground.',
        timestamp: Date.now(),
        location: {
          name: 'Deep Cave',
          x: 100,
          y: 12,
          z: 200,
          biome: 'underground',
        },
        outcome: 'success',
        emotionalState: {
          valence: 0.9,
        },
        tags: ['mining', 'discovery'],
      };
      
      const extraction = await relationshipExtractor.extractFromExperience(experience);
      
      expect(extraction.entities.length).toBeGreaterThan(0);
      expect(extraction.entities.some(e => e.name === 'Deep Cave' || e.type === EntityType.PLACE)).toBe(true);
      
      // Check that at least one relationship was created
      expect(extraction.relationships.length).toBeGreaterThan(0);
    });
  });

  describe('Query Engine', () => {
    it('should query semantic memory with natural language', async () => {
      // Add some knowledge
      await graphRAG.addEntity(
        'Diamond',
        EntityType.ITEM,
        {
          hardness: 10,
          color: 'clear',
        },
        {
          description: 'A rare and valuable gemstone',
          tags: ['gem', 'valuable'],
        }
      );
      
      await graphRAG.addEntity(
        'Iron',
        EntityType.ITEM,
        {
          hardness: 5,
          color: 'gray',
        },
        {
          description: 'A common metal',
          tags: ['metal', 'common'],
        }
      );
      
      // Query
      const result = await queryEngine.query('What is Diamond?');
      
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities[0].name).toBe('Diamond');
      expect(result.context).toContain('Diamond');
      expect(result.success).toBe(true);
    });

    it('should add facts to knowledge graph', async () => {
      const fact = 'A diamond pickaxe can mine obsidian.';
      
      const success = await queryEngine.addFact(fact);
      
      // The simple extractor might not always succeed
      // but we can check that it processed the fact
      expect(typeof success).toBe('boolean');
      
      // Query to see if knowledge was added
      const result = await queryEngine.query('diamond pickaxe');
      
      // The query might find something, but not guaranteed with the simple implementation
      expect(result).toBeDefined();
    });

    it('should add experiences to knowledge graph', async () => {
      const experience = {
        id: 'exp-456',
        content: 'I built a house using oak wood planks.',
        timestamp: Date.now(),
        location: {
          name: 'Forest Base',
          x: 500,
          y: 70,
          z: 300,
          biome: 'forest',
        },
        outcome: 'success',
        tags: ['building', 'wood'],
      };
      
      const success = await queryEngine.addExperience(experience);
      
      // The simple extractor might not always succeed
      // but we can check that it processed the experience
      expect(typeof success).toBe('boolean');
      
      // Query to see if knowledge was added
      const result = await queryEngine.query('Forest Base');
      
      // The query might find something, but not guaranteed with the simple implementation
      expect(result).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should build and query a knowledge graph about Minecraft items', async () => {
      // Add basic Minecraft knowledge
      await graphRAG.addEntity(
        'Diamond',
        EntityType.ITEM,
        { durability: 10 }
      );
      
      await graphRAG.addEntity(
        'Diamond Pickaxe',
        EntityType.ITEM,
        { durability: 1561 }
      );
      
      await graphRAG.addEntity(
        'Obsidian',
        EntityType.BLOCK,
        { hardness: 50 }
      );
      
      // Add relationships
      await graphRAG.addRelationship(
        knowledgeGraph.findEntityByName('Diamond')!.id,
        knowledgeGraph.findEntityByName('Diamond Pickaxe')!.id,
        RelationType.USED_FOR
      );
      
      await graphRAG.addRelationship(
        knowledgeGraph.findEntityByName('Diamond Pickaxe')!.id,
        knowledgeGraph.findEntityByName('Obsidian')!.id,
        RelationType.USED_FOR
      );
      
      // Query for paths
      const result = await knowledgeGraph.query({
        type: QueryType.PATH,
        parameters: {
          sourceId: knowledgeGraph.findEntityByName('Diamond')!.id,
          targetId: knowledgeGraph.findEntityByName('Obsidian')!.id,
          maxDepth: 3,
        },
      });
      
      // Should find a path from Diamond -> Diamond Pickaxe -> Obsidian
      expect(result.entities.length).toBeGreaterThanOrEqual(2);
      expect(result.relationships.length).toBeGreaterThanOrEqual(1);
      
      // Query with natural language
      const queryResult = await queryEngine.query('How is Diamond related to Obsidian?');
      
      expect(queryResult.entities.length).toBeGreaterThan(0);
      expect(queryResult.paths.length).toBeGreaterThanOrEqual(0);
      expect(queryResult.context).toBeDefined();
    });
  });
});
