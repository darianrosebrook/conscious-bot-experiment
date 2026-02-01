# Rig Documentation Enrichment Guide

**Purpose**: This document provides a systematic template for enriching rig documentation to make incorrect implementation nearly impossible.

**Gold standard**: Rig I-ext (P21) — use as reference for all sections below.

**Status**: Rig B has been upgraded; use as second example.

---

## Required enrichment for all rigs

Every rig PLAN document must have these sections with concrete details:

### 1. Target invariant (existing, refine if needed)

**What**: The critical boundary this rig proves; the one-sentence invariant.

**Quality check**:
- ✅ States what must be true, not just what the rig does
- ✅ Fail condition is clear (what breaks the boundary)
- ✅ References the primitive being proven

**Example from Rig B**:
> "Sterling never proposes an illegal operator; legality is fail-closed."

### 2. Formal signature (existing, ensure complete)

**What**: The primitive's formal contract from Sterling's capability primitive spec.

**Quality check**:
- ✅ Matches Sterling P0X spec exactly
- ✅ Lists state requirements, operator requirements, trace requirements
- ✅ References determinism/boundedness/audit gates

### 3. Current code anchors (NEW - critical)

**What**: Exact file paths, line numbers, and code snippets showing where changes must be made.

**Required subsections**:
- 3.1 What exists today (file + line range + current code)
- 3.2 What must be added (file + insertion point + new code)
- 3.3 What must be changed (file + line range + before/after code)

**Quality check**:
- ✅ Every "What to implement" item maps to specific file path
- ✅ Line numbers or function names provided (not just "somewhere in X")
- ✅ Code snippets show exact interfaces/types to extend
- ✅ No vague "add capability logic" — show the exact function signature

**Example from Rig B**:
```markdown
### 3.1 Minecraft crafting rules — no capability today

| Location | Line(s) | What |
|----------|---------|------|
| `packages/planning/src/sterling/minecraft-crafting-rules.ts` | 59–137 | `buildCraftingRules()` builds rules; no capability fields. |
| `packages/planning/src/sterling/minecraft-crafting-types.ts` | 31–48 | `MinecraftCraftingRule` interface: Missing `requiredCapabilities`. |

**Exact code to extend:**

\`\`\`ts
// ADD to packages/planning/src/sterling/minecraft-crafting-types.ts
export interface MinecraftCraftingRule {
  // ... existing fields ...
  /** Rig B: capability atoms required for this rule to be legal. Fail-closed: missing = illegal. */
  requiredCapabilities?: string[];
}
\`\`\`
```

### 4. conscious-bot vs Sterling split (NEW - blocking)

**What**: Explicit table showing what must be implemented where.

**Required table**:

| Area | What conscious-bot must implement | What Sterling must implement | Location |
|------|----------------------------------|------------------------------|----------|
| State extension | ... | ... | file paths |
| Operator changes | ... | ... | file paths |
| Rule validation | ... | ... | file paths |
| Search changes | ... | ... | file paths |

**Quality check**:
- ✅ Every implementation item assigned to conscious-bot OR Sterling (not both)
- ✅ "No Sterling changes" explicitly stated if true
- ✅ Contract between projects defined (what conscious-bot sends, what Sterling returns)
- ✅ File paths provided for both projects

**Example from Rig B**:
```markdown
### Implement in conscious-bot (the rig)

| Area | What conscious-bot must implement | Location |
|------|-----------------------------------|----------|
| **Capability derivation** | Derive from inventory + stations; deterministic, bounded. | New: `packages/planning/src/capabilities/capability-derivation.ts` |
| **Rule filtering** | Filter rules before Sterling; fail-closed. | Extend: `packages/planning/src/sterling/minecraft-crafting-solver.ts` |

### Implement in Sterling (Python)

| Area | Sterling role | Required for Rig B? |
|------|----------------|---------------------|
| **Capability state** | None. Sterling receives rules; does not model capabilities. | **No.** |
| **Search** | Unchanged. | **No change.** |

**Contract**: conscious-bot sends only legal rules; Sterling returns plan; conscious-bot validates plan steps.
```

