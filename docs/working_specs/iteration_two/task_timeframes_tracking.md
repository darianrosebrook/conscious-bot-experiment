# Task Timeframes Implementation Tracking

**Author:** @darianrosebrook  
**Status:** Implementation Required  
**Target:** Bucket-Based Time Management with Pause/Resume  
**Dependencies:** Stages 1-5 of Implementation Plan  

## Overview

This document tracks the implementation of the bucket-based time management system that prevents agent thrashing, enables partial completion checkpoints, and provides natural scheduling for better conditions.

## Bucket Taxonomy

### Bucket Definitions
| Bucket         | Duration Band (Cap) | Cognitive Scope         | Typical Deliverable                                       | When to Use                                     |
| -------------- | ------------------- | ----------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| **Tactical**   | **30–90 s**         | One atomic action/loop  | "Reach this block"; "Place 1 torch"; "Open furnace"       | Tight feedback, high risk, precise manipulation |
| **Short**      | **3–5 min**         | One micro-objective     | "Collect 8 logs"; "Smelt 4 iron"; "Scout 100m"            | Low risk, near base, small inventory impact     |
| **Standard**   | **8–12 min**        | One subgoal with checks | "Light a 40m corridor"; "Excavate an ore pocket"          | Medium risk; needs guards (light, food)         |
| **Long**       | **20–30 min**       | Compound subgoal        | "Mine iron → smelt → craft shield"; "Perimeter wall pass" | Chained options; safe to pause mid-flow         |
| **Expedition** | **45–60 min**       | Multi-stage, off-base   | "Locate village & map returns"; "Nether prep route"       | Far from base; strong pause/resume & caches     |

## Implementation Requirements

### 1. Bucket System Core
**Location**: `packages/core/src/time-management/bucket-system.ts`

#### Requirements
- [ ] Define bucket types and duration bands
- [ ] Implement bucket selection heuristics
- [ ] Support bucket shrinking/growing
- [ ] Enforce policy limits

#### Key Interfaces
```typescript
export enum Bucket {
  TACTICAL = 'tactical',
  SHORT = 'short',
  STANDARD = 'standard',
  LONG = 'long',
  EXPEDITION = 'expedition'
}

export interface BucketBudget {
  bucket: Bucket;
  maxMs: number;
  checkpointEveryMs: number;
}

export interface BucketContext {
  risk: RiskAssessment;
  readiness: ReadinessAssessment;
  distance: DistanceAssessment;
  payoff: PayoffAssessment;
}
```

#### Success Criteria
- All bucket types defined with correct duration bands
- Selection heuristics work correctly
- Bucket shrinking/growing functions properly
- Policy limits enforced

### 2. Bucket Policy System
**Location**: `packages/core/src/time-management/bucket-policy.ts`

#### Requirements
- [ ] Configurable bucket durations
- [ ] Activity-to-bucket defaults
- [ ] Risk rules configuration
- [ ] Policy limits enforcement

#### Policy Configuration
```json
{
  "buckets": {
    "Tactical": {"minMs": 30000, "maxMs": 90000},
    "Short":    {"minMs": 180000, "maxMs": 300000},
    "Standard": {"minMs": 480000, "maxMs": 720000},
    "Long":     {"minMs": 1200000, "maxMs": 1800000},
    "Expedition":{"minMs": 2700000, "maxMs": 3600000}
  },
  "defaults": {
    "miningTargeted": "Standard",
    "miningBulk": "Long",
    "buildingPass": "Short",
    "smeltingBatch": "Short",
    "craftingMilestone": "Standard",
    "combat": "Tactical",
    "exploreNear": "Standard",
    "expedition": "Expedition",
    "logistics": "Short",
    "farming": "Short"
  },
  "riskRules": {
    "nightShrinks": true,
    "lowFoodShrinks": 0.4,
    "lowDurabilityShrinks": 0.2,
    "hostilesRadius": 12,
    "farFromBaseMeters": 300
  },
  "limits": { "minBucket": "Tactical", "maxBucket": "Expedition" }
}
```

#### Success Criteria
- Policy loads correctly from configuration
- Defaults applied to activities
- Risk rules trigger bucket adjustments
- Limits enforced properly

### 3. Bucket Selection Heuristics
**Location**: `packages/core/src/time-management/bucket-selector.ts`

#### Requirements
- [ ] Risk assessment calculation
- [ ] Readiness assessment calculation
- [ ] Distance assessment calculation
- [ ] Payoff assessment calculation
- [ ] Bucket selection algorithm

