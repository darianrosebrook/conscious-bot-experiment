# Feedback Implementation Verification

Verification of the epistemic-action feedback against the conscious-bot codebase (2026-02-13).

## Scope

- **conscious-bot**: TypeScript planning, executors, minecraft-interface
- **Sterling (Python)**: `resolve_intent_steps.py` and solver logic live in a sibling repo; not audited here

---

## 1. Direct Frontier Computation

**Feedback:** Derive `required_raw_mine_targets(goal_item)` by walking rules backward, then:
- `observed_mine_targets = observed_blocks ∩ mine_rule_outputs` (intersect, not union)
- If `required_raw_mine_targets ∩ observed_mine_targets` is empty → emit `explore_for_resources` with `resource_tags = sorted(required_raw_mine_targets)`

**Status: NOT IMPLEMENTED in conscious-bot**

- `minecraft-crafting-rules.ts`: `buildCraftingRules()` does not take `nearbyBlocks`; it builds all rules from mcData.
- `minecraft-crafting-solver.ts`: Passes `nearbyBlocks` to Sterling; pruning is done in the Python backend.
- No TypeScript code computes `required_raw_mine_targets` or `observed_mine_targets ∩ mine_rule_outputs`.
- Tool progression uses a related pattern: `buildToolProgressionRules()` checks `nearbyBlocks.has(block)` and returns `missingBlocks` when required blocks are absent. That is rule-build-time gating, not a general frontier derivation.

---

## 2. observed_mine_targets Intersection (Avoid Union)

**Feedback:** Use intersection so non-mineables (grass, leaves) in `nearby_blocks` do not cause mine-rule pruning to delete all mine rules and under-specify exploration.

**Status: PARTIALLY IMPLEMENTED**

- **Tool progression:** Uses `nearbySet.has(block)` for required blocks; only required blocks are checked. No union with non-mineables.
- **Crafting:** Pruning is in Sterling (Python). Cannot verify intersection vs union without Sterling source.
- **Risk:** If Sterling uses `nearby_blocks` as a union or does not intersect with `mine_rule_outputs`, the failure mode described in the feedback can still occur.

---

## 3. recipe_group / variant_id Semantics

**Feedback:** Prefer explicit `recipe_group` and `variant_id` from the rule builder instead of `:v` string heuristics. If the generator cannot be changed, add a defensive log: "saw multiple craft rules that share produces=wooden_pickaxe but none matched variant heuristic."

**Status: NOT IMPLEMENTED**

- `minecraft-crafting-rules.ts` line 171: Uses `:v${...}` suffix for recipe variants.
- No `recipe_group` or `variant_id` in rule types.
- No defensive log for unmatched variant heuristics.
- `action-mapping.ts` and `crafting-leaves.ts` strip `:v9`-style suffixes for display; semantics remain string-based.

---

## 4. explore_for_resources Leaf and resource_tags

**Feedback:** Emit `explore_for_resources` with non-empty `resource_tags` matching the derived frontier.

**Status: PARTIALLY IMPLEMENTED**

| Component | Status |
|-----------|--------|
| Leaf contract (`leaf-arg-contracts.ts`) | `resource_tags`, `goal_item`, `reason` defined |
| Action mapping | Passes args through to `explore_for_resources` |
| Executor (`executeExplore`) | **Does not use `resource_tags`** — calls `exploreForItems(undefined, ...)` for generic exploration |
| Solver emission | Crafting solver does not emit `explore_for_resources` when unsolved |
| Tool progression | Returns `needsBlocks` but planner does not convert to `explore_for_resources` steps |

**Gap:** `executeExplore` should pass `resource_tags[0]` (or a chosen tag) to `exploreForItems` so exploration targets the frontier.

---

## 5. needsBlocks → explore_for_resources Conversion

**Feedback:** When no observed mine targets intersect the goal frontier, emit exactly one leaf `explore_for_resources` with non-empty `resource_tags`.

**Status: NOT IMPLEMENTED**

