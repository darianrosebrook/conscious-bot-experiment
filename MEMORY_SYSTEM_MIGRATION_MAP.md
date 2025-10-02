# Memory System Migration Map: Current → Enhanced

## Overview

This document maps the current memory system components to their enhanced versions based on obsidian-rag patterns. The conscious-bot project already has sophisticated memory functionality, but it needs enhancement with better integration, multi-hop reasoning, and advanced entity relationship modeling.

## 🔄 Migration Strategy

### **Approach**: Evolutionary Enhancement
- **Evaluate if we should keep or refactor**: Existing sophisticated components (lik memory decay, neuroscience consolidation, etc.) have been in the project for a very long time, let's compare the benchmarks of our system and the benchmarks of the new system before making large changes. We need a baseline and a rollback strategy. But, we should know that everything in the memory core is on the chopping block, since processing is limited, accuracy and speed are both a factor.
- **Refactoring over shadow files (e.g no knowledge-graph.ts and enhanced-knowledge-graph.ts, refactor into one file)**: Current hybrid search and knowledge graph with obsidian-rag patterns could use an audit and refactor
- **Add**: Missing features like multi-hop reasoning, advanced entity linking
- **Integrate**: Memory decay with knowledge graph operations, logarithmic decay (use it or lose it). Memories that get used increase the countdown with a very small logarithmic change up towards a limit (can remember from a longer time since it becomes a more reinforced memory). Memories that don't get used decay inversely up to a limit, where if missed eventually hitting a threshold and disappearing.

## 📋 Component Mapping

### 1. **Core Memory System** (Main Entry Points)

| Current Component | Status | Enhancement Plan | New Location |
|------------------|--------|------------------|--------------|
| `memory-system.ts` | ✅ **Keep & Enhance** | Add knowledge graph integration, decay-aware search | `packages/memory/src/memory-system.ts` |
| `enhanced-memory-system.ts` | ✅ **Keep & Enhance** | Merge with main system, add obsidian-rag patterns | `packages/memory/src/enhanced-memory-system.ts` |
| `index.ts` | ✅ **Keep** | Update exports for new enhanced components | `packages/memory/src/index.ts` |

### 2. **Vector Database & Storage**

| Current Component | Status | Enhancement Plan | New Location |
|------------------|--------|------------------|--------------|
| `vector-database.ts` | ✅ **Enhance** | Upgrade to pgvector for better performance, add entity metadata | `packages/memory/src/vector-database.ts` |
| **New**: Enhanced Vector DB | ➕ **Add** | PostgreSQL with pgvector, entity relationship indexes | `packages/memory/src/vector-database-enhanced.ts` |

### 3. **Embedding Services**

| Current Component | Status | Enhancement Plan | New Location |
|------------------|--------|------------------|--------------|
| `embedding-service.ts` | ✅ **Enhance** | Add strategic model selection, quality-based confidence scoring | `packages/memory/src/embedding-service.ts` |
| **New**: Advanced Embedding Strategy | ➕ **Add** | Content-type specific models, performance monitoring | `packages/memory/src/advanced-embedding-service.ts` |

### 4. **Knowledge Graph System**

| Current Component | Status | Enhancement Plan | New Location |
|------------------|--------|------------------|--------------|
| `semantic/knowledge-graph-core.ts` | ✅ **Enhance** | Add PostgreSQL persistence, vector embeddings on entities | `packages/memory/src/semantic/knowledge-graph-core.ts` |
| `semantic/graph-rag.ts` | ✅ **Enhance** | Add multi-hop reasoning, explainable results | `packages/memory/src/semantic/graph-rag.ts` |
| **New**: Entity Extraction Pipeline | ➕ **Add** | Multi-modal entity extraction, cross-memory linking | `packages/memory/src/entity-extraction-service.ts` |
| **New**: Relationship Inference Engine | ➕ **Add** | Co-occurrence analysis, statistical relationship scoring | `packages/memory/src/relationship-inference-engine.ts` |

### 5. **Hybrid Search Engine**

| Current Component | Status | Enhancement Plan | New Location |
|------------------|--------|------------------|--------------|
| `hybrid-search-service.ts` | ✅ **Major Enhancement** | Add obsidian-rag hybrid search patterns, multi-hop traversal | `packages/memory/src/hybrid-search-service.ts` |
| **Combine and refactor**: Additional Hybrid Search to add | ➕ **Add** | Decay-aware ranking, explainable provenance, performance optimization | `packages/memory/src/advanced-hybrid-search.ts` |

