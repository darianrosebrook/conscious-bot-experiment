# Arbiter: Signal-Driven Control Implementation

**Module:** `core/arbiter/`  
**Purpose:** Central control system orchestrating cognitive modules with real-time performance constraints  
**Author:** @darianrosebrook

## Overview

The Arbiter serves as the **central nervous system** of the conscious bot, coordinating between all cognitive modules while enforcing strict real-time performance budgets. It implements a signal-driven architecture that routes cognitive tasks between planners (LLM, HRM, GOAP) based on problem characteristics and available computational budget.

## Architecture

### Core Components

```typescript
interface ArbiterSystem {
  signalProcessor: SignalProcessor;
  performanceMonitor: PerformanceMonitor;
  cognitiveRouter: CognitiveRouter;
  preemptionLadder: PreemptionLadder;
  safetyWatchdog: SafetyWatchdog;
}
```

### Signal Processing Pipeline

```
[Raw Signals] → [Signal Processor] → [Priority Evaluation] → [Cognitive Router] → [Module Selection] → [Execution]
     ↓                                      ↓                       ↓                    ↓
[Homeostasis] → [Need Assessment] → [Goal Candidates] → [Task Routing] → [Performance Monitor]
     ↓                                      ↓                       ↓                    ↓
[Intrusions] → [Constitution Filter] → [Utility Scoring] → [Budget Allocation] → [Safety Watchdog]
```

## Implementation Components

### 1. Signal Processor (`signal-processor.ts`)

**Purpose:** Aggregates and prioritizes signals from multiple sources

```typescript
/**
 * Central signal processing engine that aggregates inputs from homeostasis,
 * intrusions, and environmental observations into prioritized action candidates.
 * 
 * @author @darianrosebrook
 */
class SignalProcessor {
  /**
   * Process incoming signals and generate prioritized goal candidates
   * 
   * @param signals - Raw signals from various sources
   * @param context - Current environmental and internal context
   * @returns Prioritized list of goal candidates with utility scores
   */
  processSignals(
    signals: SignalInput[],
    context: ContextState
  ): GoalCandidate[];

  /**
   * Apply constitutional filtering to signal suggestions
   * 
   * @param signals - Raw signal inputs
   * @returns Filtered signals that pass constitutional rules
   */
  applyConstitutionalFilter(signals: SignalInput[]): SignalInput[];

  /**
   * Calculate utility scores for goal candidates using multi-factor analysis
   * 
   * @param candidates - Goal candidates to evaluate
   * @param context - Current context for scoring
   * @returns Candidates with computed utility scores
   */
  calculateUtilityScores(
    candidates: GoalCandidate[],
    context: ContextState
  ): ScoredGoalCandidate[];
}
```

### 2. Cognitive Router (`cognitive-router.ts`)

**Purpose:** Routes cognitive tasks to appropriate processing modules

```typescript
/**
 * Intelligent routing system that directs cognitive tasks to the most
 * appropriate processing module (LLM, HRM, GOAP) based on task characteristics
 * and performance constraints.
 * 
 * @author @darianrosebrook
 */
class CognitiveRouter {
  /**
   * Determine optimal cognitive module for task processing
   * 
   * @param task - Cognitive task to be processed
   * @param budget - Available computational budget
   * @param context - Current system context
   * @returns Selected module and routing rationale
   */
  routeTask(
    task: CognitiveTask,
    budget: PerformanceBudget,
    context: SystemContext
  ): RoutingDecision;

  /**
   * Evaluate task characteristics for routing decisions
   * 
   * @param task - Task to analyze
   * @returns Task signature for routing logic
   */
  analyzeTaskSignature(task: CognitiveTask): TaskSignature;

  /**
   * Apply mixture-of-experts routing heuristics
   * 
   * @param signature - Task characteristics
   * @param budget - Available resources
   * @returns Recommended processing module
   */
  applyRoutingHeuristics(
    signature: TaskSignature,
    budget: PerformanceBudget
  ): ModuleSelection;
}
```

### 3. Preemption Ladder (`preemption-ladder.ts`)

**Purpose:** Implements priority-based task preemption for real-time response

