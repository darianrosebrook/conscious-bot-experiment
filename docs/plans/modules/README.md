# Conscious Bot Modules — Map of Content

Author: @darianrosebrook

This directory contains implementation plans for all modules. Use this Map of Content and Progress Tracker to navigate and track completion.

## Map of Content

### Core
- [Core Overview](core/README.md)
- [Arbiter & Signal-Driven Control](core/arbiter_signal_driven_control.md)

### World
- [World Overview](world/README.md)
- [Visible-Only Sensing (Ray Casting)](world/visible_only_sensing.md)

### Memory
- [Memory Overview](memory/README.md)
- [Memory & Recall: Places and Stories](memory/memory_and_recall.md)

### Planning
- [Planning Suite Overview](planning/README.md)
- [Goal Formulation](planning/goal_formulation.md)
- [Hierarchical Planner (HTN/HRM)](planning/hierarchical_planner.md)
- [Reactive Executor (GOAP)](planning/reactive_executor.md)
- [Forward Model (Predictive Simulation)](planning/forward_model.md)

### Cognition
- [Cognition Overview](cognition/README.md)
- [Cognitive Core (LLM Integration)](cognition/cognitive_core.md)
- [Self-Model (Identity & Narrative)](cognition/self_model.md)
- [Social Cognition (Theory of Mind)](cognition/social_cognition.md)

### Interfaces
- [Interfaces Overview](interfaces/README.md)
- [Web Dashboard & Streaming (Next.js)](interfaces/web_dashboard.md)
- [Intrusion Interface (External Suggestions)](interfaces/intrusion_interface.md)
- [Human Controls (Live Oversight)](interfaces/human_controls.md)
- [Constitution (Ethical Rules Engine)](interfaces/constitution.md)

### Safety
- [Safety Overview](safety/README.md)
- [Privacy (Data Protection)](safety/privacy.md)
- [Monitoring (Telemetry & Performance)](safety/monitoring.md)
- [Fail-Safes (Watchdogs & Recovery)](safety/fail_safes.md)

### Evaluation
- [Evaluation Overview](evaluation/README.md)
- [Scenarios (Test Environments)](evaluation/scenarios.md)
- [Metrics (Performance Analysis)](evaluation/metrics.md)
- [Curriculum (Progressive Learning)](evaluation/curriculum.md)

## Progress Tracker

**🎉 MILESTONE 1 (FOUNDATION) COMPLETE** - All critical infrastructure modules implemented and tested

