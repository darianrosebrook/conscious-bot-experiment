# M2 Implementation Plan: Cognitive Foundation

**Author:** @darianrosebrook  
**Date:** December 2024  
**Status:** Implementation Ready  
**Priority:** Critical Research Objective

## Executive Summary

M2 focuses on implementing the **critical cognitive components** identified in the M1 Critical Review. This milestone transforms our sophisticated reactive system into a truly autonomous, learning agent capable of demonstrating consciousness-like behaviors. The implementation prioritizes **Planning: Goal Formulation**, **Memory Systems**, and **Cognitive Core** integration to establish the foundation for embodied artificial consciousness.

## Current Status Assessment

###  M1 Achievements (Foundation Complete)
- **Core Infrastructure**: Arbiter, MCP Capabilities, Real-Time Performance
- **World Interface**: Visible-Only Sensing, Perception, Navigation, Sensorimotor
- **Safety Systems**: Monitoring, Privacy, Fail-Safes
- **Technical Excellence**: 81 test suites, real-time budgets, event-driven architecture

###  Critical Gaps (M2 Focus)
1. **Cognitive Core (LLM Integration)**: 0% implemented - **CRITICAL**
2. **Memory Systems**: 0% implemented - **CRITICAL**  
3. **Goal Formulation**: 0% implemented - **CRITICAL**
4. **Planning Systems**: 0% implemented - **CRITICAL**

## M2 Implementation Strategy

### Phase 1: Cognitive Foundation 

#### 1.1 Planning: Goal Formulation
**Priority:** Critical Path - Enables autonomous behavior

```typescript
interface GoalFormulationSystem {
  // Homeostasis monitoring
  homeostasis: {
    health: HealthMonitor;
    hunger: HungerMonitor;
    energy: EnergyMonitor;
    safety: SafetyMonitor;
    curiosity: CuriosityMonitor;
  };
  
  // Need generation and prioritization
  needs: {
    primary: ['survival', 'safety', 'exploration'];
    secondary: ['social', 'achievement', 'creativity'];
    urgency: 'dynamic_calculation';
    satisfaction: 'continuous_monitoring';
  };
  
  // Goal management
  goals: {
    current: Goal[];
    queue: GoalQueue;
    priority: 'utility_based';
    adaptation: 'context_sensitive';
  };
}
```

**Implementation Files:**
- `packages/planning/src/goal-formulation/`
  - `homeostasis-monitor.ts`
  - `need-generator.ts`
  - `goal-manager.ts`
  - `utility-calculator.ts`

**Success Criteria:**
- Agent generates autonomous goals based on internal state
- Goal prioritization responds to changing conditions
- Homeostasis monitoring maintains agent well-being
- Utility calculation optimizes goal selection

#### 1.2 Memory: Episodic
**Priority:** Critical Path - Provides experience continuity

```typescript
interface EpisodicMemorySystem {
  // Event logging
  events: {
    storage: 'append_only_log';
    indexing: 'temporal_and_semantic';
    compression: 'salience_based';
    retrieval: 'context_aware';
  };
  
  // Memory consolidation
  consolidation: {
    frequency: 'during_downtime';
    strategy: 'salience_scoring';
    forgetting: 'graceful_decay';
    narrative: 'story_generation';
  };
  
  // Experience utilization
  utilization: {
    decision_support: 'pattern_recognition';
    learning: 'experience_synthesis';
    planning: 'historical_context';
    reflection: 'narrative_coherence';
  };
}
```

**Implementation Files:**
- `packages/memory/src/episodic/`
  - `event-logger.ts`
  - `memory-consolidator.ts`
  - `salience-scorer.ts`
  - `experience-retriever.ts`

**Success Criteria:**
- Agent logs significant experiences with metadata
- Memory consolidation occurs during idle periods
- Experience retrieval supports decision-making
- Narrative coherence maintained across sessions

### Phase 2: Intelligence Layer 

#### 2.1 Memory: Semantic
**Priority:** High - Enables knowledge representation

```typescript
interface SemanticMemorySystem {
  // Knowledge graph
  knowledge: {
    entities: 'minecraft_objects';
    relationships: 'spatial_and_functional';
    properties: 'dynamic_attributes';
    inference: 'graph_based_reasoning';
  };
  
  // GraphRAG retrieval
  retrieval: {
    primary: 'graph_rag';
    fallback: 'vector_similarity';
    query: 'structured_and_natural';
    ranking: 'relevance_and_freshness';
  };
  
  // Knowledge integration
  integration: {
    episodic: 'event_to_knowledge';
    perception: 'observation_to_facts';
    planning: 'knowledge_to_actions';
    learning: 'continuous_updates';
  };
}
```

