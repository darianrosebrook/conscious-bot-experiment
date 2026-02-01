# Mock Data and Fallback Investigation

**Scope**: conscious-bot monorepo.  
**Focus**: Mock data, default/fallback thoughts/tasks/plans/goals, and any code that substitutes or interferes with real APIs for the bot's internal state (thoughts, actions, goals, tasks, plans, memories).

**Exclusions**: Test-only mocks (`__tests__`, `test-utils`, `vi.fn()`, etc.) are noted but not treated as production interference.

---

## 1. Summary Table

| Area | Location | Type | Interferes with real API? |
|------|----------|------|----------------------------|
| Dashboard config | `dashboard.config.ts`, `dashboard-context.tsx` | Config only | No (keys never read for substitution) |
| Cognition – observations | `observation-reasoner.ts` | Fallback thoughts | Yes (LLM failure → generic fallback thought) |
| Dashboard – cognitive stream | `api/ws/cognitive-stream/route.ts` | Fallback thoughts | Yes (cognition unavailable → empty thoughts) |
| Dashboard – tasks API | `api/tasks/route.ts` | Fallback tasks | Yes (planning error → synthetic "maintenance" tasks) |
| Minecraft – state API | `minecraft-interface/server.ts` | Default state | Yes (no bot/adapter → empty goals/tasks/inventory) |
| Minecraft – environment | `environmental-detector.ts` | Mock env data | Yes (comment: "return mock data based on position") |
| Planning – Sterling planner | `sterling-planner.ts` | Empty/fallback steps | Yes (API fail → `[]`; no plan → `step-fallback-*`) |
| Planning – thought processor | `cognitive-thought-processor.ts` | Placeholder task history | Yes (placeholder data from recentTaskKeys) |
| Planning – modular server | `modular-server.ts` | Placeholder leaves | Yes (placeholder BT leaves return failure) |
| Memory – system | `memory-system.ts` | Placeholder export/backup | Partial (export returns `[]`) |
| Memory – signal generator | `memory-signal-generator.ts` | Placeholder salient memories | Yes (returns `[]`) |
| Plan executor | `plan-executor.ts` | Placeholder latency | No (metrics only) |
| Dashboard – stream route | `api/stream/route.ts` | Placeholder stream | Yes (sends "unavailable" until planning responds) |
| Dashboard – inventory/tasks | `api/inventory/route.ts`, `api/tasks/route.ts` | Fallback items/tasks | Yes (on upstream failure) |

---

## 2. Dashboard: Mock/Mock-Fallback Config (Unused)

**Files**: `packages/dashboard/dashboard.config.ts`, `packages/dashboard/src/contexts/dashboard-context.tsx`

- **`enableMockData`**: `process.env.DASHBOARD_ENABLE_MOCK_DATA === 'true'` (default false).
- **`mockDataFallback`**: `process.env.DASHBOARD_MOCK_DATA_FALLBACK !== 'false'` (default true in context defaults).

**Finding**: These keys are **never read** in the codebase to substitute API responses. No `config.dashboard.mockDataFallback` or `config.dashboard.enableMockData` usage was found. They are dead config; removing or wiring them is a product decision.

---

## 3. Cognition: Observation Reasoner – Fallback Thoughts

**File**: `packages/cognition/src/environmental/observation-reasoner.ts`

- On LLM failure or timeout, `createFallback()` is used and returns an `ObservationInsight` with:
  - **Thought text**: From `buildFallbackThought(payload)` (entity/environment-specific or generic).
  - **Generic fallback**: `GENERIC_FALLBACK_THOUGHT = 'I remain aware of my surroundings and continue monitoring.'`
  - **Tasks**: Always `tasks: []`.
  - **Flags**: `fallback: true`, `source: 'fallback'`.

**Interference**: Real observation API is replaced by a synthetic thought when the LLM fails. Downstream (e.g. cognitive stream) can receive these fallback thoughts instead of real reasoning.

**Related**: Dashboard cognitive-stream route treats "generic fallback" messages specially (`isGenericFallback()`) and deduplicates them over 5 minutes.

### 3b. LLM-generated thoughts vs observation fallbacks

Thoughts such as **"I need to gather wood before it gets too dark. [GOAL: collect oak_log 5]"** are **LLM-generated**, not observation-reasoner fallbacks.

