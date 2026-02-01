# Structure Build Protocol v0

Anchor document for checkpointed long-horizon building. This defines the checkpoint schema, invariant set, macro/micro planning contract, resume algorithm, and acceptance tests so work can be picked up across sessions without re-litigating fundamentals.

## Scope

Applies to building tasks routed through the Sterling building solver (`MinecraftBuildingSolver`) and executed by the planning executor (`modular-server.ts autonomousTaskExecutor`). Non-goals for v0: spatial awareness in Sterling, global pathfinding, aesthetic optimization beyond invariants.

## Current system state (grounding)

What exists today:

| Component | Status | Location |
|-----------|--------|----------|
| Building solver (Sterling) | Working; produces module-ordered steps with Rig G signals | `minecraft-building-solver.ts` |
| Partial order plan + DAG | Working; linearized with feasibility checking | `constraints/partial-order-plan.ts` |
| Rig G feasibility gate | Working; blocks infeasible plans, triggers replan | `constraints/execution-advisor.ts` |
| Executor with shadow/live modes | Working; feature-gated, guard ordering contract | `modular-server.ts`, `autonomous-executor.ts` |
| Replan consumer | Working; 3-attempt backoff, digest comparison | `task-integration.ts _scheduleRigGReplan` |
| Episode reporting | Working; fire-and-forget to Sterling (stub mode) | `base-domain-solver.ts reportEpisode` |
| Step meta tags (moduleId, moduleType, templateId) | Working; set by `toTaskStepsWithReplan` | `minecraft-building-solver.ts:396-402` |
| Step-level inventory snapshots | Working; delta verification on complete | `task-integration.ts startTaskStep/completeTaskStep` |
| Building leaves (prepare_site, build_module, place_feature) | **Placeholder stubs** — read-only, no world mutation | `construction-leaves.ts` |
| `/action` dispatch for building types | **Broken** — `executeAction` has no cases for these types | Phase 0 prerequisite |
| Checkpoint/resume system | **Absent** | This spec defines it |
| World-state block scanning | **Absent** | Needed for module postcondition verification |
| Site signature persistence | **Absent** | Needed for resume |
| Module completion registry | **Absent** | Needed for resume |

## Staged implementation plan

### Stage 0: Action boundary (prerequisite for all live execution)

Fix `executeAction` in `action-translator.ts` so building step types reach their leaf implementations. Without this, the executor can only "fail correctly."

**Commits (from existing plan):**
- **0a**: Add `craft`/`smelt` aliases + building leaf delegation via `executeLeafAction`
- **0b**: LeafFactory-first dispatch with `ACTION_TYPE_TO_LEAF` normalization
- **0c**: Boundary conformance test (every solver-emittable type accepted)

**Done when**: `npx vitest run planner-action-boundary.test.ts` passes; POST `/action` with `type: 'prepare_site'` reaches `PrepareSiteLeaf.tick()`.

### Stage 1: Checkpointed module execution

Add module-level commit points to the building execution flow.

**Data model additions** (`task.metadata.build`, new namespace):

