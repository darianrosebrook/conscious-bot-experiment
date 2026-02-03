# Cognitive Thought Pipeline Trace

> **Status**: NEEDS EXTERNAL REVIEW
> **Date**: 2026-02-03
> **Issue**: 136+ intrusive thoughts processed without action; identical awareness thoughts repeated 10x

This document traces the complete flow of thoughts through the conscious-bot system, identifying architectural issues that prevent thoughts from becoming actions.

---

## Executive Summary

The cognitive pipeline has a **critical architectural issue**: thoughts are marked `processed: true` at the **source** (cognition service) before they ever reach the **consumer** (planning service). This makes them invisible to the task conversion pipeline.

### Key Findings

1. **Premature `processed` flag**: Awareness and intrusive thoughts are marked `processed: true` immediately upon broadcast
2. **No goal extraction for environmental thoughts**: Awareness thoughts lack `extractedGoal` metadata
3. **IDLE-2 blocks non-goal thoughts correctly**: The intent contract works as designed—the issue is upstream
4. **No content deduplication**: Same "Awareness: 4 neutral nearby" generated 10+ times without dedup

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THOUGHT GENERATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │ Saliency Reasoner│    │ Intrusive Thought│    │ Enhanced Thought │       │
│  │ (Environmental)  │    │ Processor        │    │ Generator (LLM)  │       │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘       │
│           │                       │                       │                  │
│           ▼                       ▼                       ▼                  │
│  "Awareness: 4 neutral"   "Response to X"         "[GOAL: collect Y]"       │
│  processed: true ❌        processed: true ❌      processed: false ✓        │
│  extractedGoal: none      extractedGoal: none     extractedGoal: {...}      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COGNITIVE STREAM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  POST /api/ws/cognitive-stream ──► cognitiveThoughts[] array                │
│                                                                              │
│  GET /api/cognitive-stream/recent?processed=false                           │
│       │                                                                      │
│       ├── Filters OUT thoughts where processed=true                         │
│       │                                                                      │
│       └── Returns only unprocessed thoughts to planning                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLANNING SERVICE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CognitiveStreamClient.getActionableThoughts()                              │
│       │                                                                      │
│       └── Fetches with processed=false (default)                            │
│                                                                              │
│  convertThoughtToTask() ──► GATE 1: processed?                              │
│                             GATE 2: status text?                            │
│                             GATE 3: seen ID?                                │
│                             GATE 4: convertEligible?                        │
│                             GATE 5: extractedGoal? ◄── IDLE-2 enforcement   │
│                                                                              │
│  Result: Only LLM-generated thoughts with [GOAL:] tags pass all gates       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File-by-File Trace

### 1. Awareness Thought Generation

**File**: `packages/cognition/src/environmental/saliency-reasoner.ts`
**Lines**: 284-332

```typescript
function generateAwarenessThought(
  tracks: Map<string, TrackSummary>,
  recentDeltas: SaliencyDelta[]
): string {
  const visibleTracks = [...tracks.values()].filter(
    (t) => t.visibility !== 'lost'
  );

  // Sort by threat, then distance
  const hostiles = visibleTracks.filter((t) => t.threatLevel !== 'none');
  const neutrals = visibleTracks.filter((t) => t.threatLevel === 'none');

  const parts: string[] = ['Awareness:'];
  if (hostiles.length > 0) {
    parts.push(`${hostiles.length} hostile${hostiles.length > 1 ? 's' : ''} (...)`);
  }
  if (neutrals.length > 0) {
    parts.push(`${neutrals.length} neutral nearby`);  // <-- THE REPEATED STRING
  }

  return parts.join(' ');
}
```

**Issue**: No deduplication. Same entity count = same string = repeated broadcast.

---

### 2. Awareness Thought Broadcast

**File**: `packages/cognition/src/routes/process-routes.ts`
**Lines**: 167-216