```typescript
/**
 * Implements hierarchical preemption for real-time cognitive control.
 * Ensures critical tasks (safety reflexes) can interrupt lower-priority
 * cognitive processes when necessary.
 * 
 * @author @darianrosebrook
 */
class PreemptionLadder {
  /**
   * Evaluate if incoming task should preempt current processing
   * 
   * @param currentTask - Currently executing task
   * @param incomingTask - New task requesting processing
   * @param context - Current danger/urgency context
   * @returns Preemption decision and execution plan
   */
  evaluatePreemption(
    currentTask: CognitiveTask,
    incomingTask: CognitiveTask,
    context: DangerContext
  ): PreemptionDecision;

  /**
   * Execute task preemption with state preservation
   * 
   * @param decision - Preemption decision to execute
   * @returns State preservation for resumed execution
   */
  executePreemption(decision: PreemptionDecision): PreemptionState;

  /**
   * Resume preempted task from preserved state
   * 
   * @param state - Previously preserved execution state
   * @returns Restored task execution context
   */
  resumePreemptedTask(state: PreemptionState): TaskExecution;
}
```

### 4. Safety Watchdog (`safety-watchdog.ts`)

**Purpose:** Monitors system health and triggers safe-mode when necessary

```typescript
/**
 * System safety monitor that watches for performance violations,
 * infinite loops, and other failure modes that require emergency intervention.
 * 
 * @author @darianrosebrook
 */
class SafetyWatchdog {
  /**
   * Continuously monitor system health and performance constraints
   * 
   * @param metrics - Current system performance metrics
   * @param budgets - Performance budget constraints
   * @returns Health assessment and any required interventions
   */
  monitorSystemHealth(
    metrics: PerformanceMetrics,
    budgets: PerformanceBudgets
  ): HealthAssessment;

  /**
   * Trigger safe-mode operation when violations detected
   * 
   * @param violation - Detected performance or safety violation
   * @returns Safe-mode execution plan
   */
  triggerSafeMode(violation: SafetyViolation): SafeModeExecution;

  /**
   * Implement emergency cognitive fallbacks
   * 
   * @param context - Emergency context
   * @returns Simplified cognitive execution plan
   */
  executeEmergencyFallback(context: EmergencyContext): FallbackExecution;
}
```

## Performance Constraints

### Real-Time Budget Enforcement

```typescript
interface PerformanceBudgets {
  // Emergency response (combat, lava, falling)
  emergency: {
    totalBudget: 50; // ms p95
    signalProcessing: 10; // ms
    routing: 5; // ms
    execution: 35; // ms
  };
  
  // Routine operation (exploration, building)
  routine: {
    totalBudget: 200; // ms p95
    signalProcessing: 30; // ms
    routing: 20; // ms
    execution: 150; // ms
  };
  
  // Deliberative planning (complex decisions)
  deliberative: {
    totalBudget: 1000; // ms p95
    signalProcessing: 50; // ms
    routing: 50; // ms
    execution: 900; // ms
  };
}
```

### Preemption Priority Levels

```typescript
enum PreemptionPriority {
  EMERGENCY_REFLEX = 0,    // Immediate danger (fall, lava, attack)
  SAFETY_INTERRUPT = 1,    // Safety violations, health critical
  GOAL_COMPLETION = 2,     // Active goal execution
  EXPLORATION = 3,         // Curiosity-driven behavior
  IDLE_PROCESSING = 4,     // Background tasks, memory consolidation
}
```

## Integration Points

### Signal Sources

1. **Homeostasis Monitor** → Internal drive signals (hunger, health, sleep)
2. **Sensorimotor Interface** → Environmental observations and threats
3. **Intrusion Interface** → External suggestions and commands
4. **Memory Systems** → Recalled goals and commitments
5. **Social Cognition** → Social obligations and opportunities

### Output Destinations

1. **Planning Modules** → Goal formulation and task planning
2. **Execution Systems** → Direct motor control and actions
3. **Memory Systems** → Experience logging and learning
4. **Safety Systems** → Alert propagation and intervention

## Monitoring and Telemetry

### Key Performance Indicators

```typescript
interface ArbiterMetrics {
  // Processing performance
  signalProcessingLatency: LatencyDistribution;
  routingDecisionTime: LatencyDistribution;
  totalCycleTime: LatencyDistribution;
  
  // Decision quality
  routingAccuracy: number; // vs oracle post-hoc
  preemptionCount: number;
  safeModeActivations: number;
  
  // Cognitive load
  queueDepth: number;
  droppedSignals: number;
  budgetViolations: number;
}
```

### Logging Strategy