```typescript
interface BuildMetadata {
  /** Content-addressed digest of template modules + goals */
  templateDigest: string;
  /** Stable anchor for the build site (set once, never changed) */
  siteSignature: {
    position: { x: number; y: number; z: number };
    facing: 'N' | 'S' | 'E' | 'W';
    refCorner: { x: number; y: number; z: number };
    footprintBounds: { min: Vec3; max: Vec3 };
  };
  /** Index of last completed module (0-based, -1 = none completed) */
  moduleIndex: number;
  /** Module IDs that have passed postcondition verification */
  completedModules: string[];
  /** Append-only checkpoint list */
  checkpoints: BuildCheckpoint[];
  /** Known workstations relevant to this build */
  stationRegistry: StationEntry[];
  /** Invariant set version (so verification knows what to check) */
  invariantSetVersion: number;
}

interface BuildCheckpoint {
  /** Content-addressed: hash of {templateDigest, moduleIndex, completedModules} */
  checkpointId: string;
  templateDigest: string;
  moduleIndex: number;
  completedModules: string[];
  /** Station state at checkpoint time */
  stationSnapshot: StationEntry[];
  /** Invariant check results */
  invariantResults: Array<{
    invariant: string;
    passed: boolean;
    evidence?: string;
  }>;
  /** Known deviations to address later */
  openDeltas: Array<{
    moduleId: string;
    issue: string;
    severity: 'blocking' | 'degraded' | 'cosmetic';
  }>;
  /** Coarse inventory summary (key materials + tools) */
  inventorySummary: Record<string, number>;
  savedAt: number;
}

interface StationEntry {
  kind: 'crafting_table' | 'furnace' | 'smoker' | 'blast_furnace' | 'anvil';
  pos: { x: number; y: number; z: number };
  reachable: boolean;
  lastVerifiedAt: number;
  provenance: { source: 'placed' | 'found'; moduleIndex: number; stepId?: string };
}
```

**Implementation steps:**

1. Add `BuildMetadata`, `BuildCheckpoint`, `StationEntry` types to `packages/planning/src/types/task.ts` under `task.metadata.build`.

2. Add checkpoint step synthesis in `toTaskStepsWithReplan`. After each module's last step, insert a synthetic checkpoint step:
   ```
   { label: 'Checkpoint: verify module <moduleId>',
     meta: { domain: 'building', leaf: 'verify_module', moduleId, templateId, isCheckpoint: true } }
   ```

3. Implement `verify_module` as a leaf in `construction-leaves.ts` that:
   - Reads world state around the expected module area (block scanning within footprint bounds)
   - Checks module postconditions (see Invariant Set v0 below)
   - Returns `{ moduleId, postconditionsMet: boolean, openDeltas: [...] }`

4. In `completeTaskStep`, when a checkpoint step completes:
   - Persist a `BuildCheckpoint` to `task.metadata.build.checkpoints`
   - Advance `moduleIndex`
   - Add moduleId to `completedModules`
   - Emit `taskLifecycleEvent: { type: 'build_checkpoint', taskId, moduleIndex, ... }`

**Done when**: A building task with 3 modules produces 3 checkpoint lifecycle events, each with postcondition results persisted to task metadata.

### Stage 2: Resume and repair

Make interruption recovery a first-class planning operation.

**Resume algorithm** (runs at the start of executor tick when a building task has checkpoints):

```
1. Load last checkpoint from task.metadata.build.checkpoints
2. Validate siteSignature:
   - Scan blocks at refCorner and footprint edges
   - If site is unrecognizable → status = 'replan_from_bootstrap'
3. Validate stationRegistry:
   - For each entry: check block at pos matches kind
   - Mark unreachable entries; schedule ensure_workstation if needed
4. Validate current module state:
   - Read blocks in module area
   - Compare against expected postconditions
   - Classify: completed | partially_completed | drifted | destroyed
5. Decide:
   - completed → advance moduleIndex, emit checkpoint, continue to next module
   - partially_completed → generate repair work package (finish remaining blocks)
   - drifted → generate repair work package (remove wrong blocks, place correct ones)
   - destroyed → replan module from scratch (regenerateSteps for that module only)
   - site invalid → replan entire build
```

**Implementation steps:**

1. Add `resumeBuildingTask(taskId)` method to `TaskIntegration`. Called by executor before step execution when `task.metadata.build` exists and `task.metadata.build.moduleIndex >= 0`.

2. Add `scanModuleState(siteSignature, moduleId, expectedBlocks)` utility in a new file `packages/planning/src/building/module-verifier.ts`. Uses bot world queries to check block types at expected positions.

3. Add repair work package generation: subset of a module's steps that target only the missing/wrong blocks. This is a filtered version of the existing solver output, not a new solver call.

**Done when**: Interrupt a building task mid-module (kill process), restart, and the executor resumes by computing delta and generating a repair work package that completes only the remaining blocks.

### Stage 3: Invariant-driven planning