- **Source**: Enhanced thought generator (`thought-generator.ts`) or internal thought API (`llm-interface.ts`), which call the MLX/LLM. The `[GOAL: ...]` tag is produced by the model following the prompt instruction in `llm-interface.ts` (e.g. "When expressing an action intention, end your thought with a goal tag like [GOAL: collect oak_log 8]...").
- **Identification**: These thoughts have `cognitiveSystem: 'llm-core'`, `thoughtType: 'reflection'`, and no `fallback: true`.
- **Observation fallbacks** instead have `source: 'fallback'`, `fallback: true`, and content like "Observing environment and deciding next action" or the generic "I remain aware of my surroundings and continue monitoring." So run-log thoughts that look like goal-oriented reflections (e.g. "gather wood before it gets too dark") are from the LLM, not from the observation fallback path.

---

## 4. Dashboard: Cognitive Stream – Fallback Thoughts

**File**: `packages/dashboard/src/app/api/ws/cognitive-stream/route.ts`

- When fetching from the cognition service fails, `fetchThoughtsFromCognition()` catches and returns `[]` (no thoughts).
- Message: `'Cognition service unavailable, using fallback thoughts:'` (then empty array).
- **Generic fallback detection**: `isGenericFallback()` matches patterns like "processing current situation", "maintaining awareness", "observing surroundings", "monitoring environment", "processing intrusive thought". Such thoughts are deduplicated over 5 minutes.

**Interference**: When cognition is down, the UI gets no thoughts (empty array). The "fallback thoughts" log is misleading—it's really "no thoughts." Generic fallback thoughts from observation-reasoner are then filtered/deduplicated here.

---

## 5. Dashboard: Tasks API – Fallback Tasks

**File**: `packages/dashboard/src/app/api/tasks/route.ts`

- On planning fetch error, the route returns **synthetic tasks** instead of failing or returning empty:
  - **Development**: Diagnostic-style tasks (e.g. "Planning service unavailable", "System fallback tasks") with steps like "Diagnose error", "Check planning service status", etc.
  - **Production**: Single synthetic task "System maintenance in progress" with steps "System monitoring active", "Service recovery in progress", "Normal operation resuming".
- Response includes `fallback: true`, `status: 'degraded'` or `'maintenance'`.

**Interference**: Real tasks from the planning service are replaced by fake "maintenance/fallback" tasks. UI and any consumer of this API cannot distinguish real bot tasks from these synthetic ones without checking `fallback`.

---

## 6. Minecraft Interface: State API – Default State When Bot/Adapter Missing

**File**: `packages/minecraft-interface/src/server.ts`

- When `!minecraftInterface || !botStatus?.connected`, the `/state` (or equivalent) response is built from `executionStatus?.bot` and **hardcoded defaults**:
  - **planningContext**: `currentGoals: []`, `activeTasks: []`, `recentEvents: []`, fixed `emotionalState` (e.g. confidence 0.5, anxiety 0.1).
  - **inventory.items**: `[]` (comment: "This will be populated with actual bot inventory items").
  - **environment**: `nearbyBlocks: []`, `nearbyEntities: []`, etc.
- When bot is null or getBot() throws, response is again minimal (e.g. position 0,64,0, health 0, empty inventory).

**Interference**: Real bot state is replaced by a minimal/default state. Goals and tasks are always empty in these paths; inventory and world state are not from the real game.

---

## 7. Minecraft Interface: Environmental Detector – Mock Data

**File**: `packages/minecraft-interface/src/environmental-detector.ts`

- `analyzeEnvironment(position)`: Comment states "For now, return mock data based on position."
- Biome/dimension come from `estimateBiomeFromPosition` / `estimateDimensionFromPosition` (with optional real bot world query); weather and scores are derived from that. So data is partially heuristic/mock rather than full real-world integration.

**Interference**: Environment state used by the bot can be mock/heuristic instead of actual Minecraft world data, depending on code path.

---

## 8. Planning: Sterling Planner – Empty and Fallback Steps

**File**: `packages/planning/src/task-integration/sterling-planner.ts`