**Implementation Files:**
- `packages/memory/src/semantic/`
  - `knowledge-graph.ts`
  - `graph-rag.ts`
  - `relationship-extractor.ts`
  - `query-engine.ts`

**Success Criteria:**
- Knowledge graph represents Minecraft world entities
- GraphRAG provides structured knowledge retrieval
- Knowledge integration supports planning and reasoning
- Continuous learning updates semantic knowledge

#### 2.2 Cognition: Cognitive Core
**Priority:** Critical - Provides reasoning and narrative

```typescript
interface CognitiveCoreSystem {
  // LLM integration
  llm: {
    provider: 'ollama_local';
    model: 'llama2_13b';
    fallback: 'llama2_7b';
    optimization: 'resource_aware';
  };
  
  // Internal dialogue
  dialogue: {
    frequency: 'event_driven';
    triggers: ['decisions', 'reflections', 'social'];
    coherence: 'narrative_continuity';
    quality: 'constitutional_alignment';
  };
  
  // Reasoning capabilities
  reasoning: {
    contextual: 'situation_understanding';
    ethical: 'constitutional_application';
    creative: 'novel_solution_generation';
    reflective: 'self_analysis';
  };
}
```

**Implementation Files:**
- `packages/cognition/src/cognitive-core/`
  - `llm-interface.ts`
  - `internal-dialogue.ts`
  - `reasoning-engine.ts`
  - `constitutional-filter.ts`

**Success Criteria:**
- Local LLM integration with Ollama
- Internal dialogue maintains narrative coherence
- Reasoning supports complex decision-making
- Constitutional alignment ensures ethical behavior

### Phase 3: Integration and Optimization (Weeks 9-12)

#### 3.1 System Integration
**Priority:** High - Ensures cohesive operation

```typescript
interface SystemIntegration {
  // Module coordination
  coordination: {
    arbiter: 'cognitive_routing';
    memory: 'cross_module_access';
    planning: 'goal_memory_integration';
    perception: 'memory_informed_observation';
  };
  
  // Performance optimization
  performance: {
    latency: '<200ms_routine_operations';
    memory: '<500mb_total_overhead';
    cpu: '<80%_utilization';
    degradation: 'graceful_fallback';
  };
  
  // Testing and validation
  validation: {
    integration: 'end_to_end_testing';
    performance: 'load_and_stress_testing';
    quality: 'behavioral_validation';
    regression: 'comprehensive_testing';
  };
}
```

**Implementation Files:**
- `packages/core/src/integration/`
  - `module-coordinator.ts`
  - `performance-optimizer.ts`
  - `integration-tester.ts`
  - `quality-validator.ts`

**Success Criteria:**
- All modules coordinate seamlessly
- Performance targets maintained under load
- Comprehensive test coverage achieved
- Behavioral validation confirms consciousness-like qualities

## Technical Implementation Details

### Package Structure

```
packages/
├── core/                    #  M1 Complete
│   ├── arbiter/
│   ├── mcp-capabilities/
│   └── real-time/
├── planning/               #  M2 New
│   ├── goal-formulation/
│   ├── hierarchical-planner/
│   └── reactive-executor/
├── memory/                 #  M2 New
│   ├── episodic/
│   ├── semantic/
│   ├── working/
│   └── provenance/
├── cognition/              #  M2 New
│   ├── cognitive-core/
│   ├── self-model/
│   └── social-cognition/
├── world/                  #  M1 Complete
│   ├── perception/
│   ├── navigation/
│   └── sensorimotor/
└── safety/                 #  M1 Complete
    ├── monitoring/
    ├── privacy/
    └── fail-safes/
```

### Dependencies and Integration

```json
{
  "dependencies": {
    "@conscious-bot/core": "workspace:*",
    "@conscious-bot/world": "workspace:*",
    "@conscious-bot/safety": "workspace:*",
    "ollama": "^0.1.0",
    "neo4j": "^5.0.0",
    "zod": "^3.22.0",
    "rxjs": "^7.8.0"
  }
}
```

### Configuration Management

