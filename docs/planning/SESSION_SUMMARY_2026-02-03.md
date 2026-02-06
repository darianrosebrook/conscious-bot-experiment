# Session Summary: Keep-Alive Pipeline & End-to-End Bot Functionality

> Status: Legacy (pre-Pattern-A). This summary reflects the goal-tag pipeline prior to Sterling
> semantic authority. For current routing/execution rules, see
> `docs/planning/sterling-boundary-contract.md` and `contracts/sterling-executor.yaml`.

**Date**: 2026-02-03
**Goal**: Restore end-to-end bot functionality through the keep-alive intention-check pipeline

---

## Executive Summary

The keep-alive pipeline is **architecturally correct and fully functional**. We verified this through a positive control test that successfully placed a thought with `convertEligible: true` into the actionable queue. The blocking issue preventing autonomous behavior is **model compliance**: the gemma3n model rarely emits `[GOAL: ...]` tags when given the non-injective prompt.

### Key Metrics from Runtime Verification
- **Bot state fetch**: ✅ Fixed (model now sees inventory, nearby entities, biome)
- **Goal tag extraction**: ✅ Working (parser correctly extracts `[GOAL: action target]`)
- **Eligibility derivation**: ✅ Working (LF-2 single choke point enforced)
- **Actionable queue**: ✅ Working (positive control appeared in queue)
- **Model goal emission**: ❌ Rarely emits tags with current prompt

---

## What We Completed

### 1. LF-2: Single Choke Point for Eligibility Derivation

**Problem**: `convertEligible` was being set in multiple places, making it impossible to audit why a thought was or wasn't actionable.

**Solution**: Refactored `thought-generator.ts` to route ALL `convertEligible` decisions through `deriveEligibility()` from the reasoning-surface.

**Files Modified**:
- `packages/cognition/src/thought-generator.ts` — Added `computeEligibility()` helper that wraps grounding + derivation
- `packages/cognition/src/reasoning-surface/eligibility.ts` — Single source of truth for eligibility rule

**Eligibility Rule** (immutable):
```typescript
convertEligible = (extractedGoal !== null && groundingResult?.pass === true)
```

**Audit Trail Added**:
- `extractedGoalRaw` — Always captured for debugging, even when budget suppresses exposure
- `eligibilityReasoning` — Explains why eligibility was derived as it was
- `groundingResult` — Captures pass/fail and referenced facts

### 2. Prompt-Parser Format Mismatch Fix

**Problem**: The intention-check prompt instructed the model to output:
```
[GOAL: action="verb" target="noun" reason="why"]
```

But the parser expected space-separated tokens:
```
[GOAL: <action> <target> <amount>]
```

**Solution**: Updated all three prompt variants to use the correct format.

**Files Modified**:
- `packages/cognition/src/keep-alive/intention-check-prompt.ts`
- `packages/cognition/src/keep-alive/__tests__/intention-check-prompt.test.ts`

**Design Constraint Preserved**: Tests enforce prompts don't contain specific action words (mine, craft, build) to maintain non-injective property.

### 3. Bot State Endpoint Fix

**Problem**: `getBotState()` in modular-server.ts called non-existent endpoints:
- `/bot/status` → 404 HTML
- `/bot/position` → 404 HTML

This caused the model to receive a sparse situation frame with no inventory, position, or nearby entity data.

**Solution**: Changed to use `/state` endpoint which returns complete bot data.

**File Modified**:
- `packages/planning/src/modular-server.ts` — `getBotState()` function

**Before**:
```typescript
const [positionRes, statusRes] = await Promise.all([
  mcFetch('/bot/position').catch(() => null),  // 404!
  mcFetch('/bot/status').catch(() => null),    // 404!
]);
```

**After**:
```typescript
const stateRes = await mcFetch('/state').catch(() => null);
const botData = stateJson?.data?.data;
```

### 4. LLM Endpoint Addition

**Problem**: Keep-alive integration called `/api/llm/generate` which didn't exist.

