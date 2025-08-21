# Planning & Decision Making Implementation Plans

**Module Suite:** `modules/planning/`  
**Purpose:** Multi-tier planning architecture with real-time adaptation and risk management  
**Author:** @darianrosebrook

## Overview

This planning module suite implements a sophisticated cognitive decision-making system inspired by F.E.A.R.'s GOAP architecture, SHOP2's HTN planning, and modern risk management techniques. The four modules work together to provide intelligent, adaptive planning from high-level strategic thinking down to reactive execution.

## Module Architecture

### Integration Flow
```
Signals → [Goal Formulation] → Goals → [Hierarchical Planner] → Plan
    ↓                                            ↓
[Forward Model] ← Action Candidates ← [Reactive Executor] ← Execution
    ↓                                            ↓
Predictions → Risk Assessment → Plan Repair ← Feedback
```

### Module Responsibilities

#### 1. Goal Formulation (`goal_formulation/`)
**Signals → Needs → Goals Pipeline**
- Transforms internal drives and external intrusions into prioritized goals
- Multi-factor utility scoring with urgency, context, risk assessment
- Feasibility analysis and automatic subgoal decomposition
- Real-time performance: Sub-50ms full pipeline

#### 2. Hierarchical Planner (`hierarchical_planner/`)  
**HTN/HRM Multi-Tier Planning**
- Top-down decomposition of complex projects using domain knowledge
- HRM-inspired refinement loops for plan adaptation
- Mixture-of-experts routing between LLM/HRM/GOAP
- Plan caching and preference-based method selection

#### 3. Reactive Executor (`reactive_executor/`)
**GOAP Real-Time Execution**
- F.E.A.R.-style opportunistic action planning for minute-to-minute decisions
- Plan repair vs replanning with stability metrics
- Safety reflexes for emergency responses
- Dynamic cost evaluation and real-time adaptation

#### 4. Forward Model (`forward_model/`)
**Predictive Simulation & Risk Assessment**
- Lightweight off-tick simulation for action candidate evaluation
- Prediction error tracking for model improvement
- CVaR analysis for tail-risk management
- Counterfactual replay for learning and debugging

## Key Engineering Insights

### From HTN Literature (SHOP2, Hierarchical Task Networks)
- **Domain knowledge encoding**: HTN methods capture expert Minecraft strategies
- **Ordered task decomposition**: Complex goals broken into sequenced subtasks
- **Preference-based selection**: Choose methods based on context (day/night, safety, efficiency)
- **Plan stability**: Prefer repair over replanning to maintain commitments

### From GOAP in Games (F.E.A.R. AI)
- **Opportunistic execution**: React to immediate threats and opportunities
- **Dynamic cost functions**: Action costs adapt to current context (threat level, resources)
- **Real-time replanning**: Continuous A* search in action space with time budgets
- **Emergent behavior**: Complex strategies emerge from simple action interactions

### From Modern Planning Research
- **D* Lite navigation**: Efficient replanning when environment changes
- **Plan repair techniques**: Edit distance metrics for plan stability
- **CVaR risk management**: Conditional Value at Risk for tail event protection
- **Anytime algorithms**: Graceful degradation under time pressure

## Performance Targets

### Real-Time Constraints
```typescript
interface PlanningPerformanceTargets {
  // Goal Formulation
  signalToGoalLatency: '< 50ms p95';
  priorityScoringLatency: '< 15ms p95';
  
  // Hierarchical Planning  
  htnDecompositionLatency: '< 50ms p95';
  methodSelectionLatency: '< 10ms p95';
  planCacheHitRate: '> 95%';
  
  // Reactive Execution
  goapPlanningLatency: '< 20ms p95';
  safetyReflexLatency: '< 5ms p95';
  repairToReplanRatio: '> 80%';
  
  // Forward Model
  simulationRolloutLatency: '< 10ms per 5-step sequence';
  parallelCandidateEvaluation: '< 50ms for 5 candidates';
  predictionAccuracy: '> 80%';
}
```

