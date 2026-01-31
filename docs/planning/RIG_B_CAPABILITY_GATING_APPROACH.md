# Rig B: Capability Gating and Legality — Companion Approach

This companion document distills the implementation plan into a recommended approach, with explicit design decisions, boundaries, **concrete code references and signatures**, and implementation construction constraints so that implementers cannot easily implement the boundary incorrectly. Read alongside `RIG_B_CAPABILITY_GATING_PLAN.md`.

---

## 1. Executive summary

Rig B proves **Primitive 2** (Capability gating and legality) by implementing fail-closed legality checks that:

1. Model **capabilities as explicit state** (not inferred ad hoc)
2. Enable/disable **operators based on capability predicates**
3. Treat **capability acquisition as first-class subgoals**
4. **Reject** any plan containing illegal operators

**Critical boundary**: Sterling never proposes an illegal operator; legality is fail-closed.

**Best path:** Add capability derivation in conscious-bot first; extend `MinecraftCraftingRule` with `requiredCapabilities`; filter rules before sending to Sterling; add post-solve legality validation. Sterling receives only legal rules; conscious-bot enforces the gate.

---

## 2. What must be implemented in conscious-bot vs Sterling

Rig B is **proved in conscious-bot**. Sterling receives rules and state; it does not know about Minecraft tool tiers. The capability gate lives in the rig.

### Implement in conscious-bot (the rig)

| Area | What conscious-bot must implement | Location |
|------|-----------------------------------|----------|
| **Capability derivation** | Derive capabilities from inventory + placed stations; deterministic, bounded. | New: `packages/planning/src/capabilities/capability-derivation.ts` |
| **Capability vocabulary** | Tool tier atoms, station atoms; bounded enum. | New: `packages/planning/src/capabilities/capability-atoms.ts` |
| **Rule capability tagging** | Tag rules with `requiredCapabilities`; mapping from item/action to capability. | Extend: `packages/planning/src/sterling/minecraft-crafting-rules.ts`; new: `packages/planning/src/capabilities/rule-capability-map.ts` |
| **Rule filtering** | Filter rules by legality before passing to Sterling; fail-closed (unknown capability = illegal). | Extend: `packages/planning/src/sterling/minecraft-crafting-solver.ts` |
| **Post-solve validation** | Validate returned plan steps against capabilities; reject if any step is illegal. | Same solver; add `validatePlanLegality()`. |
| **Subgoal generation** | When target operator is illegal, generate capability acquisition subgoals. | `packages/planning/src/capabilities/subgoal-generator.ts` |

### Implement in Sterling (Python)

| Area | Sterling role | Required for Rig B? |
|------|----------------|---------------------|
| **Capability state** | None. Sterling receives rules and inventory; it does not model capabilities. | **No.** |
| **Rule filtering** | None. conscious-bot sends only legal rules. | **No.** |
| **Search** | Unchanged. Sterling expands rules as before. | **No change.** |

**Contract:** conscious-bot sends only rules that pass `legalityGate`; Sterling returns a plan; conscious-bot validates plan steps before execution. If validation fails, the plan is rejected and a capability subgoal is generated.

---

## 3. Current code anchors (what exists today)

Exact file paths and line context for changes.

### 3.1 Minecraft crafting rules — no capability today

| Location | Line(s) | What |
|----------|---------|------|
| `packages/planning/src/sterling/minecraft-crafting-rules.ts` | 59–137 | `buildCraftingRules()` builds rules from mcData; `addMineRule()` adds mine rules; no capability fields. |
| Same file | 115–137 | `addMineRule()` creates rules with `action`, `actionType: 'mine'`, `produces`, `consumes`, `requires`, `needsTable`, `needsFurnace`, `baseCost`. No `requiredCapabilities`. |
| `packages/planning/src/sterling/minecraft-crafting-types.ts` | 31–48 | `MinecraftCraftingRule` interface: `action`, `actionType`, `produces`, `consumes`, `requires`, `needsTable`, `needsFurnace`, `baseCost`. Missing: `requiredCapabilities`. |

**Exact code to extend (crafting types):**