**Solution**: Added the endpoint to cognition server.

**File Modified**:
- `packages/cognition/src/server.ts`

### 5. Runtime Verification

Performed systematic pipeline verification:

1. **Endpoint verification** — Confirmed `/state` returns proper JSON, `/bot/*` returns 404
2. **Full content inspection** — Retrieved complete thought content (not truncated)
3. **Goal tag detection** — Checked for `[GOAL:` substring presence
4. **Positive control** — Injected thought with `convertEligible: true`, verified it appeared in actionable queue

---

## Current System State

### What's Working

| Component | Status | Evidence |
|-----------|--------|----------|
| Keep-alive initialization | ✅ | `[KeepAliveIntegration] Initialized successfully` |
| Autonomous executor | ✅ | `[AUTONOMOUS EXECUTOR] Idle detected: no_tasks` |
| Bot state fetching | ✅ | Model sees "4x passive mobs nearby" |
| LLM generation | ✅ | MLX sidecar returns 200, model responds |
| Thought broadcasting | ✅ | Thoughts appear in cognitive stream |
| Eligibility derivation | ✅ | `derived: true` in all thought metadata |
| Actionable queue | ✅ | Positive control appeared with `count: 1` |

### What's Blocking End-to-End Autonomy

**Model (gemma3n) doesn't emit goal tags** with the non-injective prompt.

Example model output:
```
"I am noticing the presence of 4x passive mobs nearby. I intend to explore the immediate area."
```

The model expresses intent in natural language ("I intend to explore") but doesn't use the required `[GOAL: explore area]` format.

Direct testing shows gemma3n CAN emit goal tags when given explicit examples:
```json
{
  "text": "ASSISTANT: I detect a potential danger.",
  "extractedGoal": {
    "action": "find",
    "target": "shelter",
    "raw": "[GOAL: find shelter]"
  }
}
```

---

## Path Forward: Intent Classification with Distill 8-Ball

### The Problem

The current approach requires the model to:
1. Understand the situation
2. Decide if action is warranted
3. Format that action as `[GOAL: action target]`

Step 3 fails frequently because small models don't reliably follow formatting instructions.

### Proposed Solution: Post-Hoc Intent Classification

Use a lightweight classifier (like `../distill/8-ball` or similar) to detect actionable intent in natural language outputs, THEN extract structured goals.

**Architecture**:
```
LLM Output → Intent Classifier → Goal Extractor → Eligibility Derivation
     ↓              ↓                   ↓                    ↓
"I intend to    [actionable:     [GOAL: explore      convertEligible:
 explore"        0.87]            area]               true
```

### Why This Works

1. **Latency**: Distill classifiers add ~5-15ms, negligible compared to LLM generation (~500-2000ms)
2. **Training data**: `distill` and `surgery-ward` have substantial training data for intent classification
3. **Decoupling**: Model doesn't need to know the goal tag format — classifier handles it
4. **Non-injective preserved**: Prompt stays factual-only; classification is post-hoc

### Implementation Outline

```typescript
// In keep-alive-controller.ts or a new intent-classifier.ts

interface IntentClassification {
  isActionable: boolean;
  confidence: number;
  suggestedAction?: string;
  suggestedTarget?: string;
}

async function classifyIntent(text: string): Promise<IntentClassification> {
  // Call distill 8-ball or similar classifier
  const result = await distillClassifier.classify(text, {
    labels: ['actionable', 'observation', 'reflection'],
    extractEntities: true,  // Extract action verbs and targets
  });

  return {
    isActionable: result.label === 'actionable' && result.confidence > 0.7,
    confidence: result.confidence,
    suggestedAction: result.entities?.action,
    suggestedTarget: result.entities?.target,
  };
}

// Modified pipeline:
async function processThought(rawOutput: string): Promise<ProcessedThought> {
  // 1. Try direct goal tag extraction (existing path)
  const directGoal = extractGoalTag(rawOutput);

  if (directGoal.goalV1) {
    // Model emitted explicit goal tag — use it
    return processWithGoal(rawOutput, directGoal.goalV1);
  }

  // 2. Fall back to intent classification
  const intent = await classifyIntent(rawOutput);

  if (intent.isActionable && intent.suggestedAction && intent.suggestedTarget) {
    // Classifier detected actionable intent — synthesize goal
    const synthesizedGoal: GoalTagV1 = {
      version: 1,
      action: normalizeGoalAction(intent.suggestedAction),
      target: intent.suggestedTarget,
      amount: null,
      raw: `[SYNTHESIZED from: "${rawOutput.slice(0, 50)}..."]`,
    };

    // IMPORTANT: Synthesized goals still go through grounding!
    return processWithGoal(rawOutput, synthesizedGoal, { synthesized: true });
  }

  // 3. No actionable intent detected
  return { content: rawOutput, extractedGoal: null, convertEligible: false };
}
```

