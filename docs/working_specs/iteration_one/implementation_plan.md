 comprehensive implementation plan for raising the conscious bot from "autonomous but generic" to "cohesive, higher-cognition" while preserving its existing strengths.

# Implementation Plan: Conscious Bot Higher-Cognition Enhancement

## Overview

This plan implements the change-set specifications to transform the conscious bot from "autonomous but generic" to "cohesive, higher-cognition" while preserving the vivid, in-world realism and user-parsing strengths. The implementation follows the ReAct pattern, Voyager-style skill library, and hybrid GOAP/HTN + Behavior Tree architecture outlined in the specifications.

## Phase 1: Core Infrastructure (Weeks 1-2)

### 1.1 ReAct Arbiter Implementation
**Target**: `packages/cognition/src/react-arbiter/`

**Implementation**:
- Create `ReActArbiter` class implementing the reason↔act loop
- Implement `/reason` endpoint with grounded context injection
- Add `/reflect` endpoint for Reflexion-style verbal self-feedback
- Integrate with existing cognitive core

**Testing**:
- Unit tests for ReAct loop integrity (max 1 tool call per step)
- Integration tests with mock world state
- Performance tests: thought→tool dispatch < 600ms

**Verification**:
- ReAct trace validation (every step has tool result in next prompt)
- Reflexion engagement ≥ 80% on failed tasks
- Tool error rate < 5%

### 1.2 Behavior Tree Executor
**Target**: `packages/planning/src/behavior-trees/`

**Implementation**:
- Create `BehaviorTreeRunner` with streaming SSE interface
- Implement leaf nodes for Mineflayer actions (dig, place, craft, pathfind)
- Add timeout/retry policies and guard conditions
- Create `/run-option` endpoint with telemetry streaming

**Testing**:
- Unit tests for BT node execution
- Integration tests with mock Mineflayer interface
- Performance tests: leaf call timeouts 3-8s, retry ≤ 2

**Verification**:
- BT execution stability under noise
- Guard condition activation during hazards
- Telemetry stream latency < 1s p95

### 1.3 Enhanced World Perception
**Target**: `packages/world/src/perception/`

**Implementation**:
- Enhance `/snapshot` endpoint with grounded context
- Add `/inventory` endpoint with versioning
- Implement `/waypoints` endpoint
- Add state_id versioning for staleness detection

**Testing**:
- Performance tests: snapshot < 250ms p95, inventory < 150ms p95
- State consistency tests
- Grounded context accuracy validation

**Verification**:
- Real-time world state accuracy
- State versioning prevents stale data usage
- Context injection improves LLM grounding

## Phase 2: Skill Library & Memory (Weeks 3-4)

### 2.1 Voyager-Style Skill Registry
**Target**: `packages/memory/src/skills/`

**Implementation**:
- Create `SkillRegistry` with pre/post conditions
- Implement skill metadata persistence
- Add skill composition and reuse tracking
- Create automatic curriculum generation

**Testing**:
- Unit tests for skill validation and composition
- Integration tests for skill reuse across worlds
- Performance tests for skill lookup < 200ms

**Verification**:
- Skill reuse rate tracking
- Transfer learning across worlds
- Automatic curriculum effectiveness

### 2.2 Enhanced Memory System
**Target**: `packages/memory/src/`

**Implementation**:
- Enhance episodic memory with compressed traces
- Add semantic memory with decay schedules
- Implement Reflexion buffer for structured hints
- Create hybrid vector + symbolic retrieval

**Testing**:
- Memory retrieval accuracy tests
- Reflexion hint persistence and retrieval
- Performance tests: recall (K=5) < 200ms p95

**Verification**:
- Memory influences planning decisions
- Reflexion hints improve success rates
- Episodic traces enable learning from experience

### 2.3 First Ten Skills Implementation
**Target**: `packages/planning/src/skills/`

**Implementation**:
- `opt.shelter_basic`: Safe 3×3×2 shelter with lighting
- `opt.chop_tree_safe`: Tree harvesting with safety checks
- `opt.ore_ladder_iron`: Iron mining with ladder safety
- `opt.smelt_iron_basic`: Iron smelting pipeline
- `opt.craft_tool_tiered`: Tiered tool crafting
- `opt.food_pipeline_starter`: Hunger satisfaction
- `opt.torch_corridor`: Mining corridor lighting
- `opt.bridge_gap_safe`: Safe ravine traversal
- `opt.biome_probe`: Exploration with waypoint logging
- `opt.emergency_retreat_and_block`: Hard abort mechanism

**Testing**:
- Individual skill unit tests with behavior contracts
- Integration tests for skill composition
- Safety and guard condition validation

**Verification**:
- Skills execute reliably under various conditions
- Guard conditions prevent failures
- Skills compose effectively for complex tasks

## Phase 3: Hybrid Planning & User Interface (Weeks 5-6)

### 3.1 HTN/GOAP Hybrid Planner
**Target**: `packages/planning/src/hybrid-planner/`

