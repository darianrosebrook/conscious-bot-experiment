# Rig B: Capability Gating and Legality Implementation Plan

**Primitive**: P2 — Capability gating and legality (what actions are permitted)

**Status**: Planned (natural next after Rig A certification)

---

## 1. Target invariant (critical boundary)

**"Sterling never proposes an illegal operator; legality is fail-closed."**

The system must:
- Model capabilities as explicit state (not inferred ad hoc)
- Enable/disable operators based on capability predicates
- Reject any plan containing illegal operators
- Reason about acquiring capabilities as first-class subgoals

**What this rig proves**: Sterling can enforce permissioned operations with fail-closed legality.

---

## 2. Formal signature

- **State includes capability set**: `can_mine_stone`, `can_mine_iron`, `has_furnace`, etc.
- **Operators enabled/disabled by capability predicates**: Preconditions reference capabilities
- **Monotone or partially monotone progression**: Capabilities are acquired, rarely lost
- **Legality checks are fail-closed**: If legality cannot be proven, operator is illegal

---

## 3. Problem being solved

### 3.1 Current state (no capability gating)

Without capability gating:
- Planner can propose "mine iron ore" when bot has wooden pickaxe (will fail at execution)
- No explicit model of tool tiers or station requirements
- Execution failures are blamed on "world state" rather than "capability violation"

### 3.2 With capability gating

With proper capability gating:
- Planner knows iron ore requires stone+ tier tool
- Capability acquisition becomes a subgoal: "need iron pickaxe → need iron ingot → need furnace + iron ore"
- Illegal operators are rejected at plan time, not execution time

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Rule building | `packages/planning/src/sterling/minecraft-crafting-rules.ts` | addMineRule; where to add requiredCapabilities |
| Rule types | `packages/planning/src/sterling/minecraft-crafting-types.ts` | MinecraftCraftingRule; extend with requiredCapabilities |
| Solver call | `packages/planning/src/sterling/minecraft-crafting-solver.ts` | Where rules are sent to Sterling; pre-filter point |
| Inventory/placement | task-integration | getInventoryForSterling; placed stations source |

**Investigation outcome (verified 2025-01-31):** `MinecraftCraftingRule` (minecraft-crafting-types.ts:31-48) has no `requiredCapabilities`. `buildCraftingRules` and `addMineRule` (minecraft-crafting-rules.ts:58-152) build rules without capability tagging. Solver (minecraft-crafting-solver.ts:98-108) sends rules to Sterling without filtering. Inventory comes from sterling-planner.fetchBotContext (sterling-planner.ts:129-145) via task-integration; no capability derivation. Filter point: before `sterlingService.solve()` in crafting-solver.

**Outcome:** Confirm rule shape extensibility; where to filter before Sterling; capability derivation data source.

---

## 5. What to implement / change

### 5.1 Capability state representation

**Location**: `packages/planning/src/capabilities/capability-derivation.ts`

**What must be implemented:**
- Define capability atoms: `can_mine_wood`, `can_mine_stone`, `can_mine_iron`, `can_mine_diamond`, etc.
- Derive capabilities from inventory: "has stone pickaxe → can_mine_iron"
- Capability set is part of planning state, canonically hashed

**Determinism requirements:**
- Derivation uses **only** sorted inventory keys + sorted placed stations
- No `Date.now()` or wall-clock time
- Capability set size bounded by `MAX_CAPABILITIES = 32`
- Same inventory + stations → identical capability set (byte-for-byte)

**Code location:** New file `packages/planning/src/capabilities/capability-derivation.ts`

### 5.2 Operator legality predicates

**Location**: `packages/planning/src/capabilities/operator-legality.ts`

**What must be implemented:**
- Each operator specifies required capabilities
- Legality function: `isLegal(operator, state) → boolean`
- Fail-closed: if any capability check fails, operator is illegal
- Unknown capability atoms → illegal (not "no requirement")
- Mining rules **must** have explicit `requiredCapabilities`

