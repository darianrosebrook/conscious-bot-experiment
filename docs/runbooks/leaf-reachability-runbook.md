# Leaf Reachability & Coverage Runbook

## Purpose
Full inventory of every leaf in the system, its pipeline reachability classification, which tests cover it, and the exact commands to verify each thought-to-execution path end-to-end.

## Audience
Use this runbook when:
- Auditing whether a new leaf is reachable by the autonomous pipeline
- Checking which tests cover a specific leaf or pipeline path
- Verifying that all execution paths work after a refactoring
- Debugging "bot never does X" — likely the leaf has no upstream producer

## Required Env

For mocked E2E suites (no infra needed):
```bash
# No special env — vitest mocks handle everything
```

For Sterling-backed suites:
```bash
STERLING_E2E=1
STERLING_WS_URL=ws://localhost:8766
```

For live smoke testing (full stack):
```bash
ENABLE_DEV_ENDPOINTS=true
ENABLE_PLANNING_EXECUTOR=1
EXECUTOR_MODE=live
EXECUTOR_LIVE_CONFIRM=YES
STERLING_WS_URL=ws://localhost:8766
```

---

## Reachability Classification

Every leaf falls into one of three categories:

| Category | Meaning | E2E testable? |
|----------|---------|---------------|
| **REACHABLE** | An autonomous pipeline producer generates steps targeting this leaf. Full E2E path exists. | Yes — mocked E2E tests cover the path |
| **PASSTHROUGH-ONLY** | Has a contract + action-mapping case, but no upstream producer generates steps for it. Only reachable via manual REST `/action` calls or MCP tool invocations. | REST-only — no pipeline E2E path to test |
| **ORPHANED** | Leaf class exists in MC interface but has no contract, no producer, and no action-mapping case. Dead code from the pipeline perspective. | Not testable via pipeline |

**Governance**: The classification sets are locked by `reachability-governance.test.ts`. Moving a leaf between categories requires updating both this runbook and the test. This prevents silent capability creep. Additionally:
- **Producer contract safety**: Every leaf emitted by a producer must have a `LeafArgContract` and an action mapping. The governance test verifies this.
- **Safety monitor bypass lock**: The safety monitor dispatches actions outside the executor allowlist (via `actionTranslator.executeAction()`). The governance test pins the allowed set: `navigate`, `move_forward`, `find_shelter`, `equip_weapon`, `attack_entity`. Adding a new bypass action requires updating the test.

---

## Full Leaf Inventory (40 leaves in KNOWN_LEAVES + orphans)

### REACHABLE leaves (21) — Full E2E path exists

