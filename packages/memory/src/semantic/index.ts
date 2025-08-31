/**
 * Semantic Memory System
 *
 * Provides knowledge graph storage, GraphRAG-first retrieval,
 * and relationship extraction for factual knowledge.
 *
 * @author @darianrosebrook
 */

export * from './types';
export * from './knowledge-graph-core';
export * from './graph-rag';
export * from './relationship-extractor';
export * from './query-engine';

import { KnowledgeGraphCore } from './knowledge-graph-core';
import { GraphRAG } from './graph-rag';
import { RelationshipExtractor } from './relationship-extractor';
import { QueryEngine } from './query-engine';
import { KnowledgeGraphConfig } from './types';

/**
 * Create a complete semantic memory system
 */
export function createSemanticMemory(config?: { knowledgeGraph?: Partial<KnowledgeGraphConfig> }) {
  const knowledgeGraphCore = new KnowledgeGraphCore(config?.knowledgeGraph);
  const graphRAG = new GraphRAG(knowledgeGraphCore);
  const relationshipExtractor = new RelationshipExtractor(
    knowledgeGraphCore,
    graphRAG
  );
  const queryEngine = new QueryEngine(
    knowledgeGraphCore,
    graphRAG,
    relationshipExtractor
  );

  return {
    knowledgeGraphCore,
    graphRAG,
    relationshipExtractor,
    queryEngine,
  };
}