**Code location:** New file `packages/planning/src/capabilities/operator-legality.ts`

### 5.3 Capability acquisition operators

**Location**: `packages/planning/src/capabilities/subgoal-generator.ts`

**What must be implemented:**
- Define operators that grant capabilities: "craft stone pickaxe → grants can_mine_iron"
- Mapping from missing capability → acquisition operator
- These become first-class subgoals when needed capabilities are missing
- Subgoal generation when no legal rules exist for target

**Code location:** New file `packages/planning/src/capabilities/subgoal-generator.ts`

### 5.4 Rule capability tagging

**Location**: `packages/planning/src/sterling/minecraft-crafting-rules.ts`

**What must be changed:**
- Extend `MinecraftCraftingRule` interface with `requiredCapabilities?: string[]`
- Tag mining rules with harvest tier capabilities in `addMineRule()`
- Tag crafting rules with station requirements (needsTable → has_crafting_table)
- Mapping maintained in `packages/planning/src/capabilities/rule-capability-map.ts`

**Code location:** Extend existing file + new mapping file

### 5.5 Rule filtering (pre-Sterling)

**Location**: `packages/planning/src/sterling/minecraft-crafting-solver.ts`

**What must be changed:**
- Before calling `sterlingService.solve()`, filter rules by legality
- Derive capabilities from current inventory + placed stations
- Filter rules to only legal ones: `legalRules = rules.filter(r => isRuleLegal(r, capabilities))`
- If no legal rules remain, return unsolved with capability subgoals
- Pass only `legalRules` to Sterling (Sterling never sees illegal rules)

**Code location:** Extend `solveCraftingGoal()` in existing file

### 5.6 Post-solve validation (defense in depth)

**Location**: Same solver file

**What must be added:**
- After Sterling returns plan, validate each step against current capabilities
- If any step is illegal, reject entire plan and return capability subgoals
- Log illegal step rejections for audit trail

**Code location:** Add `validatePlanLegality()` function in solver

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Capability atoms | `planning/src/capabilities/` | Define capability vocabulary |
| Capability derivation | `planning/src/capabilities/` | Derive from inventory/stations |
| Rule capability tagging | `planning/src/sterling/` + `capabilities/rule-capability-map.ts` | Tag rules with requiredCapabilities |
| Rule filtering (legality) | `planning/src/sterling/minecraft-crafting-solver.ts` | Filter rules before Sterling; fail-closed |
| Post-solve validation | Same solver | Validate returned plan steps against capabilities |
| Acquisition subgoals | `planning/src/capabilities/` | Generate when no legal rules for goal |

**Note:** Legality is enforced in conscious-bot (pre-filter + post-validate), not in Sterling. Sterling receives only legal rules. See companion approach for conscious-bot vs Sterling split.

---

## 7. Order of work (suggested)

1. **Define capability vocabulary** for Minecraft tool tiers and stations.
2. **Implement capability derivation** from inventory state.
3. **Add capability preconditions** to existing crafting operators.
4. **Add legality check** in Sterling search (fail-closed).
5. **Add acquisition operators** that grant capabilities.
6. **Certification tests**: illegal operators never proposed; capability subgoals work.

---

## 8. Dependencies and risks

- **Rig A certification**: Builds on deterministic operator semantics.
- **Capability explosion**: Too many fine-grained capabilities can bloat state space.
- **Derivation correctness**: Capability derivation must be deterministic and complete.
- **Monotonicity assumption**: Some capabilities can be lost (tool breaks); model carefully.

---

## 9. Transfer surfaces (domain-agnosticism proof)

To prove this capability is domain-agnostic (not Minecraft-specific), implement the same primitive on at least one of these surfaces:

### 9.1 Enterprise workflow permissions

**Surface**: Document approval workflow with permission levels