```ts
// ADD to packages/planning/src/sterling/minecraft-crafting-types.ts
// MinecraftCraftingRule interface — add required field:

export interface MinecraftCraftingRule {
  action: string;
  actionType: 'craft' | 'mine' | 'smelt' | 'place';
  produces: CraftingInventoryItem[];
  consumes: CraftingInventoryItem[];
  requires: CraftingInventoryItem[];
  needsTable: boolean;
  needsFurnace: boolean;
  baseCost: number;
  /** Rig B: capability atoms required for this rule to be legal. Fail-closed: missing = illegal. */
  requiredCapabilities?: string[];
}
```

### 3.2 Crafting solver — sends rules without filtering

| Location | Line(s) | What |
|----------|---------|------|
| `packages/planning/src/sterling/minecraft-crafting-solver.ts` | 54–107 | `solveCraftingGoal()` builds rules via `buildCraftingRules()`, converts inventory, sends to Sterling. No capability derivation or rule filtering. |
| Same file | 98–107 | `this.sterlingService.solve()` receives `inventory`, `goal`, `nearbyBlocks`, `rules`. Rules are sent as-is. |
| `packages/planning/src/task-integration.ts` | 333–340 | `getInventoryForSterling()` fetches inventory; no capability derivation. |

**Exact code to add (solver, before Sterling call):**

```ts
// ADD in minecraft-crafting-solver.ts, before line 98 (sterlingService.solve):
// 1. Derive capabilities from inventory + placed stations
// 2. Filter rules by legality
// 3. If no rules remain for goal, return unsolved with capability subgoals

const capabilities = deriveCapabilities(inventory, placedStations);
const legalRules = filterRulesByLegality(rules, capabilities);
if (legalRules.length === 0) {
  const subgoals = generateCapabilitySubgoals(rules, capabilities);
  return { solved: false, steps: [], error: `Missing capabilities: ${subgoals.join(', ')}`, capabilitySubgoals: subgoals };
}
// Use legalRules instead of rules in solve() call
```

### 3.3 Rule-to-capability mapping

**New file:** `packages/planning/src/capabilities/rule-capability-map.ts`

Mining rules must be tagged by harvest tier: `iron_ore` → `can_harvest_iron`; `diamond_ore` → `can_harvest_diamond`; `stone` → `can_harvest_stone`. Craft rules: `needsTable` → `has_crafting_table`; `needsFurnace` → `has_furnace`. This mapping is **deterministic** and **explicit**; no inference.

---

## 4. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Capability representation | Explicit atoms in state | Clear, auditable, fail-closed |
| Derivation source | Inventory + stations | Deterministic, single source of truth |
| Legality checking | At search expansion time | Prevents illegal transitions from entering search |
| Capability hierarchy | Tool tier ladder (wood < stone < iron < diamond) | Matches Minecraft mechanics |
| Monotonicity | Mostly monotone; handle tool breaks separately | Simplifies planning |

---

## 3. Capability vocabulary

### 3.1 Tool tier capabilities

```ts
// packages/planning/src/capabilities/capability-atoms.ts

export const TOOL_TIER_CAPABILITIES = [
  'can_harvest_wood',      // Always true (hand)
  'can_harvest_stone',     // Requires wooden+ pickaxe
  'can_harvest_iron',      // Requires stone+ pickaxe
  'can_harvest_gold',      // Requires iron+ pickaxe
  'can_harvest_diamond',   // Requires iron+ pickaxe
  'can_harvest_obsidian',  // Requires diamond pickaxe
] as const;

export const TOOL_EFFICIENCY_CAPABILITIES = [
  'efficient_wood_harvest',    // Wooden+ axe
  'efficient_stone_harvest',   // Stone+ pickaxe
  'efficient_dirt_harvest',    // Any shovel
] as const;

export type ToolCapability = 
  | typeof TOOL_TIER_CAPABILITIES[number]
  | typeof TOOL_EFFICIENCY_CAPABILITIES[number];
```

### 3.2 Station capabilities

```ts
export const STATION_CAPABILITIES = [
  'has_crafting_table',    // Can craft 3x3 recipes
  'has_furnace',           // Can smelt
  'has_smithing_table',    // Can upgrade to netherite
  'has_enchanting_table',  // Can enchant
  'has_anvil',             // Can repair/combine
] as const;

export type StationCapability = typeof STATION_CAPABILITIES[number];
```

### 3.3 Combined capability set

