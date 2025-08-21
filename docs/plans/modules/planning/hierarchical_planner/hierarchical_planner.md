# Hierarchical Planner Implementation Plan

**Module:** `modules/planning/hierarchical_planner/`  
**Purpose:** HTN/HRM multi-tier planning with decomposition and refinement  
**Author:** @darianrosebrook

## Architecture Overview

The hierarchical planner implements a two-tier system combining:
1. **HTN (Hierarchical Task Networks)** for top-down decomposition of complex projects
2. **HRM-inspired refinement** for plan adaptation and optimization

### When to Use HTN vs GOAP
- **HTN**: Complex, multi-step projects ("Establish safe base", "Prepare Nether trip", "Trade up to diamond gear")
- **GOAP**: Minute-to-minute reactive execution ("heal now", "retreat", "grab nearby coal")

## Core Components

### 1. World State Representation
```typescript
// SHOP2-style predicate representation
interface WorldState {
  predicates: Set<Predicate>;
  
  // Fast lookups
  hasItem(item: string, qty: number): boolean;
  isAt(location: Position): boolean;
  timeOfDay(): 'day' | 'night' | 'dawn' | 'dusk';
  threatLevel(): number;
}

interface Predicate {
  name: string;
  args: any[];
  
  // Examples:
  // At(bot, x, y, z)
  // Has(bot, item, qty)
  // SafeZone(x, y, z)
  // ToolTier(bot, 'iron')
  // KnownVillage(id)
}
```

### 2. HTN Methods (Domain Knowledge)
```typescript
interface HTNMethod {
  task: string;
  guard: (state: WorldState) => boolean;
  expandsTo: string[];
  preferences: Preference[];
  cost: number;
}

// Example methods
const ESTABLISH_SAFE_BASE: HTNMethod = {
  task: 'EstablishSafeBase',
  guard: (state) => !state.hasItem('bed', 1),
  expandsTo: [
    'SelectSite',
    'LightPerimeter', 
    'PlaceBed',
    'BuildShelter'
  ],
  preferences: [
    { type: 'prefer_plains', weight: 0.8 },
    { type: 'avoid_night', weight: 0.9 }
  ],
  cost: 100
};

const PREPARE_NETHER_TRIP: HTNMethod = {
  task: 'PrepareNetherTrip',
  guard: (state) => state.hasItem('obsidian', 10),
  expandsTo: [
    'AcquireArmor(iron_or_better)',
    'StockFood(stack>=2)',
    'BrewPotions(FireResistance)',
    'BuildPortal',
    'SetSpawn(base)'
  ],
  preferences: [
    { type: 'safety_first', weight: 1.0 }
  ],
  cost: 500
};
```

### 3. Operators (Primitive Actions)
```typescript
interface Operator {
  name: string;
  preconditions: Predicate[];
  effects: Effect[];
  cost: number;
  exec: (mcp: MCPBus) => Promise<ExecutionResult>;
}

const CRAFT_STONE_PICKAXE: Operator = {
  name: 'Craft(stone_pickaxe)',
  preconditions: [
    { name: 'Has', args: ['bot', 'cobblestone', 3] },
    { name: 'Has', args: ['bot', 'stick', 2] },
    { name: 'At', args: ['bot', 'nearCraftingTable'] }
  ],
  effects: [
    { type: 'add', predicate: { name: 'Has', args: ['bot', 'stone_pickaxe', 1] } },
    { type: 'remove', predicate: { name: 'Has', args: ['bot', 'cobblestone', 3] } },
    { type: 'remove', predicate: { name: 'Has', args: ['bot', 'stick', 2] } }
  ],
  cost: 5,
  exec: async (mcp) => mcp.mineflayer.craft('stone_pickaxe', 1)
};
```

### 4. HTN Planner Engine
```typescript
class HTNPlanner {
  private methods: Map<string, HTNMethod[]> = new Map();
  private operators: Map<string, Operator> = new Map();
  
  /**
   * Decompose a high-level task into ordered subtasks
   * Returns cached plan if available and still valid
   */
  async decompose(
    task: string, 
    state: WorldState,
    context: PlanningContext
  ): Promise<Plan | null> {
    
    // Check cache first
    const cached = this.planCache.get(task, state);
    if (cached && this.isStillValid(cached, state)) {
      return cached;
    }
    
    // Find applicable methods
    const methods = this.getApplicableMethods(task, state);
    if (methods.length === 0) return null;
    
    // Select best method using preferences
    const method = this.selectBestMethod(methods, state, context);
    
    // Recursive decomposition
    const plan = await this.expandMethod(method, state, context);
    
    // Cache result
    this.planCache.set(task, state, plan);
    
    return plan;
  }
  
  private selectBestMethod(
    methods: HTNMethod[], 
    state: WorldState, 
    context: PlanningContext
  ): HTNMethod {
    
    return methods.reduce((best, current) => {
      const currentScore = this.scoreMethod(current, state, context);
      const bestScore = this.scoreMethod(best, state, context);
      return currentScore > bestScore ? current : best;
    });
  }
  
  private scoreMethod(
    method: HTNMethod, 
    state: WorldState, 
    context: PlanningContext
  ): number {
    
    let score = 1.0 / method.cost;
    
    // Apply preferences
    for (const pref of method.preferences) {
      score *= this.evaluatePreference(pref, state, context);
    }
    
    // Context factors
    if (context.urgency > 0.8) {
      score *= (1.0 - method.cost / 1000); // Prefer faster methods
    }
    
    return score;
  }
}
```

