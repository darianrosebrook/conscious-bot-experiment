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

### Stage 0.5: World-mutating building execution

The grounding table shows building leaves are placeholder stubs (read-only, no world mutation). Even with Stage 0 action boundary fixed, the executor cannot actually build anything. This stage makes building steps produce real world changes.

**Approach**: Per-block placement decomposition (Path A). The building solver decomposes modules into individual `place_block_at` steps, each placing one block at a specific coordinate. This is verbose but has critical advantages for v0:
- Each step is independently checkpointable and resumable
- Repair is trivial (re-run the missing placement steps from witness diff)
- No internal cursor or sub-progress tracking needed within a leaf
- The existing step-based executor, rate limiter, and inventory snapshots all work without modification

**Alternative considered (Path B)**: A `build_module` leaf that internally iterates placements. Rejected for v0 because it requires internal progress tracking to be resumable, and repair becomes "rerun the leaf with a partial target set" which duplicates executor logic.

**Implementation steps:**

1. Extend the building solver's `toTaskStepsWithReplan` to emit per-block `place_block_at` steps for each module. Each step carries:
   ```
   meta: { domain: 'building', leaf: 'place_block_at', moduleId, templateId,
           position: { x, y, z }, blockId: 'oak_planks' }
   ```

2. Implement `PlaceBlockAtLeaf` in `construction-leaves.ts`: navigates to within interaction range, places the specified block at the specified position, verifies placement. Returns `{ placed: boolean, position, blockId }`.

3. Existing `prepare_site` and `place_feature` stubs remain as-is for v0 — `prepare_site` becomes a no-op (site assumed clear) and features are decomposed into `place_block_at` steps like modules.

4. The building solver produces a `ModuleWitnessV1` as a side effect of decomposition: the witness `expectedPlacements` is exactly the list of `place_block_at` steps for that module.

**Done when**: A building task places real blocks in the world. A 3-module build produces `place_block_at` steps that result in actual blocks at the expected positions.

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
  /**
   * Index of the next module to execute (0-based).
   * - 0 = no modules completed yet, first module is next
   * - N = modules 0..N-1 completed, module N is next
   * - modules.length = all modules completed
   * After checkpoint pass: moduleCursor++
   */
  moduleCursor: number;
  /** Module IDs that have passed postcondition verification (derived, not authoritative cursor) */
  completedModules: string[];
  /** Append-only checkpoint list */
  checkpoints: BuildCheckpoint[];
  /** Known workstations relevant to this build */
  stationRegistry: StationEntry[];
  /** Invariant set version (so verification knows what to check) */
  invariantSetVersion: number;
}

