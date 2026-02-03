# Idle Introspection Design: Emergent Behavior through Memory-Driven Cognition

## Status: Design Draft v2 — Implementation Pending

**Author**: Claude with @darianrosebrook
**Created**: 2026-02-03
**Updated**: 2026-02-03 (incorporated research-integrity pivots)
**Goal**: Replace hardcoded idle behaviors with emergent, memory-grounded cognition

### Implementation Note (2026-02-03)

The previous `IdleBehaviorSelector` (`packages/planning/src/server/idle-behavior-selector.ts`) was deleted
per this design's recommendation — it hardcoded fallback behaviors that violated the project's research
philosophy. **This design document is the current source of truth for idle behavior.**

Current state:
- **Deleted**: `idle-behavior-selector.ts` and its tests (commit 3d7a883)
- **Not yet implemented**: Memory-driven idle introspection per this design
- **Consequence**: The bot currently has no idle behavior system; it waits for tasks without self-directed activity

Next steps: Implement the `IdleIntrospectionController` per the architecture below, respecting invariants IDLE-1 through IDLE-5.

---

## Formal Invariants (IDLE-1 through IDLE-5)

These invariants prevent "hidden policy" from migrating to other layers and maintain research interpretability.

### IDLE-1: Eligibility-Based Idle Detection

Idle events only fire when **no tasks are eligible to run** (per eligibility policy), not when `activeTasks.length === 0`.

**Event payload must include `idle_reason`:**
- `no_tasks` — True cognitive idle (no work exists)
- `all_in_backoff` — Tasks exist but are cooling down
- `circuit_breaker_open` — Executor is in protection mode
- `blocked_on_prereq` — Tasks waiting on dependencies
- `manual_pause` — Tasks are manually paused

**Acceptance check**: In a run where tasks exist but all have `nextEligibleAt > now`, no new tasks should be created solely from idle introspection.

### IDLE-2: Intent Contract for Task Creation

Thoughts **never** create tasks unless an explicit intent contract is emitted.

**The only valid commitment signal is `[GOAL: action target amount]`.**

All other language ("Maybe I should...", "I could...", action verbs without the tag) is treated as non-actionable cognition (reflection/observation) and must NOT be converted to tasks.

**Acceptance check**: Run idle introspection that produces a paragraph with action verbs but no `[GOAL:]` tag. Verify zero tasks are created.

### IDLE-3: Drives as Salience Annotators, Not Goal Injectors

Drives may annotate salience (hunger rising, threat proximity, inventory pressure) but may NOT directly inject goals.

**Pivot from current design**: The `selectDrive()` / `evaluateDriveTick()` system currently produces `[GOAL: ...]` tags directly. This must be converted to produce **interoceptive summaries** that become facts in the situation builder, not micro-goals.

**Acceptance check**: Drives can be toggled off as an ablation without changing any other logic. Behavior differences can be measured cleanly.

### IDLE-4: Bounded Introspection

Idle introspection is bounded by:
- **Rate limits**: Max goal emissions per hour while in `idle_reason=all_in_backoff`
- **Spacing**: Minimum interval between goal-tagged outputs unless interoceptive threshold crossed
- **Retrieval budgets**: Structured queries (last N events, time window T) rather than open-ended semantic search
- **Storage gates**: Only store idle thoughts if they contain committed intent OR reflect salient event delta OR update identity/narrative checkpoints

**Acceptance check**: After a 2-hour idle-heavy soak, episodic memory should not be dominated by repetitive idle reflections.

### IDLE-5: Provenance Logging

Every idle cycle logs a provenance record:
```typescript
interface IdleCycleProvenance {
  idle_introspection_contract_version: string;  // e.g., "v2.0.0"
  prompt_template_hash: string;
  retrieval_mode: 'structured' | 'semantic' | 'hybrid';
  retrieval_params: {
    time_window_ms: number;
    max_events: number;
    semantic_top_k?: number;
  };
  model_params: {
    model: string;
    temperature: number;
    max_tokens: number;
  };
  idle_reason: IdleReason;
  decision_outcome: 'no_op' | 'thought_only' | 'intent_emitted';
  intent_emitted?: string;  // The [GOAL: ...] if any
  timestamp: number;
}
```

**Acceptance check**: Two runs can be compared with attribution to environment variance vs model stochasticity vs config/version differences.

---

## Problem Statement