### 5. Plan Refinement (HRM-inspired)
```typescript
class PlanRefiner {
  /**
   * Two-tier refinement: Planner proposes outline, Executor provides feedback
   */
  async refine(
    initialPlan: Plan, 
    state: WorldState,
    feedback: ExecutionFeedback[]
  ): Promise<Plan> {
    
    let refinedPlan = initialPlan.clone();
    
    for (const fb of feedback) {
      switch (fb.type) {
        case 'blocked_path':
          refinedPlan = await this.replanNavigation(refinedPlan, fb);
          break;
          
        case 'missing_resource':
          refinedPlan = await this.insertGatherStep(refinedPlan, fb);
          break;
          
        case 'threat_detected':
          refinedPlan = await this.insertSafetyStep(refinedPlan, fb);
          break;
      }
    }
    
    return refinedPlan;
  }
  
  private async replanNavigation(plan: Plan, feedback: ExecutionFeedback): Promise<Plan> {
    // Use D* Lite to find alternative path
    const altPath = await this.navigation.replan(
      feedback.currentPos, 
      feedback.targetPos,
      feedback.blockedEdges
    );
    
    return plan.replaceNavigation(feedback.stepIndex, altPath);
  }
}
```

## Performance & Metrics

### Real-Time Constraints
- **Decomposition budget**: 50ms p95 for complex methods
- **Method selection**: 10ms p95 using preference cache
- **Plan validation**: 5ms p95 using incremental checking

### Key Metrics
```typescript
interface PlanningMetrics {
  // Quality & Responsiveness
  taskSuccessRate: number;           // Per HTN top-level goal
  timeToFirstPlan: number;           // HTN decomposition latency
  planDepth: number;                 // Average decomposition depth
  branchingFactor: number;           // Methods per task average
  
  // Stability & Efficiency  
  planStability: number;             // Edit distance between successive plans
  repairToReplanRatio: number;       // Prefer repair over full replan
  methodCacheHitRate: number;        // Decomposition cache effectiveness
  
  // Resource Usage
  decompositionCPU: number;          // CPU time per planning cycle
  planCacheMemory: number;           // Memory usage of plan cache
  methodSelectionLatency: number;    // Preference evaluation time
}
```

### Testing Strategy

#### Unit Tests
```typescript
describe('HTN Planner', () => {
  test('method selection with preferences', () => {
    const state = createTestState({ timeOfDay: 'night' });
    const methods = [NIGHT_SHELTER_METHOD, DAY_BUILD_METHOD];
    
    const selected = planner.selectBestMethod(methods, state, context);
    
    expect(selected).toBe(NIGHT_SHELTER_METHOD); // Prefer safety at night
  });
  
  test('decomposition caching', () => {
    const plan1 = planner.decompose('EstablishSafeBase', state1);
    const plan2 = planner.decompose('EstablishSafeBase', state1);
    
    expect(plan1).toBe(plan2); // Same object from cache
  });
});
```

#### Integration Tests
```typescript
describe('HTN + GOAP Integration', () => {
  test('combat interruption with plan repair', async () => {
    // Start crafting task
    const plan = await htn.decompose('CraftIronArmor', state);
    
    // Simulate combat interrupt
    const threat = { type: 'zombie', distance: 5 };
    const feedback = await executor.handleThreat(threat);
    
    // Should repair plan, not replan from scratch
    const repairedPlan = await refiner.refine(plan, state, [feedback]);
    const editDistance = computeEditDistance(plan, repairedPlan);
    
    expect(editDistance).toBeLessThan(3); // Minimal changes
    expect(repairedPlan.containsStep('FleeToLight')).toBe(true);
  });
});
```

## Implementation Requirements

### Core HTN Engine Foundation
- [ ] `WorldState` predicate system
- [ ] `HTNMethod` and `Operator` interfaces  
- [ ] Basic decomposition engine
- [ ] 5 essential methods: EstablishBase, StockFood, UpgradeTools, ExploreArea, TradWithVillager