```typescript
/**
 * Comprehensive logging for cognitive decision debugging
 */
interface ArbiterLogEntry {
  timestamp: number;
  phase: 'signal' | 'routing' | 'execution' | 'preemption';
  
  // Signal processing
  inputSignals?: SignalInput[];
  filteredSignals?: SignalInput[];
  generatedGoals?: GoalCandidate[];
  
  // Routing decisions
  taskSignature?: TaskSignature;
  routingDecision?: RoutingDecision;
  selectedModule?: ModuleType;
  
  // Performance tracking
  latencyMs: number;
  budgetUtilization: number;
  
  // Context
  dangerLevel: DangerLevel;
  cognitiveLoad: number;
  availableModules: ModuleType[];
}
```

## Configuration

### Routing Heuristics

```yaml
# config/arbiter.yaml
routing_rules:
  # Route social tasks to LLM for language understanding
  social_tasks:
    conditions:
      - has_dialogue: true
      - involves_players: true
    target_module: LLM
    confidence: 0.9
  
  # Route structured reasoning to HRM
  logical_tasks:
    conditions:
      - symbolic_preconditions: high
      - time_budget: ">100ms"
      - requires_planning: true
    target_module: HRM
    confidence: 0.8
  
  # Route immediate actions to GOAP
  reactive_tasks:
    conditions:
      - time_budget: "<50ms"
      - emergency_context: true
    target_module: GOAP_REFLEX
    confidence: 0.95

performance_budgets:
  emergency_ms: 50
  routine_ms: 200
  deliberative_ms: 1000
  
  # Budget allocation per phase
  signal_processing_pct: 20
  routing_pct: 10
  execution_pct: 70

preemption_thresholds:
  health_critical: 10  # HP
  lava_proximity: 2    # blocks
  fall_distance: 5     # blocks
  hostile_proximity: 3 # blocks
```

## Testing Strategy

### Unit Tests

- Signal processing accuracy with mock inputs
- Routing decision correctness for known task types  
- Preemption timing and state preservation
- Safety watchdog violation detection

### Integration Tests

- End-to-end signal → decision → action pipeline
- Performance budget enforcement under load
- Module communication and error handling
- Safe-mode fallback behavior

### Performance Tests

- Latency distribution under various loads
- Memory usage and garbage collection impact
- Concurrent signal processing throughput
- Stress testing with malformed inputs

## Implementation Files

### Required Implementation

```
core/arbiter/
├── signal-processor.ts       # Signal aggregation and prioritization
├── cognitive-router.ts       # Task routing logic
├── preemption-ladder.ts      # Priority-based preemption
├── safety-watchdog.ts        # System health monitoring
├── arbiter.ts               # Main orchestration class
├── types.ts                 # TypeScript interfaces
├── config.ts                # Configuration management
└── __tests__/
    ├── signal-processor.test.ts
    ├── cognitive-router.test.ts
    ├── preemption-ladder.test.ts
    ├── safety-watchdog.test.ts
    └── integration.test.ts
```

### External Dependencies

- `@conscious-bot/core/performance-monitor` - Performance tracking
- `@conscious-bot/memory` - Context and history access
- `@conscious-bot/planning` - Goal formulation integration
- `@conscious-bot/interfaces/constitution` - Rule enforcement

## Success Criteria

### Functional Requirements

- [ ] Process 100+ signals/second with <200ms p95 latency
- [ ] Route cognitive tasks with >90% accuracy vs human oracle
- [ ] Preempt lower-priority tasks within 10ms of emergency signals
- [ ] Maintain stable operation during 24+ hour continuous runs

### Performance Requirements

- [ ] Meet real-time budgets 95% of the time
- [ ] Memory usage <50MB for arbiter components
- [ ] Zero unsafe state transitions under normal operation
- [ ] Graceful degradation under computational stress

---

**Next Steps:**
1. Implement core signal processing pipeline
2. Create routing heuristics for LLM/HRM/GOAP selection  
3. Build preemption mechanisms for safety-critical interrupts
4. Integrate with performance monitoring system
5. Develop comprehensive test suite

This arbiter implementation serves as the **cognitive backbone** of the conscious bot, ensuring responsive, safe, and intelligent behavior across all operational contexts.

## Implementation Verification

**Confidence Score: 87%** - Core signal processing and routing implemented, but some advanced features need alignment

### ✅ Implemented Components