The previous `IdleBehaviorSelector` hardcoded fallback behaviors like "Gather Stone" and "Look Around", causing the bot to get stuck in unproductive loops. These behaviors violated the project's core research philosophy:

> "We propose and implement a unified cognitive architecture that integrates **embodied sensory feedback**, **hierarchical planning**, **long-term memory**, and **language-based reflection** to explore proto-conscious behaviors in an artificial agent."
> — readme.md

### User Invariants (from conversation)

**DO:**
- Let MLX-LM sidecar reason over tasks (via introspection, not prompting)
- Use Sterling to help construct tasks when symbolic planning is appropriate
- Let the bot introspect its own state and memories
- Allow emergent behavior from the cognitive architecture, not scripted fallbacks

**DO NOT:**
- Hardcode fallback tasks/actions ("Gather Stone", "Look Around")
- Auto-kick off tasks when idle (proactive task injection)
- Force context into the window (stuffing the prompt with pre-written goals)
- Use LLM-style prompting ("You are a minecraft bot...")

---

## Current Architecture Analysis

### What Happens When Idle (Current — PROBLEMATIC)

1. **Planning Service** (`modular-server.ts:1659-1687`): When `activeTasks.length === 0`, posts `idle_period` event to Cognition
   - **Problem**: This fires even when tasks exist but are in backoff/blocked
2. **Cognition Service**: `EventDrivenThoughtGenerator.generateThoughtForEvent()` receives the event
3. **Idle Thought Generation** (`event-driven-thought-generator.ts:189-194`): Returns a random string from a hardcoded list
   - **Problem**: Hardcoded strings, no memory context
4. **Drive Tick** (`thought-generator.ts:1517-1587`): Deterministically injects `[GOAL: ...]` based on inventory state
   - **Problem**: Bypasses LLM reasoning, directly injects goals

### Where the Problems Live

| Component | Problem | IDLE Invariant Violated |
|-----------|---------|------------------------|
| `modular-server.ts` idle detection | Uses `activeTasks.length === 0` not eligibility | IDLE-1 |
| `event-driven-thought-generator.ts` | Hardcoded idle thought strings | (general principle) |
| `thought-generator.ts selectDrive()` | Directly emits `[GOAL: ...]` tags | IDLE-3 |
| `thought-to-task-converter.ts` | May convert soft language to tasks | IDLE-2 |
| No provenance logging | Can't attribute behavior to config vs model | IDLE-5 |

### What's Good (and should be kept)

- **LLM Interface** (`llm-interface.ts`) correctly talks to MLX-LM sidecar
- **Goal tag extraction** parses `[GOAL: action target amount]` from LLM output (this is the intent contract)
- **Situation builder** (`buildIdleSituation`) provides factual game state
- **Grounding check** verifies LLM output references actual facts
- **Interoception system** tracks stress axes (can become salience annotations)

---

## Design Principles

### 1. Thought vs Intent Separation

Split the cognitive output channel:
- **Thought**: Always allowed, may be stored, never creates tasks
- **Intent**: Structured `[GOAL: ...]` tag, only this can become a task

The thought-to-task converter consumes only Intent, never Thought.

### 2. Eligibility-Based Idle, Not Task-Count-Based

```typescript
// WRONG
if (activeTasks.length === 0) {
  emitIdleEvent();
}

// RIGHT
const eligibleTasks = activeTasks.filter(t => isTaskEligible(t, now));
if (eligibleTasks.length === 0) {
  const reason = determineIdleReason(activeTasks, circuitBreakerState);
  emitIdleEvent({ idle_reason: reason });
}
```

### 3. Drives Annotate, Don't Inject

```typescript
// WRONG (current)
private selectDrive(...): { goalTag: string; ... } {
  if (logCount < 16) {
    return { goalTag: '[GOAL: collect oak_log 8]', ... };
  }
}

// RIGHT (new)
private buildInteroceptiveSummary(...): string {
  const pressures: string[] = [];
  if (logCount < 16) pressures.push('Wood supply is running low.');
  if (food < 10) pressures.push('Hunger is becoming urgent.');
  if (health < 10) pressures.push('Health is critically low.');
  return pressures.join(' ');
}
// This summary becomes part of the situation, not a goal
```

### 4. Structured Retrieval First

```typescript
// WRONG (semantic search as primary)
await memoryService.search({ query: 'recent experiences' });

// RIGHT (structured query with optional semantic)
await memoryService.query({
  type: 'episodic',
  time_window_ms: 3600000,  // Last hour
  max_results: 5,
  semantic_rerank: false,  // Optional, logged if used
});
```