Add higher-order invariants that define "cohesion" as checkable properties.

**Invariant set v0** (minimal, high-value):

| Invariant | Check | When verified |
|-----------|-------|---------------|
| **Access** | Entrance path unblocked (BFS from outside to interior) | Every checkpoint |
| **Footprint** | Building within declared bounds (no accidental growth) | Every checkpoint |
| **Reachability** | Utility zone has reachable crafting_table + furnace when needed | Before craft/smelt steps |
| **Structural** | Load-bearing blocks present (walls support roof) | After wall/roof modules |

**Implementation steps:**

1. Define invariant checkers in `packages/planning/src/building/invariant-checkers.ts`. Each checker: `(siteSignature, worldState) => { passed: boolean; evidence?: string }`.

2. Run invariant checks at every checkpoint. Store results in `BuildCheckpoint.invariantResults`.

3. If an invariant fails at checkpoint:
   - Classify as `openDelta` with severity
   - `blocking` severity prevents advancing to next module (generates repair work package)
   - `degraded` severity is logged but allows progress
   - `cosmetic` severity is recorded only

4. Add invariant violation cost to the Rig G feasibility checker. Plans that would violate known invariants get lower feasibility scores.

**Done when**: A building task where a creeper blows a hole in a wall generates a repair work package that restores the access invariant before continuing.

### Stage 4: Explicit subtask spawning for resource arcs

When module prerequisites aren't met (material deficit), spawn sub-tasks instead of inlining acquisition steps.

**Current behavior**: `toTaskStepsWithReplan` injects `acquire_material` steps + `replan_building` sentinel inline.

**Target behavior**: Spawn a separate checkpointable sub-task ("acquire 64 cobblestone") that has its own lifecycle, can be interrupted/resumed independently, and unblocks the parent building task on completion.

**Implementation steps:**

1. When `result.needsMaterials` is detected, instead of inline steps, call `taskIntegration.addTask()` to create a sub-task with `parentTaskId` reference.

2. Parent building task enters `status: 'blocked_on_subtask'` with `blockedReason: 'awaiting_materials:<subtaskId>'`.

3. When sub-task completes, parent transitions back to `pending` and regenerates steps with updated inventory.

4. Sub-tasks are themselves checkpointable (gather progress, craft intermediate items).

**Done when**: A building task that needs 64 cobblestone spawns a "gather cobblestone" sub-task, waits for it, then continues building with the gathered materials.

---

## Macro/micro planning contract

**Macro plan** (long-lived):
- Produced by the building solver: ordered list of modules with dependency edges
- Stored as the partial order plan in `task.metadata.solver.rigG.partialOrderPlan`
- Module ordering is stable across sessions (content-addressed node IDs)
- Only regenerated on full replan (site invalidation or exhausted repair attempts)

**Micro plan** (short-lived, per work package):
- Generated for the next module only (bounded step count)
- Explicit preconditions: materials in inventory, site area clear, previous module complete
- Explicit postconditions: blocks placed at expected positions (verifiable)
- Regenerated on resume (delta-based), on repair (subset of original), or on replan

**Contract**:
- Macro plan decides *what* to build and in *what order*
- Micro plan decides *how* to build the next module given *current state*
- Checkpoint is the boundary between them: macro advances moduleIndex, micro is discarded
- Resume always starts by recomputing micro from delta, never by "continuing from step N"

---

## Workstation semantics

Workstations are capability, not geometry. They belong in the leaf layer, not Sterling.

**Step type**: `ensure_workstation(kind)` — semantic step emitted by Sterling when a craft/smelt operation needs station access.

**Leaf**: `place_workstation` — goal-oriented leaf that:
1. Scans for existing station of the requested kind within interaction range
2. If found and reachable: return success, update stationRegistry
3. If not found: place one in the utility zone, verify interactability, update stationRegistry
4. If placement fails: try alternate positions within bounded budget, then fail with reason class

