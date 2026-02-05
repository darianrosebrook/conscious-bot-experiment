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

**Status**: ✅ Complete (commit: TBD)

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

**Status**: Harness live (tripwire active, ready for migration)

**Target files**:
- `packages/cognition/src/cognitive-core/llm-interface.ts`

**Evidence bundle**:

### 1. Hard boundary signals
- [ ] Ratchet count drops from 6 to 5
- [ ] no-legacy-sanitizer-imports.test.ts passes
- [ ] no-local-mapping.test.ts stays green (critical - watch for switch-on-action)
- [ ] no-semantic-types.test.ts stays green

### 2. Behavioral equivalence
- [ ] Golden test: envelope construction from raw text
  - Input: "I see trees nearby. [GOAL: dig stone]"
  - Expected: envelope with verbatim marker, sanitized text, correct hash
- [ ] Golden test: thought stream events unchanged
  - Input: normal thought triggering TTS
  - Expected: same event shape, same TTS gating behavior
- [ ] Golden test: degenerate LLM output handling
  - Input: empty, code-ish, filler patterns
  - Expected: same rejection behavior

### 3. Integration handshake
- [✓] B1 handshake tripwire is LIVE
  - Pre-migration: `it.fails()` test executes and detects bypass
  - Post-migration: flip to `it()` → proves Sterling reduce() called
  - DI seam added: `LLMInterface(config, { languageIOClient })`
- [ ] Contract test: envelope → reduce → result (post-migration)
  ```typescript
  // Test: Sterling reduce() is actually called
  const envelope = buildEnvelope(rawText);
  const result = await client.reduce(envelope);
  expect(result.committed_ir).toBeDefined();
  expect(result.is_executable).toBeDefined();
  ```
- [✓] TS does not contain forbidden semantic patterns
  - Negative test scans llm-interface.ts for ACTION_NORMALIZE_MAP, etc.
  - Currently passes (no semantic patterns found)

### 4. Observability
- [ ] Structured log at llm-interface seam
  ```typescript
  logger.info('llm_interface_envelope', {
    envelope_schema_version: envelope.schema_version,
    envelope_id: envelope.envelope_id,
    reduce_latency_ms: durationMs,
    reducer_result_version: result.schema_version,
    is_executable: result.is_executable,
    degraded_mode: false,
  });
  ```

**Go/no-go criteria**:
```bash
# All must pass:
pnpm --filter @conscious-bot/cognition test -- --run src/cognitive-core/__tests__/llm-interface-integration.test.ts
pnpm --filter @conscious-bot/cognition test -- --run src/__tests__/boundary-conformance/
# Integration test shows Sterling was called (assert on log or mock)
```

---

## Migration C: Clean up types.ts and index.ts

**Status**: Not started

**Target files**:
- `packages/cognition/src/types.ts`
- `packages/cognition/src/index.ts`

**Evidence bundle**:

### 1. Hard boundary signals
- [ ] Ratchet count drops from 5 to 3 (both files removed from grandfather list)
- [ ] no-legacy-sanitizer-imports.test.ts passes
- [ ] All boundary tests stay green

### 2. Behavioral equivalence
- [ ] Public exports snapshot test
  ```typescript
  // Test: package surface only exposes language-io types
  import * as cognition from '@conscious-bot/cognition';
  const exports = Object.keys(cognition);
  expect(exports).not.toContain('GoalTagV1');  // Removed
  expect(exports).not.toContain('sanitizeLLMOutput');  // Removed
  expect(exports).toContain('processLLMOutputAsync');  // Kept
  expect(exports).toContain('ReducerResultView');  // language-io type
  ```

### 3. Integration handshake
- N/A (API surface cleanup)

### 4. Observability
- [ ] No imports of legacy types from package surface
  ```bash
  # In consuming packages (e.g., planning):
  grep -r "GoalTagV1\|sanitizeLLMOutput" packages/planning/src | wc -l
  # Expected: 0
  ```

**Go/no-go criteria**:
```bash
# All must pass:
pnpm --filter @conscious-bot/cognition test -- --run src/__tests__/package-exports.test.ts
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