### 5. What to implement / change (existing, make concrete)

**What**: Detailed breakdown of work with file paths and function signatures.

**Required detail level**:
- File path for every component
- Function/class names (not just "add logic")
- Determinism requirements called out explicitly
- Boundedness constraints stated
- Code location specified (new file vs extend existing)

**Quality check**:
- ✅ Every subsection has "**Location**:" specified
- ✅ "**What must be implemented**:" is concrete (function signature, not abstract)
- ✅ "**Determinism requirements**:" listed if applicable
- ✅ "**Code location**:" New file / Extend file X / Modify function Y

**Example structure**:
```markdown
### 5.1 Component name

**Location**: `packages/X/src/Y/Z.ts`

**What must be implemented:**
- Specific function: `deriveCapabilities(inventory, stations): CapabilitySet`
- Specific interface: `CapabilitySet { capabilities: Set<Capability>, ... }`

**Determinism requirements:**
- Uses sorted keys only
- No Date.now()
- Bounded by MAX_X

**Code location:** New file `packages/X/src/Y/Z.ts`
```

### 6. Implementation pivots (NEW - critical for correctness)

**What**: Specific footguns and how to avoid them, with code examples.

**Required format** (from Rig I-ext):
Each pivot must have:
- **Problem**: What will break if implemented naively
- **Pivot**: The specific constraint/rule that prevents the break
- **Code example**: Showing correct implementation
- **Acceptance check**: How to verify it's done correctly

**Minimum 3-5 pivots per rig** covering:
- Determinism (time/ordering)
- Boundedness (caps/limits)
- Fail-closed vs fail-warn
- Pre-filter vs post-filter
- Schema consistency

**Quality check**:
- ✅ Each pivot has all 4 parts (Problem, Pivot, Code, Acceptance)
- ✅ Code examples show actual TypeScript/Python (not pseudocode)
- ✅ Acceptance checks are testable (not "works correctly")

**Example from Rig B**:
```markdown
### Pivot 1: Capability derivation must be deterministic and bounded

**Problem:** If derivation uses `Date.now()` or non-deterministic ordering, same inventory yields different capability sets. Tests flake; replay fails.

**Pivot:** Derivation uses **only** inventory (sorted by name) + stations (sorted). No wall-clock. Bounded by `MAX_CAPABILITIES`.

\`\`\`ts
function deriveCapabilities(inventory: Record<string, number>, stations: Set<string>): CapabilitySet {
  const sortedInv = Object.keys(inventory).sort();
  // ... derive from sorted keys only
  return { capabilities: new Set(caps.slice(0, MAX_CAPABILITIES)), lastDerivedTick: 0 };
}
\`\`\`

**Acceptance check:** Same inventory + stations → identical capability set (byte-for-byte) across runs.
```

### 7. Transfer surfaces (NEW - domain-agnosticism proof)

**What**: At least 2-3 concrete non-Minecraft surfaces that prove the same primitive.

**Required for each surface**:
- Surface name and domain
- State representation (what the analog is)
- Operators (what actions map to)
- Capability gating / temporal / hierarchy (rig-specific semantic)
- What must be proven (same gates as Minecraft rig)

**Quality check**:
- ✅ At least 2 distinct surfaces listed
- ✅ Each surface maps rig semantics to different domain
- ✅ "Prove:" section states what certification gates must pass

**Example from Rig B**:
```markdown
### 7.1 Enterprise workflow permissions

**Surface**: Document approval workflow with permission levels

- **State**: User capabilities (can_view, can_edit, can_approve, can_publish)
- **Operators**: submit_draft, request_review, approve_document, publish_document
- **Capability gating**: "approve_document" requires can_approve
- **Acquisition**: "request_approval_rights" grants can_approve
- **Fail-closed**: User without can_edit cannot propose edit operations

**Prove:** Same legality gates; same fail-closed semantics; same subgoal generation
```