interface BuildCheckpoint {
  /** Content-addressed: hash of {templateDigest, moduleCursor, completedModules} */
  checkpointId: string;
  templateDigest: string;
  /** moduleCursor value at the time this checkpoint was taken (points to next module) */
  moduleCursor: number;
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

**Module witness** (critical primitive for deterministic verification):

When the building solver produces a module plan, it also produces a `ModuleWitnessV1` that defines the expected end-state for that module. The witness is the verification input for `verify_module` — without it, postcondition checking is unbounded and non-deterministic.

```typescript
interface ModuleWitnessV1 {
  /** Module this witness describes */
  moduleId: string;
  /** Coordinate frame: relative positions are offset from refCorner */
  refCorner: { x: number; y: number; z: number };
  facing: 'N' | 'S' | 'E' | 'W';
  /** Blocks that must exist after module completion (relative to refCorner) */
  expectedPlacements: Array<{
    dx: number; dy: number; dz: number;
    blockId: string;
  }>;
  /** Positions that must be air (doorways, interior space, corridors) */
  requiredEmpty: Array<{
    dx: number; dy: number; dz: number;
  }>;
  /** Content-addressed digest of this witness (hash of expectedPlacements + requiredEmpty, sorted) */
  witnessDigest: string;
}
```

The witness is:
- Produced by the building solver alongside each module's steps (in `toTaskStepsWithReplan`)
- Stored in the checkpoint step's `meta.moduleWitnessDigest` (content-addressed reference)
- Stored in full on the task's `metadata.build.witnesses[moduleId]`
- Used by `verify_module` to check only the declared positions (bounded scan, not full footprint)

**Implementation steps:**

1. Add `BuildMetadata`, `BuildCheckpoint`, `StationEntry`, `ModuleWitnessV1` types to `packages/planning/src/types/task.ts` under `task.metadata.build`.

2. Extend `toTaskStepsWithReplan` to produce a `ModuleWitnessV1` for each module. For v0, the witness is derived from the module's placement steps: each `place_block_at` step contributes an entry to `expectedPlacements`. Store witnesses on `task.metadata.build.witnesses`.

3. Add checkpoint step synthesis in `toTaskStepsWithReplan`. After each module's last step, insert a synthetic checkpoint step:
   ```
   { label: 'Checkpoint: verify module <moduleId>',
     meta: { domain: 'building', leaf: 'verify_module', moduleId, templateId,
             isCheckpoint: true, moduleWitnessDigest } }
   ```

4. Implement `verify_module` as a leaf in `construction-leaves.ts` that:
   - Loads the module witness from `task.metadata.build.witnesses[moduleId]`
   - For each entry in `expectedPlacements`: checks block at absolute position matches `blockId`
   - For each entry in `requiredEmpty`: checks block at absolute position is air
   - Returns `{ moduleId, postconditionsMet: boolean, diff: { missing, wrong, unexpected }, evidenceDigest }`
   - The `diff` is the repair input: it directly describes what blocks need placement/removal

5. In `completeTaskStep`, when a checkpoint step completes:
   - Persist a `BuildCheckpoint` to `task.metadata.build.checkpoints`
   - Advance `moduleCursor` (`moduleCursor++`)
   - Add moduleId to `completedModules`
   - Emit `taskLifecycleEvent: { type: 'build_checkpoint', taskId, moduleCursor, ... }`

**Done when**: A building task with 3 modules produces 3 checkpoint lifecycle events, each with witness-driven postcondition results persisted to task metadata.

### Stage 2: Resume and repair

Make interruption recovery a first-class planning operation.

**Resume algorithm** (runs at the start of executor tick when a building task has checkpoints):

```
0. Reconcile in-flight steps (crash recovery):
   - Find any step with startedAt set but done=false
   - For each in-flight step, run type-specific reconciliation:
     * placement step: check if target block exists at expected position (from witness/meta)
     * workstation step: check if station exists and is interactable
     * gather/craft/smelt step: check inventory delta against step's expected produces/consumes
   - If effect already realized in world → mark step done (idempotent completion)
   - If effect not realized → return step to pending execution
   - This prevents duplicated placements, phantom deficits, and repair thrash

1. Load last checkpoint from task.metadata.build.checkpoints
2. Validate siteSignature:
   - Scan blocks at refCorner and footprint edges
   - If site is unrecognizable → status = 'replan_from_bootstrap'
3. Validate stationRegistry:
   - For each entry: check block at pos matches kind
   - Mark unreachable entries; schedule ensure_workstation if needed
4. Validate current module state using module witness:
   - Load witness for module at moduleCursor
   - For each expectedPlacement: check block at absolute position
   - For each requiredEmpty: check block is air
   - Compute diff: { missing, wrong, unexpected }
   - Classify from diff:
     * diff empty → completed
     * diff is subset of original placements → partially_completed
     * diff contains wrong blocks (expected X, found Y) → drifted
     * diff covers >80% of placements → destroyed
5. Decide:
   - completed → advance moduleCursor, emit checkpoint, continue to next module
   - partially_completed → generate repair work package from diff (place missing blocks only)
   - drifted → generate repair work package from diff (remove wrong blocks, place correct ones)
   - destroyed → replan module from scratch (regenerateSteps for that module only)
   - site invalid → replan entire build
```

**Implementation steps:**

1. Add `resumeBuildingTask(taskId)` method to `TaskIntegration`. Called by executor before step execution when `task.metadata.build` exists and `task.metadata.build.moduleCursor > 0`.

2. Add `reconcileInFlightSteps(task)` as the first operation in `resumeBuildingTask`. For each step with `startedAt && !done`, check world state or inventory to determine if the effect was realized. This is the crash-recovery path that prevents duplicate side effects.

3. Add `scanModuleState(witness: ModuleWitnessV1, siteSignature)` utility in `packages/planning/src/building/module-verifier.ts`. Checks each witness entry against world state, returns typed diff. This is the same code path used by `verify_module` at checkpoint time.

4. Add repair work package generation: convert diff into `place_block_at` and `dig_block_at` steps. Repair is literally "apply the diff from verify_module."

**Done when**: Interrupt a building task mid-module (kill process), restart, and the executor resumes by reconciling in-flight steps, computing witness-based delta, and generating a repair work package that completes only the remaining blocks.

### Stage 3: Invariant-driven planning

Add higher-order invariants that define "cohesion" as checkable properties.

**Invariant set v0** (minimal, high-value, probe-based):

All v0 invariants use bounded probe checks, not open-ended search. Each invariant defines its probe set explicitly so verification is deterministic and cheap.

| Invariant | v0-lite check (probe-based) | When verified |
|-----------|----------------------------|---------------|
| **Access** | Doorway volume (2-high column at declared entrance position) must be air. Corridor of length 3 from doorway outward must be passable (2-high air at each position). No BFS in v0. | Every checkpoint |
| **Footprint** | All blocks placed by the build must be within `siteSignature.footprintBounds`. Check: no entries in any module witness have absolute positions outside bounds. At runtime: spot-check 8 footprint edge positions for unexpected non-air blocks. | Every checkpoint |
| **Reachability** | `stationRegistry` has at least one reachable entry for each required kind. Check: block at registered position matches kind and bot can path to within 4 blocks (simple distance check, not full pathfind). | Before craft/smelt steps |
| **Structural** | Module witness placements are all present (subsumes "load-bearing" for v0). A wall module's witness entries must all match. No physics inference in v0 — structural correctness = witness correctness. Future v1 may add adjacency requirements for roof support blocks. | After wall/roof modules |

**Implementation steps:**

1. Define invariant checkers in `packages/planning/src/building/invariant-checkers.ts`. Each checker: `(siteSignature, witnesses: ModuleWitnessV1[], worldState) => { passed: boolean; evidence?: string }`. Checkers receive the full witness set so they can reason about cross-module properties (footprint, access).

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
- Checkpoint is the boundary between them: macro advances moduleCursor, micro is discarded
- Resume always starts by recomputing micro from delta, never by "continuing from step N"

---

## Workstation semantics

Workstations are capability, not geometry. They belong in the leaf layer, not Sterling.

**v0 mapping rule**: The solver continues to emit `actionType: 'place'` with `parameters.block` naming the workstation block (e.g. `crafting_table`, `furnace`). The semantic distinction is enforced at the mapping boundary in `action-translator.ts`, not by changing solver output:

- `place` + workstation-class block (`crafting_table`, `furnace`, `smoker`, `blast_furnace`, `anvil`) → leaf: `place_workstation` (goal-oriented)
- `place` + non-workstation block → leaf: `place_block` (or `place_block_at` when coordinates exist)

This keeps Sterling's output format stable and avoids requiring a new solver action type in v0. A future version may introduce an explicit `ensure_workstation` solver action if the mapping boundary proves insufficient.

**Leaf**: `place_workstation` — goal-oriented leaf that:
1. Scans for existing station of the requested kind within interaction range
2. If found and reachable: return success, update stationRegistry
3. If not found: place one in the utility zone, verify interactability, update stationRegistry
4. If placement fails: try alternate positions within bounded budget, then fail with reason class

**Station registry** lives in `task.metadata.build.stationRegistry`. It persists across sessions and checkpoints. The `place_workstation` leaf reads from it first (reuse-preferred), writes to it on placement/discovery.

**Structure-geometry vs. capability**: If a step places a crafting_table as part of a module's structural layout (e.g. as furniture at a specific coordinate), that is `place_block_at`, not `place_workstation`. The distinction is made by the building solver via step metadata: steps with `meta.domain === 'building'` and explicit coordinates are structural placements; steps synthesized for crafting/smelting prerequisites are capability placements.

---

## Acceptance tests

### Conformance (Stage 0)

- Every solver-emittable step type accepted by `executeAction` (no "Unknown action type")
- `mapBTActionToMinecraft` round-trips through `executeAction` for all leaf spec names

### Checkpoint (Stage 1)

- Building task with 3 modules emits 3 checkpoint lifecycle events
- Each checkpoint contains: moduleCursor, completedModules, invariantResults
- Checkpoint is persisted to `task.metadata.build.checkpoints`
- `templateDigest` and `siteSignature` are stable across checkpoints

### Resume (Stage 2)

- Interrupt at random step inside a module
- Resume computes delta, generates repair work package
- Repair completes only remaining blocks (not full module)
- `moduleCursor` and `siteSignature` survive interruption
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

## Cohesion model (v0)

Once checkpoint/resume exists, "cohesion" is not aesthetics — it's a set of stable, checkable constraints that shape module decomposition and repair behavior. Cohesion = invariants + witness structure.

### Three layers of cohesion

**Layout invariants** (structure stays usable):
- Entrance volume remains clear (Access invariant)
- Interior has a 2-high walkable path between key anchors: door ↔ workstation zone ↔ storage zone
- Footprint bounds preserved (Footprint invariant)

**Site utility invariants** (build remains operable across sessions):
- Workstation zone exists and is reachable: crafting_table + furnace (Reachability invariant)
- Storage anchor exists: at least one chest at a known coordinate (tracked in stationRegistry as `kind: 'chest'`)
- Lighting baseline (v1, not v0): key interior probes have light level ≥ threshold

**Narrative/goal invariants** (the thing being built remains "the same thing"):
- `templateDigest` remains constant across checkpoints
- Module order constraints remain satisfied (DAG edges)
- Key features exist (door, roof, windows) — these are special witness entries with `requiredEmpty` for openings

### Module ordering principle

For long-horizon structures, the first two modules should establish anchors that make all subsequent modules interruptible and resumable:

1. **Utility zone bootstrap**: workstations + chest + clear pad. This ensures the bot can craft and store materials even if interrupted before the shell is complete.
2. **Shell/entrance**: walls + doorway + immediate corridor. This establishes the Access invariant early, so subsequent interior modules can assume a bounded, navigable space.

All modules after these two benefit from the anchors existing: workstations are reusable, storage is available, and the entrance path is checkable.

### How cohesion shapes repair

When an invariant fails at checkpoint:
- Layout failure → repair work package restores the structural witness entries (from diff)
- Utility failure → `ensure_workstation` re-scans and re-places if needed
- Narrative failure → should not happen (templateDigest is immutable); if it does, this is a bug, not a repair

Repair priority: layout > utility > narrative. A structure with a hole in the wall is more urgent than a missing workstation, because the hole may invalidate the Access invariant and block all subsequent modules.

---

## Goal binding and activation protocol

Specified in a separate document: [`goal-binding-protocol.md`](goal-binding-protocol.md).

That protocol defines how long-horizon goals (like "build shelter") get durable identity, activation/hold semantics, completion verification, and deduplication. It sits above this build protocol: checkpoint/resume here provides the execution substrate; goal binding there provides the coordination layer.

Key interfaces between the two protocols:
- `metadata.build` (this doc) provides `moduleCursor`, `siteSignature`, `checkpoints`, `witnesses` — the execution state
- `metadata.goalBinding` (goal doc) provides `goalInstanceId`, `goalKey`, `hold`, `completion` — the coordination state
- The goal resolver reads `metadata.build` to score progress when deduplicating
- The hold protocol triggers the resume algorithm defined here (Stage 2)
- The completion verifier consumes module witnesses and invariant results from checkpoints

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
| In-flight step crash | Process dies after side effects but before completeTaskStep | In-flight reconciliation on resume: check world/inventory state for each started-but-not-done step |
| Duplicated placement | Crash recovery re-executes a step whose effect already exists | Reconciliation marks realized steps as done before generating repair work package |

Goal-binding failure modes (duplication, zombie goals, done thrash, false continuation, regression blindness) are specified in [`goal-binding-protocol.md`](goal-binding-protocol.md).

---

## File map (where things go)

### New files

| File | Purpose | Stage |
|------|---------|-------|
| `packages/planning/src/building/module-witness.ts` | `ModuleWitnessV1` type, witness generation from placement steps, `witnessDigest` hashing | 0.5 |
| `packages/minecraft-interface/src/leaves/place-block-at-leaf.ts` | `PlaceBlockAtLeaf` — per-block world-mutating placement | 0.5 |
| `packages/planning/src/building/module-verifier.ts` | `scanModuleState(witness, siteSignature)`, witness-driven block verification, diff computation | 1 |
| `packages/planning/src/building/checkpoint-manager.ts` | Checkpoint creation, persistence, content-addressed ID generation | 1 |
| `packages/planning/src/building/resume-planner.ts` | In-flight reconciliation, delta computation, repair/continue/replan decision, work package generation | 2 |
| `packages/planning/src/building/invariant-checkers.ts` | Invariant checker functions (access, footprint, reachability, structural) — probe-based | 3 |
| `packages/minecraft-interface/src/leaves/workstation-leaf.ts` | `place_workstation` leaf (goal-oriented workstation placement via mapping boundary) | 3 |

### Modified files

| File | Changes | Stage |
|------|---------|-------|
| `packages/minecraft-interface/src/action-translator.ts` | Phase 0 dispatch fixes (commits 0a-0c), workstation mapping boundary (`place` + workstation-block → `place_workstation`) | 0, 3 |
| `packages/planning/src/types/task.ts` | Add `metadata.build` namespace (BuildMetadata, BuildCheckpoint, StationEntry, ModuleWitnessV1) | 0.5 |
| `packages/planning/src/sterling/minecraft-building-solver.ts` | Per-block decomposition (Stage 0.5), witness generation, checkpoint step synthesis in `toTaskStepsWithReplan` | 0.5, 1 |
| `packages/minecraft-interface/src/leaves/construction-leaves.ts` | `verify_module` leaf (witness-driven), `PlaceBlockAtLeaf` registration | 0.5, 1 |
| `packages/planning/src/task-integration.ts` | Checkpoint persistence in `completeTaskStep`, `resumeBuildingTask` with in-flight reconciliation | 1, 2 |

Goal-binding file map (goal-resolver, activation-reactor, shelter-verifier, goalBinding types, goal-manager changes) is specified in [`goal-binding-protocol.md`](goal-binding-protocol.md).