- **`fetchBotContext()`**: On failure or non-ok response, returns `{ inventory: [], nearbyBlocks: [] }`. So planning sees empty context instead of real inventory/blocks.
- **`generateDynamicSteps()`**: Can return `[]` when backend is `'unplannable'` or when all solver paths fail (after "falling through").
- **`generateLeafMappedSteps()`**: When there is a fallback plan, steps are created with ids `step-fallback-${taskId}-${index + 1}`. So "fallback" here means compiler/requirement-based steps, not necessarily real Sterling plans.

**Interference**: Real inventory/nearbyBlocks are replaced by empty arrays on API failure. Task steps can be empty or only fallback (compiler) steps when Sterling is unavailable or fails.

---

## 9. Planning: Cognitive Thought Processor – Placeholder Task History

**File**: `packages/planning/src/cognitive-thought-processor.ts`

- **`getRecentTaskHistory(limit)`**: Comment "For now, return placeholder data." Returns entries derived from `this.recentTaskKeys` (key + timestamp + type from key prefix), not from a real task-history API.

**Interference**: Memory/context that expects real task history gets placeholder data derived from in-memory keys, not from the actual task store or planning API.

---

## 10. Planning: Modular Server – Placeholder Minecraft Leaves

**File**: `packages/planning/src/modular-server.ts`

- "Register placeholder Minecraft leaves" creates minimal LeafImpls for BT registration (e.g. `move_to`, `dig_block`, `place_block`, …).
- Each placeholder `run()` returns `{ status: 'failure', error: { detail: 'placeholder' }, ... }`.

**Interference**: If these placeholders are ever invoked instead of real Minecraft leaves, actions always fail with a placeholder error. They are intended for registration/validation only; any use in live execution would override real behavior.

---

## 11. Memory: Placeholder Implementations

**Files**:
- `packages/memory/src/memory-system.ts`: `exportMemories()` returns `[]` (placeholder). Critical-memory backup queue has a no-op placeholder ("this is a placeholder").
- `packages/memory/src/memory-signal-generator.ts`: `findSalientMemories()` returns `[]` and logs "Finding salient memories (placeholder implementation)".
- `packages/memory/src/neuroscience-consolidation-manager.ts`: One placeholder returning empty array (line ~476).

**Interference**: Export and salient-memory APIs do not return real data; backup path for critical memories is not implemented. Callers (e.g. context for reasoning) get empty results instead of real memories.

---

## 12. Dashboard: Stream and Other API Fallbacks

**File**: `packages/dashboard/src/app/api/stream/route.ts`

- SSE endpoint fetches from `http://localhost:3002/live-stream`. Initial payload has `connected: false`, `placeholder: false`, `message: 'Live stream data unavailable'`. If planning responds with success and streamData, those are used; otherwise the UI keeps seeing "unavailable" or error state.

**Interference**: Stream is a proxy to planning; when planning is down, the dashboard shows unavailable rather than real stream data. The word "placeholder" in comments refers to this default-unavailable state.

**Other**:
- **Inventory route** (`api/inventory/route.ts`): On item or full fetch failure, returns fallback items or a fallback response with `fallback: true`.
- **Tasks route**: See section 5.

---

## 13. Other Placeholders (Lower Impact or Non-API)

- **plan-executor.ts**: `getNetworkLatency()` / `updateNetworkLatency()` use placeholder/simulated values (50 ms default, random 10–110 ms). Affects metrics only, not task/plan content.
- **safety-monitoring-system.ts**: CPU usage set to placeholder `0.1`.
- **evaluation (benchmarking)**: Placeholder "cognitive benchmarks" and "placeholder trends" in benchmark runner/benchmarker.
- **core/signal-processor.ts**: Placeholder for timer-based processing.
- **world (perception)**: Placeholder "previous focus", "placeholder classification", "goal-driven attention placeholder".
- **BehaviorTreeRunner.ts**: "Initialize with a placeholder tree, will be loaded in execute()" (runtime load intended).
- **minecraft-interface/server.ts**: Screenshot endpoint uses `via.placeholder.com` image URLs when Prismarine viewer is disabled (UI only).
- **action-translator.ts**: Comment "placeholder that should be enhanced with proper BT execution" (behavior tree execution path).

---

## 14. Recommendations