### 8. Concrete certification tests (NEW - make testable)

**What**: Actual test code (not just descriptions) for each certification gate.

**Required tests** (minimum):
- Test 1: Core boundary proof (the main invariant)
- Test 2: Determinism (same input → same output)
- Test 3: Boundedness (caps enforced)
- Test 4: Adversarial / negative (illegal inputs rejected)
- Test 5: Sterling integration (end-to-end)

**Quality check**:
- ✅ Tests are actual TypeScript code (not pseudocode or descriptions)
- ✅ Each test has `describe` + `it` + `expect` assertions
- ✅ Tests cover both positive and negative cases
- ✅ At least one end-to-end Sterling integration test

**Example from Rig B**:
```ts
describe('Capability gating - illegal rejection', () => {
  it('rejects mine_diamond_ore without iron+ pickaxe', () => {
    const inventory = { wooden_pickaxe: 1 };
    const capabilities = deriveCapabilities(inventory, new Set());
    const diamondRule = getRuleByAction('mine_diamond_ore');

    expect(isRuleLegal(diamondRule, capabilities)).toBe(false);
  });
});
```

### 9. Definition of done (existing, make concrete)

**What**: Upgrade from abstract criteria to testable acceptance checks.

**Required subsections**:
- 9.1 Core boundary criteria (what must be true)
- 9.2 Concrete certification tests (references to test code above)
- 9.3 Transfer surface validation (which surfaces tested)
- 9.4 Implementation pivot acceptance (checklist of all pivots)

**Quality check**:
- ✅ Every criterion is testable (not "works well")
- ✅ References specific test code from section 8
- ✅ Pivot acceptance checklist includes all pivots from section 6
- ✅ Transfer surface requirement stated explicitly

---

## Enrichment priority by track

### Track 1 (Certification - A, B, C)

**Priority**: Highest - these must be implementation-ready FIRST

**Status**:
- ✅ Rig A: Has baseline; needs enrichment pass
- ✅ Rig B: UPGRADED (use as template)
- ⚠️ Rig C: Needs full enrichment

**Next action**: Enrich Rig A and C using Rig B as template.

### Track 2 (Belief + Perception - I, I-ext, J)

**Priority**: High - needed for observation spam fix

**Status**:
- ✅ Rig I-ext: GOLD STANDARD (fully detailed)
- ⚠️ Rig I: Needs enrichment (use I-ext as template)
- ⚠️ Rig J: Needs enrichment

**Next action**: Enrich Rig I and J using I-ext as template.

### Track 3 (Widening - D, E, F, G, H, K)

**Priority**: Medium - can proceed after Track 1-2

**Status**:
- ⚠️ All need enrichment

**Next action**: Defer until Track 1-2 complete; then enrich systematically.

---

## Enrichment workflow

For each rig to be enriched:

### Step 1: Prepare
- [ ] Read the existing PLAN document
- [ ] Read the corresponding Sterling primitive spec (P0X)
- [ ] Read Rig I-ext or Rig B as template
- [ ] Identify which track (determines priority)

### Step 2: Inventory gaps
- [ ] Check for "conscious-bot vs Sterling split" section
- [ ] Check for concrete code anchors (file paths + line numbers)
- [ ] Check for implementation pivots with code examples
- [ ] Check for transfer surfaces (at least 2)
- [ ] Check for concrete test code (not just descriptions)

### Step 3: Enrich missing sections
- [ ] Add section 3 (Current code anchors) if missing
- [ ] Add section 4 (conscious-bot vs Sterling split) if missing
- [ ] Make section 5 (What to implement) concrete with file paths
- [ ] Add section 6 (Implementation pivots) with 3-5 pivots
- [ ] Add section 7 (Transfer surfaces) with 2-3 surfaces
- [ ] Add section 8 (Concrete certification tests) with test code
- [ ] Upgrade section 9 (Definition of done) to reference concrete tests

