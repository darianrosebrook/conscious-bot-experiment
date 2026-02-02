# Conscious Bot Modules — Map of Content

Author: @darianrosebrook

This directory contains implementation specifications for all modules, organized by package.

## Map of Content

### Core (`packages/core/`)
- [Core Overview](core/README.md) — arbiter, signal processing, leaves, MCP capabilities, real-time performance, integration services (LLM, Sterling, TTS)
- [Arbiter & Signal-Driven Control](core/arbiter_signal_driven_control.md)
- [MCP Capabilities](core/mcp_capabilities/mcp_capabilities.md) — capability registry, leaf contracts, BT DSL
- [Real-Time Performance](core/real_time/real_time.md) — budget enforcement, degradation, alerting
- [Task Parser](core/task-parser.md)

### World (`packages/world/`)
- [World Overview](world/README.md) — sensing, navigation, perception, sensorimotor, place graph
- [Visible-Only Sensing (Ray Casting)](world/visible_only_sensing.md)
- [Perception](world/perception/perception.md)
- [Navigation (D* Lite)](world/navigation/navigation.md)
- [Place Graph](world/place_graph/place_graph.md)
- [Sensorimotor](world/sensorimotor/sensorimotor.md)

### Memory (`packages/memory/`)
- [Memory Overview](memory/README.md) — multi-store architecture, provenance, GraphRAG
- [Memory & Recall: Places and Stories](memory/memory_and_recall.md)
- [Episodic Memory](memory/episodic/episodic.md)
- [Semantic Memory](memory/semantic/semantic.md)
- [Working Memory](memory/working/working.md)
- [Provenance](memory/provenance/provenance.md)
- [Memory Versioning](memory/memory-versioning.md)
- [Comprehensive Cognitive Memory Domains](memory/comprehensive-cognitive-memory-domains.md)

### Planning (`packages/planning/`)
- [Planning Overview](planning/README.md) — Sterling solvers, goal lifecycle, temporal planning, behavior trees, task integration, constraints
- [Goal Formulation](planning/goal_formulation/goal_formulation.md)
- [Hierarchical Planner](planning/hierarchical_planner/hierarchical_planner.md)
- [Reactive Executor (GOAP)](planning/hierarchical_planner/reactive_executor/reactive_executor.md)
- [Forward Model](planning/forward_model/forward_model.md) — type definitions retained, not actively integrated

### Cognition (`packages/cognition/`)
- [Cognition Overview](cognition/README.md) — LLM reasoning, environmental awareness, ethical filtering, identity, ReAct arbiter, audit
- [Cognitive Core](cognition/cognitive_core/cognitive_core.md)
- [Self-Model](cognition/self_model/self_model.md)
- [Social Cognition](cognition/social_cognition/social_cognition.md)

### Interfaces
- [Constitution (Ethical Rules Engine)](interfaces/constitution/constitution.md)
- [Web Dashboard](interfaces/web_dashboard/web_dashboard.md)
- [Human Controls](interfaces/human_controls/human_controls.md)
- [Intrusion Interface](interfaces/intrusion_interface/intrusion_interface.md)

### Safety (`packages/safety/`)
- [Safety Overview](safety/README.md)
- [Privacy](safety/privacy/privacy.md)
- [Monitoring](safety/monitoring/monitoring.md)
- [Fail-Safes](safety/fail_safes/fail_safes.md)

### Evaluation (`packages/evaluation/`)
- [Evaluation Overview](evaluation/README.md) — benchmarking, regression monitoring, curriculum, scenarios, dashboard

## Package-to-Documentation Alignment

| Package | Doc Alignment | Notes |
|---------|--------------|-------|
| `core` | Current | Arbiter, signals, leaves, MCP, real-time, LLM/Sterling/TTS services |
| `world` | Current | Sensing, navigation, perception, sensorimotor, place graph |
| `memory` | Current | Episodic, semantic, working, provenance + asset/social/skills extensions |
| `planning` | Current | Sterling solvers, goal lifecycle, temporal, BT, task integration, constraints |
| `cognition` | Current | Core 3 modules + environmental, constitutional filter, intrusion, ReAct, audit, config |
| `safety` | Current | Privacy, monitoring, fail-safes |
| `evaluation` | Current | Scenarios, metrics, curriculum + benchmarking, dashboard, regression, testing infra |

## Strategic Documents

- [Integration Strategy](../../strategy/integration_strategy.md) — cross-module coordination
- [Risk Management](../../strategy/risk_management.md) — risk assessment and mitigation
- [Verification Framework](../../strategy/verification_framework.md) — quality assurance methodology