| # | Leaf | Producer(s) | Test Coverage | Notes |
|---|------|-------------|---------------|-------|
| 1 | `move_to` | Sterling bootstrap, exploration driveshaft | `cross-boundary-bootstrap.test.ts`, `gather-food-dispatch-chain-e2e.test.ts`, `exploration-driveshaft-e2e.test.ts` | |
| 2 | `step_forward_safely` | Sterling bootstrap (theme=safety) | `cross-boundary-bootstrap.test.ts` | Maps to `move_forward` in action-mapping |
| 3 | `acquire_material` | Solvers (mine), fallback planner, bootstrap, dynamic prereq | `cross-boundary-bootstrap.test.ts`, `gather-food-dispatch-chain-e2e.test.ts`, `executor-task-loop-e2e.test.ts`, `thought-to-execution-e2e.test.ts`, `building-solver-dispatch-chain-e2e.test.ts`, `explore-replan-dispatch-e2e.test.ts` | Primary mining/gathering leaf |
| 4 | `place_block` | Solvers (place action, non-workstation) | `tool-progression-integration.test.ts` | |
| 5 | `consume_food` | Sterling bootstrap (food), hunger driveshaft | `cross-boundary-bootstrap.test.ts`, `gather-food-dispatch-chain-e2e.test.ts` | Terminal action for hunger reflex |
| 6 | `craft_recipe` | Crafting solver, tool progression, fallback planner, dynamic prereq | `tool-progression-integration.test.ts`, `executor-task-loop-e2e.test.ts`, `thought-to-execution-e2e.test.ts`, `explore-replan-dispatch-e2e.test.ts` | |
| 7 | `smelt` | Crafting solver, furnace solver | `tool-progression-integration.test.ts` | |
| 8 | `place_workstation` | Solvers (place:crafting_table/furnace), dynamic prereq | `tool-progression-integration.test.ts` | |
| 9 | `open_container` | Acquisition solver (loot strategy) | None — **G-3 deferred** | |
| 10 | `prepare_site` | Building solver (module_type=prep_site) | `building-solver-dispatch-chain-e2e.test.ts` | |
| 11 | `build_module` | Building solver, fallback planner | `building-solver-dispatch-chain-e2e.test.ts` | |
| 12 | `place_feature` | Building solver (module_type=place_feature) | `building-solver-dispatch-chain-e2e.test.ts` | |
| 13 | `building_step` | Building solver (default module type) | `building-solver-dispatch-chain-e2e.test.ts` | |
| 14 | `explore_for_resources` | Tool progression solver (needs_blocks) | `explore-replan-dispatch-e2e.test.ts` | |
| 15 | `replan_building` | Building solver (deficit sentinel) | `building-solver-dispatch-chain-e2e.test.ts` | |
| 16 | `replan_exhausted` | Building solver (max replans) | `building-solver-dispatch-chain-e2e.test.ts` | |
| 17 | `interact_with_entity` | Acquisition solver (trade strategy) | None — **G-3 deferred** | |
| 18 | `introspect_recipe` | Executor prereq injection (programmatic) | `executor-task-loop-e2e.test.ts` | Called programmatically, not as task step |
| 19 | `attack_entity` | Safety monitor (reactive combat) | `safety-monitor-dispatch-e2e.test.ts` | Dispatched via actionTranslator, bypasses planning executor |
| 20 | `equip_weapon` | Safety monitor (pre-attack equip) | `safety-monitor-dispatch-e2e.test.ts` | Dispatched via actionTranslator |
| 21 | `sleep` | Sleep driveshaft (Stage 1: existing bed only) | `sleep-driveshaft-controller.test.ts`, `sleep-driveshaft-e2e.test.ts` | `placeBed: false` — no bed crafting/placement |

### PASSTHROUGH-ONLY leaves (19) — No autonomous producer

| # | Leaf | Has Contract | Has Action Mapping | Why No Producer |
|---|------|:---:|:---:|------|
| 22 | `dig_block` | Yes | Yes | Deprecated. `stepToLeafExecution` rewrites → `acquire_material`. Direct dispatch needs `pos`. |
| 23 | `collect_items` | Yes | Yes | `acquire_material` handles collection internally |
| 24 | `place_torch_if_needed` | Yes | Yes | No exploration/lighting driveshaft exists |
| 25 | `place_torch` | Yes | Yes | Used in Tier B smoke chain manually only |
| 26 | `retreat_and_block` | Yes | Yes | Safety monitor uses `navigate`/`move_forward`, not this |
| 27 | `retreat_from_threat` | Yes | Yes | Safety monitor uses `navigate` for flee, not this |
| 28 | `sense_hostiles` | Yes | Yes | Used internally by safety monitor assessment, not as task step |
| 29 | `get_light_level` | Yes | Yes | Utility leaf — no step producer |
| 30 | `get_block_at` | Yes | Yes | Utility leaf — no step producer |
| 31 | `find_resource` | Yes | Yes | Removed from `_lower_gather`; `acquire_material` handles search internally |
| 32 | `manage_inventory` | Yes | Yes | No inventory management driveshaft |
| 33 | `use_item` | Yes | Yes | No producer emits use_item steps |
| 34 | `equip_tool` | Yes | Yes | **Reclassified**: `AcquireMaterialLeaf.selectBestTool()` (interaction-leaves.ts:1402) already auto-equips before digging. No executor-side injection needed. |
| 35 | `till_soil` | Yes | Yes | No farming driveshaft |
| 36 | `harvest_crop` | Yes | Yes | No farming driveshaft |
| 37 | `manage_farm` | Yes | Yes | No farming driveshaft |
| 38 | `interact_with_block` | Yes | Yes | No producer emits interact_with_block steps |
| 39 | `chat` | Yes | Yes | Smoke path only, not autonomous |
| 40 | `wait` | Yes | Yes | Smoke path only, not autonomous |

