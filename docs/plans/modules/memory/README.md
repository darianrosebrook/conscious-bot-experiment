# Memory Systems

Multi-store memory architecture with provenance tracking, GraphRAG-first retrieval, and seed-based versioning.

## Modules

### Episodic Memory (`episodic/`)
**Purpose:** Autobiographical event log with consolidation
- Append-only log of significant experiences
- Salience scoring and consolidation during downtime
- Forgetting mechanisms for memory management
- Narrative checkpoint generation
- **Key Files:** `event_logger.py`, `consolidation.py`, `salience_scorer.py`, `narrative_checkpoints.py`

### Semantic Memory (`semantic/`)
**Purpose:** Structured knowledge graph of world relationships
- Entity-relationship graph storage
- GraphRAG-first retrieval for structured queries
- Continuous updates from episodic events
- Fact extraction and relationship inference
- **Key Files:** `knowledge_graph.py`, `graph_rag.py`, `relationship_extractor.py`, `query_engine.py`

### Working Memory (`working/`)
**Purpose:** Short-term context and active cognitive state
- Current observations and active goals
- Recent dialogue and action plans
- Limited capacity with strategic retention
- Integration with long-term memory retrieval
- **Key Files:** `context_manager.py`, `goal_tracker.py`, `dialogue_buffer.py`, `memory_integration.py`

### Provenance (`provenance/`)
**Purpose:** Decision justification and audit trails
- Justification sets for all plans and decisions
- Evidence tracking with observation IDs
- Fast accountability for post-hoc explanation
- Why() function for telemetry and debugging
- **Key Files:** `justification_tracker.py`, `evidence_manager.py`, `audit_trail.py`, `explanation_generator.py`

### Memory Versioning (`memory-versioning-manager.ts`)
**Purpose:** Seed-based memory isolation and namespace management
- Automatic namespace creation based on world seeds
- Memory isolation between different Minecraft worlds
- Active namespace switching and cleanup
- Statistics and monitoring for memory usage
- **Key Files:** `memory-versioning-manager.ts`, `memory-integration.ts`

## Implementation Notes

- GraphRAG prioritized over vector similarity searches
- Minimal vector use (narrative snippets and chat only)
- Predictable retrieval latency requirements
- Comprehensive provenance for all decisions
- **Seed-based memory isolation** for world-specific learning

## Memory Versioning

The memory system now supports automatic versioning based on Minecraft world seeds. This ensures that:

- Each world maintains separate memory context
- No cross-contamination between different seeds
- Bot can learn world-specific knowledge
- Memory isolation enables focused learning

### Quick Start

```bash
# Set world seed for memory isolation
export WORLD_SEED=12345
export WORLD_NAME="My World"

# Start memory service
cd packages/memory && pnpm run dev:server

# Start minecraft interface (will auto-activate memory namespace)
cd packages/minecraft-interface && pnpm run dev:server
```

### Testing

```bash
# Test memory versioning
cd packages/memory && pnpm test memory-versioning.test.ts

# Run memory versioning demo
cd packages/minecraft-interface && pnpm tsx bin/memory-versioning-demo.ts
```

For detailed documentation, see [Memory Versioning System](memory-versioning.md).

---

**Author**: @darianrosebrook
