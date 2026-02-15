# Debugging Leaf Dispatch Failures Runbook

## Purpose
Systematic diagnosis of leaf dispatch failures at each pipeline stage, from task creation through leaf execution and verification.

## Required Env

Full pipeline debugging requires all services running:
```bash
ENABLE_DEV_ENDPOINTS=true            # enables /api/dev/* diagnostic endpoints
ENABLE_PLANNING_EXECUTOR=1           # enables executor loop
EXECUTOR_MODE=live                   # live dispatch (not shadow)
EXECUTOR_LIVE_CONFIRM=YES            # confirms live mode
STERLING_WS_URL=ws://localhost:8766  # Sterling connection
```

Optional (dev-only overrides for isolating issues):
```bash
GEOFENCE_ENABLED=false               # disable geofence guard
REFLEX_ENABLED=false                 # disable reflex preemption
EXECUTOR_POLL_MS=5000                # faster executor polling (default: 10s)
```

## Pipeline Trace Points

```
User Intent / Thought
        ↓
[TaskIntegration.addTask] ................... task-integration.ts:1108
        ↓
[SterlingPlanner.generateDynamicSteps] ...... sterling-planner.ts
        ↓
   +----+----+
   |         |
Sterling   Fallback
Solver     Planner
   |         |
   +----+----+
        ↓
  TaskStep[] with meta.leaf + meta.args
        ↓
[autonomousTaskExecutor loop] ............... modular-server.ts:1477
        ↓
[stepToLeafExecution] ....................... modular-server.ts:915
        ↓
[validateLeafArgs] .......................... leaf-arg-contracts.ts:127
        ↓
[Guard pipeline]
  0. Geofence (fail-closed)
  1. Allowlist (block unknown leaves)
  2. Shadow mode (observe, no mutate)
  3. Rate limiter
  4. Rig G (feasibility gate)
  5. Commit (execute)
  6. Post-dispatch: NAV_PREEMPTED → SAFETY_PREEMPTED (30s backoff)
  7. Post-dispatch: NAV_BUSY → NAVIGATING_IN_PROGRESS (no retry)
        ↓
[toolExecutor.execute] ...................... modular-server.ts:2020
        ↓
HTTP POST /action --> minecraft-interface:3005
        ↓
[POST /action handler] ...................... server.ts:1581
        ↓
[ActionTranslator.executeAction] ............ action-translator.ts:949
        ↓
[LeafFactory.get(leafName)] ................. server.ts:889 (global)
        ↓
[leaf.run(ctx, args)] ....................... <leaf-file>:<line>
        ↓
Mineflayer bot actions
        ↓
LeafResult { status, result, metrics }
        ↓
HTTP 200 JSON response
        ↓
[taskIntegration.completeTaskStep] .......... task-integration.ts
  or retry logic
```

---

## Failure Mode Reference

| # | Failure | Signal | Diagnosis | Fix |
|---|---------|--------|-----------|-----|
| **F1** | Sterling not connected | 503 `sterling_not_connected` | WebSocket unavailable | Start Sterling, verify `STERLING_WS_URL=ws://localhost:8766` |
| **F2** | Digest unknown | `A_result.status='blocked'` | Expand call returned blocked | Use valid digest or check Sterling has the IR loaded |
| **F3** | Stub loaded but steps malformed | `A_result.status='blocked'` | Expansion failed validation | Check IR step schema, verify `meta.leaf` and `meta.args` present |
| **F4** | Expansion ok but executor disabled | `B_expansion.ok=true`, `C_dispatch.count=0` | Executor not running | Set `ENABLE_PLANNING_EXECUTOR=1` and `EXECUTOR_MODE=live` |
| **F5** | Dispatch ok but verification fails | A-C ok, D fails | World state doesn't match expectations | Check verification mode (inventory_delta, receipt_anchored), inspect artifact |
| **F6** | Timeout (45s) | Partial checkpoints, `timed_out: true` | Executor poll timeout exceeded | Increase `EXECUTOR_POLL_MS`, check if executor is polling |
| **NAV_PREEMPTED** | Navigation lease preempted by reflex | `SAFETY_PREEMPTED` error, 30s backoff | Reflex controller (hunger, health, threat) took navigation lease | Wait for backoff (30s) or disable reflex in dev mode |
| **NAV_BUSY** | Navigation already in progress | `NAVIGATING_IN_PROGRESS` error, no retry | Another task is using pathfinder | Wait for navigation to complete or cancel blocking task |

---

## Stage-by-Stage Debugging

### Stage 1: Task Creation (addTask)

**Trace point**: `packages/planning/src/task-integration.ts:1108`

**Symptoms**:
- Task never appears in task list
- Task created but no steps generated

**Diagnosis**:

```bash
# Check planning service logs
tail -f packages/planning/logs/planning.log | grep addTask

# Check if task was created
curl -s http://localhost:3002/api/tasks | jq '.tasks[] | select(.description | contains("harvest"))'
```

**Common causes**:
- Planning service not running
- Task dedupe key collision (task already exists)
- Sterling planner returned empty steps array

**Fix**:
```bash
# Verify planning service is up
curl -s http://localhost:3002/health

# Check task count
curl -s http://localhost:3002/api/tasks | jq '.tasks | length'
```

---

### Stage 2: Step Generation (Sterling/Fallback Planner)

**Trace point**: `packages/planning/src/task-integration/sterling-planner.ts`

**Symptoms**:
- Task created but `steps: []`
- Steps have no `meta.leaf` or `meta.args`

**Diagnosis**:

```bash
# Check task steps
curl -s http://localhost:3002/api/tasks | jq '.tasks[0].steps'

# Look for Sterling expand call in logs
tail -f packages/planning/logs/planning.log | grep expandByDigest
```

**Common causes**:
- Sterling expand returned `{ status: 'blocked' }` (F2)
- Fallback planner couldn't map requirement to leaf
- `stepToLeafExecution` remap failed (unknown leaf)

**Fix**:
- Use `sterling-smoke-runbook.md` to test Sterling expand
- Check `requirementToFallbackPlan` in `leaf-arg-contracts.ts` for requirement kind support
- Verify `actionTypeToLeaf` routing table has entry for action type

---

### Stage 3: Step Validation (validateLeafArgs)

**Trace point**: `packages/planning/src/modules/leaf-arg-contracts.ts:127`

**Symptoms**:
- Step blocked with `Invalid args for leaf: <name>`
- Step skipped due to missing required keys

**Diagnosis**:

```bash
# Check executor logs for validation errors
tail -f packages/planning/logs/planning.log | grep validateLeafArgs

# Inspect step args
curl -s http://localhost:3002/api/tasks | jq '.tasks[0].steps[0].meta.args'
```

**Common causes**:
- Required key missing (enforced in `CONTRACTS.requiredKeys`)
- Unknown leaf name (not in `KNOWN_LEAVES` set)
- Args shape doesn't match contract

**Fix**:
- Add missing required keys to step generation logic
- Add leaf to `KNOWN_LEAVES` in `leaf-arg-contracts.ts`
- Check `ACTION_CONTRACTS` in `action-contract-registry.ts` for requiredKeys enforcement

---

### Stage 4: Guard Pipeline

**Trace point**: `packages/planning/src/server/autonomous-executor.ts`

**Symptoms**:
- Step blocked by geofence
- Step blocked by allowlist
- Step executed but in shadow mode (no mutation)

**Guards in order**:

| # | Guard | Blocks when | Override env var |
|---|-------|-------------|------------------|
| 0 | Geofence | Bot outside allowed region | `GEOFENCE_ENABLED=false` (dev only) |
| 1 | Allowlist | Leaf not in allowlist | Add to `ALLOWED_LEAVES` array |
| 2 | Shadow mode | `EXECUTOR_MODE=shadow` | Set `EXECUTOR_MODE=live` |
| 3 | Rate limiter | Too many requests/sec | Increase rate limit config |
| 4 | Rig G feasibility | Rig G says `shouldProceed=false` | Check `blockReason` in logs |

**Diagnosis**:

```bash
# Check guard logs
tail -f packages/planning/logs/planning.log | grep "Guard blocked"

# Check executor mode
echo $EXECUTOR_MODE  # should be "live" not "shadow"

# Check geofence config
curl -s http://localhost:3002/api/executor/config | jq '.geofence'
```

**Fix**:
```bash
# Disable geofence (dev only)
GEOFENCE_ENABLED=false

# Switch to live mode
EXECUTOR_MODE=live
EXECUTOR_LIVE_CONFIRM=YES
```

---

### Stage 5: Dispatch to MC Interface

**Trace point**: `packages/planning/src/modular-server.ts:2020` → `HTTP POST /action`

**Symptoms**:
- `toolExecutor.execute` returns error
- HTTP 500 from minecraft-interface
- Connection refused to port 3005

**Diagnosis**:

```bash
# Check minecraft-interface is running
curl -s http://localhost:3005/health

# Test action endpoint directly
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"sense_hostiles","parameters":{}}' | jq
```

**Common causes**:
- Minecraft-interface not running
- Port mismatch (check `MINECRAFT_INTERFACE_PORT`)
- Action type unknown (not in `ACTION_CONTRACTS`)

**Fix**:
```bash
# Start minecraft-interface
cd packages/minecraft-interface && npm run dev

# Verify port
echo $MINECRAFT_INTERFACE_PORT  # default: 3005
```