### 6. **Memory Decay Integration**

| Current Component | Status | Enhancement Plan | New Location |
|------------------|--------|------------------|--------------|
| `memory-decay-manager.ts` | ✅ **Enhance** | Integrate with knowledge graph, entity decay propagation | `packages/memory/src/memory-decay-manager.ts` |
| `sharp-wave-ripple-manager.ts` | ✅ **Enhance** | SWR effects on knowledge graph relationships | `packages/memory/src/sharp-wave-ripple-manager.ts` |
| `neuroscience-consolidation-manager.ts` | ✅ **Enhance** | Knowledge graph updates during consolidation | `packages/memory/src/neuroscience-consolidation-manager.ts` |

### 7. **Memory Type Components** (Keep Existing)

| Component | Status | Enhancement Plan |
|-----------|--------|------------------|
| `episodic/` | ✅ **Keep** | Add entity linking to episodic memories |
| `working/` | ✅ **Keep** | Add knowledge graph context to working memory |
| `social/` | ✅ **Keep** | Enhance social relationship modeling |
| `spatial/` | ✅ **Keep** | Add spatial entity relationships |
| `emotional/` | ✅ **Keep** | Link emotional entities to knowledge graph |

### 8. **Supporting Services** (Keep & Enhance)

| Component | Status | Enhancement Plan |
|-----------|--------|------------------|
| `chunking-service.ts` | ✅ **Enhance** | Entity-aware chunking for better extraction |
| `memory-system-coordinator.ts` | ✅ **Enhance** | Coordinate knowledge graph operations |
| `identity-memory-guardian.ts` | ✅ **Keep** | Add entity-based identity preservation |
| `memory-versioning-manager.ts` | ✅ **Keep** | Version knowledge graph structures |

## 🏗️ Implementation Phases

### **Phase 1: Foundation Enhancement** (Week 1-2)

#### 1.1 Enhanced Vector Database
```typescript
// Current: Basic Chroma integration
// Enhanced: PostgreSQL + pgvector with entity metadata
// Location: packages/memory/src/vector-database-enhanced.ts
```

#### 1.2 Entity Extraction Pipeline
```typescript
// Current: Basic entity extraction
// Enhanced: Multi-modal extraction with confidence scoring
// Location: packages/memory/src/entity-extraction-service.ts
```

#### 1.3 Knowledge Graph Enhancement
```typescript
// Current: In-memory graph with JSON persistence
// Enhanced: PostgreSQL persistence, vector embeddings, multi-hop traversal
// Location: packages/memory/src/semantic/knowledge-graph-core.ts
```

### **Phase 2: Advanced Hybrid Search** (Week 3-4)

#### 2.1 Enhanced Hybrid Search Service
```typescript
// Current: Basic vector + graph combination
// Enhanced: Obsidian-RAG patterns, multi-hop reasoning, explainable results
// Location: packages/memory/src/hybrid-search-service.ts
```

#### 2.2 Memory Decay Integration
```typescript
// Current: Memory-level decay management
// Enhanced: Entity and relationship decay propagation
// Location: packages/memory/src/memory-decay-manager.ts
```

### **Phase 3: Advanced Features** (Week 5-6)

#### 3.1 Advanced Embedding Strategy
```typescript
// Current: Basic embeddinggemma usage
// Enhanced: Strategic model selection, quality metrics, performance monitoring
// Location: packages/memory/src/advanced-embedding-service.ts
```

#### 3.2 Cross-Modal Entity Linking
```typescript
// Current: Type-specific entity handling
// Enhanced: Unified entity representation across memory types
// Location: packages/memory/src/cross-modal-entity-linker.ts
```

## 🔗 Integration Points

### Memory Decay ↔ Knowledge Graph Integration

```typescript
// 1. Entity decay influenced by relationships
interface EntityDecayProfile {
  baseDecayRate: number; // From memory type (0.01-0.05)
  relationshipBoost: number; // Strong relationships slow decay
  consolidationHistory: Array<{
    timestamp: number;
    type: 'swr' | 'decay' | 'manual';
    relationshipStrength: number;
  }>;
}

// 2. Relationship decay mechanics
interface RelationshipDecay {
  bidirectionalDecay: boolean; // Relationship strength decays with entities
  contextPreservation: boolean; // Important relationships maintain protection
  consolidationEffects: boolean; // SWR events strengthen persistence
}

// 3. Hybrid search decay awareness
interface DecayAwareSearchResult {
  memoryDecay: number; // 0-1, how much memory has decayed
  entityDecay: number; // 0-1, how much entities have decayed
  relationshipDecay: number; // 0-1, how much relationships have decayed
  recencyBoost: number; // Recent access reduces decay penalty
  importanceProtection: number; // High importance reduces decay penalty
  adjustedScore: number; // Original score adjusted for decay
}
```

