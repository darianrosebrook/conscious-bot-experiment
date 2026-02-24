# Leaf Contract Alignment Check Runbook

## Purpose
Verify that the planning-side leaf contracts (`CONTRACTS` in `leaf-arg-contracts.ts`) and the MC-side action contracts (`ACTION_CONTRACTS` in `action-contract-registry.ts`) agree on parameter normalization, aliases, required keys, and leaf name resolution.

## Required Env

```bash
# Tests run in Node.js — no runtime services needed
NODE_ENV=test
```

No running services required. These are pure unit tests that import both contract registries and compare them.

## Why Contract Alignment Matters

The system has two independent contract registries that must agree:

```
Planning (port 3002)                    MC Interface (port 3005)
┌──────────────────────┐                ┌──────────────────────┐
│ CONTRACTS            │                │ ACTION_CONTRACTS     │
│ (leaf-arg-contracts) │   must agree   │ (action-contract-    │
│                      │ ◄────────────► │  registry)           │
│ - requiredKeys       │                │ - requiredKeys       │
│ - optionalKeys       │                │ - aliases            │
│ - defaults           │                │ - stripKeys          │
│ - KNOWN_LEAVES set   │                │ - dispatchMode       │
└──────────────────────┘                └──────────────────────┘
```

If they disagree:
- Planning sends `blockType` but MC expects `item` → leaf receives `undefined`
- Planning omits a required key that MC enforces → fail-closed rejection
- Planning sends a leaf name MC doesn't recognize → dispatch failure

## Running the Tests

```bash
cd packages/planning
npm test -- contract-alignment.test.ts
```

Or with verbose output:

```bash
cd packages/planning
npm test -- contract-alignment.test.ts --verbose
```

## What the Tests Check

### 1. Alias Agreement: collect_items normalizes `item` → `itemName`

Both planning and MC must apply the same alias for `collect_items`:

```
Planning: CONTRACTS.collect_items normalizes { item: 'wheat' } → { itemName: 'wheat' }
MC:       ACTION_CONTRACTS.collect_items.aliases = { item: 'itemName' }
```

The test sends `{ item: 'wheat' }` through both normalizers and verifies the output matches.

### 2. Alias Agreement: smelt normalizes `item` → `input`

Both sides must agree that `smelt` aliases `item` to `input`:

```
Planning: CONTRACTS.smelt normalizes { item: 'iron_ore' } → { input: 'iron_ore' }
MC:       ACTION_CONTRACTS.smelt.aliases = { item: 'input' }
```

### 3. KNOWN_LEAVES Coverage

Every leaf in `KNOWN_LEAVES` that has a corresponding action type must have an `ACTION_CONTRACTS` entry on the MC side. This catches cases where a new leaf is added to planning but forgotten on the MC side.

### 4. Idempotency

Normalization must be idempotent: `normalize(normalize(x)) === normalize(x)`. This prevents cascading alias application (e.g., `item` → `input` → `something_else`).

## Diagnosing Failures

### Test: "both sides normalize item → itemName" FAILS

**Symptom**: Planning normalizes to `{ itemName: 'wheat' }` but MC normalizes to `{ item: 'wheat' }` (or vice versa).

**Cause**: Alias mismatch between `CONTRACTS` and `ACTION_CONTRACTS`.

**Diagnosis**:
```bash
# Check planning-side contract
grep -A10 "collect_items" packages/planning/src/modules/leaf-arg-contracts.ts

# Check MC-side contract
grep -A10 "collect_items" packages/minecraft-interface/src/action-contract-registry.ts
```

**Fix**: Ensure both sides have the same alias mapping. The MC side (`ACTION_CONTRACTS`) is the source of truth for normalization — update the planning side to match.

---

### Test: "every leaf in KNOWN_LEAVES has an ACTION_CONTRACTS entry" FAILS

**Symptom**: Test lists leaves that exist in `KNOWN_LEAVES` but have no `ACTION_CONTRACTS` entry.

**Cause**: New leaf added to planning but not registered on MC side.

**Diagnosis**:
```bash
# List KNOWN_LEAVES
grep -A200 "CONTRACTS\b" packages/planning/src/modules/leaf-arg-contracts.ts | grep -oP "^\s+'(\w+)'" | head -40

# List ACTION_CONTRACTS keys
grep -oE "^\s+\w+:" packages/minecraft-interface/src/action-contract-registry.ts | head -40

# Find the diff
diff <(grep -oE "^\s+'(\w+)'" packages/planning/src/modules/leaf-arg-contracts.ts | sort) \
     <(grep -oE "^\s+\w+:" packages/minecraft-interface/src/action-contract-registry.ts | sort)
```