### ORPHANED leaves (8) — No contract, no producer, no action mapping

| # | Leaf | File | Why Orphaned |
|---|------|------|-------------|
| 41 | `follow_entity` | movement-leaves.ts | No contract, no producer, no action-mapping case |
| 42 | `transfer_items` | container-leaves.ts | No contract, no producer |
| 43 | `close_container` | container-leaves.ts | No contract, no producer |
| 44 | `plant_crop` | farming-leaves.ts | No contract, no producer |
| 45 | `operate_piston` | world-interaction-leaves.ts | No contract, no producer |
| 46 | `control_redstone` | world-interaction-leaves.ts | No contract, no producer |
| 47 | `build_structure` | world-interaction-leaves.ts | No contract, no producer |
| 48 | `control_environment` | world-interaction-leaves.ts | No contract, no producer |

**Note**: `place_scaffold` was previously emitted by the building solver for `moduleType=scaffold`, but had no `LeafArgContract` or action mapping — making it always fail at the executor. This was fixed: scaffold now falls through to `building_step` (the default case). The `reachability-governance.test.ts` "producer contract safety" section prevents this class of bug from recurring.

---

## Pipeline Entry Points (Thought-to-Execution Paths)

Each entry point is a distinct way tasks/steps enter the pipeline. Tests should cover every entry point.

### EP-1: Sterling Bootstrap Lowering (idle episode → expand_by_digest)

**Path**: Idle episode thought → `convertThoughtToTask` → `sterling_ir` task → `expandByDigest` → `_lower_*` → concrete leaf steps

**Leaves produced**: `move_to`, `step_forward_safely`, `acquire_material`, `consume_food`

**Expansion functions**:
| Lemma | Theme | Steps |
|-------|-------|-------|
| `explore` | any | `move_to(exploration_target, distance=10)` |
| `navigate` | safety | `step_forward_safely(distance=8)` |
| `navigate` | other | `move_to(target=<theme>, distance=10)` |
| `gather` | food | `acquire_material(sweet_berry_bush, count=1)` → `consume_food()` |
| `gather` | other | `acquire_material(item=<theme>, count=1)` |

**Contract fixture**: `bootstrap-lowering-v1.json` (shared between Sterling Python and Planning TypeScript)

**Test coverage**:
```bash
# Contract fixture shape + action mapping (mocked, fast)
npx vitest run packages/planning/src/server/__tests__/cross-boundary-bootstrap.test.ts

# Full pipeline: idle episode → expand → dispatch (mocked, fast)
npx vitest run packages/planning/src/__tests__/gather-food-dispatch-chain-e2e.test.ts

# Python-side lowering (run from sterling dir)
cd ../sterling && python -m pytest tests/unit/test_expand_by_digest_v1.py -v
```

### EP-2: Sterling Solver (crafting, tool progression, building)

**Path**: Task with requirement → `SterlingPlanner.generateDynamicSteps` → solver → `actionTypeToLeaf` → leaf steps

**Leaves produced**: `acquire_material`, `craft_recipe`, `smelt`, `place_workstation`, `place_block`, `explore_for_resources`, `prepare_site`, `build_module`, `place_feature`, `building_step`, `replan_building`, `replan_exhausted`