1. **Dashboard mock config**: Either remove `enableMockData` / `mockDataFallback` or implement and document where they gate real vs mock/fallback data. Today they are unused.
2. **Observation reasoner**: Make fallback behavior explicit (e.g. feature flag or strict mode): either omit posting to cognitive stream on LLM failure or clearly tag fallback thoughts so downstream can filter or display differently.
3. **Tasks API**: Consider returning `{ tasks: [], fallback: true, error: ... }` instead of synthetic maintenance tasks, so the UI can show "tasks unavailable" rather than fake tasks. If synthetic tasks are kept, ensure all consumers check `fallback`.
4. **Minecraft state API**: Document that when bot/adapter is missing, response is minimal/default and not real state; consider 503 + empty or no `planningContext` instead of default goals/tasks.
5. **Environmental detector**: Replace or clearly fence "mock data based on position" with real world queries or document as best-effort when real data is unavailable.
6. **Sterling planner**: On `fetchBotContext()` failure, consider failing the planning step or propagating "context unavailable" instead of silently using empty inventory/blocks.
7. **Cognitive thought processor**: Replace `getRecentTaskHistory` placeholder with real task-store or planning API integration.
8. **Memory**: Implement or remove `exportMemories` and `findSalientMemories`; implement or remove critical-memory backup in memory-system.
9. **Placeholder leaves**: Ensure BT execution never uses the modular-server placeholder leaves in production (only for registration). Add a runtime check or separate registration from execution so real Minecraft leaves are always used when available.

---

## 15. Quick Reference: Files to Change for Real-API-Only Behavior

| Goal | Primary files |
|------|----------------|
| No fallback thoughts (cognition) | `packages/cognition/src/environmental/observation-reasoner.ts` |
| No fallback/empty thoughts in UI | `packages/dashboard/src/app/api/ws/cognitive-stream/route.ts` |
| No synthetic tasks on planning failure | `packages/dashboard/src/app/api/tasks/route.ts` |
| No default state when bot missing | `packages/minecraft-interface/src/server.ts` |
| Real environment data | `packages/minecraft-interface/src/environmental-detector.ts` |
| Real bot context in planning | `packages/planning/src/task-integration/sterling-planner.ts` |
| Real task history in thought processor | `packages/planning/src/cognitive-thought-processor.ts` |
| Real memory export / salient memories | `packages/memory/src/memory-system.ts`, `memory-signal-generator.ts` |
| No placeholder BT leaves in execution | `packages/planning/src/modular-server.ts` |
| MCP snapshot uses real position (not 0,64,0) | `packages/mcp-server/src/conscious-bot-mcp-server.ts` (use `player.position` from world state) |

---

## 16. Log Review (post-fix-run.log)

Review of `post-fix-run.log` to map log sources per service and surface issues that align with or extend the mock/fallback investigation.

### 16.1 Log sources by service

| Service | Log prefix / pattern | Examples |
|---------|----------------------|----------|
| Dashboard | `[Dashboard]` | POST/GET routes, "Broadcasting message to 0 connections", "Loaded N thoughts", "New thought added" |
| Minecraft Interface | `[Minecraft Interface]` | "No world state available for HUD update", "[ThreatPerception]", "Planning cycle error", "Bot state updated" |
| Planning | `[Planning]` | "WorldStateManager poll result", "WorldStateManager no meaningful change", "[MCP] Bot instance updated", "[CognitiveStream] Fetched N thoughts" |
| Cognition | `[Cognition]` | "Enhanced thought generator has 0 recent thoughts", "Received external thought", "Thought sent to cognitive stream" |
| MCP (in Planning) | `[MCP]` or `[Planning] [MCP]` | "createWorldSnapshot called", "Creating snapshot from world state", "Snapshot created successfully" |
| Health / runner | `[Core API]`, `[Memory]`, `[World]`, etc. `[HEALTH]`, `[SUCCESS]`, `[INFO]` | Health checks, readiness, service status |

### 16.2 Recurring issues visible in logs

1. **No plan available for execution (Minecraft Interface)**  
   Every ~15s: `Planning cycle error: Error: No plan available for execution` then `Planning cycle ended: No plan available for execution (0/0 steps)`.  
   **Tie-in**: Plan executor has no active plan; planning either returns no tasks or minecraft-interface does not receive/apply them. Directly related to "No plan" path in plan-executor and task/plan fallbacks.