```ts
export type Capability = ToolCapability | StationCapability;

export interface CapabilitySet {
  capabilities: Set<Capability>;
  lastDerivedTick: number;
}

export const MAX_CAPABILITIES = 32;  // Bounded for state hashing
```

---

## 4. Capability derivation

### 4.1 Derivation from inventory

```ts
// packages/planning/src/capabilities/capability-derivation.ts

import { Inventory } from '../types';

interface ToolInfo {
  material: 'wood' | 'stone' | 'iron' | 'gold' | 'diamond' | 'netherite';
  type: 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe';
}

const MATERIAL_TIERS: Record<string, number> = {
  wood: 1,
  stone: 2,
  iron: 3,
  gold: 2,  // Gold is fast but low tier
  diamond: 4,
  netherite: 5,
};

function getBestTool(inventory: Inventory, toolType: string): ToolInfo | null {
  const tools = Object.entries(inventory)
    .filter(([name, count]) => name.includes(toolType) && count > 0)
    .map(([name]) => parseToolName(name))
    .filter((t): t is ToolInfo => t !== null);
  
  if (tools.length === 0) return null;
  return tools.reduce((best, tool) => 
    MATERIAL_TIERS[tool.material] > MATERIAL_TIERS[best.material] ? tool : best
  );
}

export function deriveCapabilities(
  inventory: Inventory,
  placedStations: Set<string>
): CapabilitySet {
  const capabilities = new Set<Capability>();
  
  // Always have basic capability
  capabilities.add('can_harvest_wood');
  
  // Tool tier capabilities
  const bestPickaxe = getBestTool(inventory, 'pickaxe');
  if (bestPickaxe) {
    const tier = MATERIAL_TIERS[bestPickaxe.material];
    if (tier >= 1) capabilities.add('can_harvest_stone');
    if (tier >= 2) capabilities.add('can_harvest_iron');
    if (tier >= 3) capabilities.add('can_harvest_gold');
    if (tier >= 3) capabilities.add('can_harvest_diamond');
    if (tier >= 4) capabilities.add('can_harvest_obsidian');
  }
  
  // Efficiency capabilities
  if (getBestTool(inventory, 'axe')) capabilities.add('efficient_wood_harvest');
  if (getBestTool(inventory, 'shovel')) capabilities.add('efficient_dirt_harvest');
  if (bestPickaxe) capabilities.add('efficient_stone_harvest');
  
  // Station capabilities
  if (placedStations.has('crafting_table') || inventory['crafting_table'] > 0) {
    capabilities.add('has_crafting_table');
  }
  if (placedStations.has('furnace') || inventory['furnace'] > 0) {
    capabilities.add('has_furnace');
  }
  // ... other stations
  
  return {
    capabilities,
    lastDerivedTick: Date.now(),
  };
}
```

---

## 5. Operator legality

### 5.1 Operator schema with capabilities

```ts
// packages/planning/src/capabilities/operator-legality.ts

export interface OperatorCapabilityRequirements {
  required: Capability[];
  anyOf?: Capability[];  // Need at least one from this list
}

export interface CraftingOperatorWithLegality {
  id: string;
  name: string;
  preconditions: {
    required_items: Record<string, number>;
    required_stations: string[];
  };
  effects: {
    consumed: Record<string, number>;
    produced: Record<string, number>;
  };
  capabilities: OperatorCapabilityRequirements;
  cost: number;
}

export const OPERATOR_CAPABILITIES: Record<string, OperatorCapabilityRequirements> = {
  'mine_stone': { required: ['can_harvest_stone'] },
  'mine_iron_ore': { required: ['can_harvest_iron'] },
  'mine_diamond_ore': { required: ['can_harvest_diamond'] },
  'mine_obsidian': { required: ['can_harvest_obsidian'] },
  'craft_3x3': { required: ['has_crafting_table'] },
  'smelt': { required: ['has_furnace'] },
};
```

### 5.2 Legality check function

```ts
export function isOperatorLegal(
  operator: CraftingOperatorWithLegality,
  capabilities: CapabilitySet
): { legal: boolean; missingCapabilities: Capability[] } {
  const missing: Capability[] = [];
  
  // Check required capabilities
  for (const cap of operator.capabilities.required) {
    if (!capabilities.capabilities.has(cap)) {
      missing.push(cap);
    }
  }
  
  // Check anyOf capabilities
  if (operator.capabilities.anyOf && operator.capabilities.anyOf.length > 0) {
    const hasAny = operator.capabilities.anyOf.some(cap => 
      capabilities.capabilities.has(cap)
    );
    if (!hasAny) {
      missing.push(...operator.capabilities.anyOf);
    }
  }
  
  return {
    legal: missing.length === 0,
    missingCapabilities: missing,
  };
}
```

