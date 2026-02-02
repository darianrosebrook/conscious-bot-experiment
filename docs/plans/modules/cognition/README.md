# Cognition & Identity

**Package:** `packages/cognition/`
**Purpose:** LLM-based reasoning, environmental awareness, ethical filtering, and identity modeling
**Author:** @darianrosebrook

## Overview

The cognition package implements the bot's reasoning layer: from raw environmental observations through thought generation, ethical filtering, and identity maintenance. The system runs as a WebSocket server (`server.ts`) that processes cognitive streams, generates thoughts via LLM, and routes them to planning.

## Module Inventory

### Cognitive Core (`cognitive-core/`)
**LLM-Based Reasoning and Internal Dialogue**
- Internal monologue and narrative reasoning
- Natural language planning and reflection
- Social dialogue generation and context management
- Memory integration (episodic retrieval, semantic queries)
- Key files: `internal-dialogue.ts`, `llm-interface.ts`, `reflection-engine.ts`, `memory-integration.ts`

### Self-Model (`self-model/`)
**Identity, Narrative Continuity, and Long-Term Contracts**
- Identity parameters and persona evolution tracking
- Narrative summary maintenance and checkpoint updates
- 30/100-day identity contracts and progress auditing
- Self-monitoring and meta-cognitive rule enforcement
- Key files: `identity-tracker.ts`, `narrative-manager.ts`, `contract-system.ts`, `self-monitor.ts`

### Social Cognition (`social-cognition/`)
**Theory of Mind and Social Relationship Modeling**
- Other agent modeling (players, NPCs) with relationship tracking
- Mimicry and social learning mechanisms
- Theory of mind simulation for behavior prediction
- Norm internalization and social rule compliance
- Key files: `agent-modeler.ts`, `theory-of-mind.ts`, `social-learner.ts`, `norm-tracker.ts`

### Environmental (`environmental/`)
**Entity Awareness & Saliency Tracking**
- **Saliency Reasoner** (`saliency-reasoner.ts`): Stateful deterministic processor for entity belief streams. Maintains per-bot track maps; applies snapshots and deltas; generates aggregate awareness thoughts (e.g., "2 hostiles nearby") without per-entity LLM calls. Uses canonical `tickId` for temporal grounding (no `Date.now()`).
- **Observation Reasoner** (`observation-reasoner.ts`): LLM-based environmental observation reasoning. Ingests entity/event snapshots with configurable position redaction; calls LLM with stress context from interoception store; outputs thoughts and task suggestions. Timeout-safe (35s MLX default); falls back to rule-based thoughts when LLM unavailable.

### Constitutional Filter (`constitutional-filter/`)
**Ethical Rule Enforcement**
- Rule-based safety gating for actions, goals, messages, and external suggestions
- Three enforcement levels: STRICT (only ALLOW), STANDARD (ALLOW + MODIFY), ADVISORY (warnings only)
- Auto-correct modifications, reasoning traces, compliance reporting
- Rule categories: Safety, Ethics, Legality, Social Norms, Goal Alignment, Resource Limits, Communication
- Norm-drift detection across sessions
- Key files: `constitutional-filter.ts`, `rules-engine.ts`, `rules-database.ts`, `types.ts`

### Intrusion Interface (`intrusion-interface/`)
**External Suggestion Handling & Risk Assessment**
- Complete pipeline: Parse → Classify → Assess Risk → Check Compliance → Decide
- LLM-based risk assessment (harmPotential, contextAppropriateness, historicalPattern)
- Constitutional compliance checking via ConstitutionalFilter
- Decision types: ACCEPT, REJECT, DEFER, MODIFY
- Priority queue gated by agent cognitive load (rejects low-urgency if load > 0.8)
- 8 content type classifications: task, goal, social, identity, explore, emotion, info, command
- Key files: `intrusion-interface.ts`, `intrusion-parser.ts`, `taxonomy-classifier.ts`

### ReAct Arbiter (`react-arbiter/`)
**Reason↔Act Interleaving**
- Implements single reasoning step (LLM, temp 0.3) + single tool call per iteration
- Tool registry of 10 composable primitives: find_blocks, pathfind, dig, place, craft, smelt, query_inventory, waypoint, sense_hostiles, chat
- Reflexion-style verbal self-feedback buffer on success/failure
- Fuzzy tool matching with graceful fallback to chat on unknown tools
- Key file: `ReActArbiter.ts`

### Audit (`audit/`)
**Thought-to-Action Pipeline Auditing**
- Session-based audit trail from need identification through action execution
- 8 pipeline stages: need_identified → thought_generated → thought_processed → action_planned → tool_selected → tool_executed → action_completed → feedback_received
- JSON + human-readable text logs to `./logs/audit/`
- Key file: `thought-action-audit-logger.ts` (singleton `auditLogger`)

### Config (`config/`)
**LLM Token & Temperature Management**
- Source-indexed parameter registry mapping call context to token budgets and temperatures
- Tuned for MLX latency targets:
  - `observation`: 128 tokens, 0.35 temp (non-blocking, short JSON)
  - `internal_thought`: 512 tokens, 0.8 temp (reflective)
  - `ethical_reasoning`: 1024 tokens, 0.6 temp (deliberate)
  - `react_operational`: 500 tokens, 0.3 temp (deterministic)
  - `creative_solver`: 1024 tokens, 0.8 temp (exploratory)
- Key file: `llm-token-config.ts`

## Top-Level Components

- `server.ts` — cognition WebSocket server; orchestrates all modules
- `thought-generator.ts` — core thought generation pipeline
- `event-driven-thought-generator.ts` — event-reactive thought pipeline variant
- `intrusive-thought-processor.ts` — evaluates intrusive thoughts against constitution
- `interoception-store.ts` — internal state tracking (stress, energy, emotional valence)
- `stress-axis-computer.ts` — stress state computation
- `bot-state-cache.ts` — cached bot state for fast access
- `llm-output-sanitizer.ts` — validates and sanitizes LLM responses
- `social-awareness-manager.ts` — social perception aggregation

## Implementation Notes

- Intrinsic motivation with curiosity budget guardrails (≤10% CPU)
- Integrity and safety gating for exploration drives
- Long-horizon identity consistency with deliberate change tracking
- Social communication integrated with constitution compliance