### 5. Silence is Valid (and Enforced)

Explicit policy with budgets:
- Max 2 goal emissions per hour when `idle_reason=all_in_backoff`
- Minimum 5 minutes between goal-tagged outputs (unless interoceptive threshold crossed)
- "Novelty gate" blocks repeating the same goal if it recently failed deterministically

---

## Implementation Plan

### Phase 1: Fix Idle Detection (IDLE-1)

**File**: `packages/planning/src/modular-server.ts`

**Change**: Replace `activeTasks.length === 0` check with eligibility-based detection:

```typescript
type IdleReason = 'no_tasks' | 'all_in_backoff' | 'circuit_breaker_open' | 'blocked_on_prereq' | 'manual_pause';

function determineIdleReason(
  activeTasks: Task[],
  eligibleTasks: Task[],
  circuitBreakerState: 'open' | 'closed' | 'half-open'
): IdleReason | null {
  if (activeTasks.length === 0) return 'no_tasks';
  if (circuitBreakerState === 'open') return 'circuit_breaker_open';
  if (eligibleTasks.length === 0) {
    // All tasks exist but none are runnable
    const allManualPaused = activeTasks.every(t => t.metadata?.manualPause);
    if (allManualPaused) return 'manual_pause';
    const allBlocked = activeTasks.every(t => t.metadata?.blockedReason);
    if (allBlocked) return 'blocked_on_prereq';
    return 'all_in_backoff';
  }
  return null; // Not idle
}
```

### Phase 2: Remove Hardcoded Idle Thoughts

**File**: `packages/cognition/src/event-driven-thought-generator.ts`

**Change**: The `generateIdleThought()` method should not return hardcoded strings. Instead, it should return a minimal observation that gets enriched by the EnhancedThoughtGenerator:

```typescript
private generateIdleThought(event: BotLifecycleEvent): string {
  const idleReason = event.data?.idleReason || 'no_tasks';

  // Return observation based on idle reason (not a goal suggestion)
  switch (idleReason) {
    case 'no_tasks':
      return 'I have no active tasks. Observing my surroundings.';
    case 'all_in_backoff':
      return 'My tasks are cooling down. Taking a moment to observe.';
    case 'circuit_breaker_open':
      return 'The executor is recovering. Waiting and watching.';
    case 'blocked_on_prereq':
      return 'Waiting for prerequisites. Observing what I can do.';
    case 'manual_pause':
      return 'Tasks are paused. Reflecting on the situation.';
    default:
      return 'Observing my surroundings.';
  }
}
```

### Phase 3: Convert Drives to Salience Annotators (IDLE-3)

**File**: `packages/cognition/src/thought-generator.ts`

**Changes**:

1. **Rename `selectDrive()` to `buildInteroceptiveSummary()`**
2. **Remove goal tag emission from drives**
3. **Return salience facts, not goals**

```typescript
/**
 * Build interoceptive summary for idle thought generation.
 * Annotates salience (what's pressing) without injecting goals.
 */
private buildInteroceptiveSummary(
  inventory: Array<{ name: string; count: number; displayName: string }>,
  timeOfDay: number,
  context: ThoughtContext
): string {
  const pressures: string[] = [];

  // Inventory analysis
  const invMap = new Map<string, number>();
  for (const item of inventory) {
    const key = (item.name || '').toLowerCase();
    invMap.set(key, (invMap.get(key) || 0) + item.count);
  }
  const logCount = ['oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'acacia_log', 'jungle_log']
    .reduce((sum, k) => sum + (invMap.get(k) || 0), 0);

  if (inventory.length === 0) {
    pressures.push('My inventory is empty.');
  } else if (logCount < 8) {
    pressures.push(`Wood supply is low (${logCount} logs).`);
  }

  // Time pressure
  if (timeOfDay >= 11000 && timeOfDay < 13000) {
    pressures.push('Sunset is approaching.');
  } else if (timeOfDay >= 13000) {
    pressures.push('It is nighttime.');
  }

  // Health/hunger from context
  const health = context.currentState?.health ?? 20;
  const food = context.currentState?.food ?? 20;
  if (health < 10) pressures.push('Health is critically low.');
  else if (health < 15) pressures.push('Health is moderate.');
  if (food < 10) pressures.push('Hunger is becoming urgent.');
  else if (food < 15) pressures.push('Getting hungry.');

  // Threat awareness
  const hostiles = context.currentState?.nearbyHostiles ?? 0;
  if (hostiles > 0) pressures.push(`${hostiles} hostile mob${hostiles > 1 ? 's' : ''} nearby.`);

  return pressures.length > 0 ? pressures.join(' ') : '';
}
```