### 5.3 Fail-closed gate

```ts
export function legalityGate(
  operator: CraftingOperatorWithLegality,
  state: PlanningState
): { allowed: boolean; reason?: string } {
  const capabilities = deriveCapabilities(state.inventory, state.placedStations);
  const result = isOperatorLegal(operator, capabilities);
  
  if (!result.legal) {
    return {
      allowed: false,
      reason: `Missing capabilities: ${result.missingCapabilities.join(', ')}`,
    };
  }
  
  return { allowed: true };
}
```

---

## 6. Capability acquisition operators

### 6.1 Operators that grant capabilities

```ts
// Define operators that grant capabilities when executed

export const CAPABILITY_GRANTING_OPERATORS: Array<{
  operator: string;
  grants: Capability[];
  condition?: (state: PlanningState) => boolean;
}> = [
  {
    operator: 'craft_stone_pickaxe',
    grants: ['can_harvest_iron'],
  },
  {
    operator: 'craft_iron_pickaxe',
    grants: ['can_harvest_diamond', 'can_harvest_gold'],
  },
  {
    operator: 'craft_diamond_pickaxe',
    grants: ['can_harvest_obsidian'],
  },
  {
    operator: 'place_crafting_table',
    grants: ['has_crafting_table'],
  },
  {
    operator: 'place_furnace',
    grants: ['has_furnace'],
  },
];
```

### 6.2 Subgoal generation

```ts
export function generateCapabilitySubgoals(
  targetOperator: CraftingOperatorWithLegality,
  currentCapabilities: CapabilitySet
): Capability[] {
  const result = isOperatorLegal(targetOperator, currentCapabilities);
  if (result.legal) return [];
  
  // Return missing capabilities as subgoals
  return result.missingCapabilities;
}

export function findOperatorToAcquireCapability(
  capability: Capability
): string | null {
  const granter = CAPABILITY_GRANTING_OPERATORS.find(
    g => g.grants.includes(capability)
  );
  return granter?.operator ?? null;
}
```

---

## 7. Sterling integration

### 7.1 Extended domain state

```yaml
# In Sterling domain definition
DomainState:
  type: object
  properties:
    inventory:
      $ref: '#/components/schemas/InventorySignature'
    placed_stations:
      type: array
      items:
        type: string
    capabilities:
      type: array
      items:
        type: string
        enum: [can_harvest_wood, can_harvest_stone, ...]
```

### 7.2 Operator schema extension

```yaml
# In Sterling operator definition
Operator:
  type: object
  properties:
    id:
      type: string
    preconditions:
      # ... existing
    effects:
      # ... existing
    required_capabilities:
      type: array
      items:
        type: string
    granted_capabilities:
      type: array
      items:
        type: string
```

### 7.3 Search expansion with legality

```python
# In Sterling domain handler (Python)
def expand_state(state, operators):
    valid_operators = []
    for op in operators:
        if is_legal(op, state['capabilities']):
            valid_operators.append(op)
        else:
            # Log rejection for audit
            log_illegal_rejection(op, state['capabilities'])
    return valid_operators
```

---

## 8. Implementation construction constraints (pivots)

These address implementation-shaped footguns where the plan is correct conceptually but the default code path will violate intent.

### Pivot 1: Capability derivation must be deterministic and bounded

**Problem:** If derivation uses `Date.now()` or non-deterministic ordering, same inventory yields different capability sets across runs. Tests flake; replay fails.

**Pivot:** Derivation uses **only** inventory (sorted by name) and placed stations (sorted). No wall-clock. Capability set size bounded by `MAX_CAPABILITIES`.

```ts
// Deterministic: sort inventory keys before deriving
function deriveCapabilities(inventory: Record<string, number>, placedStations: Set<string>): CapabilitySet {
  const sortedInv = Object.keys(inventory).sort();
  // ... derive from sorted keys only
  return { capabilities: new Set(caps.slice(0, MAX_CAPABILITIES)), lastDerivedTick: 0 };
}
```