- **State**: User capabilities (can_view, can_edit, can_approve, can_publish)
- **Operators**: submit_draft, request_review, approve_document, publish_document
- **Capability gating**: "approve_document" requires can_approve; "publish_document" requires can_publish
- **Acquisition**: "request_approval_rights" grants can_approve (after manager grants)
- **Fail-closed**: User without can_edit cannot propose edit operations

**Prove:** Same legality gates; same fail-closed semantics; same subgoal generation

### 9.2 Robotics autonomy levels

**Surface**: Robot operating modes with safety certification levels

- **State**: Certified modes (can_move_supervised, can_manipulate_objects, can_operate_autonomously)
- **Operators**: navigate, pick, place, execute_task_autonomously
- **Capability gating**: "execute_task_autonomously" requires can_operate_autonomously
- **Acquisition**: "complete_safety_certification" grants higher autonomy levels
- **Fail-closed**: Robot without can_manipulate_objects cannot propose manipulation

**Prove:** Same monotone progression; same capability-as-subgoal reasoning

### 9.3 Staged rollout gates (infrastructure)

**Surface**: Software deployment with environment promotion gates

- **State**: Deployment capabilities (can_deploy_dev, can_deploy_staging, can_deploy_prod)
- **Operators**: deploy_to_dev, deploy_to_staging, deploy_to_prod, rollback
- **Capability gating**: "deploy_to_prod" requires can_deploy_prod (approval + checks)
- **Acquisition**: "pass_staging_validation" grants can_deploy_prod
- **Fail-closed**: No production deploy without explicit production capability

**Prove:** Same fail-closed enforcement; same capability derivation pattern

---

## 10. Definition of "done"

### 10.1 Core boundary criteria

- **No illegal operators**: Sterling receives only legal rules; output plans contain no illegal steps
- **Fail-closed**: Unknown capability = illegal; mining without explicit caps = illegal
- **Pre-filter + post-validate**: Rules filtered before Sterling; plan validated after return
- **Subgoal reasoning**: When no legal rules exist, return `capabilitySubgoals` for acquisition
- **Determinism**: Same inventory + stations → identical capability set
- **Schema consistency**: Mining rules without matching `requiredCapabilities` fail validation

### 10.2 Concrete certification tests

#### Test 1: Illegal operator rejection

```ts
describe('Capability gating - illegal rejection', () => {
  it('rejects mine_diamond_ore without iron+ pickaxe', () => {
    const inventory = { wooden_pickaxe: 1, cobblestone: 64 };
    const stations = new Set<string>();
    const rules = buildCraftingRules(mcData);

    const capabilities = deriveCapabilities(inventory, stations);
    const diamondRule = rules.find(r => r.action === 'mine_diamond_ore');

    expect(isRuleLegal(diamondRule, capabilities)).toBe(false);

    const legalRules = filterRulesByLegality(rules, capabilities);
    expect(legalRules).not.toContain(diamondRule);
  });

  it('allows mine_diamond_ore with iron pickaxe', () => {
    const inventory = { iron_pickaxe: 1 };
    const stations = new Set<string>();

    const capabilities = deriveCapabilities(inventory, stations);
    const diamondRule = getRuleByAction('mine_diamond_ore');

    expect(isRuleLegal(diamondRule, capabilities)).toBe(true);
  });
});
```

#### Test 2: Subgoal generation

```ts
describe('Capability gating - subgoal generation', () => {
  it('generates capability acquisition subgoals', () => {
    const inventory = {};  // Empty inventory
    const stations = new Set<string>();
    const rules = buildCraftingRules(mcData);

    const capabilities = deriveCapabilities(inventory, stations);
    const ironRule = getRuleByAction('mine_iron_ore');

    const subgoals = generateCapabilitySubgoals([ironRule], capabilities);
    expect(subgoals).toContain('can_harvest_iron');

    const acquiringOp = findOperatorToAcquireCapability('can_harvest_iron');
    expect(acquiringOp).toBe('craft_stone_pickaxe');
  });
});
```

#### Test 3: Adversarial rule validation