2. **Repeated status thought (Minecraft Interface → Cognition → Dashboard)**  
   Every planning cycle failure: same thought posted: "Health: 100%, Hunger: 100%. Observing environment and deciding next action."  
   **Tie-in**: Default/fallback thought when there is no plan; floods cognitive stream and history. Planning’s `[CognitiveStream] Fetched N thoughts` shows N identical copies. Consider deduplication or not posting when there is no plan.

3. **No world state available for HUD update (Minecraft Interface)**  
   Frequent: `[Minecraft Interface] No world state available for HUD update`.  
   **Source**: `packages/minecraft-interface/src/server.ts` (HUD update path). Indicates world state not provided for the HUD at that moment (e.g. bot not ready or endpoint returning no world state). Not mock data per se but a missing-data path.

4. **MCP snapshot position wrong (Planning/MCP)**  
   Log shows minecraft interface returning `data.worldState.player.position: { x: 67.5, y: 63, z: -105.5 }` but MCP "Snapshot created successfully" has `position: { x: 0, y: 64, z: 0 }`.  
   **Cause**: `packages/mcp-server/src/conscious-bot-mcp-server.ts` builds snapshot with `worldState.playerPosition || worldState.agentPosition || { x: 0, y: 64, z: 0 }`. The API provides `worldState.player.position`, not `playerPosition`/`agentPosition`, so the code falls back to default.  
   **Fix**: Use `worldState.player?.position` (or equivalent from the actual minecraft-interface response shape) so the snapshot uses real position instead of default.

5. **WorldStateManager no meaningful change (Planning)**  
   Many lines: `WorldStateManager no meaningful change` (sometimes with `[Planning]` prefix, sometimes without).  
   **Source**: `packages/planning/src/world-state/world-state-manager.ts`. When poll result differs from previous snapshot by less than the "meaningful" threshold, this is logged. Inconsistent prefix is likely interleaved stdout from multiple processes. Consider reducing frequency (e.g. debug level or rate limit) to cut log volume.

6. **ThreatPerception / LOS suppression (Minecraft Interface)**  
   Repeated `[ThreatPerception] localized threat assessment: 0 threats, level: low` and `suppressed N LOS logs in last 5000ms (drowned:N, creeper:N, spider:N)`.  
   Informational; suppression is intentional. If desired, these could be moved to debug or rate-limited.

### 16.3 Emoji usage in logs

Project rule: emojis banned except (for debug logs) ⚠️, ✅, 🚫.

**In post-fix-run.log:**

- **Allowed in debug context**: ⚠️ (planning cycle ended), ✅ (health, readiness, thought sent, etc.).
- **Present and likely to be disallowed in code/docs**: 🧠 (Cognition service, ThreatPerception), 🔍 (Checking service health, MINECRAFT INTERFACE, Bot state updated), 📋 (Enhanced thought generator), 🔄 (Starting autonomous planning cycle), 📊 (Service Status), 🚦 (Broadcasting readiness), 🔗 (Quick Actions), 🎮 (Minecraft Commands), 🛑 (To stop), 💡 (Services are running), 🎉 (All services passed, Conscious Bot System is running).

Recommendation: Restrict log/dashboard emojis to ⚠️, ✅, 🚫 and replace the rest with plain text (e.g. "[Cognition]", "Threat assessment", "Planning cycle started") in the packages that emit these lines.

### 16.4 Additions to mock/fallback list from log review

| Item | Location | Notes |
|------|----------|--------|
| MCP world snapshot position | `mcp-server/conscious-bot-mcp-server.ts` | Uses `playerPosition`/`agentPosition`; API has `player.position`. Fallback `{ x: 0, y: 64, z: 0 }` used instead of real position. |
| Repeating "Observing environment" thought | Minecraft Interface → Cognition | Emitted every planning cycle when no plan; acts as a default thought and floods stream. |
| "No world state available for HUD update" | minecraft-interface/server.ts | Not mock data but a recurring missing-data path; HUD gets no world state when this fires. |

---

*Investigation completed by parallel search and code review. Test-only mocks and UI-only placeholders (e.g. input placeholder text, asset fallbacks) are omitted from "interferes" where they do not feed bot state. Section 16 added from post-fix-run.log review.*