4. **Modify `generateIdleThought()` to use salience summary**:

```typescript
private async generateIdleThought(context: ThoughtContext): Promise<CognitiveThought> {
  // Build interoceptive summary (salience, not goals)
  const inventory = context.currentState?.inventory || [];
  const timeOfDay = context.currentState?.timeOfDay ?? 0;
  const salienceSummary = this.buildInteroceptiveSummary(inventory, timeOfDay, context);

  // Build situation with salience as facts
  let situation = this.buildIdleSituation(context);
  if (salienceSummary) {
    situation += `\n\nCurrent pressures: ${salienceSummary}`;
  }

  // Let LLM reason freely (may or may not emit goal)
  const response = await this.llm.generateInternalThought(situation, {
    currentGoals: [], // Don't force goals
    recentMemories: context.memoryContext?.recentMemories || [],
    agentState: context.currentState,
  });

  // ... rest of thought construction
}
```

5. **Remove or gate `evaluateDriveTick()`**:

```typescript
// Option: Gate behind ablation flag
private evaluateDriveTick(context: ThoughtContext): CognitiveThought | null {
  // Ablation flag: disable drive ticks entirely
  if (process.env.DISABLE_DRIVE_TICKS === 'true') {
    return null;
  }
  // ... existing logic, but NOW only fires if ablation disabled
  // AND we want to keep it for comparison experiments
}
```

### Phase 4: Add Provenance Logging (IDLE-5)

**File**: `packages/cognition/src/thought-generator.ts` (or new file)

```typescript
interface IdleCycleProvenance {
  idle_introspection_contract_version: string;
  prompt_template_hash: string;
  retrieval_mode: 'structured' | 'semantic' | 'hybrid';
  retrieval_params: {
    time_window_ms: number;
    max_events: number;
    semantic_top_k?: number;
  };
  model_params: {
    model: string;
    temperature: number;
    max_tokens: number;
  };
  idle_reason: IdleReason;
  salience_summary: string;
  decision_outcome: 'no_op' | 'thought_only' | 'intent_emitted';
  intent_emitted?: string;
  timestamp: number;
}

private logIdleCycleProvenance(provenance: IdleCycleProvenance): void {
  console.log('[IDLE-PROVENANCE]', JSON.stringify(provenance));
  // Could also emit to audit logger or telemetry
}
```

### Phase 5: Enforce Intent Contract in Converter (IDLE-2) ✅ IMPLEMENTED

**File**: `packages/planning/src/task-integration/thought-to-task-converter.ts`

**Change**: Added `requireExplicitGoalTag` config option (default: `true`) that enforces the intent contract.

**Implementation**:
```typescript
export interface ConvertThoughtToTaskDeps {
  // ... existing fields ...
  config?: {
    strictConvertEligibility?: boolean;
    /**
     * IDLE-2 Intent Contract Enforcement.
     * When true (default), only explicit [GOAL:] tags from the sanitizer create tasks.
     * When false, allow keyword-based fallback for backward compatibility.
     */
    requireExplicitGoalTag?: boolean;
  };
}

// In convertThoughtToTask():
if (!extractedGoal || !extractedGoal.action) {
  // IDLE-2: By default, require explicit [GOAL:] tags.
  const requireExplicitGoalTag = deps.config?.requireExplicitGoalTag !== false;

  if (requireExplicitGoalTag) {
    // Strict mode (default): no [GOAL:] tag → no task.
    return {
      task: null,
      decision: 'dropped_sanitizer',
      reason: 'IDLE-2: no explicit [GOAL:] tag — keyword fallback disabled',
    };
  }
  // Legacy keyword fallback only reachable when requireExplicitGoalTag=false
}
```

**Behavior**:
- Default (`requireExplicitGoalTag` not set or `true`): Only `[GOAL:]` tags from sanitizer create tasks
- Legacy (`requireExplicitGoalTag: false`): Keyword fallback allowed for backward compatibility

**Decision codes**:
- `dropped_sanitizer` with reason `'IDLE-2: no explicit [GOAL:] tag — keyword fallback disabled'`