### Preferences & Caching Implementation
- [ ] Preference evaluation system
- [ ] Plan caching with invalidation
- [ ] Method selection optimization
- [ ] Performance metrics collection

### Refinement & Integration Features
- [ ] HRM-inspired plan refinement
- [ ] GOAP integration points
- [ ] Plan repair vs replan logic
- [ ] OpenTelemetry instrumentation

### Advanced Features Integration
- [ ] Dynamic method loading
- [ ] Learning from plan outcomes
- [ ] Adaptive preference weights
- [ ] Comprehensive test suite

## File Structure
```
modules/planning/hierarchical_planner/
├── src/
│   ├── core/
│   │   ├── htn_planner.ts          # Main HTN engine
│   │   ├── world_state.ts          # Predicate system
│   │   ├── method_registry.ts      # HTN method storage
│   │   └── operator_registry.ts    # Primitive actions
│   ├── refinement/
│   │   ├── plan_refiner.ts         # HRM-style refinement
│   │   ├── preference_evaluator.ts # Method selection
│   │   └── plan_cache.ts           # Caching system
│   ├── methods/
│   │   ├── base_building.ts        # Safe base methods
│   │   ├── resource_gathering.ts   # Mining, farming methods
│   │   ├── exploration.ts          # Area exploration
│   │   └── social.ts               # Trading, interaction
│   └── metrics/
│       ├── planning_telemetry.ts   # Performance tracking
│       └── stability_analyzer.ts   # Plan stability metrics
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── docs/
    ├── method_dsl.md              # Method authoring guide
    └── performance_tuning.md     # Optimization tips
```

## Dependencies
- `@modules/core/mcp_capabilities` - Action execution
- `@modules/world/navigation` - D* Lite pathfinding  
- `@modules/memory/working` - Current state tracking
- `@modules/safety/monitoring` - Performance telemetry
- External: `fast-check` (property testing), `@opentelemetry/api`

## Current Implementation Enhancements

### Basic Hierarchical RL Integration (M3)
**Scope:** Learn HTN method selection preferences based on execution outcomes

```typescript
interface MethodLearningSystem {
  // Track method performance over time
  methodSuccessTracker: MethodPerformanceTracker;
  
  // Learn preferences for method selection
  preferenceLearner: HTNPreferenceLearner;
  
  // Basic RL for method selection optimization
  methodRL: {
    stateFeatures: MethodSelectionFeatures;
    rewardSignals: MethodOutcomeRewards;
    learningRate: number;
  };
}

class HTNPreferenceLearner {
  updateMethodPreferences(
    method: HTNMethod,
    outcome: ExecutionOutcome,
    context: PlanningContext
  ): void {
    // Simple Q-learning for method selection
    const reward = this.computeMethodReward(outcome);
    const state = this.extractStateFeatures(context);
    
    this.updateQValue(method, state, reward);
  }
}
```

**Integration Points:**
- Enhance existing method selection scoring in `HTNPlanner.selectBestMethod()`
- Add outcome tracking to execution feedback loops
- Implement simple Q-learning for method preferences

**Benefits:**
- Learn optimal strategies for different contexts (day/night, high/low resources)
- Improve planning efficiency through experience
- Maintain explainability with method-level learning

### Enhanced Context-Aware Planning (M3)
**Scope:** Better situational awareness for method selection

```typescript
interface ContextualPlanningEnhancement {
  situationAnalyzer: SituationAnalyzer;
  threatAssessment: ThreatLevelAnalyzer;
  opportunityDetector: OpportunityRecognition;
  
  // Enhanced scoring with learned weights
  contextualScoring: {
    timeOfDay: number;        // Day/night preferences
    threatLevel: number;      // Safety considerations  
    resourceState: number;    // Abundance/scarcity
    socialContext: number;    // Other agents present
  };
}
```

**Implementation:**
- Expand `scoreMethod()` to include learned contextual weights
- Add basic computer vision for threat/opportunity detection
- Track success rates by context type

## Success Criteria
- [ ] Decomposes complex 5+ step tasks reliably
- [ ] 95%+ plan cache hit rate for repeated scenarios  
- [ ] Sub-50ms planning latency for cached methods
- [ ] 80%+ repair vs replan ratio (plan stability)
- [ ] Zero method selection errors in 1000+ decompositions
- [ ] **NEW:** 15%+ improvement in method selection accuracy after 100 episodes
- [ ] **NEW:** Context-aware planning shows measurable adaptation to time/threat patterns

This implementation plan provides the foundation for sophisticated long-term planning while maintaining real-time responsiveness through caching, preferences, and incremental refinement. The RL enhancements add adaptive learning without compromising the explainable HTN foundation.