```typescript
if (type === 'environmental_awareness') {
  // ... process saliency envelope ...

  const internalThought = {
    type: 'environmental',
    content: insight.thought.text,  // "Awareness: 4 neutral nearby"
    metadata: {
      thoughtType: 'environmental',
      source: 'saliency',
      // NO extractedGoal field ❌
      // NO convertEligible field ❌
    },
    id: `thought-${Date.now()}-sal-${envelope.seq}`,
    timestamp: Date.now(),
    processed: true,  // ❌ FATAL: Marked processed immediately
  };

  await resilientFetch(`${dashboardUrl}/api/ws/cognitive-stream`, {
    body: JSON.stringify(internalThought),
  });
}
```

**Issues**:
1. `processed: true` set before planning sees the thought
2. No `extractedGoal` metadata
3. No `convertEligible` flag

---

### 3. Intrusive Thought Processing

**File**: `packages/cognition/src/routes/process-routes.ts`
**Lines**: 63-166

```typescript
if (type === 'intrusion') {
  const result = await deps.intrusiveThoughtProcessor.processIntrusiveThought(content);

  if (result.accepted && result.thought) {
    await resilientFetch(cognitiveStreamUrl, {
      body: JSON.stringify({
        ...result.thought,
        processed: true,  // ❌ FATAL: Marked processed immediately
      }),
    });
  }
}
```

**Issue**: Same pattern—marked processed before planning evaluation.

---

### 4. Cognitive Stream Fetch (Planning Side)

**File**: `packages/cognition/src/routes/cognitive-stream-routes.ts`
**Lines**: 231-286

```typescript
router.get('/api/cognitive-stream/recent', async (req, res) => {
  const { limit = 10, processed = false } = req.query;  // Default: only unprocessed

  let recentThoughts = deps.state.cognitiveThoughts.slice();

  if (processed === 'false') {
    recentThoughts = recentThoughts.filter((thought) => !thought.processed);
  }

  // Returns filtered list
});
```

**Result**: Awareness and intrusive thoughts (with `processed: true`) are filtered OUT.

---

### 5. Thought-to-Task Conversion

**File**: `packages/planning/src/task-integration/thought-to-task-converter.ts`
**Lines**: 227-519

```typescript
export async function convertThoughtToTask(thought, deps) {
  // GATE 1: Already processed?
  if (thought.processed)
    return { decision: 'blocked_guard', reason: 'already processed' };

  // GATE 5: Extract goal tag
  const extractedGoal = thought.metadata?.extractedGoal;

  if (!extractedGoal?.action) {
    const requireExplicitGoalTag = deps.config?.requireExplicitGoalTag !== false;
    if (requireExplicitGoalTag) {
      return {
        decision: 'dropped_sanitizer',
        reason: 'IDLE-2: no explicit [GOAL:] tag — keyword fallback disabled',
      };
    }
  }

  // Create task only if all gates pass
}
```

**IDLE-2 works correctly**: Thoughts without `extractedGoal` are blocked. The issue is upstream.

---

## Root Cause Analysis

### Why 136 Intrusive Thoughts Had No Action

```
External Source (Dashboard)
  ↓
POST /process { type: 'intrusion', content: '...' }
  ↓
IntrusiveThoughtProcessor.processIntrusiveThought()
  ↓
Sends to cognitive stream with processed: true  ◄── PROBLEM
  ↓
Planning fetches with processed=false
  ↓
Intrusive thought is NOT returned
  ↓
Never reaches convertThoughtToTask()
  ↓
NO TASK CREATED
```

### Why "Awareness: 4 neutral nearby" Appeared 10x

1. Belief system sends `saliency_delta` envelope on each entity update
2. Same 4 entities visible = same awareness text generated
3. Each has unique ID (`thought-${Date.now()}-sal-${seq}`)
4. No content-based deduplication exists
5. All marked `processed: true` immediately

---

## Decision Matrix