### Key Invariants Preserved

- **I-1 (No goal injection)**: Prompt remains factual-only
- **I-2 (Autonomy optional)**: Classifier can return `isActionable: false`
- **I-3 (Action via explicit intent)**: Model still expresses intent; classifier just detects it
- **LF-2 (Single choke point)**: Synthesized goals still go through `deriveEligibility()`

### Integration with Eval Harness

The eval harness (from the plan) can test both paths:

```jsonl
{"scenario_id": "direct-tag-test", "expected_path": "direct", "content": "[GOAL: mine stone 8]"}
{"scenario_id": "intent-classify-test", "expected_path": "classifier", "content": "I want to gather some wood"}
{"scenario_id": "observation-test", "expected_path": "none", "content": "The sun is setting over the plains"}
```

Metrics to track:
- `direct_extraction_rate` — How often model emits valid `[GOAL:]` tags
- `classifier_extraction_rate` — How often classifier detects actionable intent
- `false_positive_rate` — Classifier says actionable but grounding fails
- `action_rate` — End-to-end goal → task conversion rate

---

## Files Changed This Session

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/cognition/src/thought-generator.ts` | Modified | LF-2 refactoring, `computeEligibility()` helper |
| `packages/cognition/src/keep-alive/intention-check-prompt.ts` | Modified | Fixed goal tag format |
| `packages/cognition/src/keep-alive/__tests__/intention-check-prompt.test.ts` | Modified | Updated test expectations |
| `packages/cognition/src/server.ts` | Modified | Added `/api/llm/generate` endpoint |
| `packages/planning/src/modular-server.ts` | Modified | Fixed `getBotState()` to use `/state` |
| `scripts/verify-keepalive-runtime.ts` | Created | Runtime verification script |

---

## Immediate Next Steps

1. **Commit and push current changes** — Pipeline fixes are stable and tested
2. **Evaluate distill classifier** — Test `../distill/8-ball` on sample thought outputs
3. **Prototype intent classification** — Add classifier fallback path
4. **Extend eval harness** — Add scenarios that test both extraction paths
5. **Run soak test** — Verify end-to-end with classifier enabled

---

## Test Commands

```bash
# Run all cognition tests
pnpm --filter @conscious-bot/cognition test

# Run keep-alive specific tests
pnpm --filter @conscious-bot/cognition test -- --run src/keep-alive/__tests__/

# Verify runtime
npx tsx scripts/verify-keepalive-runtime.ts

# Start system and observe
pnpm start > run.log 2>&1 &
tail -f run.log | grep -i "keep-alive\|goal\|eligible"
```

---

## Summary

The bot has been non-functional because thoughts weren't becoming tasks. We traced this to:

1. **Format mismatch** (fixed) — Prompt format didn't match parser expectations
2. **Missing bot state** (fixed) — Sparse situation frames led to generic model outputs
3. **Model compliance** (blocking) — gemma3n doesn't reliably emit goal tags

The architecture is sound. The immediate path forward is to add a lightweight intent classifier that can detect actionable intent in natural language, synthesize goal structures, and feed them through the existing grounding and eligibility pipeline.