```yaml
# config/m2-implementation.yaml
m2_implementation:
  cognitive_core:
    llm:
      provider: "ollama"
      model: "llama2:13b"
      fallback: "llama2:7b"
      max_tokens: 2048
      temperature: 0.7
    
  memory:
    episodic:
      max_events: 10000
      consolidation_interval: 3600
      salience_threshold: 0.3
    
    semantic:
      graph_database: "neo4j"
      max_entities: 100000
      max_relationships: 500000
    
  planning:
    goal_formulation:
      homeostasis_interval: 1000
      need_generation_frequency: "continuous"
      goal_queue_size: 10
```

## Risk Mitigation

### High-Risk Areas

1. **LLM Integration Complexity**
   - **Risk**: Local model setup and prompt engineering challenges
   - **Mitigation**: Start with Ollama + Llama 2, implement fallback mechanisms
   - **Contingency**: Use simpler rule-based reasoning as backup

2. **Memory Performance**
   - **Risk**: Graph database integration and query optimization
   - **Mitigation**: Implement caching, optimize queries, use indexing
   - **Contingency**: Fallback to simpler memory structures

3. **Integration Complexity**
   - **Risk**: Connecting multiple cognitive modules
   - **Mitigation**: Incremental integration with comprehensive testing
   - **Contingency**: Modular fallback to simpler systems

### Medium-Risk Areas

1. **Performance Degradation**
   - **Risk**: Maintaining real-time constraints with added complexity
   - **Mitigation**: Performance monitoring and graceful degradation
   - **Contingency**: Dynamic resource allocation and priority management

2. **Testing Coverage**
   - **Risk**: Ensuring comprehensive testing of cognitive behaviors
   - **Mitigation**: Behavioral testing framework and automated validation
   - **Contingency**: Manual testing and gradual rollout

## Success Metrics

### Functional Metrics
-  Agent generates and explains its own goals
-  Agent can recall and use past experiences
-  Agent can plan and execute complex multi-step actions
-  Agent can engage in basic internal dialogue

### Performance Metrics
-  Maintain <200ms p95 for routine operations
-  Maintain <50ms p95 for critical operations
-  LLM response time <2 seconds for cognitive tasks
-  Memory query latency <100ms for relevant information

### Quality Metrics
-  90% test coverage for new cognitive modules
-  Zero safety violations in cognitive decision-making
-  Successful integration with existing M1 modules
-  Passing all regression tests

## Implementation Timeline

### Week 1-2: Foundation Setup
- [ ] Create new packages (planning, memory, cognition)
- [ ] Set up Ollama and local LLM infrastructure
- [ ] Implement basic goal formulation system
- [ ] Create episodic memory foundation

### Week 3-4: Core Implementation
- [ ] Complete goal formulation with homeostasis
- [ ] Implement episodic memory with consolidation
- [ ] Set up semantic memory with GraphRAG
- [ ] Begin LLM integration for cognitive core

### Week 5-6: Intelligence Layer
- [ ] Complete cognitive core with internal dialogue
- [ ] Implement semantic memory integration
- [ ] Create memory-planning coordination
- [ ] Begin system integration testing

### Week 7-8: Integration and Optimization
- [ ] Complete system integration
- [ ] Performance optimization and tuning
- [ ] Comprehensive testing and validation
- [ ] Documentation and code review

### Week 9-10: Advanced Features
- [ ] Implement collaborative reasoning (HRM integration)
- [ ] Add learning and adaptation capabilities
- [ ] Enhance consciousness metrics
- [ ] Performance benchmarking

### Week 11-12: Validation and Documentation
- [ ] End-to-end system validation
- [ ] Research metrics collection
- [ ] Documentation completion
- [ ] M2 completion review

## Conclusion

M2 represents the **critical transformation** from a sophisticated reactive system to a truly autonomous, learning agent. By implementing the cognitive foundation (Goal Formulation, Memory Systems, and Cognitive Core), we establish the essential components for embodied artificial consciousness.

The implementation prioritizes **incremental development** with comprehensive testing, ensuring that each component builds upon the previous while maintaining the real-time performance and safety requirements established in M1.

**Key Success Factors:**
1. **Modular Development**: Each component developed and tested independently
2. **Performance Monitoring**: Continuous validation of real-time constraints
3. **Integration Testing**: Comprehensive end-to-end validation
4. **Documentation**: Complete documentation for research reproducibility

**Expected Outcome**: A conscious bot capable of autonomous goal generation, experience-based learning, and sophisticated reasoning that demonstrates the consciousness-like behaviors central to our research objectives.

---

**Next Action**: Begin M2 implementation with Week 1-2 foundation setup, starting with package creation and Ollama infrastructure setup.
