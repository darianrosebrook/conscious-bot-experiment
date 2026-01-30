# Sterling searchHealth Instrumentation Spec

**Status**: Implemented (2026-01-29). Python `SearchHealthAccumulator` in `core/search_health.py` uses Welford's online algorithm (O(1) per expansion) instead of list accumulation. `searchHealthVersion: 1` field required. `terminationReason` enum: `goal_found` | `max_nodes` | `frontier_exhausted` | `error` (old values `goal`/`no_solution` are rejected by the TypeScript parser). Verified end-to-end: wooden pickaxe produces healthy metrics, iron tier triggers degeneracy detection.

**Purpose**: Define the minimal instrumentation the Sterling A\* loop must emit so the TypeScript solver can detect heuristic degeneracy and surface search quality in SolveBundle artifacts.

## What the TypeScript side already has

The parser (`search-health.ts`) and type definitions (`solve-bundle-types.ts`) are complete. The TypeScript side:

1. Reads `metrics.searchHealth` from Sterling's `complete` message.
2. Parses 11 required fields (all must be present or the parser returns `undefined`).
3. Runs degeneracy detection with three thresholds:
   - `pctSameH > 0.5` → "heuristic not discriminating"
   - `hVariance === 0 && nodesExpanded > 10` → "constant heuristic"
   - `branchingEstimate > 8 && terminationReason === 'max_nodes'` → "unguided search blowup"

Until the Python side emits `searchHealth`, the parser returns `undefined` and E2E tests explicitly assert this.

## Required payload shape

The `complete` message must include a `metrics.searchHealth` object:

```json
{
  "type": "complete",
  "domain": "minecraft",
  "solved": true,
  "metrics": {
    "planId": "...",
    "searchHealth": {
      "searchHealthVersion": 1,
      "nodesExpanded": 93,
      "frontierPeak": 42,
      "hMin": 0.0,
      "hMax": 6.0,
      "hMean": 2.8,
      "hVariance": 3.1,
      "fMin": 5.0,
      "fMax": 28.0,
      "pctSameH": 0.23,
      "terminationReason": "goal_found",
      "branchingEstimate": 3.2
    }
  }
}
```

### Field definitions

| Field | Type | Description | How to compute |
|---|---|---|---|
| `searchHealthVersion` | int | Protocol version (must be `1`; unknown versions rejected by parser) | Hard-coded to `1` |
| `nodesExpanded` | int | Total nodes popped from the priority queue | Increment counter on each `heappop` |
| `frontierPeak` | int | Maximum size the open set reached | Track `max(len(open_set))` after each `heappush` |
| `hMin` | float | Minimum h(n) observed across expanded nodes | `min(h_values)` |
| `hMax` | float | Maximum h(n) observed across expanded nodes | `max(h_values)` |
| `hMean` | float | Mean h(n) across expanded nodes | `sum(h_values) / len(h_values)` |
| `hVariance` | float | Variance of h(n) across expanded nodes | `variance(h_values)` (population) |
| `fMin` | float | Minimum f(n) = g(n) + h(n) observed | `min(f_values)` |
| `fMax` | float | Maximum f(n) observed | `max(f_values)` |
| `pctSameH` | float | Fraction of expanded nodes sharing the modal h value (0..1) | Count the most frequent h value, divide by `nodesExpanded` |
| `terminationReason` | string | One of: `"goal_found"`, `"max_nodes"`, `"frontier_exhausted"`, `"error"` | Set based on why the loop exited |
| `branchingEstimate` | float | Effective branching factor estimate | `total_successors_generated / nodesExpanded` |

## Where to instrument in the Python A\* loop

The instrumentation requires tracking 4 accumulators during the search loop:

```python
# Before the loop
h_values = []           # h(n) for each expanded node
f_values = []           # f(n) for each expanded node
frontier_peak = 0       # max open set size
total_successors = 0    # total children generated (for branching estimate)

# Inside the loop, on each node expansion (heappop)
node = heappop(open_set)
h_values.append(node.h)
f_values.append(node.g + node.h)
frontier_peak = max(frontier_peak, len(open_set))

# When generating successors
for successor in expand(node):
    total_successors += 1
    heappush(open_set, successor)
    frontier_peak = max(frontier_peak, len(open_set))

# After the loop exits, compute the searchHealth object
nodes_expanded = len(h_values)
if nodes_expanded > 0:
    from statistics import mean, pvariance
    from collections import Counter

    h_counter = Counter(h_values)
    modal_h_count = h_counter.most_common(1)[0][1]

    search_health = {
        "nodesExpanded": nodes_expanded,
        "frontierPeak": frontier_peak,
        "hMin": min(h_values),
        "hMax": max(h_values),
        "hMean": mean(h_values),
        "hVariance": pvariance(h_values),
        "fMin": min(f_values),
        "fMax": max(f_values),
        "pctSameH": modal_h_count / nodes_expanded,
        "terminationReason": termination_reason,  # "goal_found" | "max_nodes" | "frontier_exhausted" | "error"
        "branchingEstimate": total_successors / nodes_expanded if nodes_expanded > 0 else 0.0,
    }
else:
    search_health = None
```

Then include it in the `complete` message:

```python
complete_msg = {
    "type": "complete",
    "domain": domain,
    "solved": solved,
    "metrics": {
        "planId": plan_id,
        **({"searchHealth": search_health} if search_health else {}),
    },
}
```

## Performance considerations

- `h_values` and `f_values` lists grow linearly with nodes expanded. For typical solves (< 5000 nodes), this is negligible.
- If memory is a concern for very large solves, use running accumulators (Welford's online variance algorithm) instead of storing all values. The modal h computation (`pctSameH`) still requires a counter.
- The instrumentation adds O(1) work per node expansion. No additional search overhead.

## Parser behavior: versioned and warns-on-partial

The TypeScript parser (`search-health.ts`) enforces these contracts:

- **Version gate**: If `searchHealthVersion` is present and not `1`, the parser returns `undefined` and warns in non-production. Unknown future versions are safely ignored (forward-compat).
- **All-or-nothing fields**: All 11 numeric/enum fields must be present and valid. If any field is missing, NaN, or Infinity, the parser returns `undefined`.
- **Partial-present warning**: If the `searchHealth` object exists but has fewer than 11 valid fields, the parser warns with the count of valid fields (e.g., `"Partial fields present (2/11)"`). This aids debugging when the Python side emits an incomplete payload.
- **Old enum rejection**: The old `terminationReason` values `"goal"` and `"no_solution"` are not accepted. Only `"goal_found"`, `"max_nodes"`, `"frontier_exhausted"`, and `"error"` are valid.

## Validation criteria

Once the Python side emits `searchHealth`, the TypeScript E2E test should be updated:

```diff
- expect(bundle.output.searchHealth).toBeUndefined();
+ expect(bundle.output.searchHealth).toBeDefined();
+ expect(bundle.output.searchHealth!.nodesExpanded).toBeGreaterThan(0);
+ expect(bundle.output.searchHealth!.terminationReason).toBe('goal_found');
```

## Known degeneracy cases

The wooden pickaxe solve (93 nodes, 8-step path) should produce healthy metrics:
- `pctSameH` should be well below 0.5
- `hVariance` should be > 0
- `branchingEstimate` should be moderate (2-4)

The iron tier solve (5000 nodes, no solution) should trigger degeneracy warnings:
- `terminationReason` = `"max_nodes"`
- `branchingEstimate` likely > 8
- `pctSameH` likely > 0.5 (item-count heuristic doesn't differentiate well for multi-step chains)