### Quality Metrics
```typescript
interface PlanningQualityMetrics {
  // Decision Quality
  goalSuccessRate: '> 85%';           // Goals achieved vs attempted
  planOptimalityRatio: '> 90%';       // Efficiency vs optimal
  priorityAccuracy: '> 90%';          // Ranking accuracy vs outcomes
  
  // Stability & Coherence
  planStabilityIndex: '> 0.8';        // Minimize disruptive changes
  commitmentViolationRate: '< 5%';    // Honor promises and persistence
  narrativeCoherence: '> 0.85';       // Actions align with agent identity
  
  // Adaptability
  threatResponseTime: '< 1000ms';     // Emergency reaction speed
  opportunityUtilization: '> 70%';    // Capitalize on chances
  contextAdaptationSpeed: '< 2000ms'; // Adjust to environment changes
}
```

## Implementation Dependencies

### Foundation Implementation
- **Goal Formulation**: Basic signal processing and priority scoring established
- **HTN Engine**: Method registry and decomposition functionality complete
- **GOAP Planner**: Action system and basic repair mechanisms operational
- **Forward Model**: Lightweight simulator with prediction tracking functional

### Integration & Optimization Requirements
- **Module Integration**: Communication protocols between planning components
- **Performance Optimization**: Real-time constraint enforcement across all planners
- **Advanced Features**: CVaR, preferences, learning mechanisms integrated
- **Testing Validation**: Comprehensive testing and validation framework complete

### Intelligence & Learning Enhancements
- **Adaptive Systems**: Preference learning and dynamic cost adjustment
- **Risk Management**: Advanced tail-event protection and assessment
- **Strategic Integration**: Social and long-term goal coordination
- **Evaluation Optimization**: Performance tuning and behavioral analysis

## Testing Strategy

### Unit Testing
- Property-based testing for plan correctness and stability
- Golden tests for method decomposition and goal generation
- Performance benchmarks for real-time constraint validation
- Mock environments for isolated module testing

### Integration Testing  
- End-to-end planning scenarios with metrics collection
- Stress testing under resource constraints and threats
- Ablation studies to measure module contribution
- Cross-module communication and error handling

### Scenario Testing
- BASALT-style Minecraft tasks for human-comparable evaluation
- Progressive curriculum from simple survival to complex projects
- Long-term autonomy tests for emergent behavior observation
- Social interaction scenarios for cooperative planning

## Dependencies

### Internal Modules
- `@modules/core/mcp_capabilities` - Action execution through capability bus
- `@modules/world/navigation` - D* Lite pathfinding and spatial reasoning
- `@modules/memory/working` - Current state and context tracking
- `@modules/memory/semantic` - World knowledge for feasibility analysis
- `@modules/cognition/cognitive_core` - LLM integration for complex reasoning
- `@modules/interfaces/constitution` - Ethical constraints and rule checking

### External Libraries
- `fast-check` - Property-based testing for plan validation
- `@opentelemetry/api` - Performance monitoring and distributed tracing
- Planning libraries: `pyhop` (HTN), custom GOAP implementation
- Risk analysis: Custom CVaR implementation with statistical libraries

## Success Criteria

### Technical Achievements
- [ ] All modules meet real-time performance constraints
- [ ] 95%+ plan execution success rate in evaluation scenarios
- [ ] Seamless integration with broader cognitive architecture
- [ ] Comprehensive telemetry and debugging capabilities

### Behavioral Achievements  
- [ ] Coherent long-term project completion (building, exploration)
- [ ] Adaptive threat response without goal abandonment
- [ ] Opportunistic resource gathering during planned activities
- [ ] Stable personality and decision patterns over extended runs

### Research Contributions
- [ ] Validation of HTN+GOAP hybrid architecture in complex domains
- [ ] Demonstration of real-time constraint satisfaction in planning
- [ ] Evidence for improved decision quality through predictive simulation
- [ ] Case studies of emergent intelligent behavior from modular design

This planning module suite represents a state-of-the-art implementation of multi-tier cognitive decision-making, bridging classical AI planning techniques with modern real-time constraints and risk management approaches.