**Routing table** (`leaf-routing.ts`):
| Solver Action | → Leaf |
|---------------|--------|
| `mine` | `acquire_material` |
| `craft` | `craft_recipe` |
| `upgrade` | `craft_recipe` |
| `smelt` | `smelt` |
| `place:crafting_table` | `place_workstation` |
| `place:<other>` | `place_block` |

**Test coverage**:
```bash
# Tool progression golden master (mocked)
npx vitest run packages/planning/src/sterling/__tests__/tool-progression-integration.test.ts

# Solver class E2E (needs Sterling running)
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts

# Building solver dispatch chain (mocked)
npx vitest run packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts

# Explore-for-resources → replan → dispatch (mocked)
npx vitest run packages/planning/src/__tests__/explore-replan-dispatch-e2e.test.ts

# Executor task loop: explore → replan → acquire → craft chain (mocked)
npx vitest run packages/planning/src/__tests__/executor-task-loop-e2e.test.ts
```

### EP-3: Fallback Planner (requirement → leaf)

**Path**: Task with requirement → `requirementToFallbackPlan` → leaf steps (when Sterling unavailable or solver returns no solution)

**Leaves produced**: `acquire_material`, `craft_recipe`, `build_module`

**Mapping**:
| Requirement Kind | → Leaf |
|-----------------|--------|
| `collect` | `acquire_material` |
| `mine` | `acquire_material` |
| `craft` | `craft_recipe` |
| `build` | `build_module` |

**Test coverage**:
```bash
# Thought-to-execution pipeline (mocked, exercises fallback path)
npx vitest run packages/planning/src/__tests__/thought-to-execution-e2e.test.ts
```

### EP-4: Dynamic Prereq Injection (executor injects subtask)

**Path**: Executor finds missing prereq → `injectDynamicPrereqForCraft` / `injectNextAcquisitionStep` → new subtask with leaf steps

**Leaves produced**: `acquire_material`, `craft_recipe`, `place_workstation`

**Test coverage**:
```bash
# Executor task loop covers the replan → prereq injection path
npx vitest run packages/planning/src/__tests__/executor-task-loop-e2e.test.ts
```

### EP-5: Hunger Driveshaft (reflex → task injection)

**Path**: `hunger-driveshaft-controller` → `consume_food` step → executor → MC interface

**Leaves produced**: `consume_food`

**Test coverage**:
```bash
# Hunger driveshaft unit tests
npx vitest run packages/planning/src/goal-formulation/__tests__/hunger-driveshaft-controller.test.ts
```

### EP-6: Exploration Driveshaft (reflex → task injection)

**Path**: `exploration-driveshaft-controller` → `move_to` step → executor → MC interface

**Leaves produced**: `move_to`

**Test coverage**:
```bash
# Unit tests
npx vitest run packages/planning/src/goal-formulation/__tests__/exploration-driveshaft-controller.test.ts

# E2E: controller → action mapping → executor dispatch
npx vitest run packages/planning/src/goal-formulation/__tests__/exploration-driveshaft-e2e.test.ts
```

### EP-7: Reactive Safety Pipeline (bypasses planning)

**Path**: Entity detection → threat assessment → safety monitor → `actionTranslator.executeAction()` directly

**Leaves produced**: `attack_entity`, `equip_weapon` (also dispatches `navigate` and `move_forward` via handler path)

**Test coverage**:
```bash
# Mocked E2E: equip → attack → flee dispatch chain
npx vitest run packages/minecraft-interface/src/__tests__/safety-monitor-dispatch-e2e.test.ts

# Live-only via proof ledger SC-8..SC-11
```

### EP-8: Acquisition Solver (specialized strategies)

**Path**: Acquisition task → `MinecraftAcquisitionSolver` → strategy-specific leaves

**Leaves produced**: `interact_with_entity` (trade), `open_container` (loot), `craft_recipe` (salvage), plus all Rig A leaves for mine/craft

**Test coverage**:
```bash
# No dedicated acquisition solver E2E test — needs coverage (G-3)
```