```ts
describe('Capability gating - adversarial rules', () => {
  it('rejects adversarial rule claiming no capabilities needed', () => {
    const adversarialRule: MinecraftCraftingRule = {
      action: 'fake_mine_diamond',
      actionType: 'mine',
      produces: [{ item: 'diamond', count: 64 }],
      consumes: [],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 1,
      requiredCapabilities: [],  // Claims no capabilities needed!
    };

    // Validation should catch mining rule without capabilities
    const validation = validateRuleCapabilityConsistency(adversarialRule);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContainEqual(
      expect.objectContaining({ code: 'MINING_WITHOUT_CAPABILITIES' })
    );
  });

  it('rejects rule with unknown capability atom', () => {
    const badRule: MinecraftCraftingRule = {
      action: 'mine_iron_ore',
      actionType: 'mine',
      produces: [{ item: 'iron_ore', count: 1 }],
      consumes: [],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 1,
      requiredCapabilities: ['can_harvst_iron'],  // Typo!
    };

    const inventory = { iron_pickaxe: 1 };
    const capabilities = deriveCapabilities(inventory, new Set());

    // Unknown capability atom = illegal
    expect(isRuleLegal(badRule, capabilities)).toBe(false);
  });
});
```

#### Test 4: Deterministic capability derivation

```ts
describe('Capability gating - determinism', () => {
  it('produces identical capability set across runs', () => {
    const inventory = { stone_pickaxe: 1, crafting_table: 1 };
    const stations = new Set(['furnace']);

    const caps1 = deriveCapabilities(inventory, stations);
    const caps2 = deriveCapabilities(inventory, stations);
    const caps3 = deriveCapabilities(inventory, stations);

    expect(caps1).toEqual(caps2);
    expect(caps2).toEqual(caps3);

    // Hash must be identical
    const hash1 = hashCapabilitySet(caps1);
    const hash2 = hashCapabilitySet(caps2);
    expect(hash1).toBe(hash2);
  });

  it('is independent of inventory insertion order', () => {
    const inv1 = { iron_pickaxe: 1, stone: 64, coal: 32 };
    const inv2 = { coal: 32, iron_pickaxe: 1, stone: 64 };

    const caps1 = deriveCapabilities(inv1, new Set());
    const caps2 = deriveCapabilities(inv2, new Set());

    expect(caps1).toEqual(caps2);
  });
});
```

#### Test 5: Sterling integration (end-to-end)

```ts
describe('Capability gating - Sterling integration', () => {
  it('Sterling never receives illegal rules', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService);
    const inventory = { wooden_pickaxe: 1 };
    const goal = { item: 'diamond', count: 1 };

    // Spy on Sterling service to capture rules sent
    const solveSpy = jest.spyOn(sterlingService, 'solve');

    await solver.solveCraftingGoal(goal, inventory, []);

    const sentRules = solveSpy.mock.calls[0][1].rules;
    const diamondRule = sentRules.find(r => r.action === 'mine_diamond_ore');

    // Sterling should never receive the illegal diamond mining rule
    expect(diamondRule).toBeUndefined();
  });

  it('returns capability subgoals when no legal path exists', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService);
    const inventory = {};  // Empty
    const goal = { item: 'iron_ingot', count: 1 };

    const result = await solver.solveCraftingGoal(goal, inventory, []);

    expect(result.solved).toBe(false);
    expect(result.capabilitySubgoals).toBeDefined();
    expect(result.capabilitySubgoals).toContain('can_harvest_iron');
  });
});
```

### 10.3 Transfer surface validation

- **Test on at least one transfer surface** (enterprise permissions, robotics levels, or deployment gates)
- **Prove same gates**: Determinism, fail-closed, subgoal generation work identically
- **Document delta**: If any semantic differences exist on transfer surface, document why

---

## 11. Cross-references

- **Companion approach**: `RIG_B_CAPABILITY_GATING_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P2)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig B section)
- **Rig A**: Foundation for operator semantics
