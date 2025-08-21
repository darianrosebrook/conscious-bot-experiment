# Memory Systems

Multi-store memory architecture with provenance tracking and GraphRAG-first retrieval.

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

## Implementation Notes

- GraphRAG prioritized over vector similarity searches
- Minimal vector use (narrative snippets and chat only)
- Predictable retrieval latency requirements
- Comprehensive provenance for all decisions

Author: @darianrosebrook