### EP-9: Sleep Driveshaft (reflex → task injection)

**Path**: `sleep-driveshaft-controller` → `sleep` step → executor → MC interface

**Leaves produced**: `sleep`

**Stage**: Stage 1 only — `placeBed: false`, finds and sleeps in existing nearby beds. Stage 2 (bed crafting/placement) is a separate future producer.

**Test coverage**:
```bash
# Unit tests
npx vitest run packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-controller.test.ts

# E2E: controller → action mapping → executor dispatch
npx vitest run packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-e2e.test.ts
```

---

## Test Suite Map

### Mocked E2E (no infra required — always runnable)

| Suite | File | Covers EPs | Leaves Exercised |
|-------|------|------------|------------------|
| Cross-Boundary Bootstrap | `packages/planning/src/server/__tests__/cross-boundary-bootstrap.test.ts` | EP-1 | move_to, step_forward_safely, acquire_material, consume_food |
| Gather-Food Dispatch Chain | `packages/planning/src/__tests__/gather-food-dispatch-chain-e2e.test.ts` | EP-1 | acquire_material, consume_food (full pipeline trace) |
| Thought-to-Execution | `packages/planning/src/__tests__/thought-to-execution-e2e.test.ts` | EP-2, EP-3 | acquire_material, craft_recipe |
| Executor Task Loop | `packages/planning/src/__tests__/executor-task-loop-e2e.test.ts` | EP-2, EP-4 | acquire_material, craft_recipe (replan chain) |
| Cognition-Planning Handshake | `packages/planning/src/__tests__/cognition-planning-handshake-e2e.test.ts` | EP-1, EP-2 | (validates task creation, not leaf dispatch) |
| Tool Progression Integration | `packages/planning/src/sterling/__tests__/tool-progression-integration.test.ts` | EP-2 | acquire_material, craft_recipe, smelt, place_workstation, place_block |
| Contract Alignment | `packages/planning/src/modules/__tests__/contract-alignment.test.ts` | — | (validates planning ↔ MC normalization, not dispatch) |
| Hunger Driveshaft | `packages/planning/src/goal-formulation/__tests__/hunger-driveshaft-controller.test.ts` | EP-5 | consume_food |
| Building Solver Dispatch Chain | `packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts` | EP-2 | prepare_site, build_module, place_feature, building_step, replan_building, acquire_material |
| Explore-Replan Dispatch Chain | `packages/planning/src/__tests__/explore-replan-dispatch-e2e.test.ts` | EP-2 | explore_for_resources, acquire_material, craft_recipe |
| Exploration Driveshaft E2E | `packages/planning/src/goal-formulation/__tests__/exploration-driveshaft-e2e.test.ts` | EP-6 | move_to |
| Safety Monitor Dispatch | `packages/minecraft-interface/src/__tests__/safety-monitor-dispatch-e2e.test.ts` | EP-7 | equip_weapon, attack_entity, navigate, move_forward, find_shelter |
| Reachability Governance | `packages/planning/src/__tests__/reachability-governance.test.ts` | — | (negative-space: locks classification, prevents capability creep) |
| Sleep Driveshaft | `packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-controller.test.ts` | EP-9 | sleep |
| Sleep Driveshaft E2E | `packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-e2e.test.ts` | EP-9 | sleep (controller → action mapping → executor dispatch) |

### Sterling-backed E2E (needs Sterling running)

| Suite | File | Covers EPs | Gate |
|-------|------|------------|------|
| Solver Class E2E | `packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts` | EP-2 | `STERLING_E2E=1` |
| Performance Baseline E2E | `packages/planning/src/sterling/__tests__/performance-baseline-e2e.test.ts` | EP-2 | `STERLING_E2E=1` |
| Sterling Pipeline E2E | `packages/minecraft-interface/src/__tests__/sterling-pipeline-e2e.test.ts` | EP-2 | `STERLING_E2E=1` |