- `minecraft-tool-progression-solver.ts`: Returns `needsBlocks: { missingBlocks, blockedAtTier, currentTier }` when required blocks are not in `nearbyBlocks`.
- `sterling-planner.ts` line 740: `if (!result.solved) return [];` — discards the result and returns no steps.
- `needsBlocks` is never turned into an `explore_for_resources` step with `resource_tags: missingBlocks`.

**Required change:** When `result.needsBlocks` is present, emit a single `explore_for_resources` step with `resource_tags: result.needsBlocks.missingBlocks` (and `goal_item` / `reason` as appropriate).

---

## 6. Replan After explore_for_resources

**Feedback:** After `explore_for_resources` completes, replanning must occur (plan invalid/expired or explicit "replan needed" event).

**Status: NOT IMPLEMENTED**

- Building solver: Uses `replan_building` sentinel after acquisition steps.
- No equivalent for `explore_for_resources`. Completion does not trigger replan.
- Risk: Exploration runs, new blocks may be visible, but the plan is not refreshed.

---

## 7. Acceptance Checks

**Feedback:**

1. **Solver-level:** Given rules with 12 wooden_pickaxe variants and observed `{oak_log}`, pruned ruleset must contain only oak lineage variants.
2. **Solver-level:** Given no observed mine targets intersecting the goal frontier, emit exactly one `explore_for_resources` with non-empty `resource_tags`.
3. **Executor-level:** After `explore_for_resources` completes, replanning must occur.

**Status:**

| Check | Status |
|-------|--------|
| 1. Oak lineage pruning | Cannot verify without Sterling; crafting rules use `:v` heuristics, no explicit lineage pruning in CB |
| 2. Emit explore_for_resources with resource_tags | Not implemented — crafting does not emit it; tool progression has needsBlocks but does not convert |
| 3. Replan after explore | Not implemented |

---

## 8. resolve_intent_steps.py

**Feedback:** The snapshot in the chat does not contain the explore leaf fallback or craft-variant pruning; verify changes landed in the real repo.

**Status: OUT OF SCOPE**

- `resolve_intent_steps.py` is not in conscious-bot.
- Likely in a sibling Sterling (Python) repo.
- Recommend checking the Sterling repo directly.

---

## 9. Integration (Raycasts, Observation Index)

**Feedback:**

- Near-term: Raycasts in MC interface, observation index, minimal endpoint with block-type summary.
- Mid-term: MC interface pushes observation deltas to world server; world server is aggregator.

**Status:** Not audited in this verification. See world package and minecraft-interface perception wiring.

---

## Summary: Implemented vs Gaps

| Item | Implemented | Gap |
|------|-------------|-----|
| explore_for_resources leaf contract | Yes | — |
| explore_for_resources executor (executeExplore) | Yes | Does not use resource_tags |
| required_raw_mine_targets frontier | No | — |
| observed ∩ mine_rule_outputs | Unknown (Sterling) | — |
| needsBlocks → explore_for_resources | No | sterling-planner returns [] |
| Replan after explore | No | — |
| recipe_group / variant_id | No | — |
| Defensive variant heuristic log | No | — |

---

## Recommended Next Steps (Priority Order)

1. **needsBlocks → explore_for_resources:** In `sterling-planner.ts`, when `result.needsBlocks` is present, emit one `explore_for_resources` step with `resource_tags: result.needsBlocks.missingBlocks`.
2. **executeExplore uses resource_tags:** Pass `resource_tags?.[0]` (or a chosen tag) to `exploreForItems()` so exploration targets the frontier.
3. **Replan after explore:** Add a replan trigger when `explore_for_resources` completes (e.g., mark plan invalid or emit replan event).
4. **Defensive variant log:** Add a log when multiple craft rules share `produces` but none match the variant heuristic.
5. **Frontier derivation (crafting):** If Sterling does not provide it, implement `required_raw_mine_targets(goal_item)` in CB and use it for crafting explore emission.