| Thought Type | `processed` | `extractedGoal` | `convertEligible` | Reaches Planning? | Creates Task? |
|--------------|-------------|-----------------|-------------------|-------------------|---------------|
| Awareness | `true` ❌ | `undefined` | `undefined` | NO | NO |
| Intrusive | `true` ❌ | `undefined` | `undefined` | NO | NO |
| LLM w/ goal | `false` ✓ | `{action, target}` | `true` | YES | YES (if routable) |
| LLM w/o goal | `false` ✓ | `undefined` | `undefined` | YES | NO (IDLE-2) |

---

## Recommended Fixes

### Fix 1: Delay `processed` Flag (Critical)

**Location**: `packages/cognition/src/routes/process-routes.ts`

```typescript
// BEFORE (broken):
const internalThought = {
  ...
  processed: true,  // Too early!
};

// AFTER (fixed):
const internalThought = {
  ...
  processed: false,  // Let planning decide
  convertEligible: false,  // Awareness thoughts are informational
};
```

### Fix 2: Add Content Deduplication in Saliency Reasoner

**Location**: `packages/cognition/src/environmental/saliency-reasoner.ts`

```typescript
const AWARENESS_DEDUP_WINDOW_MS = 30_000;
const recentAwarenessContent = new Map<string, number>(); // content -> timestamp

function generateAwarenessThought(...): string | null {
  const text = buildAwarenessText(...);

  const lastEmit = recentAwarenessContent.get(text);
  if (lastEmit && Date.now() - lastEmit < AWARENESS_DEDUP_WINDOW_MS) {
    return null;  // Suppress duplicate
  }

  recentAwarenessContent.set(text, Date.now());
  return text;
}
```

### Fix 3: Add Intent Extraction for Intrusive Thoughts

**Location**: `packages/cognition/src/routes/process-routes.ts`

```typescript
if (type === 'intrusion') {
  const result = await deps.intrusiveThoughtProcessor.processIntrusiveThought(content);

  // NEW: Extract intent from intrusive thought content
  const extractedGoal = await extractGoalFromContent(content, deps.llmInterface);

  const thought = {
    ...result.thought,
    processed: false,  // Let planning decide
    convertEligible: !!extractedGoal,
    metadata: {
      ...result.thought.metadata,
      extractedGoal,
    },
  };
}
```

### Fix 4: Gate Rapid Repetitions

Add circuit breaker for same-content thoughts:

```typescript
const REPETITION_LIMIT = 3;
const REPETITION_WINDOW_MS = 60_000;

// If >3 identical thoughts in 60s, suppress further emissions
```

---

## Files Requiring Changes

| File | Change | Priority |
|------|--------|----------|
| `packages/cognition/src/routes/process-routes.ts` | Delay `processed` flag | P0 |
| `packages/cognition/src/environmental/saliency-reasoner.ts` | Content dedup | P1 |
| `packages/cognition/src/routes/cognitive-stream-routes.ts` | Add `markProcessed` endpoint | P1 |
| `packages/planning/src/task-integration.ts` | Call markProcessed after evaluation | P1 |
| `packages/cognition/src/intrusive-thought-processor.ts` | Intent extraction | P2 |

---

## Verification Checklist

After fixes, verify:

- [ ] Awareness thoughts reach planning with `processed: false`
- [ ] Planning marks thoughts processed after evaluation
- [ ] Duplicate content is suppressed within 30s window
- [ ] Intrusive thoughts with clear intent create tasks
- [ ] IDLE-2 still blocks thoughts without `[GOAL:]` tags
- [ ] Soak test shows `goals > 0` when LLM emits goal tags

---

## Appendix: Soak Test Evidence

From `run.log` during 12-minute soak:

```
[Planning] [CognitiveStream] Fetched 10 thoughts [
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"',
  '"Awareness: 4 neutral nearby"'
]
```

From soak metrics:
```
thoughts=20 drive-ticks=0 goals=0 intents=0
tasks: | goalKeyed: none
```

This confirms:
1. Thoughts are being generated (20 per sample)
2. No goals are being extracted (LLM not emitting `[GOAL:]` tags)
3. No tasks are being created (correct per IDLE-2)
4. The issue is **upstream** (thought generation), not downstream (task conversion)