### Live-stack proofs (needs full services)

| Proof | Covers EPs | How to Run |
|-------|------------|------------|
| Sterling Smoke (SC-1..SC-7) | EP-2 | `POST /api/dev/sterling-smoke` (see [sterling-smoke-runbook.md](./sterling-smoke-runbook.md)) |
| Reactive Safety (SC-8..SC-11) | EP-7 | Live Minecraft with hostile mobs |
| Hunger Driveshaft (SC-29+) | EP-5 | Live Minecraft with hunger |

---

## Coverage Gaps

### ~~Gap G-1: Reactive safety pipeline~~ — RESOLVED
Addressed by `safety-monitor-dispatch-e2e.test.ts` (Phase 1d). Tests equip → attack → flee dispatch chain with payload verification.

### ~~Gap G-2: Building solver leaves~~ — RESOLVED
Addressed by `building-solver-dispatch-chain-e2e.test.ts` (Phase 1a). Tests module-type → leaf mapping, happy path dispatch, deficit path, and documents Option A policy (derived args blocked in live mode).

### Gap G-3: Acquisition solver strategies have no E2E test
**Impact**: `interact_with_entity` (trade) and `open_container` (loot) are REACHABLE but untested.
**Needed**: Acquisition solver E2E test covering trade/loot/salvage strategies.
**Deferred**: Trade/loot/salvage require Sterling backend rules that don't exist yet.

### ~~Gap G-4: `explore_for_resources` dispatch~~ — RESOLVED
Addressed by `explore-replan-dispatch-e2e.test.ts` (Phase 1b). Tests needsBlocks → explore → replan → dispatch chain.

### ~~Gap G-5: `equip_tool` has no producer~~ — RECLASSIFIED
**Not a gap**: `AcquireMaterialLeaf.selectBestTool()` (interaction-leaves.ts:1402) already auto-equips the best tool before digging. The equip happens inside the leaf, not as a separate executor step. No executor-side injection needed. The leaf is PASSTHROUGH-ONLY because no autonomous producer emits `equip_tool` as a *step*, but tool equipping is handled internally.

### ~~Gap G-6: `sleep` has no producer~~ — RESOLVED
Addressed by `sleep-driveshaft-controller.ts` (Phase 3a). Stage 1: sleep in existing nearby bed (`placeBed: false`). Stage 2 (bed crafting/placement) is a separate future producer.

### Gap G-7: Farming leaves have no producer
**Impact**: `till_soil`, `harvest_crop`, `manage_farm` are all unreachable autonomously.
**Needed**: Farming driveshaft or Sterling expansion rules for farming goals.
**Deferred**: Farming is P2 gameplay, not needed for basic autonomy.

### ~~Gap G-8: Exploration driveshaft has no test~~ — RESOLVED
Addressed by `exploration-driveshaft-e2e.test.ts` (Phase 1c). Tests controller → action mapping → executor dispatch chain.

---

## Run Commands

### Full mocked E2E regression (no infra, ~30s)

```bash
# Using the E2E script (recommended — includes suite gating)
bash scripts/run-e2e.sh

# Or manually:
npx vitest run \
  packages/planning/src/server/__tests__/cross-boundary-bootstrap.test.ts \
  packages/planning/src/__tests__/gather-food-dispatch-chain-e2e.test.ts \
  packages/planning/src/__tests__/thought-to-execution-e2e.test.ts \
  packages/planning/src/__tests__/executor-task-loop-e2e.test.ts \
  packages/planning/src/__tests__/cognition-planning-handshake-e2e.test.ts \
  packages/planning/src/sterling/__tests__/tool-progression-integration.test.ts \
  packages/planning/src/modules/__tests__/contract-alignment.test.ts \
  packages/planning/src/goal-formulation/__tests__/hunger-driveshaft-controller.test.ts \
  packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts \
  packages/planning/src/__tests__/explore-replan-dispatch-e2e.test.ts \
  packages/planning/src/goal-formulation/__tests__/exploration-driveshaft-e2e.test.ts \
  packages/minecraft-interface/src/__tests__/safety-monitor-dispatch-e2e.test.ts \
  packages/planning/src/__tests__/reachability-governance.test.ts \
  packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-controller.test.ts \
  packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-e2e.test.ts
```