**Implementation**:
- Create HTN planner for structured tasks (tech progression)
- Implement GOAP for flexible goal satisfaction
- Add plan repair mechanism for failed nodes
- Integrate with skill registry for option selection

**Testing**:
- HTN method validation and expansion
- GOAP goal satisfaction tests
- Plan repair effectiveness validation

**Verification**:
- Plans reference only valid skills
- Repair mechanism avoids wholesale replanning
- Hybrid approach improves planning efficiency

### 3.2 Task Parser Restoration
**Target**: `packages/cognition/src/task-parser/`

**Implementation**:
- Restore schema-first user task parsing
- Add keyword fallbacks for robustness
- Implement creative, grounded paraphrasing
- Connect parsed tasks to goal stack

**Testing**:
- Task parsing accuracy tests
- Schema validation tests
- Creative response quality validation

**Verification**:
- User commands translate to structured tasks
- Creative responses remain grounded in world state
- Task integration with cognitive loop

### 3.3 Dual-Channel Prompting
**Target**: `packages/cognition/src/prompting/`

**Implementation**:
- Operational channel (low temp) for tool selection
- Expressive channel (high temp) for player narration
- Grounded context injection from world state
- Style exemplars for personality consistency

**Testing**:
- Channel separation validation
- Context grounding accuracy
- Style consistency tests

**Verification**:
- Operational decisions remain schema-bound
- Expressive responses are creative but accurate
- Dual channels work harmoniously

## Phase 4: Evaluation & Integration (Weeks 7-8)

### 4.1 MineDojo-Style Evaluation Suite
**Target**: `packages/evaluation/src/minedojo-tasks/`

**Implementation**:
- Create 6-10 core evaluation tasks
- Implement success rate tracking
- Add performance metrics (steps, damage, deaths)
- Create nightly evaluation pipeline

**Testing**:
- Task execution reliability
- Metric collection accuracy
- Evaluation pipeline stability

**Verification**:
- Success rate tracking for core tasks
- Performance regression detection
- Evaluation results inform development

### 4.2 Enhanced Dashboard
**Target**: `packages/dashboard/src/`

**Implementation**:
- Real-time ReAct trace visualization
- BT execution tree display
- Plan stack and skill call tracking
- Replay scrubber with screenshots

**Testing**:
- Dashboard performance under load
- Real-time update accuracy
- Export functionality validation

**Verification**:
- Dashboard provides actionable insights
- Real-time visibility improves debugging
- Export enables offline analysis

### 4.3 Integration Testing
**Target**: System-wide integration

**Implementation**:
- End-to-end workflow testing
- Performance benchmarking
- Safety and reliability validation
- User experience testing

**Testing**:
- Complete workflow execution
- Performance under various conditions
- Safety mechanism validation

**Verification**:
- System works cohesively
- Performance meets targets
- Safety mechanisms function correctly

## Testing & Verification Strategy

### Automated Testing
1. **Unit Tests**: Each module has comprehensive unit tests
2. **Integration Tests**: Cross-module functionality validation
3. **Performance Tests**: Latency and throughput benchmarks
4. **Safety Tests**: Guard condition and error handling validation

### Manual Testing
1. **User Experience Testing**: Task parsing and creative responses
2. **Safety Validation**: Hazard handling and emergency procedures
3. **Performance Validation**: Real-world scenario testing

### Continuous Evaluation
1. **Nightly Benchmarks**: MineDojo-style task evaluation
2. **Regression Detection**: Performance and success rate monitoring
3. **Skill Reuse Tracking**: Learning and transfer measurement

## Success Metrics

### Performance Targets
- ReAct step: thought→tool dispatch < 600ms
- World perception: snapshot < 250ms p95, inventory < 150ms p95
- Memory operations: recall < 200ms p95
- BT execution: leaf timeouts 3-8s, retry ≤ 2

### Quality Metrics
- Success rate on core tasks ≥ 85%
- Reflexion engagement ≥ 80% on failed tasks
- Skill reuse rate ≥ 60%
- Tool error rate < 5%

### User Experience Metrics
- Task parsing accuracy ≥ 90%
- Creative response grounding ≥ 95%
- Dashboard latency < 1s p95

## Implementation Order

1. **Start with edges**: BT executor and world perception
2. **Add core loop**: ReAct arbiter with grounded context
3. **Build skills**: First ten skills with comprehensive testing
4. **Enhance memory**: Skill registry and Reflexion buffer
5. **Implement planning**: HTN/GOAP hybrid with skill integration
6. **Restore UX**: Task parser and dual-channel prompting
7. **Add evaluation**: MineDojo-style benchmarks
8. **Polish integration**: Dashboard and system-wide testing

This implementation plan follows the specifications while leveraging the existing codebase structure. Each phase builds upon the previous one, ensuring a stable foundation for higher-cognition capabilities while preserving the bot's existing strengths.