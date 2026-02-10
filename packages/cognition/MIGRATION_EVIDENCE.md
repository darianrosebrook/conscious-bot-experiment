# Migration Evidence Bundle

This document tracks the evidence required for each PR4 migration.

## Signal Types

Each migration must provide 4 signal types:

1. **Hard boundary** (must pass, fail-closed)
   - Migration import ratchet (no-legacy-sanitizer-imports.test.ts)
   - Local mapping boundary (no-local-mapping.test.ts)
   - Type-level boundary (no-semantic-types.test.ts)

2. **Behavioral equivalence** (detect accidental changes)
   - Golden tests at user-visible seams
   - Pin 3-5 high-leverage scenarios with exact expected outputs

3. **Integration handshake** (prove Sterling is actually in the loop)
   - Contract test: envelope → reduce → result invariants
   - Prove TS delegates semantic work, doesn't recreate it

4. **Observability** (debuggable when it breaks)
   - Structured logging at the seam (one log line per request)
   - Schema version, hash, latency, error class, degraded mode flag

---

## Migration A: Delete goal-extractor.ts

**Status**: ✅ Complete (commit: 1347b95)

**Target files**:
- `packages/cognition/src/reasoning-surface/goal-extractor.ts` (delete)
- `packages/cognition/src/reasoning-surface/index.ts` (update re-exports)

**Evidence bundle**:

### 1. Hard boundary signals
- [✓] Ratchet count drops from 7 to 6
- [✓] no-legacy-sanitizer-imports.test.ts passes (32 tests)
- [✓] no-local-mapping.test.ts stays green (99 tests)
- [✓] no-semantic-types.test.ts stays green (73 tests)

### 2. Behavioral equivalence
- [✓] Zero imports of goal-extractor remain after deletion
  ```bash
  grep -r "from.*goal-extractor" packages/cognition/src --exclude-dir=__tests__ | wc -l
  # Result: 0 ✓
  ```
- [✓] Exports contract test passes (reasoning-surface-exports.test.ts)
- [✓] Typecheck passes: `npx tsc --noEmit` (no errors)

### 3. Integration handshake
- N/A (pure deletion, no Sterling involvement) - explicitly marked

### 4. Observability
- N/A (compile-time verification only) - explicitly marked

**Go/no-go criteria**:
```bash
# All must pass:
grep -r "from.*goal-extractor" packages/cognition/src --exclude-dir=__tests__ | wc -l  # = 0
pnpm --filter @conscious-bot/cognition build  # exits 0
pnpm --filter @conscious-bot/cognition typecheck  # exits 0
pnpm --filter @conscious-bot/cognition test -- --run src/__tests__/boundary-conformance/  # all pass
```

---

## Migration B: Migrate cognitive-core/llm-interface.ts

**Status**: ✅ Complete

**Target files**:
- `packages/cognition/src/cognitive-core/llm-interface.ts`

**Evidence bundle**:

### 1. Hard boundary signals
- [✓] Ratchet count drops from 6 to 5
- [✓] no-legacy-sanitizer-imports.test.ts passes (34 tests)
- [✓] no-local-mapping.test.ts stays green (95 tests)
- [✓] no-semantic-types.test.ts stays green (70 tests)

### 2. Behavioral equivalence
- [✓] LLMResponse.metadata.reduction shape implemented
  - Contains opaque Sterling artifacts (reducerResult, isExecutable, blockReason)
  - No TS semantic interpretation of these fields
- [✓] Degraded mode when Sterling unavailable
  - Returns text-only response with isExecutable: false
  - No local semantic fallback (fail-closed)
- [✓] Non-semantic formatForChat() replaces sanitizeForChat()
  - Strips markers visually without semantic interpretation

### 3. Integration handshake
- [✓] B1 handshake tripwire PASSED
  - Test flipped from `it.fails()` to `it()` - now passes
  - DI seam: `LLMInterface(config, { languageIOClient })`
  - Mock reduce() is called when generateResponse() is invoked
- [✓] Contract test: Sterling reduce() is called
  ```typescript
  expect(mockReduce).toHaveBeenCalled();
  expect(mockReduce.mock.calls[0][0]).toBe('I see trees nearby. [GOAL: dig stone]');
  ```
- [✓] TS does not contain forbidden semantic patterns
  - Negative test scans llm-interface.ts for ACTION_NORMALIZE_MAP, etc.
  - All patterns absent

### 4. Observability
- [✓] Structured logging via llm-output-reducer.ts
  - Logs: envelope_schema_version, envelope_id, reduce_latency_ms, is_executable
  - Logs degraded_mode flag when Sterling unavailable
  - Includes request_id for correlation

**Migration evidence**:
```bash
# llm-interface.ts no longer imports from llm-output-sanitizer:
grep "from.*llm-output-sanitizer" packages/cognition/src/cognitive-core/llm-interface.ts
# Result: (empty) ✓

# All boundary conformance tests pass:
pnpm --filter @conscious-bot/cognition test -- --run src/__tests__/boundary-conformance/
# Result: 33 passed, 742 total tests ✓

# Sterling handshake test passes:
pnpm --filter @conscious-bot/cognition test -- --run "should call Sterling reduce"
# Result: Test passes - Sterling is called ✓
```

**Files changed**:
- `cognitive-core/llm-interface.ts` - Removed all sanitizer imports, uses reduceRawLLMOutput
- `cognitive-core/llm-output-reducer.ts` - NEW: stable semantic seam
- `cognitive-core/chat-formatting.ts` - NEW: non-semantic text formatter
- `types.ts` - Added ReductionProvenance, updated LLMResponse metadata
- `thought-generator.ts` - Updated to use reduction.reducerResult

---

## Migration C: Clean up types.ts, index.ts, and reasoning-surface