---

### Stage 6: Action Translation & Dispatch

**Trace point**: `packages/minecraft-interface/src/action-translator.ts:949`

**Symptoms**:
- Action received but no leaf executed
- Leaf not found error
- Args normalized incorrectly

**Diagnosis**:

```bash
# Check action-translator logs
tail -f packages/minecraft-interface/logs/mc.log | grep executeAction

# Test normalization directly (requires dev endpoint)
curl -s -X POST http://localhost:3005/api/dev/test-normalize \
  -H 'Content-Type: application/json' \
  -d '{"type":"acquire_material","parameters":{"blockType":"stone"}}' | jq
```

**Common causes**:
- Leaf not registered in `LeafFactory`
- Dispatch mode wrong (`'handler'` instead of `'leaf'`)
- Alias not applied (param name mismatch)

**Fix**:
- Check `factory.register(YourLeaf)` in `server.ts:registerCoreLeaves`
- Verify `ACTION_CONTRACTS[actionType].dispatchMode === 'leaf'`
- Add alias: `aliases: { 'blockType': 'item' }`

---

### Stage 7: Leaf Execution

**Trace point**: `packages/minecraft-interface/src/leaves/<category>-leaves.ts`

**Symptoms**:
- Leaf runs but returns error
- Timeout exceeded
- Bot action fails (dig, place, pathfind)

**Diagnosis**:

```bash
# Check leaf execution logs
tail -f packages/minecraft-interface/logs/mc.log | grep "Leaf execution"

# Check bot status
curl -s http://localhost:3005/bot/status | jq
```

**Common causes**:
- Bot not connected (`ctx.bot` is null)
- World state doesn't match preconditions (no blocks to dig, inventory full)
- Timeout too short for operation
- Navigation blocked (NAV_BUSY, NAV_PREEMPTED)

**Fix**:
- Start Minecraft bot: `npm run start:bot`
- Prepare world state (use Docker setup commands from leaf docs)
- Increase `timeout` in `LeafSpec`
- Check navigation lease: see "Navigation Lease Debugging" below

---

### Stage 8: Verification

**Trace point**: `packages/planning/src/task-integration.ts` → `verifyByLeaf`

**Symptoms**:
- Leaf succeeded but verification fails
- Inconclusive verification loops
- Re-dispatch on successful action

**Verification modes**:

| Mode | Used by | Checks | Failure cause |
|------|---------|--------|---------------|
| `inventory_delta` | dig, collect, craft | Inventory before/after | Block→drop name mismatch (stone → cobblestone) |
| `receipt_anchored` | place_block, place_torch | Probe `get_block_at(position)` | Chunk not loaded (inconclusive), wrong block (contradicted) |
| `position_delta` | move_to, step_forward_safely | Bot position before/after | Bot didn't move expected distance |
| `none` | sense_hostiles, get_light_level | No verification | N/A |

**Diagnosis**:

```bash
# Check verification logs
tail -f packages/planning/logs/planning.log | grep verification

# Read golden-run artifact
cat artifacts/golden-run/golden-<run_id>.json | jq '.execution.verification'
```

**Common causes**:
- Tri-state inconclusive → retry probe (not re-dispatch)
- Inventory delta doesn't match expected item name
- Receipt position not probed (no `meta.leafReceipt`)

**Fix**:
- Add block→drop name mapping table
- Use receipt-anchored verification for placement leaves
- Increase probe timeout for receipt verification

---

## Navigation Lease Debugging

**File**: `packages/minecraft-interface/src/navigation-lease-manager.ts`

Navigation lease prevents concurrent pathfinding (only one task can navigate at a time).

### Symptoms
- `NAV_PREEMPTED` error with 30s backoff
- `NAV_BUSY` error with no retry

### Diagnosis

```bash
# Check navigation lease status
curl -s http://localhost:3005/api/navigation/lease | jq

# Fields:
# - isActive: true if lease is held
# - holder: "planner" or "reflex:hunger" or "reflex:health"
# - ttl: remaining time before auto-release (ms)
# - preemptReason: why lease was taken (if preempted)
```

### Lease Lifecycle

```
1. Task acquires lease → isActive=true, holder="planner", ttl=30s
2. Navigation completes → lease released
3. Reflex triggers (hunger < threshold) → preempts lease, holder="reflex:hunger"
4. Planner gets NAV_PREEMPTED → step blocked, 30s backoff
5. Reflex completes (eats food) → releases lease
6. Planner retries after backoff
```

### Fix

**If NAV_PREEMPTED**:
- Wait for 30s backoff to expire
- Check reflex controller logs: `tail -f packages/minecraft-interface/logs/mc.log | grep reflex`
- Disable reflexes in dev mode: `REFLEX_ENABLED=false`