### Suite selection with E2E script

Categories: `core` (mocked, no infra), `sterling` (needs Sterling, implies infra), `infra` (Docker/Postgres/Minecraft/MLX), `all`.

```bash
bash scripts/run-e2e.sh                          # core only (fast, no infra started)
E2E_SUITES=all bash scripts/run-e2e.sh           # everything (starts all infra)
E2E_SUITES=core,sterling bash scripts/run-e2e.sh  # core + sterling (starts infra for sterling)
```

### Full E2E with Sterling (needs Sterling running)

```bash
E2E_SUITES=all bash scripts/run-e2e.sh
```

### Python-side contract tests (from sterling repo)

```bash
cd ../sterling && python -m pytest tests/unit/test_expand_by_digest_v1.py tests/unit/test_idle_episode_reducer.py -v
```

### Quick: which leaves are covered?

```bash
# Shows which leaf names appear in E2E test files
grep -roh "'[a-z_]*'" packages/planning/src/__tests__/*e2e* packages/planning/src/server/__tests__/cross-boundary* | sort -u
```

### Quick: which leaves are in KNOWN_LEAVES but have no E2E test mention?

```bash
# Extract leaf names from contracts
grep "leafName:" packages/planning/src/modules/leaf-arg-contracts.ts | sed "s/.*'\(.*\)'.*/\1/" | sort > /tmp/known-leaves.txt

# Extract leaf names mentioned in E2E tests
grep -roh "'[a-z_]*'" packages/planning/src/__tests__/*e2e* packages/planning/src/server/__tests__/cross-boundary* | sort -u > /tmp/tested-leaves.txt

# Show uncovered leaves
comm -23 /tmp/known-leaves.txt /tmp/tested-leaves.txt
```

---

## Maintenance

When adding a new leaf:
1. Follow [leaf-creation-runbook.md](./leaf-creation-runbook.md) for implementation
2. Update the inventory table in this file with the correct reachability classification
3. Update `reachability-governance.test.ts` — classify the leaf in `PASSTHROUGH_ONLY` or `AUTONOMOUSLY_REACHABLE`
4. If REACHABLE: ensure at least one E2E test covers the producing pipeline path
5. If PASSTHROUGH-ONLY: document why no producer exists and whether one is planned
6. If adding a new pipeline entry point (EP-N): add it to the entry points section

When a leaf moves categories (e.g., adding a driveshaft makes a PASSTHROUGH leaf REACHABLE):
1. Update the inventory table
2. Update `reachability-governance.test.ts` classification sets
3. Add or update E2E test coverage
4. Update the coverage gaps section (remove resolved gaps)

---

## Related Runbooks

- **[leaf-creation-runbook.md](./leaf-creation-runbook.md)**: How to implement and integrate a new leaf
- **[debugging-leaf-dispatch-runbook.md](./debugging-leaf-dispatch-runbook.md)**: Diagnose failures at each pipeline stage
- **[sterling-smoke-runbook.md](./sterling-smoke-runbook.md)**: Live smoke testing via `/api/dev/sterling-smoke`
- **[receipt-anchored-verification-runbook.md](./receipt-anchored-verification-runbook.md)**: Verification for placement leaves

---

*Last updated: 2026-02-13*
*Source: Reachability audit of `leaf-arg-contracts.ts`, `action-mapping.ts`, `step-to-leaf-execution.ts`, `leaf-routing.ts`, `expand_by_digest_v1.py`, `automatic-safety-monitor.ts`, all solver files, all driveshaft controllers, `reachability-governance.test.ts`.*