**Station registry** lives in `task.metadata.build.stationRegistry`. It persists across sessions and checkpoints. The `ensure_workstation` leaf reads from it first (reuse-preferred), writes to it on placement/discovery.

**Mapping rule**: If a step is "place crafting_table" and the intent is access for future operations, map to `ensure_workstation`, not `place_block`. Structure-geometry placements remain `place_block_at`.

---

## Acceptance tests

### Conformance (Stage 0)

- Every solver-emittable step type accepted by `executeAction` (no "Unknown action type")
- `mapBTActionToMinecraft` round-trips through `executeAction` for all leaf spec names

### Checkpoint (Stage 1)

- Building task with 3 modules emits 3 checkpoint lifecycle events
- Each checkpoint contains: moduleIndex, completedModules, invariantResults
- Checkpoint is persisted to `task.metadata.build.checkpoints`
- `templateDigest` and `siteSignature` are stable across checkpoints

### Resume (Stage 2)

- Interrupt at random step inside a module
- Resume computes delta, generates repair work package
- Repair completes only remaining blocks (not full module)
- `moduleIndex` and `siteSignature` survive interruption
- `stationRegistry` is re-validated on resume

### Cohesion invariant (Stage 3)

- Doorway remains unblocked after N modules
- If blocked by drift, repair work package is generated before continuing
- Invariant failure at checkpoint produces `openDelta` with severity

### Resource sub-tasks (Stage 4)

- Material deficit spawns sub-task with `parentTaskId`
- Parent blocks until sub-task completes
- Sub-task is independently checkpointable
- Parent resumes with updated inventory after sub-task completion

### Simulated interruptions (cross-cutting)

For each stage, test:
- Kill mid-step (process death) → resume from last checkpoint
- Kill between modules (clean stop) → resume advances to next module
- Kill during repair → resume re-computes delta, generates new repair
- World drift between sessions (creeper damage) → invariant detects, repair generated

---

## Failure-mode cards

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Station littering | Always placing new stations without reuse scan | `ensure_workstation` pre-check + stationRegistry reuse preference |
| Station unreachable | Placed behind wall, at feet, or obstructing movement | Interactability validation + alternate placement + utility zone anchor |
| Structure drift | Mobs/environment modify world between sessions | Checkpoint + delta + repair mode; invariants catch drift early |
| Replan thrash | Repeated identical replans without world change | stepsDigest baseline + identical-digest stop + 3-attempt cap (implemented) |
| Module order violation | Executing module before prerequisite complete | Rig G feasibility gate (implemented); DAG edge enforcement |
| Inventory desync | Items consumed but step marked incomplete | Step-level inventory snapshots + delta verification (implemented) |

---

## File map (where things go)

| New file | Purpose |
|----------|---------|
| `packages/planning/src/building/module-verifier.ts` | `scanModuleState`, block-level verification for postconditions |
| `packages/planning/src/building/invariant-checkers.ts` | Invariant checker functions (access, footprint, reachability, structural) |
| `packages/planning/src/building/checkpoint-manager.ts` | Checkpoint creation, persistence, content-addressed ID generation |
| `packages/planning/src/building/resume-planner.ts` | Delta computation, repair/continue/replan decision, work package generation |
| `packages/minecraft-interface/src/leaves/workstation-leaf.ts` | `place_workstation` leaf (ensure_workstation semantic step) |

| Modified file | Changes |
|----------------|---------|
| `packages/planning/src/types/task.ts` | Add `metadata.build` namespace (BuildMetadata, BuildCheckpoint, StationEntry) |
| `packages/planning/src/sterling/minecraft-building-solver.ts` | Checkpoint step synthesis in `toTaskStepsWithReplan` |
| `packages/planning/src/task-integration.ts` | Checkpoint persistence in `completeTaskStep`, `resumeBuildingTask` method |
| `packages/minecraft-interface/src/leaves/construction-leaves.ts` | `verify_module` leaf implementation |
| `packages/minecraft-interface/src/action-translator.ts` | Phase 0 dispatch fixes (commits 0a-0c) |