**Fix**: Add the missing leaf to `ACTION_CONTRACTS` in `action-contract-registry.ts`. See [leaf-creation-runbook.md](./leaf-creation-runbook.md) Phase 1.3.

---

### Test: Idempotency check FAILS

**Symptom**: `normalize(normalize(x))` produces different output than `normalize(x)`.

**Cause**: Alias chain — one alias's target is another alias's source.

**Example of broken alias chain**:
```typescript
// BAD: 'item' → 'input', 'input' → 'recipe' would cascade
aliases: {
  item: 'input',    // First pass: item → input
  input: 'recipe',  // Second pass: input → recipe (not idempotent!)
}
```

**Fix**: Aliases must be one level deep. Never make an alias target also be an alias source.

---

### Test: requiredKeys enforcement FAILS

**Symptom**: MC side rejects a request with missing keys, but planning side didn't catch it.

**Cause**: `requiredKeys` in `ACTION_CONTRACTS` has keys that planning's `CONTRACTS` doesn't enforce.

**Diagnosis**:
```bash
# Check MC required keys for an action
grep -A5 "craft_recipe" packages/minecraft-interface/src/action-contract-registry.ts | grep requiredKeys

# Check planning required keys
grep -A5 "craft_recipe" packages/planning/src/modules/leaf-arg-contracts.ts | grep requiredKeys
```

**Fix**: Add the required key to planning's `CONTRACTS.requiredKeys` so it fails early on the planning side rather than at dispatch time.

## Normalization Semantics Reference

These rules govern how `normalizeActionParams` works on the MC side:

| Rule | Behavior |
|------|----------|
| **Null-as-absent** | `null` and `undefined` are treated identically as "not provided" |
| **Alias source cleanup** | Non-canonical alias source keys are always deleted from output |
| **Alias conflict resolution** | If both source and target keys are set, target wins, source is deleted, warning emitted |
| **requiredKeys enforcement** | Missing required keys cause immediate fail-closed rejection |
| **Idempotent** | `normalize(normalize(x)) === normalize(x)` |
| **Defaults applied last** | Defaults fill in after aliases resolve |

## Key Implementation Files

| Component | File | Key Functions |
|-----------|------|---------------|
| Planning contracts | `packages/planning/src/modules/leaf-arg-contracts.ts` | `CONTRACTS`, `KNOWN_LEAVES`, `validateLeafArgs` |
| MC contracts | `packages/minecraft-interface/src/action-contract-registry.ts` | `ACTION_CONTRACTS`, `normalizeActionParams`, `resolveLeafName` |
| Alignment tests | `packages/planning/src/modules/__tests__/contract-alignment.test.ts` | 5 test cases |
| Leaf routing | `packages/planning/src/sterling/leaf-routing.ts` | `actionTypeToLeaf`, `actionTypeToLeafExtended` |

## Copy-Paste Commands

### Run contract alignment tests
```bash
cd packages/planning && npm test -- contract-alignment.test.ts --verbose
```

### List all KNOWN_LEAVES
```bash
node -e "const c = require('./packages/planning/src/modules/leaf-arg-contracts'); console.log([...c.KNOWN_LEAVES].sort().join('\n'))"
```

### List all ACTION_CONTRACTS keys
```bash
node -e "const c = require('./packages/minecraft-interface/src/action-contract-registry'); console.log(Object.keys(c.ACTION_CONTRACTS).sort().join('\n'))"
```

### Test normalization for a specific action
```bash
node -e "
const { normalizeActionParams } = require('./packages/minecraft-interface/src/action-contract-registry');
const result = normalizeActionParams('craft', { item: 'stick', quantity: 4 });
console.log(JSON.stringify(result, null, 2));
"
```

### Check idempotency manually
```bash
node -e "
const { normalizeActionParams } = require('./packages/minecraft-interface/src/action-contract-registry');
const first = normalizeActionParams('collect_items', { item: 'wheat' });
const second = normalizeActionParams('collect_items', first.params);
console.log('Idempotent:', JSON.stringify(first.params) === JSON.stringify(second.params));
"
```

---

## Related Runbooks

- **[leaf-creation-runbook.md](./leaf-creation-runbook.md)**: Phase 1 covers contract registration (where mismatches originate)
- **[debugging-leaf-dispatch-runbook.md](./debugging-leaf-dispatch-runbook.md)**: Stage 3 covers validateLeafArgs failures
- **[sterling-smoke-runbook.md](./sterling-smoke-runbook.md)**: Smoke test exercises the full normalization path

---

*Last updated: 2026-02-14*
*Source: `packages/planning/src/modules/__tests__/contract-alignment.test.ts`; `docs/leaf-execution-pipeline.md` → Action Contract Registry section*