### Step 4: Validate enrichment
- [ ] Every "What to implement" item has file path
- [ ] Every component has function/interface signatures
- [ ] At least 3 implementation pivots with acceptance checks
- [ ] At least 2 transfer surfaces defined
- [ ] At least 5 concrete test code examples
- [ ] "Definition of done" references all pivots and tests

### Step 5: Cross-reference
- [ ] Update `RIG_DOCUMENTATION_INDEX.md` to mark rig as "enriched"
- [ ] Ensure companion APPROACH document aligns (or create if missing)
- [ ] Link to Sterling primitive spec in cross-references

---

## Quality checklist for enriched docs

An enriched rig document must pass this checklist:

### Structural completeness
- [ ] Has all 9+ required sections
- [ ] Each section has required subsections
- [ ] Cross-references point to existing docs

### Concreteness (no vague instructions)
- [ ] Every file path is absolute and specific
- [ ] Every function has signature shown
- [ ] Every "add logic" is replaced with "implement function X()"
- [ ] Every interface/type has fields listed

### Code examples
- [ ] At least 3 TypeScript code blocks showing exact implementation
- [ ] At least 5 test code blocks with describe/it/expect
- [ ] Pivot examples show correct vs incorrect code

### Domain-agnosticism
- [ ] At least 2 transfer surfaces defined
- [ ] Each surface maps rig semantics to different domain
- [ ] Transfer surfaces are non-Minecraft

### Testability
- [ ] Every acceptance check is verifiable (not "works")
- [ ] Tests reference specific functions/files
- [ ] Definition of done lists concrete pass/fail criteria

### Sterling alignment
- [ ] Matches Sterling P0X spec formal signature
- [ ] conscious-bot vs Sterling split is explicit
- [ ] Contract between projects is defined

---

## Example rig upgrade: Before and after

### Before (abstract, unimplementable)

```markdown
## 5. What to implement

- Add capability state
- Filter rules by legality
- Generate subgoals when needed
```

### After (concrete, implementable)

```markdown
## 5. What to implement / change

### 5.1 Capability state representation

**Location**: `packages/planning/src/capabilities/capability-derivation.ts`

**What must be implemented:**
- Function: `deriveCapabilities(inventory: Inventory, stations: Set<string>): CapabilitySet`
- Type: `CapabilitySet { capabilities: Set<Capability>, lastDerivedTick: number }`
- Atoms: Enum of capability strings (can_harvest_wood, can_harvest_stone, etc.)

**Determinism requirements:**
- Derivation uses **only** sorted inventory keys + sorted stations
- No `Date.now()`
- Bounded by `MAX_CAPABILITIES = 32`

**Code location:** New file `packages/planning/src/capabilities/capability-derivation.ts`

**Code example:**
\`\`\`ts
export function deriveCapabilities(
  inventory: Inventory,
  stations: Set<string>
): CapabilitySet {
  const capabilities = new Set<Capability>();
  const sortedInv = Object.keys(inventory).sort();

  // Always have basic
  capabilities.add('can_harvest_wood');

  // Derive tool tiers...

  return {
    capabilities,
    lastDerivedTick: 0,  // No Date.now()
  };
}
\`\`\`
```

---

## Template for new sections

### Section 3 template: Current code anchors

```markdown
## 3. Current code anchors (what exists today)

### 3.1 [Component name] — [current state]

| Location | Line(s) | What |
|----------|---------|------|
| `path/to/file.ts` | 10-50 | Description of current code |

**Exact code to extend:**

\`\`\`ts
// Current interface/function
// Show what exists today
\`\`\`

**What must be added:**

\`\`\`ts
// New field/method to add
\`\`\`
```

### Section 4 template: conscious-bot vs Sterling split