### Phase 6: Add Goal Emission Budgets (IDLE-4)

**File**: `packages/cognition/src/thought-generator.ts`

```typescript
private _goalEmissionBudget = {
  lastEmissionTime: 0,
  emissionsThisHour: 0,
  hourStart: Date.now(),
};

private canEmitGoal(idleReason: IdleReason): boolean {
  const now = Date.now();

  // Reset hourly counter
  if (now - this._goalEmissionBudget.hourStart > 3600000) {
    this._goalEmissionBudget.emissionsThisHour = 0;
    this._goalEmissionBudget.hourStart = now;
  }

  // Minimum spacing (5 min unless interoceptive threshold crossed)
  const minSpacing = 300000;
  if (now - this._goalEmissionBudget.lastEmissionTime < minSpacing) {
    return false;
  }

  // Budget when in backoff state
  if (idleReason === 'all_in_backoff') {
    const maxPerHour = 2;
    if (this._goalEmissionBudget.emissionsThisHour >= maxPerHour) {
      return false;
    }
  }

  return true;
}

private recordGoalEmission(): void {
  this._goalEmissionBudget.lastEmissionTime = Date.now();
  this._goalEmissionBudget.emissionsThisHour++;
}
```

---

## Files to Modify

| File | Change | Invariant |
|------|--------|-----------|
| `packages/planning/src/modular-server.ts` | Eligibility-based idle detection, include `idle_reason` | IDLE-1 |
| `packages/cognition/src/event-driven-thought-generator.ts` | Remove hardcoded strings, pass idle_reason through | IDLE-1 |
| `packages/cognition/src/thought-generator.ts` | Convert drives to salience, add provenance, add budgets | IDLE-3, IDLE-4, IDLE-5 |
| `packages/planning/src/task-integration/thought-to-task-converter.ts` | Enforce intent contract | IDLE-2 |

---

## Acceptance Tests

### Test IDLE-1: Eligibility-Based Idle
```
Given: 3 tasks exist, all in backoff (nextEligibleAt > now)
When: Executor loop runs
Then: idle_period event fires with idle_reason='all_in_backoff'
And: No new tasks are created from idle introspection
```

### Test IDLE-2: Intent Contract
```
Given: Idle introspection generates "Maybe I should gather some wood"
When: Thought-to-task converter processes it
Then: No task is created (no [GOAL:] tag)
```

### Test IDLE-3: Drives as Salience
```
Given: DISABLE_DRIVE_TICKS=false, inventory has 0 logs
When: generateIdleThought() runs
Then: Situation includes "Wood supply is low" as fact
And: No [GOAL: collect oak_log] is auto-injected
And: LLM may or may not emit a goal
```

### Test IDLE-4: Budgets
```
Given: idle_reason='all_in_backoff', 2 goals already emitted this hour
When: LLM generates a thought with [GOAL:]
Then: Goal is suppressed (budget exceeded)
And: Thought is stored as observation only
```

### Test IDLE-5: Provenance
```
Given: Any idle cycle completes
Then: Log contains [IDLE-PROVENANCE] JSON with all required fields
And: Two runs can be compared for config vs model variance
```

---

## Migration Notes

### Breaking Changes
- `idle_period` event payload now includes `idle_reason` field
- `evaluateDriveTick()` behavior changes (no longer emits goals directly)

### Ablation Support
- Set `DISABLE_DRIVE_TICKS=true` to completely disable drive tick system
- Allows clean A/B comparison of emergent-only vs drive-assisted cognition

### Monitoring
- Watch for `[IDLE-PROVENANCE]` logs to track behavior
- Monitor `decision_outcome` distribution over time
- Alert if `intent_emitted` rate exceeds expected bounds

---

## Philosophical Alignment

This design aligns with the project's stated goals while maintaining research integrity:

> "We expect to observe that many behaviors and states often deemed 'conscious-like' – such as having an inner voice, pursuing self-chosen goals, experiencing something analogous to emotions, and maintaining a self-identity over time – can emerge from the interplay of the modules we designed"

By:
1. **Separating Thought from Intent**: The agent can think without acting
2. **Making drives salience-only**: Environmental pressure creates genuine reasons to act, not scripted responses
3. **Logging provenance**: Behavioral differences can be attributed to architecture vs randomness
4. **Enforcing budgets**: Compulsive action is explicitly prevented

The result is a system where agency emerges from architecture, and that emergence is measurable.