**Signal Processing Pipeline:**
- `packages/core/src/signal-processor.ts` (712 lines) - Complete signal normalization and fusion
- `packages/core/src/arbiter.ts` (672 lines) - Main arbiter with cognitive routing
- Signal taxonomy and normalization as specified in plan
- Real-time performance monitoring and budget enforcement

**Module Coordination:**
- Cognitive module interface with `canHandle()`, `process()`, `estimateProcessingTime()`
- Preemption system with priority levels
- Performance degradation management
- Constitutional filtering integration

**Real-Time Performance:**
- `packages/core/src/real-time/performance-tracker.ts` (782 lines)
- `packages/core/src/real-time/budget-enforcer.ts` (540 lines)
- `packages/core/src/real-time/degradation-manager.ts` (721 lines)

### 🔄 Partially Implemented

**Need Generation:**
- Basic need computation implemented
- Missing context gates (night/village boosts)
- Need trend tracking (dScore) not fully implemented

**Goal Template System:**
- Goal templates defined but not fully integrated
- Missing feasibility checking with inventory/craft graph
- Plan sketch hints for HRM not implemented

### ❌ Missing Components

**Advanced Signal Fusion:**
- Intrusion signal processing incomplete
- Memory/promise signal integration partial
- Social signal context awareness limited

**Priority Ranking:**
- Commitment boost calculation missing
- Novelty boost not implemented
- Opportunity cost calculation incomplete

### Next Steps for Full Alignment

1. **Complete Need Generation** (Priority: High - 4-6 hours)
   ```typescript
   // Missing: Context-aware need processing
   class AdvancedNeedGenerator {
     applyContextGates(need: Need, context: Context): Need;
     trackNeedTrends(needs: Need[]): TrendAnalysis;
     integrateMemorySignals(memory: Memory, needs: Need[]): EnhancedNeed[];
   }
   ```

2. **Enhance Goal Templates** (Priority: High - 6-8 hours)
   ```typescript
   // Missing: Advanced goal template integration
   class GoalTemplateManager {
     checkFeasibility(goal: Goal, state: WorldState): FeasibilityResult;
     generatePlanSketch(goal: Goal): PlanSketch;
     applyCooldownProtection(goal: Goal): ProtectedGoal;
   }
   ```

3. **Advanced Signal Processing** (Priority: Medium - 6-8 hours)
   ```typescript
   // Missing: Complex signal fusion
   class AdvancedSignalProcessor {
     processIntrusionSignals(intrusions: Intrusion[]): ProcessedSignal[];
     integrateMemorySignals(memory: Memory): MemorySignal[];
     enhanceSocialContext(signals: Signal[]): ContextualSignal[];
   }
   ```

4. **Priority Ranking Enhancement** (Priority: Medium - 4-6 hours)
   ```typescript
   // Missing: Advanced priority calculation
   class PriorityRanker {
     computeCommitmentBoost(goal: Goal, context: Context): number;
     computeNoveltyBoost(goal: Goal, history: History): number;
     computeOpportunityCost(goal: Goal, alternatives: Goal[]): number;
   }
   ```

### Integration Points

- **Memory System**: ✅ Integrated for signal storage
- **Constitutional Filter**: ✅ Integrated for safety gating
- **HRM Planning**: ✅ Basic integration, needs plan sketch hints
- **GOAP Execution**: ✅ Basic integration, needs enhanced coordination

### Critical Development Priorities

#### High Priority (Immediate Focus)
1. **Need Generation Enhancement** - Complete context-aware need processing and trend tracking
2. **Goal Template Integration** - Implement feasibility checking and plan sketch generation
3. **Advanced Signal Processing** - Complete intrusion and memory signal integration

#### Medium Priority (Next Phase)
1. **Priority Ranking Enhancement** - Implement commitment boost, novelty boost, and opportunity cost
2. **Integration Optimization** - Enhance coordination with HRM and GOAP systems
3. **Performance Monitoring** - Add advanced performance metrics and optimization

### Success Criteria for Full Alignment

- [ ] Context-aware need generation with trend tracking implemented
- [ ] Advanced goal template integration with feasibility checking
- [ ] Complex signal fusion with intrusion and memory integration
- [ ] Advanced priority ranking with multi-factor analysis
- [ ] Complete integration with all cognitive modules

**Overall Assessment**: The core signal processing and routing architecture is solidly implemented. The main gaps are in advanced need generation, goal template integration, and priority ranking sophistication. The foundation is strong for completing the remaining features. With focused development on the identified priorities, 95%+ alignment can be achieved within 2-3 weeks.