**Acceptance check:** Same inventory + stations → identical capability set (byte-for-byte) across runs.

---

### Pivot 2: Fail-closed, not fail-warn — unknown capability = illegal

**Problem:** If a rule has no `requiredCapabilities` or an unknown capability string, treating it as "legal" allows diamond mining with wooden pickaxe.

**Pivot:** Rules **without** `requiredCapabilities` are treated as requiring **no extra capabilities** only if they are non-mining (craft, smelt). Mining rules **must** have explicit capability tags. Unknown capability atom → rule is **illegal**.

```ts
function isRuleLegal(rule: MinecraftCraftingRule, caps: CapabilitySet): boolean {
  if (!rule.requiredCapabilities || rule.requiredCapabilities.length === 0) {
    if (rule.actionType === 'mine') return false;  // Mining MUST have explicit capabilities
    return true;
  }
  for (const cap of rule.requiredCapabilities) {
    if (!KNOWN_CAPABILITIES.has(cap)) return false;  // Unknown = illegal
    if (!caps.capabilities.has(cap)) return false;
  }
  return true;
}
```

**Acceptance check:** Rule with `requiredCapabilities: ['can_harvest_diamond']` and inventory lacking iron+ pickaxe is rejected. Rule with typo `can_harvst_diamond` is rejected.

---

### Pivot 3: Rule filtering must occur before Sterling, not after

**Problem:** Sending all rules to Sterling and filtering the *plan* after solve wastes search; Sterling may explore illegal branches.

**Pivot:** Filter rules **before** calling `sterlingService.solve()`. Sterling never sees illegal rules.

```ts
const legalRules = rules.filter(r => isRuleLegal(r, capabilities));
if (legalRules.length === 0) return makeCapabilitySubgoalResult(rules, capabilities);
const result = await this.sterlingService.solve(this.sterlingDomain, { ...opts, rules: legalRules });
```

**Acceptance check:** Sterling receives zero rules with `can_harvest_diamond` when bot has only wooden pickaxe.

---

### Pivot 4: Post-solve validation — defense in depth

**Problem:** Sterling could have a bug; or rules could be mutated. Plan could contain illegal step.

**Pivot:** After receiving plan from Sterling, validate each step against current capabilities. If any step is illegal, reject entire plan and return capability subgoals.

```ts
const planLegal = result.steps.every(step => isStepLegal(step, capabilities));
if (!planLegal) {
  return { solved: false, steps: [], error: 'Plan contained illegal step', capabilitySubgoals: [...] };
}
```

**Acceptance check:** Adversarial Sterling response with illegal step is rejected; no execution of illegal step.

---

### Pivot 5: Capability mismatch — schema validation

**Problem:** Rule claims to produce iron_ingot but has `requiredCapabilities: []`. Schema allows inconsistency.

**Pivot:** Add semantic validation: mining rules for ore types **must** have matching harvest capability. CI test rejects rules with capability/effect mismatch.

```ts
// In rule validation (Rig A extends): mining iron_ore requires can_harvest_iron
function validateRuleCapabilityConsistency(rule: MinecraftCraftingRule): ValidationError[] {
  if (rule.actionType === 'mine') {
    const oreType = extractOreFromProduces(rule.produces);
    const required = ORE_TO_CAPABILITY[oreType];
    if (required && (!rule.requiredCapabilities || !rule.requiredCapabilities.includes(required))) {
      return [{ code: 'CAPABILITY_MISMATCH', message: `Mining ${oreType} requires ${required}` }];
    }
  }
  return [];
}
```

**Acceptance check:** Rule that produces diamond but has no `can_harvest_diamond` fails validation in CI.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1. Deterministic derivation | Same inventory + stations → identical capability set. |
| 2. Fail-closed | Unknown capability = illegal; mining without explicit caps = illegal. |
| 3. Pre-filter rules | Sterling receives only legal rules. |
| 4. Post-solve validation | Illegal step in plan → plan rejected. |
| 5. Schema consistency | Mining rule without matching capability fails validation. |

---

## 9. DO and DO NOT

**DO:**
- **DO** derive capabilities deterministically from inventory (sorted keys) + stations.
- **DO** check legality at rule-filter time **before** Sterling (fail-closed).
- **DO** validate plan steps after Sterling returns (defense in depth).
- **DO** treat capability acquisition as first-class subgoals when no legal rules.
- **DO** log legality rejections for audit trail.
- **DO** bound capability set size (MAX_CAPABILITIES).
- **DO** tag mining rules with explicit `requiredCapabilities`.