**If NAV_BUSY**:
- Wait for current navigation to complete
- Cancel blocking task: `curl -X POST http://localhost:3002/api/tasks/<task_id>/cancel`
- Check for stuck navigation: if TTL expired but lease still held, restart MC interface

---

## Rig G (Execution Advisor) Debugging

**File**: `packages/planning/src/constraints/execution-advisor.ts`

Rig G is a fail-closed feasibility gate that blocks steps before execution.

### Decision Output

```typescript
{
  shouldProceed: boolean;
  blockReason?: string;
  suggestedParallelism: number;  // 1-3
  reorderableStepPairs: Array;
  shouldReplan: boolean;
  replanReason?: string;
}
```

### Diagnosis

```bash
# Check Rig G decision in executor logs
tail -f packages/planning/logs/planning.log | grep "Rig G"

# Look for blockReason
tail -f packages/planning/logs/planning.log | grep blockReason
```

### Common Block Reasons
- `"Version check failed"` → Rig G version mismatch
- `"Feasibility check failed"` → Step violates feasibility rules
- `"Parallelism budget exceeded"` → Too many concurrent steps

### Fix
- Check Rig G version in logs
- Review feasibility rules in `execution-advisor.ts`
- Reduce parallelism: lower `suggestedParallelism` value

---

## Copy-Paste Diagnostic Commands

### Check all services are running
```bash
curl -s http://localhost:3000/health && echo "Dashboard OK"
curl -s http://localhost:3001/health && echo "Memory OK"
curl -s http://localhost:3002/health && echo "Planning OK"
curl -s http://localhost:3003/health && echo "Cognition OK"
curl -s http://localhost:3004/health && echo "World OK"
curl -s http://localhost:3005/health && echo "MC Interface OK"
curl -s http://localhost:8766/health && echo "Sterling OK"
```

### Check task execution status
```bash
curl -s http://localhost:3002/api/tasks | jq '.tasks[] | {id, status, description, steps: .steps | length}'
```

### Check executor state
```bash
curl -s http://localhost:3002/api/executor/state | jq
```

### Check navigation lease
```bash
curl -s http://localhost:3005/api/navigation/lease | jq
```

### Test action dispatch directly
```bash
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"sense_hostiles","parameters":{}}' | jq
```

### Read latest golden-run artifact
```bash
ls -t artifacts/golden-run/*.json | head -1 | xargs cat | jq '.execution'
```

### Follow executor logs in real-time
```bash
tail -f packages/planning/logs/planning.log | grep -E "(autonomousTaskExecutor|stepToLeafExecution|Guard|NAV_)"
```

---

## Quick Diagnosis Flowchart

```
Task not appearing?
  → Check planning service: curl http://localhost:3002/health
  → Check addTask logs: tail -f planning.log | grep addTask

Task created but no steps?
  → Check Sterling expand: use sterling-smoke-runbook.md
  → Check fallback planner: grep requirementToFallbackPlan in logs

Steps blocked by validation?
  → Check KNOWN_LEAVES: grep "your_leaf" leaf-arg-contracts.ts
  → Check requiredKeys: grep "your_action" action-contract-registry.ts

Steps blocked by guards?
  → Check executor mode: echo $EXECUTOR_MODE (should be "live")
  → Check geofence: GEOFENCE_ENABLED=false (dev only)

Dispatch fails (500)?
  → Check MC interface running: curl http://localhost:3005/health
  → Check leaf registered: grep "factory.register" server.ts

Leaf runs but fails?
  → Check bot connected: curl http://localhost:3005/bot/status
  → Check world state: verify preconditions (blocks, items, etc.)
  → Check timeout: increase LeafSpec.timeout if needed

Navigation errors (NAV_PREEMPTED)?
  → Check navigation lease: curl http://localhost:3005/api/navigation/lease
  → Wait for backoff (30s) or disable reflexes: REFLEX_ENABLED=false

Verification fails?
  → Check artifact: cat artifacts/golden-run/golden-*.json | jq '.execution.verification'
  → Check mode: inventory_delta vs receipt_anchored
  → Check block→drop name mismatch (stone → cobblestone)
```

---

## Related Runbooks

- **[sterling-smoke-runbook.md](./sterling-smoke-runbook.md)**: Test Sterling → leaf pipeline end-to-end
- **[leaf-creation-runbook.md](./leaf-creation-runbook.md)**: Implement new leaves with full integration
- **[receipt-anchored-verification-runbook.md](./receipt-anchored-verification-runbook.md)**: Debugging tri-state verification

---

*Last updated: 2026-02-12*
*Source: `docs/leaf-execution-pipeline.md` → Pipeline Overview, Failure Modes sections; `docs/bot-sterling-task-execution-pipeline.md` → Guard Pipeline section*