```markdown
## 4. What must be implemented in conscious-bot vs Sterling

### Implement in conscious-bot (the rig)

| Area | What conscious-bot must implement | Location |
|------|-----------------------------------|----------|
| **Component 1** | Specific function/module | `path/to/file.ts` |
| **Component 2** | Specific validation/derivation | `path/to/file.ts` |

### Implement in Sterling (Python)

| Area | Sterling role | Required for Rig X? |
|------|----------------|---------------------|
| **State** | Does Sterling need state changes? | Yes/No + rationale |
| **Search** | Does Sterling need search changes? | Yes/No + rationale |

**Contract**: [Define what conscious-bot sends and what Sterling returns]
```

### Section 6 template: Implementation pivots

```markdown
## 6. Implementation construction constraints (pivots)

### Pivot 1: [Constraint name]

**Problem:** [What breaks if implemented naively]

**Pivot:** [The specific rule/constraint that prevents the break]

\`\`\`ts
// Code example showing correct implementation
\`\`\`

**Acceptance check:** [Testable criterion]

---

### Pivot 2: [Next constraint]

...
```

### Section 7 template: Transfer surfaces

```markdown
## 7. Transfer surfaces (domain-agnosticism proof)

### 7.1 [Surface name]

**Surface**: [Brief description of domain]

- **State**: [What state looks like in this domain]
- **Operators**: [What actions map to]
- **[Rig-specific semantic]**: [How the rig's primitive applies]
- **[Key requirement]**: [Main constraint/gate]

**Prove:** [What certification gates must pass on this surface]

---

### 7.2 [Second surface]

...
```

### Section 8 template: Concrete certification tests

```markdown
## 8. Concrete certification tests

### 8.1 [Test name - core boundary]

\`\`\`ts
describe('[Rig name] - [capability]', () => {
  it('[specific test case]', () => {
    // Arrange
    const state = createState({ ... });

    // Act
    const result = functionUnderTest(state);

    // Assert
    expect(result).toBe(expected);
  });
});
\`\`\`

### 8.2 [Test name - determinism]

...
```

---

## Next steps for documentation work

1. **Immediate (Track 1)**:
   - Enrich Rig A using Rig B as template
   - Enrich Rig C using Rig B as template
   - Validate all Track 1 rigs pass quality checklist

2. **Near-term (Track 2)**:
   - Enrich Rig I using Rig I-ext as template
   - Enrich Rig J using Rig I-ext as template
   - Validate all Track 2 rigs pass quality checklist

3. **Deferred (Track 3)**:
   - Enrich Rigs D, E, F, G, H, K systematically
   - Use Rig B or I-ext as templates based on complexity
   - Validate each before moving to next

4. **Sterling coordination**:
   - For each enriched rig, verify Sterling primitive spec alignment
   - Update Sterling primitive specs if conscious-bot rig reveals gaps
   - Ensure contract definitions are bidirectional

---

## Maintaining enrichment quality

As rigs evolve:

1. **When adding new sections**: Use templates above
2. **When changing implementation**: Update code anchors (section 3)
3. **When adding pivots**: Add to section 6 with all 4 parts
4. **When finding new footguns**: Document as new pivot
5. **When tests change**: Update section 8 test code

**Rule**: If a section becomes outdated, the rig is no longer "enriched" until updated.

---

## Summary

**What enrichment means**:
- Concrete file paths and function signatures (not abstract "add logic")
- Explicit conscious-bot vs Sterling split
- At least 3 implementation pivots with code examples
- At least 2 transfer surfaces
- At least 5 concrete test code blocks
- Testable definition of done

**Why it matters**:
- Makes incorrect implementation nearly impossible
- Enables parallel development (Sterling and conscious-bot teams)
- Provides audit trail for why decisions were made
- Proves domain-agnosticism through transfer surfaces

**Gold standards**:
- Rig I-ext (P21) - most comprehensive
- Rig B (P2) - recently upgraded, good template

**Status tracking**: Mark rigs as "enriched" in `RIG_DOCUMENTATION_INDEX.md` when they pass quality checklist.