**DO NOT:**
- **DO NOT** infer capabilities ad hoc at different points in code.
- **DO NOT** allow illegal operators through with warnings (fail-closed, not fail-warn).
- **DO NOT** send unfiltered rules to Sterling and filter only the plan.
- **DO NOT** allow mining rules without explicit capability tags.
- **DO NOT** treat unknown capability atoms as "no requirement."

---

## 10. Determinism and boundedness rules (non-negotiable)

- **Capability derivation:** Use sorted inventory keys only; no `Date.now()` in derivation.
- **Rule capability tags:** Mining rules MUST have explicit `requiredCapabilities`; no implicit "any tool."
- **Bounded capability set:** `MAX_CAPABILITIES = 32`; derivation never exceeds.
- **Known capability atoms:** Only strings from `KNOWN_CAPABILITIES` set are valid; unknown = illegal.

---

## 11. Certification tests

### 11.1 Illegal operator rejection

```ts
describe('Capability gating', () => {
  it('rejects mine_diamond_ore without iron+ pickaxe', () => {
    const state = createState({ inventory: { wooden_pickaxe: 1 } });
    const operator = getOperator('mine_diamond_ore');
    const result = legalityGate(operator, state);
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('can_harvest_diamond');
  });
  
  it('allows mine_diamond_ore with iron pickaxe', () => {
    const state = createState({ inventory: { iron_pickaxe: 1 } });
    const operator = getOperator('mine_diamond_ore');
    const result = legalityGate(operator, state);
    
    expect(result.allowed).toBe(true);
  });
});
```

### 11.2 Subgoal generation

```ts
describe('Capability subgoals', () => {
  it('generates capability acquisition subgoals', () => {
    const state = createState({ inventory: {} });
    const operator = getOperator('mine_iron_ore');
    const subgoals = generateCapabilitySubgoals(operator, state.capabilities);
    
    expect(subgoals).toContain('can_harvest_iron');
    
    const acquiringOp = findOperatorToAcquireCapability('can_harvest_iron');
    expect(acquiringOp).toBe('craft_stone_pickaxe');
  });
});
```

### 11.3 Adversarial rejection

```ts
describe('Adversarial operator rejection', () => {
  it('rejects adversarial operators claiming illegal capabilities', () => {
    const adversarialOperator = {
      id: 'fake_mine_diamond',
      name: 'Mine diamond (fake)',
      capabilities: { required: [] },  // Claims no capability needed
      // ... but effects include diamond
    };
    
    // Validation should catch this
    const validation = validateOperatorCapabilities(adversarialOperator);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('capability mismatch');
  });
});
```

---

## 12. Definition of "done" for boundary milestone

### Core boundary criteria

- **No illegal operators:** Sterling receives only legal rules; output plans contain no illegal steps.
- **Fail-closed:** Unknown capability = illegal; mining without explicit caps = illegal.
- **Pre-filter + post-validate:** Rules filtered before Sterling; plan validated after return.
- **Subgoal reasoning:** When no legal rules exist, return `capabilitySubgoals` for acquisition.
- **Determinism:** Same inventory + stations → identical capability set.
- **Schema consistency:** Mining rules without matching `requiredCapabilities` fail validation.

### Implementation construction acceptance checks (5 pivots)

| # | Pivot | Acceptance check |
|---|-------|------------------|
| 1 | Deterministic derivation | Same inventory + stations → identical capability set. |
| 2 | Fail-closed | Unknown capability = illegal; mining without caps = illegal. |
| 3 | Pre-filter | Sterling receives only legal rules. |
| 4 | Post-solve validation | Illegal step in plan → plan rejected. |
| 5 | Schema consistency | Mining rule without matching capability fails validation. |

**All 5 acceptance checks must pass before the boundary milestone is considered "done."**

---

## 13. Cross-references

- **Implementation plan**: `RIG_B_CAPABILITY_GATING_PLAN.md`
- **Rig A**: Foundation for operator semantics (`RIG_A_CERTIFICATION_PLAN.md`)
- **Capability primitives**: `capability-primitives.md` (P2)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig B section)