#### Selection Algorithm
```typescript
function selectBucket(activity: Activity, snap: Snapshot, inv: Inventory, planCtx: PlanCtx): Bucket {
  let b = POLICY.defaults[activity];
  const risk = computeRisk(snap, inv);
  
  // Risk shrinks bucket
  if (risk.high) b = shrink(b);
  if (isNight(snap) && POLICY.riskRules.nightShrinks) b = shrink(b);
  if (inv.foodSaturation < POLICY.riskRules.lowFoodShrinks) b = shrink(b);
  if (toolDurabilityLow(inv)) b = shrink(b);
  if (distanceFromBase(snap) > POLICY.riskRules.farFromBaseMeters) b = shrink(b);
  
  // Payoff can expand one step if safe
  if (planCtx.milestoneNear && risk.low) b = grow(b);
  
  return clamp(b, POLICY.limits.minBucket, POLICY.limits.maxBucket);
}
```

#### Success Criteria
- Risk assessment accurate
- Readiness assessment accurate
- Distance assessment accurate
- Payoff assessment accurate
- Bucket selection explainable

### 4. Timeout Decorators
**Location**: `packages/planning/src/behavior-trees/timeout-decorators.ts`

#### Requirements
- [ ] Timeout decorator implementation
- [ ] Checkpoint decorator implementation
- [ ] Graceful pause handling
- [ ] State preservation

#### Decorator Implementation
```typescript
const withBudget = (subtree: BTNode, budget: BucketBudget) =>
  Timeout(budget.maxMs, Checkpoint(subtree, budget.checkpointEveryMs || 60000));

const optionRoot = Sequence(
  withBudget(originalSubtree, budget),
  EmitPauseTicket() // only runs if Timeout fired
);
```

#### Success Criteria
- Timeouts enforced correctly
- Checkpoints created regularly
- Graceful pause works
- State preserved properly

### 5. Checkpoint System
**Location**: `packages/planning/src/behavior-trees/checkpoint-decorators.ts`

#### Requirements
- [ ] Periodic checkpoint creation
- [ ] Episodic trace emission
- [ ] Inventory diff recording
- [ ] Waypoint saving

#### Checkpoint Data
```typescript
interface CheckpointData {
  timestamp: number;
  position: Vec3;
  inventory: InventoryState;
  progress: ProgressMarkers;
  waypoint: Waypoint;
  episodeId: string;
}
```

#### Success Criteria
- Checkpoints created at specified intervals
- All required data captured
- Episodic traces emitted
- Waypoints saved correctly

### 6. Resume Ticket System
**Location**: `packages/planning/src/resume-ticket-manager.ts`

#### Requirements
- [ ] Pause ticket generation
- [ ] Resume ticket processing
- [ ] Ticket deduplication
- [ ] Priority management

#### Resume Ticket Format
```json
{
  "id": "resume.opt.ore_ladder_iron#shaft_A#2025-08-25T22:01:00Z",
  "kind": "resume",
  "originOption": "opt.ore_ladder_iron@1.2.3",
  "args": {"shaft":"A"},
  "resumeContext": {
    "waypoint": {"name":"shaft_A_checkpoint_03","pos":[...],"safe":true},
    "progress": {"depth": 34, "lightsPlaced": 7},
    "requirements": {"torchesMin": 12, "pickTierMin": "stone"}
  },
  "suggestedBucket": "Standard",
  "deadline": "soon",
  "priority": 0.62
}
```

#### Success Criteria
- Pause tickets generated correctly
- Resume tickets processed properly
- Deduplication works
- Priority management functional

## Integration Points

### 1. Planning Integration
**Location**: `packages/planning/src/reactive-executor/enhanced-goap-planner.ts`

#### Requirements
- [ ] Add budget to plan steps
- [ ] Integrate bucket selection
- [ ] Handle pause/resume tickets
- [ ] Support checkpoint scheduling

#### Plan Step Format
```json
{
  "option_id":"opt.ore_ladder_iron@1.2.3",
  "args": {"shaft":"A"},
  "budget": {"bucket":"Standard", "maxMs": 10 * 60_000},
  "checkpointEveryMs": 60_000
}
```

### 2. Execution Integration
**Location**: `packages/planning/src/behavior-trees/BehaviorTreeRunner.ts`

#### Requirements
- [ ] Apply timeout decorators
- [ ] Handle checkpoint creation
- [ ] Emit pause tickets
- [ ] Support graceful pause

### 3. Memory Integration
**Location**: `packages/memory/src/episodic/checkpoint-memory.ts`

