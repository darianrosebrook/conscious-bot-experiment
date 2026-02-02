# Planning & Decision Making

**Package:** `packages/planning/`
**Purpose:** Multi-tier planning architecture with Sterling solver integration, goal lifecycle management, and real-time adaptive execution
**Author:** @darianrosebrook

## Overview

The planning package implements a cognitive decision-making system spanning goal formulation through reactive execution. The architecture centers on Sterling-backed domain solvers for Minecraft-specific reasoning (crafting, tool progression, acquisition, building, furnace scheduling, navigation), with supporting subsystems for temporal planning, behavior tree execution, constraint modeling, and skill composition.

## Architecture

### Integration Flow
```
Signals → [Goal Formulation] → Goals → [Goal Lifecycle] → Active Goals
    ↓                                         ↓
[Cognitive Router] → Sterling Solver / LLM / Compiler
    ↓                        ↓
[Task Integration] → Tasks → [Behavior Tree Runner] → Leaf Execution
    ↓                                    ↓
[Reactive Executor] ← Plan Repair ← Feedback
```

## Module Inventory

### Goal Formulation (`goal-formulation/`)
**Signals → Needs → Goals Pipeline**
- `homeostasis-monitor.ts` — monitors health, hunger, threat against comfort thresholds
- `need-generator.ts` — translates homeostasis signals into needs
- `goal-manager.ts` — orchestrates generation, prioritization, feasibility
- `goal-generator.ts` — advanced goal generation with signal processing
- `advanced-signal-processor.ts` — complex signal analysis and weighting
- `priority-scorer.ts` — multi-factor priority scoring
- `utility-calculator.ts` — utility scoring across multiple dimensions
- `task-bootstrapper.ts` — goal-to-task bootstrapping

### Goal Lifecycle (`goals/`)
**Goal State Machine & Binding Protocol**
- `goal-binding-types.ts`, `goal-binding-normalize.ts` — goal-task binding contracts
- `goal-identity.ts` — goal equivalence and identity
- `goal-resolver.ts` — resolves goals through task execution
- `goal-task-sync.ts` — synchronizes goal state with task state
- `goal-hold-manager.ts` — hold semantics for goal persistence
- `goal-lifecycle-events.ts`, `goal-lifecycle-hooks.ts` — state transition events and hooks
- `completion-checker.ts` — validates goal completion criteria
- `activation-reactor.ts` — reacts to goal activation signals
- `verifier-registry.ts` — pluggable goal verifiers
- `threat-hold-bridge.ts` — threat detection → goal hold integration
- `preemption-budget.ts` — preemption timing and budget management
- `periodic-review.ts` — periodic goal review and cleanup
- `effect-partitioning.ts` — effect aggregation and partitioning

### Sterling Solvers (`sterling/`)
**Domain-Specific Reasoning via Sterling Backend**

Core infrastructure:
- `base-domain-solver.ts` — abstract base class (availability gating, planId extraction, episode reporting)
- `sterling-reasoning-service.ts` — WebSocket client to Sterling (solve, async solve, knowledge graph, reachability)
- `solve-bundle.ts` — evidence bundle construction with content-addressed hashing (definitionHash, stepsDigest)
- `solve-bundle-types.ts` — SolveBundle, CompatReport, SearchHealthMetrics types
- `compat-linter.ts` — rule compatibility linting (domain errors, constraint violations)
- `search-health.ts` — search metrics parsing (optional until Python emits data)
- `leaf-routing.ts` — maps solve steps to capability leaves with duration estimation
- `degeneracy-detection.ts` — detects degenerate strategies
- `primitive-namespace.ts` — qualified primitive IDs (CB-Pxx / ST-Pxx)

Domain solvers:
- `minecraft-crafting-solver.ts` / `minecraft-crafting-rules.ts` — crafting goal solving
- `minecraft-tool-progression-solver.ts` / `minecraft-tool-progression-rules.ts` — multi-tier tool progression (wood → stone → iron → diamond)
- `minecraft-acquisition-solver.ts` / `minecraft-acquisition-rules.ts` — item acquisition (trade, loot, salvage strategies)
- `minecraft-building-solver.ts` / `minecraft-building-rules.ts` — building construction
- `minecraft-furnace-solver.ts` / `minecraft-furnace-rules.ts` — furnace scheduling and smelting batch optimization
- `minecraft-navigation-solver.ts` — pathfinding with hazard policies and movement costs

Evidence capsules:
- `primitives/p21/` — P21 evidence capsule types (contract types, reference fixtures)
- `primitives/p03/` — P03 temporal capsule types and adapter

### Temporal Planning (`temporal/`)
**Rig C — Temporal Enrichment for Crafting Rules**
- `temporal-enrichment.ts` — orchestration entrypoint; rule enrichment facade
- `time-state.ts` — Minecraft time bucket construction and slot inference
- `duration-model.ts` — action duration mapping and annotation
- `capacity-manager.ts` — slot reservation and deadlock prevention
- `deadlock-prevention.ts` — deadlock detection across temporal constraints
- `batch-operators.ts` — batch operation hints for parallel execution
- `makespan-objective.ts` — makespan cost computation

Modes: `on` | `off` | `legacy`

