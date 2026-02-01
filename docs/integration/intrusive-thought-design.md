# Intrusive Thought Interface: Design and Human-Aligned Behavior

Design for how the bot experiences intrusive thoughts (no external attribution), how it decides to act or resist (bias toward accepting unless it can fight it off), and how the dashboard tracks chain-of-thought vs intrusive thoughts with deduplication. Includes research summary and circle-back behavior.

**Author:** @darianrosebrook

---

## Implementation status

Links point to the implementing file and line(s). Update this section as implementation progresses.

| Area | Status | Location |
|------|--------|----------|
| **Provenance in cognitive stream (intrusion)** | Implemented | [packages/cognition/src/server.ts](packages/cognition/src/server.ts#L1610-L1615) – intrusive thought payload sets `attribution: 'self'`, `thoughtType: 'intrusive'`, `provenance: 'intrusion'` |
| **Dashboard: accept provenance, persist on thoughts** | Implemented | [packages/dashboard/src/app/api/ws/cognitive-stream/route.ts](packages/dashboard/src/app/api/ws/cognitive-stream/route.ts#L797-L854) – extract provenance, intrusive dedup by canonical content + 8 min |
| **Dashboard: types (provenance, Interoception)** | Implemented | [packages/dashboard/src/types/index.ts](packages/dashboard/src/types/index.ts#L14-L23) – `Interoception` (stress, focus, curiosity); [L39](packages/dashboard/src/types/index.ts#L39) – `Thought.provenance` |
| **Dashboard: UI display CoT vs Intrusive** | Implemented | Store and hooks use `provenance`; UI can filter/label (see dashboard store and cognitive-stream route). |
| **Consideration step (accept/resist before task)** | Implemented | [packages/cognition/src/server.ts](packages/cognition/src/server.ts#L1589-L1627) – `runConsiderationStep`; gated by `ENABLE_CONSIDERATION_STEP=true`; resist returns early with `recorded: true` |
| **Stress / interoception backend (cognition)** | Implemented | [packages/cognition/src/interoception-store.ts](packages/cognition/src/interoception-store.ts) – 6-axis `StressAxes` interface, weighted composite, `setStressAxes`, `decayStressAxes`, `setStressAxis`; [packages/cognition/src/server.ts](packages/cognition/src/server.ts) GET `/state` includes `intero` with `stressAxes` |
| **Stress axis computer (world state → axes)** | Implemented | [packages/cognition/src/stress-axis-computer.ts](packages/cognition/src/stress-axis-computer.ts) – `computeStressAxes`, `blendAxes`, `buildStressContext`, `buildWorldStateSnapshot`; integrated in cognition server periodic thought loop |
| **Stress updates from intrusive-thought outcome** | Implemented | [packages/cognition/src/interoception-store.ts](packages/cognition/src/interoception-store.ts) `updateStressFromIntrusion` targets `stressAxes.situational`; recomputes composite |
| **Cognition `/state` exposes intero (stress axes)** | Implemented | [packages/cognition/src/server.ts](packages/cognition/src/server.ts) – `intero: getInteroState()` returns `stress`, `focus`, `curiosity`, `stressAxes` |
| **Dashboard bot-state consumes intero** | Implemented | [packages/dashboard/src/app/api/ws/bot-state/route.ts](packages/dashboard/src/app/api/ws/bot-state/route.ts) `buildBotStatePayload`; fallback includes `stressAxes` defaults |
| **Sleep reset / halve stress axes** | Implemented | [packages/cognition/src/server.ts](packages/cognition/src/server.ts) POST `/stress/reset` accepts `spawnPosition`, resets `msSinceLastRest`; `halveStressAxes()` gives time/healthHunger 0.3x, others 0.5x; [packages/minecraft-interface/src/server.ts](packages/minecraft-interface/src/server.ts) forwards `spawnPosition` on `respawned` |
| **Hexagonal grid stress heatmap (dashboard)** | Implemented | [packages/dashboard/src/components/stress-hex-heatmap.tsx](packages/dashboard/src/components/stress-hex-heatmap.tsx) – 6-sector mapping by dominant axis when `stressAxes` present; axis labels around perimeter; fallback to focus-based sectors |
| **Stress context in LLM prompts** | Implemented | [packages/cognition/src/stress-axis-computer.ts](packages/cognition/src/stress-axis-computer.ts) `buildStressContext` → natural-language fragments (never says "stress"); injected into: observation-reasoner, thought-generator (idle + social), consideration step, periodic thought loop |
| **Stress meter uses real cognition intero** | Implemented | [packages/minecraft-interface/src/server.ts](packages/minecraft-interface/src/server.ts) – dashboard push and hud_update include cognition intero; [packages/dashboard/src/app/page.tsx](packages/dashboard/src/app/page.tsx) – hud_update prefers `hudData.intero` when present |
| **Observational research: log stress at decision boundaries** | Implemented | [packages/cognition/src/stress-boundary-logger.ts](packages/cognition/src/stress-boundary-logger.ts) – `logStressAtBoundary` includes `axisVector: [time, situational, healthHunger, resource, protection, locationDistance]` for CSV extraction |

---

## 1. Research: How Humans Are Influenced by Intrusive Thoughts

### 1.1 Intrusive thoughts feel like one's own

- Intrusive thoughts are **generated internally** and typically **experienced as one's own** cognitions, not as an external voice or imposition.
- Attribution (whether a thought feels "mine" or "external") depends on **metacognitive appraisals**. When metacognitive beliefs align with the intrusive nature of the thought, it is experienced as one's own **unwanted** thought.
- Distress comes from **interpretation and significance** (e.g. catastrophic misinterpretation), not from the thought being labeled "from outside."

So for the bot: it should **never** be told that a thought came from an "outside source." It should experience the thought as its own; we only track provenance for **dashboard/analytics** (so humans can see chain-of-thought vs intrusion).

### 1.2 Suppression backfires; acceptance and resistance

- **Suppression** (trying to eliminate or control unwanted thoughts) is largely **counterproductive**: thought frequency and distress can increase.
- **Acceptance-based** approaches and **focused distraction** are more effective than suppression. Acceptance reduces discomfort by changing one's **relationship** to the thought rather than trying to eliminate it.
- People often assume that controlling thoughts is possible and necessary, leading to suppression strategies that backfire. The goal should shift from eliminating thoughts to **deciding what to do with them** (act, dismiss, or sit with them).

So for the bot: we should **nudge** it to decide what to do with the thought (act on it or resist/dismiss). We **bias toward accepting** (acting on it) unless the bot can articulate a reason to resist; resistance is a deliberate cognitive step, not suppression.

---

## 2. Bot Experience: No External Indication, Nudge + Bias Accept Unless Resist

### 2.1 No indication of outside source

- The bot must **never** see any field or content that says the thought came from "intrusion," "external suggestion," or "outside."
- **Attribution** in the cognitive stream and in any internal representation stays **`attribution: 'self'`** so the bot's "experience" is that the thought is its own.
- **Provenance** (that the thought entered via the intrusion interface) is **metadata only** for the dashboard and analytics. It is not passed into the bot's reasoning prompts or decision steps.

### 2.2 Nudge to decide what to do

- The bot is **nudged** to make an explicit decision: act on the thought (accept) or dismiss it (resist).
- This can be implemented as a **consideration step** before creating a task: present the thought as an internal thought (no label), and ask the bot (via a short LLM call or a heuristic) to choose "accept" or "resist" and optionally why.
- **Bias toward accepting**: the prompt or policy can state that "most of the time we act on our thoughts unless there's a good reason not to." So by default the bot accepts (creates task / acts); it resists only when it can "fight it off" (e.g. reason that the thought is unsafe, off-mission, or redundant).

### 2.3 Current vs desired flow

- **Current:** Intrusion content is parsed, policy-rewritten, grounded, and turned into a task. There is no explicit "do I want to act on this or dismiss it?" step; suppression is only by duplicate content (canonical + time window).
- **Desired:** (1) Present thought as internal (no "intrusive" label in content or in the bot’s view). (2) Optional **consideration step**: "You had the thought: &lt;content&gt;. Do you want to act on it (accept) or dismiss it (resist)? Reply accept or resist and optionally why." Bias: accept unless the bot resists. (3) If accept: continue to parse, ground, and create task. If resist: return accepted: false, response: "Dismissed", recorded: true; do not create task. (4) All stream/dashboard payloads use attribution 'self' and metadata provenance 'intrusion' for humans only.

### 2.4 Acceptance of Intrusive Thoughts and Stress

- **Current:** No indication of affecting stress level
- **Desired:** Stress is affected by how many intrusive thoughts are detrimental to bot's state of being vs beneficial to state of being. Bot should reason about whether it's a good idea or not as an indication of which direction to influence the stress meter, and the rejection of it should bias more towards improving stress levels.

---

### 2.5 Research: How Stress Influences Decision-Making and Behavior

- **Acute stress:** Impairs decision quality, increases perception of time pressure, and narrows focus (people become more exploitative—favoring immediate options over exploring alternatives). Attention allocation is a key mechanism.
- **Chronic stress:** Pushes toward rigid, habitual responses rather than deliberative choices; also promotes overexploitation in serial decisions.
- **Modulating factors:** Decision complexity, time pressure, and individual variation in stress responsiveness affect how severely stress impairs decisions.

**Implications for the bot:** Stress can be modeled as a meter that (1) is updated by intrusive-thought outcomes (resist vs accept; beneficial vs detrimental), with rejection biasing toward lower stress, and (2) can influence behavior when fed into reasoning (e.g. high stress nudging toward simpler, more habitual responses or higher perceived urgency). The bot should have access to its current stress (and health) when generating responses so that behavior can reflect internal state.

---

## 3. Bot State: Health, Stress, and Where They Live

### 3.1 Current Architecture

- **Health:** Source of truth is the Minecraft bot (`bot.health` 0–20). It flows from minecraft-interface (bot-adapter emits `health_changed`, `/state` returns `worldState.player.health`) to cognition (observation payloads include `bot.health`) and to the dashboard (bot-state route fetches minecraft `/state` and builds `vitals.health`). Health is used for survival logic, observation context, and HUD display.
- **Stress (and interoception):** Cognition owns interoception in [interoception-store.ts](packages/cognition/src/interoception-store.ts). The dashboard receives real intero from: (1) bot-state SSE/JSON route (fetches cognition `/state`), (2) minecraft-interface push to dashboard (includes cognition), (3) hud_update over WebSocket (includes cognition intero when available). Falls back to derived values from safety/curiosity or defaults only when cognition is unavailable.
- **Cognition `/state`:** Returns cognitiveCore, constitutionalFilter, intrusionInterface, selfModel, socialCognition—no vitals, no interoception. So cognition does not currently expose or own stress.

### 3.2 Desired: Single Source of Truth for Stress (and Interoception)

- **Owner:** Cognition should own **interoception state** (stress, focus, curiosity) because:
  - Intrusive thought acceptance/rejection is processed in cognition; stress updates naturally follow from that outcome.
  - Other cognitive events (e.g. reflection, observation salience) can later influence stress/focus/curiosity in one place.
- **Storage:** In-memory store in cognition with defaults (e.g. stress: 20, focus: 80, curiosity: 75), clamped 0–100. Optionally persisted (e.g. file or DB) for continuity across restarts.
- **API:** Cognition `/state` should include `data.intero` (stress, focus, curiosity) so the dashboard and other consumers can read it. Dashboard bot-state route should fetch cognition `/state` and use `state.data.intero` when present, falling back to current hardcoded intero.
- **Updates:**
  - **Intrusive thought outcome:** After `IntrusiveThoughtProcessor.processIntrusiveThought` returns, cognition server updates stress: e.g. resist (rejection) → decrease stress (bias toward improvement); accept + detrimental → increase stress; accept + beneficial → decrease or hold. "Detrimental vs beneficial" can come from an optional LLM or heuristic (e.g. safety/policy rewrite already signals risk; task category or target can signal benefit/detriment).
  - **Optional:** Health loss events (already forwarded to cognition for observation) could increase stress; health gain or safe periods could decrease it.
- **Feeding stress into behavior:** When generating responses (observation reasoning, intrusive-thought consideration, task selection), pass current stress (and health) into context so the bot's reasoning can be influenced by internal state (e.g. high stress → more cautious or more habit-oriented, per research).

### 3.3 Multi-Axis Stress Model (Gating, Not "Poor Choices" Signal)

Stress must **not** be presented to the bot as "you are stressed, therefore make worse decisions." Instead it should function as a **gating matrix** of situational dimensions that inform context. Each dimension is an axis; reasoning receives the full vector so the model can weigh trade-offs (e.g. low resource stress but high time stress).

**Proposed axes (map to hexagonal grid):**

- **Time stress** – urgency, deadlines, how long since last rest or goal progress
- **Situational stress** – immediate threats, unexpected events, task failure or backtracking
- **Health/hunger stress** – low health or food (already in vitals; can be normalized as stress contribution)
- **Resource abundance stress** – scarcity of key items, inventory pressure
- **Protection level** – armor, shelter, exposure (e.g. night vs day, biome danger)
- **Location/distance from home** – distance from bed/spawn or safe anchor; disorientation

**Hexagonal grid visualization (dashboard):** Use a **hexagonal grid heatmap** to show stress state, inspired by the agent-agency `HexagonHeatmap` component (axial coordinates, `hexSpiral` from center, flat-top hex path). Semantics:

- **Center** = relatively low stress (calm); **edges** = highest stress. Map the stress vector to a grid cell (e.g. discretize axes and map to axial (q,r) or ring + direction).
- **Heat / color** = how often the bot has been in that state (dwell time or visit count). Style cells so that frequently occupied states are visually distinct (e.g. warmer or brighter), so operators see which stress regions the bot tends to inhabit.
- **Current state** = the cell corresponding to the current stress vector is highlighted with a **thick, visible outline** (e.g. stronger stroke or ring) so the current position in the grid is obvious at a glance.

Implementation reference: `agent-agency/apps/agent_management_dashboard/src/components/HexagonHeatmap.tsx` (axial coords, `hexRing`/`hexSpiral`, `hexPath`, color by value). Adapt so that (1) value per hex = dwell frequency or visit count for that state, (2) one hex is marked as "current" with a distinct outline (e.g. `strokeWidth` and/or `stroke` color).

**Current hex grid axes (dashboard):** The live heatmap is implemented in [packages/dashboard/src/components/stress-hex-heatmap.tsx](packages/dashboard/src/components/stress-hex-heatmap.tsx). It uses two dimensions:

- **Radial (center to edge):** **Composite stress** 0–100 (weighted mean of 6 axes). Ring 0 = stress 0–19 (center), ring 1 = 20–39, ring 2 = 40–59, ring 3 = 60–79, ring 4 = 80–100 (edge). Center = lowest stress band.
- **Angular (6 directions on each ring):** When `stressAxes` is available, sector is determined by the **dominant axis** (highest value): 0=Time, 1=Situational, 2=Health/Hunger, 3=Resource, 4=Protection, 5=Location. Axis labels are rendered around the hex perimeter. When `stressAxes` is absent, falls back to focus-based sector mapping.

**Why "neutral" is not the center tile:** Default interoception is stress 20, focus 80. Stress 20 falls in ring 1 (bucket 20–39), so the current state is drawn one hex out from center. The center (ring 0) is reserved for the lowest stress band (0–19). So neutral appears one step from center by design.

**Internal representation (implemented):** The six axes are stored in `InteroState.stressAxes` (each 0–100). A weighted composite (`stress`) is computed for backward compatibility. The `buildStressContext()` function in `stress-axis-computer.ts` converts axes to natural-language situational fragments (e.g. "I need to address my health or hunger soon.", "I'm far from anywhere familiar or safe.") — it never uses the word "stress". These fragments are injected into LLM prompts at five sites: observation reasoner, idle thought, social consideration, internal thought generation, and the consideration step. Axis weights: situational 0.25, healthHunger 0.20, time/resource/protection 0.15 each, locationDistance 0.10.

**Sleep reset:** After the bot sleeps (or respawns at bed), apply a **reset or halving** of stress axes (e.g. all axes multiplied by 0.5, or time/situational reset to baseline). This models recovery and prevents unbounded accumulation. Exact rule (full reset vs halve vs per-axis) can be tuned.

**Observational research tracking:** Because this is an observational research project, we should **log and correlate**:

- **Stress state over time** – snapshot of all axes at thought/decision boundaries (e.g. when generating observation thought, when accepting/resisting intrusion, when selecting a task)
- **Thought outcomes** – what thought was produced, what action (if any) was taken, and the stress vector at that moment
- **Events** – health changes, sleep, death, resource changes, location changes so we can correlate "what happened to the bot" with "how its thoughts and stress evolved"

This allows post-hoc analysis: e.g. "When time stress and situational stress were both high, did the bot favor habitual vs exploratory choices?" without hard-coding "high stress → bad decisions" into the prompt.

### 3.4 Access and Update Points (Summary)

| Data    | Source of truth       | Read by                         | Updated by                                      |
|---------|------------------------|---------------------------------|-------------------------------------------------|
| Health  | Minecraft bot         | Cognition, dashboard, planning | Minecraft (damage/healing)                      |
| Stress (axes) | Cognition (new) | Dashboard, cognition prompts   | Cognition (intrusive-thought outcome; health/events; sleep reset/halve) |
| Focus   | Cognition (new)       | Dashboard                       | Cognition (optional: task completion, intrusion) |
| Curiosity | Cognition (new)      | Dashboard                       | Cognition (optional: novelty, exploration)      |

Stress is a **multi-axis vector** (time, situational, health/hunger, resource, protection, location); center = calm. Not a single "stress = poor choices" signal. Sleep resets or halves axes. Stress + thought outcomes logged for observational correlation.

---

## 4. Dashboard: Tracking Chain-of-Thought vs Intrusive, and Deduplication

### 4.1 Provenance for display

- **Provenance** indicates how the thought entered the system for **dashboard display only**:
  - **Chain-of-thought (CoT):** thoughts from periodic thought generator, observation reasoner, reflection, ReAct, social consideration, etc. (anything not from the intrusion pipeline).
  - **Intrusive:** thoughts that entered via POST /process type `intrusion` (external suggestion pipeline).
- Each thought sent to the cognitive stream can carry **`metadata.provenance`**: `'chain-of-thought'` (default) or `'intrusion'`.
- The dashboard UI can show a badge or filter: "CoT" vs "Intrusive" so operators can see which thoughts came from the intrusion interface without the bot ever seeing that.

### 4.2 Deduplication so the same intrusive thought doesn't appear multiple times

- **Cognition (IntrusiveThoughtProcessor):** Already deduplicates by **canonical content** and **suppression window** (e.g. 8 min). The same canonical thought text is not processed again within that window.
- **Dashboard (cognitive stream POST):** Today we deduplicate by identical content + type within 30s. For thoughts with **provenance === 'intrusion'**, we should:
  - Use **canonical content** (trim, lowercase, collapse whitespace) for comparison.
  - Use a **longer deduplication window** (e.g. 8 minutes) so the same intrusive thought text does not appear multiple times in the stream even if multiple events (e.g. "thought generated," "task created") are sent.
- Optionally, send **one** stream event per intrusive thought (the final "thought" after consideration/task creation) and avoid sending intermediate events with the same content, so the dashboard naturally shows each intrusive thought once.

### 4.3 Stress state: hexagonal grid heatmap (dashboard)

- **Widget:** A hexagonal grid heatmap shows the bot's stress state over time. Center = relatively low stress; edges = high stress. Cell color/heat = how often the bot has been in that state (dwell or visit count). The **current** stress state is indicated by a **thick, visible outline** around the corresponding grid cell.
- **6-sector mapping:** When `stressAxes` is available from cognition, the angular sector is determined by the **dominant axis** (highest-valued of the 6 axes). Sector labels (Time, Situational, Health, Resource, Protection, Location) are rendered as small SVG text around the hex perimeter. When `stressAxes` is absent (e.g. cognition offline), falls back to focus-based mapping.
- **Data:** Backend supplies `intero` with `stressAxes` via GET `/state`. Dashboard maps current composite stress to ring, dominant axis to sector, and accumulates dwell/visit counts per cell for heat styling.

### 4.4 Implementation notes (provenance and deduplication)

- **Cognition server:** When posting an intrusive thought to the cognitive stream, set `attribution: 'self'`, `type` to the thought’s category (e.g. `result.thought.type` or `'reflection'`), and `metadata.provenance = 'intrusion'`, `metadata.thoughtType = 'intrusive'` so the dashboard can both display "Intrusive" and deduplicate.
- **Dashboard route:** (1) Accept `metadata.provenance`. (2) For thoughts with `provenance === 'intrusion'`, before adding, check for an existing thought in the last 8 minutes with the same **canonical content** and `provenance === 'intrusion'`; if found, return success with `deduplicated: true` and the existing id. (3) Persist `provenance` in the thought object so the UI can filter and label.

---

## 5. Circle-Back on Chain-of-Thought

### 5.1 Does the bot circle back on its CoT?

- **Post-episode reflection:** The bot has **ReActArbiter.reflect()**, which runs **after** an episode (trace of steps + outcome). It produces a reflection on what went well and what could be improved and stores it in a **reflexion buffer**. That reflection can be used in future episodes via **getRelevantReflexionHints(situation)**. So the bot **does** use past experience to inform future behavior, but that is **post-hoc reflection**, not "revisit step 2 of the current chain."
- **No explicit "circle back" to a prior step:** There is no current mechanism to "circle back" to an earlier step in the same chain of thought to re-evaluate or revise it (e.g. "reconsider step 2 given what we learned in step 5"). The flow is linear: observe → reason → act (or reflect after the episode).
- **Opportunity:** If we want the bot to circle back on its CoT, we could add a step that, after N steps or on certain triggers, re-evaluates an earlier thought or decision (e.g. "Given what I know now, would I still do step 2?"). That would require an explicit design (which step to revisit, when, and how to merge the result back into the chain).

---

## 6. Summary

| Topic | Decision |
|-------|----------|
| External indication | None. Bot always sees attribution 'self'; provenance is metadata-only for dashboard. |
| Nudge + bias | Nudge bot to decide "accept or resist." Bias toward accepting unless it can fight it off (optional consideration step). |
| Stress and intrusive thoughts | Stress updated by intrusive-thought outcome: resist biases toward lower stress; accept + detrimental raises stress; accept + beneficial lowers or holds. Cognition owns interoception; expose via `/state`; dashboard consumes instead of hardcoded intero. |
| Stress model | Multi-axis (time, situational, health/hunger, resource, protection, location). Gate context with axes; do not prompt "you are stressed, choose poorly." Sleep resets or halves axes. Dashboard: hexagonal grid heatmap (center = calm, edges = high stress; heat = dwell frequency; current cell = thick outline). See agent-agency HexagonHeatmap. |
| Stress and behavior | Pass stress axes (and health) into observation and intrusion context as situational context (e.g. "low food, far from spawn"); reasoning reflects state without a single "stress = bad choices" signal. |
| Observational research | Log stress axes at thought/decision boundaries; correlate with thought outcomes and events (health, sleep, location) for post-hoc analysis of how stress correlated with behavior. |
| Dashboard tracking | Use `metadata.provenance`: 'chain-of-thought' vs 'intrusion'. UI shows CoT vs Intrusive. |
| Deduplication | Intrusive: canonical content + 8 min window in dashboard; Cognition already suppresses by canonical + 8 min. |
| Circle-back on CoT | Post-episode reflection exists (ReAct reflexion buffer). No explicit "circle back to step N" in the current chain. |

---

## 7. Related Docs

- `mlx-sidecar-dataflow-and-scheduler.md` – Intrusion path and LLM call sites.
- `observation-queue-and-llm-scheduling.md` – Observation queue; intrusion is another LLM consumer.
