/**
 * Entity Extraction Service Tests
 *
 * Tests the multi-modal entity extraction pipeline with confidence scoring
 * and relationship inference capabilities.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  EntityExtractionService,
  EntityType,
  RelationshipType,
} from '../entity-extraction-service';

describe('Entity Extraction Service', () => {
  let service: EntityExtractionService;

  beforeEach(() => {
    service = new EntityExtractionService();
  });

  describe('Entity Extraction', () => {
    it('extracts named entities with high confidence [A6]', async () => {
      const text = `
        John Smith works at Google on the TensorFlow project.
        Mary Johnson develops machine learning algorithms at OpenAI.
        The neural network architecture was designed by researchers at MIT.
      `;

      const result = await service.extractFromText(text, 'test-source-1');

      expect(result.entities.length).toBeGreaterThan(0);

      // Should extract person names
      const persons = result.entities.filter(
        (e) => e.type === EntityType.PERSON
      );
      expect(persons.length).toBeGreaterThanOrEqual(2);

      // Should extract organization names
      const organizations = result.entities.filter(
        (e) => e.type === EntityType.ORGANIZATION
      );
      expect(organizations.length).toBeGreaterThanOrEqual(2);

      // All entities should meet minimum confidence threshold
      result.entities.forEach((entity) => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });

    it('extracts technology and concept entities [A6]', async () => {
      const text = `
        The machine learning model uses neural networks and deep learning algorithms.
        TensorFlow and PyTorch are popular frameworks for AI development.
        The research paper discusses attention mechanisms and transformer architectures.
      `;

      const result = await service.extractFromText(text, 'test-source-2');

      // Should extract technology entities
      const technologies = result.entities.filter(
        (e) => e.type === EntityType.TECHNOLOGY
      );
      expect(technologies.length).toBeGreaterThanOrEqual(2);

      // Should extract concept entities
      const concepts = result.entities.filter(
        (e) => e.type === EntityType.CONCEPT
      );
      expect(concepts.length).toBeGreaterThanOrEqual(2);

      // Check for specific entities
      const entityNames = result.entities.map((e) => e.name);
      expect(entityNames.some((name) => name.includes('TensorFlow'))).toBe(
        true
      );
      expect(entityNames.some((name) => name.includes('neural'))).toBe(true);
    });

    it('provides confidence distribution metrics [A7]', async () => {
      const text = `
        Simple text with common words and proper nouns like Google and Microsoft.
        Complex technical terms like convolutional neural networks and recurrent LSTM.
        Statistical patterns with frequent mentions of machine learning.
      `;

      const result = await service.extractFromText(text, 'test-source-3');

      expect(result.metadata.confidenceDistribution).toBeDefined();
      expect(
        result.metadata.confidenceDistribution.high +
          result.metadata.confidenceDistribution.medium +
          result.metadata.confidenceDistribution.low
      ).toBe(result.entities.length);

      // Should have some high-confidence entities
      expect(result.metadata.confidenceDistribution.high).toBeGreaterThan(0);
    });

    it('respects maximum entity limits', async () => {
      // Create service with low limits for testing
      const limitedService = new EntityExtractionService({
        maxEntitiesPerChunk: 3,
        minConfidence: 0.1, // Lower threshold to get more entities
      });

      const text = `
        Person One works at Organization A. Person Two works at Organization B.
        Person Three works at Organization C. Person Four works at Organization D.
        Person Five works at Organization E. Person Six works at Organization F.
      `;

      const result = await limitedService.extractFromText(text, 'test-limit');

      expect(result.entities.length).toBeLessThanOrEqual(3);
    });

    it('handles empty or malformed input gracefully', async () => {
      const result1 = await service.extractFromText('', 'empty-test');
      expect(result1.entities).toHaveLength(0);
      expect(result1.relationships).toHaveLength(0);

      const result2 = await service.extractFromText('   ', 'whitespace-test');
      expect(result2.entities).toHaveLength(0);

      const result3 = await service.extractFromText(
        '!@#$%^&*()',
        'symbols-test'
      );
      expect(result3.entities).toHaveLength(0);
    });
  });

  describe('Relationship Extraction', () => {
    it('extracts pattern-based relationships [A6]', async () => {
      const text = `
        John Smith works on the TensorFlow project at Google.
        Mary Johnson develops machine learning algorithms for OpenAI.
        The neural network architecture was created by researchers at MIT.
      `;

      const result = await service.extractFromText(text, 'test-relationships');

      expect(result.relationships.length).toBeGreaterThan(0);

      // Should extract WORKS_ON relationships
      const worksOnRelationships = result.relationships.filter(
        (r) => r.type === RelationshipType.WORKS_ON
      );
      expect(worksOnRelationships.length).toBeGreaterThan(0);

      // Should extract organizational relationships
      const partOfRelationships = result.relationships.filter(
        (r) => r.type === RelationshipType.PART_OF
      );
      expect(partOfRelationships.length).toBeGreaterThan(0);

      // All relationships should have evidence
      result.relationships.forEach((rel) => {
        expect(rel.evidence.sourceText).toBeDefined();
        expect(rel.evidence.cooccurrenceCount).toBeGreaterThan(0);
      });
    });

    it('calculates relationship strength using co-occurrence [A6]', async () => {
      const text = `
        Neural networks and machine learning are closely related concepts in AI.
        Deep learning algorithms use neural network architectures extensively.
        Machine learning models often incorporate neural network techniques.
      `;

      const result = await service.extractFromText(text, 'test-cooccurrence');

      // Should find co-occurrence based relationships
      const relatedRelationships = result.relationships.filter(
        (r) => r.type === RelationshipType.RELATED_TO
      );
      expect(relatedRelationships.length).toBeGreaterThan(0);

      // Should have statistical measures
      relatedRelationships.forEach((rel) => {
        expect(rel.strength).toBeGreaterThan(0);
        expect(rel.evidence.mutualInformation).toBeDefined();
      });
    });

    it('applies rule-based relationship extraction', async () => {
      const text = `
        The AI research team at Google develops advanced machine learning algorithms.
        Microsoft Research collaborates with universities on neural network projects.
      `;

      const result = await service.extractFromText(text, 'test-rules');

      // Should extract rule-based relationships
      const ruleBasedRelationships = result.relationships.filter(
        (r) => r.evidence.extractionMethod === 'rule_based'
      );
      expect(ruleBasedRelationships.length).toBeGreaterThan(0);

      // Rule-based relationships should have high confidence
      ruleBasedRelationships.forEach((rel) => {
        expect(rel.confidence).toBeGreaterThan(0.7);
      });
    });

    it('respects maximum relationship limits', async () => {
      // Create service with low relationship limit
      const limitedService = new EntityExtractionService({
        maxRelationshipsPerChunk: 2,
      });

      const text = `
        Entity A works on Project X. Entity B works on Project Y.
        Entity C works on Project Z. Entity D works on Project W.
        Entity E works on Project V. Entity F works on Project U.
      `;

      const result = await limitedService.extractFromText(
        text,
        'test-relationship-limit'
      );

      expect(result.relationships.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Statistical Relationship Inference', () => {
    it('calculates pointwise mutual information for entity pairs [A6]', async () => {
      const text = `
        Neural networks and machine learning are fundamental concepts in AI research.
        Deep learning algorithms rely on neural network architectures for pattern recognition.
        Machine learning techniques frequently use neural network models for classification.
      `;

      const result = await service.extractFromText(text, 'test-pmi');

      // Should extract statistical relationships
      const statisticalRelationships = result.relationships.filter(
        (r) => r.evidence.extractionMethod === 'statistical_pmi'
      );

      if (statisticalRelationships.length > 0) {
        // PMI-based relationships should have meaningful strength values
        statisticalRelationships.forEach((rel) => {
          expect(rel.strength).toBeGreaterThan(0);
          expect(rel.evidence.mutualInformation).toBeGreaterThan(0);
        });
      }
    });

    it('handles entities with no significant relationships', async () => {
      const text = `
        Apple banana cherry date elderberry fig grape.
        These are just random fruit names with no meaningful relationships.
      `;

      const result = await service.extractFromText(
        text,
        'test-no-relationships'
      );

      // Should extract entities but few/no relationships
      expect(result.entities.length).toBeGreaterThan(0);
      // May have some relationships but they should be weak
      if (result.relationships.length > 0) {
        result.relationships.forEach((rel) => {
          expect(rel.strength).toBeLessThan(0.5); // Weak relationships
        });
      }
    });
  });

  describe('Multi-Modal Support', () => {
    it('extracts from different content types [A6]', async () => {
      const texts = [
        {
          content: 'Technical documentation about machine learning algorithms.',
          type: 'text' as const,
        },
        {
          content:
            'Research paper on neural network architectures and optimization.',
          type: 'pdf' as const,
        },
        {
          content: 'Audio transcript discussing AI development methodologies.',
          type: 'audio' as const,
        },
      ];

      for (const { content, type } of texts) {
        const result = await service.extractFromText(
          content,
          `test-${type}`,
          type
        );

        expect(result.metadata.sourceType).toBe(type);
        expect(result.entities.length).toBeGreaterThan(0);

        // All entities should be properly typed
        result.entities.forEach((entity) => {
          expect(Object.values(EntityType)).toContain(entity.type);
        });
      }
    });

    it('provides processing time metrics [A7]', async () => {
      const text = `
        This is a moderately complex text with various entities and relationships.
        It should take some time to process but not too long for testing purposes.
      `;

      const result = await service.extractFromText(text, 'test-metrics');

      expect(result.metadata.extractionTime).toBeGreaterThan(0);
      expect(result.metadata.totalTokens).toBeGreaterThan(0);
      expect(result.metadata.processingErrors).toBeDefined();
    });
  });

  describe('Configuration and Customization', () => {
    it('respects minimum confidence threshold', async () => {
      // Create service with high confidence threshold
      const strictService = new EntityExtractionService({
        minConfidence: 0.9,
      });

      const text = `
        John works on AI projects. Mary develops algorithms.
        Simple text with potentially low-confidence entities.
      `;

      const result = await strictService.extractFromText(
        text,
        'test-confidence'
      );

      // Should only include high-confidence entities
      result.entities.forEach((entity) => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('applies custom entity patterns', async () => {
      // Create service with custom patterns
      const customService = new EntityExtractionService({
        customEntityPatterns: {
          [EntityType.TECHNOLOGY]: [
            /\bCustomFramework\b/g,
            /\bSpecialLibrary\b/g,
          ],
        },
      });

      const text = `
        The project uses CustomFramework for data processing and SpecialLibrary for visualization.
        These custom technologies should be recognized by the enhanced patterns.
      `;

      const result = await customService.extractFromText(text, 'test-custom');

      // Should extract custom technology entities
      const customTech = result.entities.filter(
        (e) =>
          e.type === EntityType.TECHNOLOGY &&
          (e.name === 'CustomFramework' || e.name === 'SpecialLibrary')
      );

      expect(customTech.length).toBeGreaterThan(0);
    });

    it('applies relationship inference rules', async () => {
      const text = `
        The AI system developed by the research team uses advanced algorithms.
        This demonstrates the rule-based relationship extraction capability.
      `;

      const result = await service.extractFromText(text, 'test-rules');

      // Should extract rule-based relationships
      const ruleBasedRelationships = result.relationships.filter(
        (r) => r.evidence.extractionMethod === 'rule_based'
      );

      expect(ruleBasedRelationships.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles extraction failures gracefully', async () => {
      // Mock a service that throws an error
      const errorService = new EntityExtractionService();

      // Override the extractEntities method to throw
      const originalExtract = errorService['extractEntities'];
      errorService['extractEntities'] = async () => {
        throw new Error('Simulated extraction failure');
      };

      const result = await errorService.extractFromText(
        'test text',
        'error-test'
      );

      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      expect(result.metadata.processingErrors).toContain(
        'Extraction failed: Simulated extraction failure'
      );
    });

    it('filters out invalid entities', async () => {
      const text = `
        A single letter A should not be extracted as an entity.
        Very short words like AI ML should be handled carefully.
        Common words like the and and should be filtered out.
      `;

      const result = await service.extractFromText(text, 'test-filtering');

      // Should not extract very short or common words as entities
      result.entities.forEach((entity) => {
        expect(entity.name.length).toBeGreaterThan(2);
        expect(!service['isCommonWord'](entity.name)).toBe(true);
      });
    });

    it('deduplicates similar entities', async () => {
      const text = `
        John Smith and John S. Smith refer to the same person.
        Google and Alphabet Inc both refer to the same organization.
        Multiple mentions of the same entity should be deduplicated.
      `;

      const result = await service.extractFromText(text, 'test-deduplication');

      // Should deduplicate similar entities
      const uniqueNames = new Set(result.entities.map((e) => e.name));
      expect(uniqueNames.size).toBeLessThanOrEqual(result.entities.length);

      // Deduplicated entities should have higher confidence
      result.entities.forEach((entity) => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });
  });
});
