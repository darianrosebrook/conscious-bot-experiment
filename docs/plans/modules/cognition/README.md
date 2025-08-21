# Cognition & Identity

High-level reasoning, self-awareness, and social modeling systems.

## Modules

### Cognitive Core (`cognitive_core/`)
**Purpose:** LLM-based reasoning and internal dialogue
- Internal monologue and narrative reasoning
- Natural language planning and reflection
- Social dialogue generation and context management
- Intrusive thought evaluation against Constitution
- **Key Files:** `internal_dialogue.py`, `llm_interface.py`, `social_dialogue.py`, `reflection_engine.py`

### Self-Model (`self_model/`)
**Purpose:** Identity, narrative continuity, and long-term contracts
- Identity parameters and persona evolution tracking
- Narrative summary maintenance and checkpoint updates
- 30/100-day identity contracts and progress auditing
- Self-monitoring and meta-cognitive rule enforcement
- **Key Files:** `identity_tracker.py`, `narrative_manager.py`, `contract_system.py`, `self_monitor.py`

### Social Cognition (`social_cognition/`)
**Purpose:** Theory of mind and social relationship modeling
- Other agent modeling (players, NPCs) with relationship tracking
- Mimicry and social learning mechanisms
- Theory of mind simulation for behavior prediction
- Norm internalization and social rule compliance
- **Key Files:** `agent_modeler.py`, `theory_of_mind.py`, `social_learner.py`, `norm_tracker.py`

## Implementation Notes

- Intrinsic motivation with curiosity budget guardrails (≤10% CPU)
- Integrity and safety gating for exploration drives
- Long-horizon identity consistency with deliberate change tracking
- Social communication integrated with Constitution compliance

Author: @darianrosebrook