### Enhanced Search Flow

```typescript
// Current flow:
// Query → Vector Search → Graph Query → Simple Fusion → Results

// Enhanced flow:
// Query → Entity Extraction → Vector Search → Graph Traversal (Multi-hop)
// ↓
// Decay Calculation → Relationship Weighting → Explainable Fusion → Results
// ↓
// Provenance Generation → Confidence Scoring → Final Ranking
```

## 📊 Component Status Matrix

| Component | Current Implementation | Obsidian-RAG Enhancement | Integration Status |
|-----------|----------------------|-------------------------|-------------------|
| **Vector Database** | Chroma integration | PostgreSQL + pgvector | 🔄 **Replace** |
| **Knowledge Graph** | In-memory JSON | PostgreSQL persistence | 🔄 **Replace** |
| **Entity Extraction** | Basic extraction | Multi-modal + confidence | ➕ **Add** |
| **Hybrid Search** | Simple combination | Multi-hop + explainable | 🔄 **Refactor** |
| **Memory Decay** | Memory-level decay | Entity/relationship decay | 🔄 **Refactor** |
| **Embedding Strategy** | Basic embeddinggemma | Strategic selection | 🔄 **Refactor** |
| **Provenance Tracking** | Basic metadata | Detailed reasoning chains | ➕ **Add** |

## 🚀 Migration Checklist

### Pre-Migration Tasks
- [ ] **Backup current memory data** for rollback capability
- [ ] **Feature flag setup** for gradual rollout (`ENABLE_ENHANCED_MEMORY_SEARCH`)
- [ ] **Performance baseline** testing of current system
- [ ] **Database migration scripts** for new schema

### Migration Tasks
- [ ] **Phase 1**: Enhanced vector database implementation
- [ ] **Phase 1**: Entity extraction pipeline
- [ ] **Phase 1**: Knowledge graph PostgreSQL persistence
- [ ] **Phase 2**: Advanced hybrid search service
- [ ] **Phase 2**: Memory decay integration
- [ ] **Phase 3**: Advanced embedding strategy
- [ ] **Phase 3**: Cross-modal entity linking

### Post-Migration Tasks
- [ ] **Performance validation** (P95 < 600ms requirement)
- [ ] **Data migration** of existing memories to new schema
- [ ] **Rollback testing** to ensure graceful degradation
- [ ] **Integration testing** with existing memory types
- [ ] **Documentation updates** for new APIs and features

## 🔄 Rollback Strategy

### Graceful Degradation Plan

1. **Feature Flag Control**
   ```typescript
   // Environment variable controls
   const ENABLE_ENHANCED_MEMORY = process.env.ENABLE_ENHANCED_MEMORY_SEARCH === 'true';
   const ENABLE_KNOWLEDGE_GRAPH = process.env.ENABLE_KNOWLEDGE_GRAPH === 'true';
   ```

2. **Fallback Mechanisms**
   - If knowledge graph unavailable: Use vector-only search
   - If entity extraction fails: Use basic text search
   - If hybrid search fails: Fall back to vector search

3. **Data Preservation**
   - All existing memory data remains accessible
   - New enhanced features are opt-in
   - Gradual migration of existing memories to enhanced format

### Rollback Steps
1. **Disable feature flags** to revert to original behavior
2. **Database rollback** scripts for schema changes
3. **Cache clearing** for any new caching layers
4. **Service restart** to ensure clean state

## 📈 Success Metrics

### Performance Targets
- **Search Latency**: P95 < 600ms for hybrid queries
- **Memory Usage**: < 20% increase over baseline
- **Entity Extraction**: ≥ 80% precision, ≥ 75% recall
- **Relationship Quality**: ≥ 70% meaningful relationships

### Quality Targets
- **Backward Compatibility**: 100% existing API compatibility
- **Data Integrity**: Zero data loss during migration
- **Feature Adoption**: ≥ 80% of memory operations use enhanced system

This migration map provides a clear path from the current sophisticated memory system to an enhanced version with obsidian-rag patterns while maintaining backward compatibility and ensuring graceful degradation.