### Task Integration (`task-integration/`)
**Thought-to-Task Conversion & Sterling Planner Routing**
- `thought-to-task-converter.ts` — CognitiveThought → Task (extracts action/resource types, calculates priority)
- `sterling-planner.ts` — wraps Sterling solvers; routes tasks to appropriate domain solver
- `task-store.ts` — in-memory task queue with prioritization
- `task-management-handler.ts` — task lifecycle (creation, completion, failure)
- `build-task-from-requirement.ts` — task instantiation from requirements

Also: `task-integration.ts` (top-level) — main TaskIntegration orchestrator class

### Behavior Trees (`behavior-trees/`)
**Robust Execution with Retries, Timeouts, and Telemetry**
- `BehaviorTreeRunner.ts` — full BT engine
  - Node types: SEQUENCE, SELECTOR, PARALLEL, DECORATOR, ACTION, CONDITION, COGNITIVE_REFLECTION
  - Timeout enforcement, retry logic, guard conditions, blackboard context
  - Emits BTTick telemetry events during execution
- `definitions/` — 16 BT definition subdirectories

### Hierarchical Planning (`hierarchical-planner/`, `hierarchical/`)
**HTN Decomposition & Macro-Planning**
- `cognitive-router.ts` — routes tasks to Sterling/compiler/LLM based on requirements
- `plan-decomposer.ts` — decomposes complex tasks into subtasks
- `task-network.ts` — task network representation
- `macro-planner.ts` — high-level macro-planning engine
- `world-graph-builder.ts` — constructs world knowledge graph
- `edge-decomposer.ts` — decomposes edges in task graph
- `feedback.ts`, `feedback-integration.ts` — feedback integration for plan refinement

### Reactive Executor (`reactive-executor/`)
**GOAP-Style Real-Time Execution**
- `reactive-executor.ts` — plan repair vs replanning decision logic
- `minecraft-executor.ts` — Minecraft-specific execution adapter
- `safety-reflexes.ts` — emergency reflexes (damage avoidance, fallback patterns)

### Constraints (`constraints/`)
**Partial-Order Planning & Feasibility Analysis**
- `partial-order-plan.ts` — DAG representation (PlanNode, PlanEdge)
- `dag-builder.ts` — constructs DAG from decompositions; finds commuting pairs
- `constraint-model.ts` — dependency, reachability, support constraints
- `feasibility-checker.ts` — validates plan feasibility
- `linearization.ts` — topological sort to executable sequence
- `execution-advisor.ts` — advises on safe execution ordering

### Skill Integration (`skill-integration/`)
**MCP & LLM-Based Skill Composition**
- `skill-composer-adapter.ts` — composes skills from primitives
- `llm-skill-composer.ts` — LLM-based skill generation and refinement
- `mcp-integration.ts`, `mcp-capabilities-adapter.ts` — MCP capability discovery and adaptation
- `skill-planner-adapter.ts` — integrates skill plans with main planner

### Modules (`modules/`)
**Bootstrap, Routing, Contracts, and Infrastructure**
- `planning-bootstrap.ts` — dependency-injected planning instance creation
- `cognitive-stream-client.ts` — cognitive stream integration client
- `action-plan-backend.ts` — routes actions to Sterling/compiler backends
- `solve-contract.ts` — canonical solve contract types
- `leaf-arg-contracts.ts` — leaf action argument validation
- `inventory-helpers.ts` — inventory transformation utilities
- `capability-registry.ts` — available capabilities registry

### Server (`server/`)
**Autonomous Execution Loop**
- `autonomous-executor.ts` — main autonomous loop for continuous execution
- `cognitive-task-handler.ts` — handles cognitive task directives
- `execution-readiness.ts` — pre-flight checks and readiness validation
- `sterling-bootstrap.ts` — Sterling service initialization

### World State (`world-state/`)
- `world-state-manager.ts` — polls `/state` endpoint; emits inventory/position updates
- `world-knowledge-integrator.ts` — integrates world knowledge into planning context

## Key Architectural Patterns

### Multi-Tier Solver Architecture
1. `BaseDomainSolver` — availability gating, planId extraction, episode reporting
2. Domain-specific solvers — crafting, tool progression, acquisition, building, furnace, navigation
3. `SterlingReasoningService` — WebSocket transport to Sterling backend

### Evidence-First Observability (Rig A)
- `SolveBundle` with content-addressed input/output hashes and compat reports
- Deterministic JSON canonicalization for bundle identity
- `compat-linter` validates rule semantics before solving

### Temporal Integration (Rig C)
- Rules annotated with makespan and batch hints
- P03 temporal slot definitions
- Configurable temporal modes (on/off/legacy)

### Goal-Task Binding (Rig G)
- Lifecycle: Activation → Execution → Completion
- Hold semantics for goal persistence across task boundaries
- Budget-based preemption of ongoing work

## Forward Model

Status: **type definitions retained but not actively integrated.** The forward model concept (predictive simulation, CVaR risk assessment, counterfactual replay) exists in type definitions but has no runtime implementation.

## Dependencies

### Internal Packages
- `@conscious-bot/core` — arbiter, leaves, Sterling client, MCP capabilities
- `@conscious-bot/world` — navigation, perception, world state
- `@conscious-bot/memory` — semantic knowledge, working memory
- `@conscious-bot/cognition` — thought stream, cognitive integration

### External
- Sterling backend (WebSocket) — graph-search reasoning engine
- `eventemitter3` — event-driven communication
- `zod` — runtime type validation