#### Requirements
- [ ] Store checkpoint data
- [ ] Retrieve resume context
- [ ] Track progress markers
- [ ] Manage waypoints

## Default Bucket Assignments

### Activity Mappings
| Activity                                 | Default Bucket   | Rationale                                                    |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------ |
| **Combat/emergency**                     | Tactical         | Always fine-grained; abort quickly; no long loops.           |
| **Torching corridor / clearing hazards** | Short → Standard | Needs frequent checkpoints and light checks; easy to resume. |
| **Targeted mining (vein or branch)**     | Standard         | Natural checkpoints at branch boundaries & inventory fill.   |
| **Bulk mining / quarrying**              | Long (if safe)   | Monotone work; bound by tool durability & inventory.         |
| **Smelting batches**                     | Short            | Transactional; checkpoint on each batch completion.          |
| **Crafting milestone chain**             | Standard         | Bounded by recipe dependencies; checkpoint by item.          |
| **Building (structure pass)**            | Short            | Encourage layered passes; snapshot per pass; resume later.   |
| **Base logistics (sort/store)**          | Short            | Avoid "cleaning rabbit hole"; return often.                  |
| **Exploration near base (<300m)**        | Standard         | Enough time to form map facts; re-anchor before night.       |
| **Expedition (>300m / Nether)**          | Expedition       | Requires waypoints, caches, retreat plan.                    |
| **Farming loop (plant/harvest)**         | Short            | Rhythm tasks; never block long horizons.                     |

## Acceptance Invariants

### Core Requirements
- **No step runs past its cap**: Every option run is bounded by its bucket `maxMs`
- **Every paused step emits a valid return ticket**: With safe waypoint, progress markers, and pre-flight requirements
- **Checkpoints at least every 60–120 s**: For Standard+ buckets (episode segments, screenshots, inventory deltas)
- **Bucket selection is explainable**: Dashboard shows `default → rules applied → final bucket`
- **Preemption is safe**: On timeout, executor cancels pathfinder, closes containers, and saves state

## Failure Mode Guards

### Protection Mechanisms
- **Starvation by short buckets**: If a task pauses >N times with no net progress, planner escalates to higher bucket or decomposes option
- **Unsafe pause point**: If budget expires in unsafe state, BT runs mandatory safety trailer (retreat/block-in) before pausing
- **Ticket pile-up**: Scheduler compacts/folds duplicate tickets and raises priority if user-requested

## Implementation Checklist

### Foundation
- [ ] Implement core leaves with timeout support
- [ ] Create basic bucket definitions
- [ ] Test leaf execution timing

### Language System
- [ ] Add timeout support to BT-DSL
- [ ] Implement checkpoint nodes
- [ ] Test compilation with timeouts

### Registration System
- [ ] Add bucket validation to registration
- [ ] Test option registration with timeouts
- [ ] Validate bucket policy compliance

### Intelligence Integration
- [ ] Integrate bucket selection with planning
- [ ] Add pause/resume ticket generation
- [ ] Test end-to-end with timeouts

### Time Management System
- [ ] Implement bucket system core
- [ ] Build policy configuration
- [ ] Create selection heuristics
- [ ] Add timeout decorators
- [ ] Implement checkpoint system
- [ ] Build resume ticket manager
- [ ] Test full time management flow

## Success Metrics

### Functional Metrics
- **Time Compliance**: 100% of tasks respect their time caps
- **Checkpoint Frequency**: Checkpoints created at specified intervals
- **Resume Success**: 100% of paused tasks can be resumed
- **Bucket Selection**: Selection logic works correctly in all scenarios

### Performance Metrics
- **Bucket Selection Time**: <10ms for bucket selection
- **Checkpoint Creation**: <50ms for checkpoint creation
- **Resume Ticket Processing**: <100ms for ticket processing
- **Timeout Enforcement**: Immediate timeout when cap reached

### Safety Metrics
- **Safe Pauses**: 100% of pauses occur in safe states
- **State Preservation**: All state preserved during pause/resume
- **Resource Cleanup**: All resources cleaned up on timeout
- **No Data Loss**: No progress lost during pause/resume

## Next Steps

1. **Begin Foundation**: Implement core leaves with timeout support
2. **Create Bucket System**: Build bucket definitions and policy
3. **Implement Decorators**: Add timeout and checkpoint decorators
4. **Build Ticket System**: Create pause/resume ticket management
5. **Integration Testing**: Test full time management flow

This time management system is critical for preventing agent thrashing and enabling long-horizon planning through safe pause/resume capabilities.