**Status**: ✅ Phase 2 Complete (grounder, eligibility, thought-generator migrated)

**Target files**:
- `packages/cognition/src/types.ts` ✅ MIGRATED (imports from language-io)
- `packages/cognition/src/reasoning-surface/grounder.ts` ✅ MIGRATED (uses ReductionProvenance)
- `packages/cognition/src/reasoning-surface/eligibility.ts` ✅ MIGRATED (uses ReductionProvenance)
- `packages/cognition/src/thought-generator.ts` ✅ MIGRATED (uses ReductionProvenance)
- `packages/cognition/src/index.ts` 🔄 IN PROGRESS (legacy exports marked deprecated)

**Evidence bundle**:

### 1. Hard boundary signals
- [✓] Ratchet count drops from 4 to 1 (only index.ts remains)
- [✓] no-legacy-sanitizer-imports.test.ts passes
- [✓] All boundary tests stay green
- [✓] no-local-mapping.test.ts stays green
- [✓] no-semantic-types.test.ts stays green

### 2. Phase 1: Deprecation markers (COMPLETE)
- [✓] Legacy exports in index.ts marked with @deprecated JSDoc
- [✓] Migration guide comments added
- [✓] `ReductionProvenance` exported from types.ts

### 3. Phase 2: Core module migration (COMPLETE)
- [✓] `grounder.ts` — Now accepts `ReductionProvenance`, deleted 250+ lines of local semantic logic
- [✓] `eligibility.ts` — Now uses `{ reduction: ReductionProvenance | null }` input
- [✓] `thought-generator.ts` — Removed `GoalTagV1` import, uses `reduction` for eligibility
- [✓] Drive-tick thoughts are now NOT eligible for task conversion (fail-closed)
- [✓] computeEligibility() moved to reasoning-surface/index.ts, accepts ReductionProvenance
- [✓] Tests updated:
  - `eligibility.test.ts` — Rewritten for Sterling-driven API with ReductionProvenance
  - `drive-tick.test.ts` — Updated: drive-ticks return `{thought, category}`, not `extractedGoal`; `convertEligible: false` always
  - `sterling-runtime-integration.test.ts` — Updated: fail-closed in fallback mode (even explicit goals NOT executable without Sterling)

**Key changes**:
```typescript
// grounder.ts — OLD
groundGoal(goal: GoalTagV1, context) → GroundingResult

// grounder.ts — NEW
groundGoal(reduction: ReductionProvenance | null, context) → GroundingResult

// eligibility.ts — OLD
deriveEligibility({ extractedGoal: GoalTagV1 | null, groundingResult }) → EligibilityOutput

// eligibility.ts — NEW
deriveEligibility({ reduction: ReductionProvenance | null }) → EligibilityOutput
```

### 4. Phase 3: Downstream migration (BLOCKED)
The following files in `packages/planning` import `GoalTagV1`:
- `task-integration.ts`
- `task-integration/task-management-handler.ts`
- `task-integration/thought-to-task-converter.ts`
- 3 test files

Before removing legacy exports from index.ts:
- [ ] Create `TaskConversionInput` bridge type (accepts Sterling OR legacy)
- [ ] Update `thought-to-task-converter` to use `metadata.reduction`
- [ ] Update task management handler to use Sterling artifacts

### 5. Phase 4: Remove legacy exports (PENDING)
After downstream migration:
- [ ] Remove `GoalTagV1`, `sanitizeLLMOutput`, etc. from index.ts exports
- [ ] Remove `index.ts` from grandfather list (drops count to 0)
- [ ] Delete llm-output-sanitizer.ts (if no longer needed)

### 6. Observability
Current state:
```bash
# Ratchet count:
# grounder.ts, eligibility.ts, thought-generator.ts REMOVED from grandfather list
# Only index.ts remains (for re-exports to packages/planning)

# Downstream consumers still import GoalTagV1:
grep -r "GoalTagV1" packages/planning/src --include="*.ts" | wc -l
# Result: 6 files (need migration before removal)
```

**Go/no-go criteria for Phase 4**:
```bash
# All must pass:
grep -r "GoalTagV1" packages/planning/src --include="*.ts" | wc -l  # = 0
pnpm build  # Ensure no consumers broken
pnpm typecheck  # Full repo typecheck
```

---

## Evidence Collection Commands

Run after each migration:

```bash
# 1. Hard boundary
pnpm --filter @conscious-bot/cognition test -- --run src/__tests__/boundary-conformance/

# 2. Behavioral equivalence
pnpm --filter @conscious-bot/cognition test -- --run src/**/__tests__/**golden**.test.ts

# 3. Integration handshake
pnpm --filter @conscious-bot/cognition test -- --run src/**/__tests__/**integration**.test.ts

# 4. Observability (runtime check)
pnpm start &
sleep 60
grep "envelope_schema_version" logs/*.log | wc -l  # Should be > 0
```

---

## Failure Modes and Remediation

### Hard boundary failure
- **Symptom**: Ratchet test fails with "unauthorized additions"
- **Root cause**: New code imports from llm-output-sanitizer
- **Fix**: Migrate the violating file or revert the change

### Behavioral equivalence failure
- **Symptom**: Golden test shows different output after migration
- **Root cause**: Semantic behavior changed unintentionally
- **Fix**: Verify Sterling returns expected semantics, or adjust mapping

### Integration handshake failure
- **Symptom**: Test shows Sterling was not called
- **Root cause**: Code path bypasses Sterling pipeline
- **Fix**: Wire Sterling client into the path, remove local semantic logic

### Observability failure
- **Symptom**: No log lines appear for envelope processing
- **Root cause**: Logging not wired, or code path bypassed
- **Fix**: Add structured log at seam, verify code path is exercised