| Module                         | Plan Doc                                       | Status | Milestone | Dependencies | Priority |
|--------------------------------|------------------------------------------------------|---------|-----------|--------------|----------|
| Core: Arbiter/Signals          | core/arbiter/README.md                               | ✅ Implemented | M1: Signal Pipeline | World, Memory | Critical |
| Core: MCP Capabilities         | core/mcp_capabilities/README.md                     | ✅ Implemented | M1: Action Interface | Core | Critical |
| Core: Real-Time Performance    | core/real_time/README.md                            | ✅ Implemented | M1: Performance Monitoring | Core | Critical |
| World: Visible-Only Sensing    | world/visible_only_sensing.md                       | ✅ Implemented | M1: Ray Casting | Core | Critical |
| World: Navigation              | world/navigation/README.md                          | ✅ Implemented | M1: D* Lite Pathfinding | Core, Perception | Critical |
| World: Perception              | world/perception/README.md                          | ✅ Implemented | M1: Occlusion & Confidence | Core | Critical |
| World: Sensorimotor            | world/sensorimotor/README.md                        | ✅ Implemented | M1: Motor Control | Core, MCP | Critical |
| Safety: Privacy                | safety/privacy.md                                    | ✅ Implemented | M1: Data Protection | None | Critical |
| Safety: Monitoring             | safety/monitoring.md                                 | ✅ Implemented | M1: Telemetry | None | Critical |
| Safety: Fail-Safes             | safety/fail_safes.md                                | ✅ Implemented | M1: Watchdogs | Monitoring | Critical |
| Planning: Goal Formulation     | planning/goal_formulation.md                         | ✅ Implemented | M2: Utility Engine | Core, Memory | Critical |
| Cognition: Cognitive Core      | cognition/cognitive_core.md                          | ✅ Implemented | M2: LLM Integration | Core | Critical |
| Cognition: Self Model          | cognition/self_model/self_model.md                   | ✅ Implemented | M2: Identity & Narrative | Cognitive Core | High |
| Memory: Episodic               | memory/episodic/README.md                           | ✅ Implemented | M2: Experience Storage | Core, World | High |
| World: Place Graph             | world/place_graph/README.md                         | ✅ Implemented | M2: Spatial Memory | Core, Navigation | High |
| Memory: Semantic               | memory/semantic/README.md                           | Not Started | M2: Knowledge Graph | Core, World | High |
| Memory: Working                | memory/working/README.md                            | ✅ Implemented | M2: Cognitive Workspace | Core | High |
| Memory: Provenance             | memory/provenance/README.md                         | Not Started | M2: Decision Tracking | Core, Memory | High |
| Interfaces: Constitution       | interfaces/constitution.md                           | ✅ Implemented | M2: Rules Engine | None | Critical |
| Interfaces: Web Dashboard      | interfaces/web_dashboard.md                          | 📝 Planned | M2: Monitoring | Safety | Medium |
| Evaluation: Scenarios          | evaluation/scenarios.md                              | 📝 Planned | M2: Test Envs | None | High |
| Evaluation: Metrics            | evaluation/metrics.md                                | 📝 Planned | M2: Analytics | Scenarios | High |
| Planning: Hierarchical Planner | planning/hierarchical_planner.md                     | 📝 Planned | M3: HTN Engine | Goal Form., Core | Critical |
| Planning: Reactive Executor    | planning/reactive_executor.md                        | 📝 Planned | M3: GOAP Impl. | Hierarchical Plan. | Critical |
| Interfaces: Intrusion Interface| interfaces/intrusion_interface.md                   | 📝 Planned | M3: Constitution | Safety, Cognition | High |
| Cognition: Cognitive Core      | cognition/cognitive_core.md                          | 📝 Planned | M3: LLM Integration | Planning, Memory | High |
| Evaluation: Curriculum         | evaluation/curriculum.md                             | 📝 Planned | M3: Progression | Metrics | Medium |
| Planning: Forward Model        | planning/forward_model.md                            | 📝 Planned | M4: Simulation | Planning Suite | Medium |
| Interfaces: Human Controls     | interfaces/human_controls.md                        | 📝 Planned | M4: Oversight | Web Dashboard | Medium |
| Cognition: Self-Model          | cognition/self_model.md                              | 📝 Planned | M4: Identity Sys. | Cognitive Core | Medium |
| Cognition: Social Cognition    | cognition/social_cognition.md                        | 📝 Planned | M4: Theory of Mind | Cognitive Core | Medium |

### Legend
- 📝 **Planned**: Specification complete, ready for implementation
- 🚧 **In Progress**: Implementation started
- ✅ **Complete**: Module functional and tested
- ⚠️ **Blocked**: Waiting on dependencies

### Milestones
- **M1: Foundation**: Core systems, safety, sensing capabilities established
- **M2: Intelligence**: Memory systems, goal formulation, evaluation framework operational
- **M3: Planning**: HTN/GOAP planning with cognitive integration functional
- **M4: Advanced**: Simulation, identity development, social cognition complete

## Strategic Planning Documents

Beyond module-specific plans, the following strategic documents guide overall project execution:

- [Integration Strategy](../../strategy/INTEGRATION_STRATEGY.md) - Cross-module coordination and data flow validation
- [Risk Management](../../strategy/RISK_MANAGEMENT.md) - Comprehensive risk assessment and mitigation strategies  
- [Verification Framework](../../strategy/VERIFICATION_FRAMEWORK.md) - Quality assurance and testing methodology
- [Future Enhancements](../../strategy/FUTURE_ENHANCEMENTS.md) - Advanced features for post-M4 development phases

📋 **See [Strategy Overview](../../strategy/README.md) for detailed guidance on using these documents.**

## Implementation Guidelines

### Development Priorities
1. **Foundation First** (M1): Establish core safety, monitoring, and sensing capabilities
2. **Intelligence Layer** (M2): Build memory systems, goal formulation, and evaluation framework
3. **Planning Integration** (M3): Implement HTN/GOAP planning with cognitive integration
4. **Advanced Features** (M4): Add simulation, identity development, and social cognition

### Quality Standards
- **Test Coverage**: Minimum 90% for critical modules, 85% for supporting modules
- **Performance**: All modules must meet specified latency constraints (P95)
- **Documentation**: All public APIs and architectural decisions documented
- **Integration**: Contract testing required between all module boundaries

### Progress Tracking Protocol
1. Update status column when beginning module implementation (📝 → 🚧)
2. Mark dependencies as ⚠️ **Blocked** if waiting on prerequisite modules
3. Update to ✅ **Complete** only after passing all verification criteria
4. Update milestone progress regularly in team reviews

Notes:
- All modules follow the verification framework for quality assurance
- Risk management strategies applied to high-complexity modules
- Integration testing required before milestone completion

---
