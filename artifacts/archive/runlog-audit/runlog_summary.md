# run.log Audit Summary

Generated: 2026-02-03T02:48:45.613161+00:00

Log file: `run.log`

Total unique clusters: 855

## Severity Breakdown

| Severity | Line Count |
|---|---|
| ERROR | 5 |
| WARN | 151 |
| INFO | 10153 |

## Component Breakdown (Top 20)

| Component | Line Count |
|---|---|
| Dashboard | 4729 |
| Minecraft Interface | 1676 |
| <no-component> | 1421 |
| Planning | 1090 |
| Cognition | 1012 |
| AUTONOMOUS EXECUTOR | 243 |
| SafetyMonitor | 102 |
| Memory | 11 |
| toolExecutor | 8 |
| MLX-LM Sidecar | 5 |
| Core API | 3 |
| World | 2 |
| Server | 2 |
| Pipeline | 2 |
| MCP | 1 |
| ThreatPerception | 1 |
| readiness | 1 |

---

## Top Clusters

### <no-component> -- ERROR -- x2

Lines 2937..7638

```
Broadcasting error to 1 clients
Broadcasting error to 1 clients
```

---

### Minecraft Interface -- WARN -- x62

**Keywords:** Disconnected

Lines 1088..8984

```
[Minecraft Interface] WebSocket client disconnected (unknown)
[Minecraft Interface] WebSocket client disconnected (unknown)
[Minecraft Interface] WebSocket client disconnected (unknown)
```

---

### Planning -- WARN -- x29

**Keywords:** timeout, acquire_material

Lines 4701..19899

```
[Planning] [Verify:acquire_material] START item=oak_log accepted=[oak_log,log,wood] timeout=20000ms hasSnapshot=true snapshotCounts=oak_log:0,log:0,wood:0
[Planning] [Verify:acquire_material] START item=oak_log accepted=[oak_log,log,wood] timeout=20000ms hasSnapshot=true snapshotCounts=oak_log:0,log:0,wood:0
[Planning] [Verify:acquire_material] START item=oak_log accepted=[oak_log,log,wood] timeout=20000ms hasSnapshot=true snapshotCounts=oak_log:0,log:0,wood:0
```

---

### Planning -- WARN -- x13

**Keywords:** timeout, acquire_material

Lines 8301..20253

```
[Planning] [Verify:acquire_material] START item=stone accepted=[stone,cobblestone] timeout=20000ms hasSnapshot=true snapshotCounts=stone:0,cobblestone:0
[Planning] [Verify:acquire_material] START item=stone accepted=[stone,cobblestone] timeout=20000ms hasSnapshot=true snapshotCounts=stone:0,cobblestone:0
[Planning] [Verify:acquire_material] START item=stone accepted=[stone,cobblestone] timeout=20000ms hasSnapshot=true snapshotCounts=stone:0,cobblestone:0
```

---

### Planning -- WARN -- x8

Lines 7490..19878

```
[Planning] [Lifecycle→Review] failed: task cognitive-task-drive-tick-1770084564882-w2753r1-goal-tag-nrkhhfw
[Planning] [Lifecycle→Review] failed: task cognitive-task-thought-1770084698479-32ekjr4-thought-content-nwk6ce0
[Planning] [Lifecycle→Review] failed: task cognitive-task-drive-tick-1770084864879-hrda9nu-goal-tag-nrkhhfw
```

---

### Planning -- WARN -- x8

Lines 7493..19882

```
[Planning] 🔇 Suppressing progress update for failed task: cognitive-task-drive-tick-1770084564882-w2753r1-goal-tag-nrkhhfw
[Planning] 🔇 Suppressing progress update for failed task: cognitive-task-thought-1770084698479-32ekjr4-thought-content-nwk6ce0
[Planning] 🔇 Suppressing progress update for failed task: cognitive-task-drive-tick-1770084864879-hrda9nu-goal-tag-nrkhhfw
```

---

### Planning -- WARN -- x6

Lines 7492..19880

```
[Planning] ❌ [Executor] Task failed after 3 retries: My inventory is bare — I should gather some wood to get started.
[Planning] ❌ [Executor] Task failed after 3 retries: My inventory is bare — I should gather some wood to get started.
[Planning] ❌ [Executor] Task failed after 3 retries: My inventory is bare — I should gather some wood to get started.
```

---

### Planning -- WARN -- x5

Lines 10799..19879

```
[Planning] Task progress updated: My inventory is bare — I should gather some wood to get started. - 0% (active -> failed)
[Planning] Task progress updated: My inventory is bare — I should gather some wood to get started. - 0% (active -> failed)
[Planning] Task progress updated: My inventory is bare — I should gather some wood to get started. - 0% (active -> failed)
```

---

### Minecraft Interface -- WARN -- x4

Lines 1406..7634

```
[Minecraft Interface] Broadcasting warning to 1 clients
[Minecraft Interface] Broadcasting warning to 1 clients
[Minecraft Interface] Broadcasting warning to 1 clients
```

---

### Minecraft Interface -- WARN -- x4

Lines 2858..7224

```
[Minecraft Interface] Broadcasting warning to 0 clients
[Minecraft Interface] Broadcasting warning to 0 clients
[Minecraft Interface] Broadcasting warning to 0 clients
```

---

### Planning -- WARN -- x2

**Keywords:** timeout, acquire_material

Lines 6447..7043

```
[Planning] [Verify:acquire_material] START item=oak_log accepted=[oak_log,log,wood] timeout=20000ms hasSnapshot=true snapshotCounts=oak_log:2,log:0,wood:0
[Planning] [Verify:acquire_material] START item=oak_log accepted=[oak_log,log,wood] timeout=20000ms hasSnapshot=true snapshotCounts=oak_log:2,log:0,wood:0
```

---

### <no-component> -- WARN -- x2

Lines 9449..9695

```
Broadcasting warning to 0 clients
Broadcasting warning to 0 clients
```

---

### Planning -- WARN -- x2

Lines 9961..18380

```
[Planning] ❌ [Executor] Task failed after 3 retries: maybe i should explore a bit and see what's around here.
[Planning] ❌ [Executor] Task failed after 3 retries: maybe i should explore a bit and see what's around here.
```

---

### Dashboard -- INFO -- x1074

Lines 556..20281

```
[Dashboard] POST /api/ws/bot-state 200 in 185ms
[Dashboard] POST /api/ws/bot-state 200 in 13ms
[Dashboard] POST /api/ws/bot-state 200 in 8ms
```

---

### Cognition -- INFO -- x862

Lines 486..20282

```
[Cognition] Processing environmental_awareness request
[Cognition] Processing environmental_awareness request
[Cognition] Processing environmental_awareness request
```

---

### Dashboard -- INFO -- x642

Lines 521..20271

```
[Dashboard] POST /api/live-stream-updates 404 in 1021ms
[Dashboard] POST /api/live-stream-updates 404 in 1023ms
[Dashboard] POST /api/live-stream-updates 404 in 1027ms
```

---

### Dashboard -- INFO -- x619

Lines 445..20144

```
[Dashboard] POST /api/ws/cognitive-stream received: <OBJECT>
[Dashboard] POST /api/ws/cognitive-stream received: <OBJECT>
[Dashboard] POST /api/ws/cognitive-stream received: <OBJECT>
```

---

### Dashboard -- INFO -- x614

Lines 477..20149

```
[Dashboard] POST /api/ws/cognitive-stream 200 in 535ms
[Dashboard] POST /api/ws/cognitive-stream 200 in 818ms
[Dashboard] POST /api/ws/cognitive-stream 200 in 13ms
```

---

### Minecraft Interface -- INFO -- x601

Lines 1085..20280

```
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
[Minecraft Interface] [MINECRAFT INTERFACE] /inventory endpoint called
```

---

### <no-component> -- INFO -- x357

Lines 7448..20163

```
  '"Maintaining awareness of surroundings."',
  '"Maintaining awareness of surroundings."',
  '"Maintaining awareness of surroundings."',
```

---

### Dashboard -- INFO -- x297

Lines 3371..20246

```
[Dashboard] POST /api/task-updates 200 in 12ms
[Dashboard] POST /api/task-updates 200 in 10ms
[Dashboard] POST /api/task-updates 200 in 16ms
```

---

### Dashboard -- INFO -- x285

Lines 628..20261

```
[Dashboard] POST /api/environment-updates 404 in 176ms
[Dashboard] POST /api/environment-updates 404 in 177ms
[Dashboard] POST /api/environment-updates 404 in 812ms
```

---

### Dashboard -- INFO -- x280

Lines 450..19944

```
[Dashboard] New thought added to history: <OBJECT>
[Dashboard] New thought added to history: <OBJECT>
[Dashboard] New thought added to history: <OBJECT>
```

---

### <no-component> -- INFO -- x239

Lines 519..19699

```
Successfully sent message to 0 connections (0 dead connections removed)
Successfully sent message to 0 connections (0 dead connections removed)
Successfully sent message to 0 connections (0 dead connections removed)
```

---

### <no-component> -- INFO -- x199

Lines 3360..20165

```
  '"My inventory is bare — I should gather some wood to get started. [GOAL: collect oak_log 8]"',
  '"My inventory is bare — I should gather some wood to get started. [GOAL: collect oak_log 8]"',
  '"My inventory is bare — I should gather some wood to get started. [GOAL: collect oak_log 8]"',
```

---

### Dashboard -- INFO -- x183

Lines 475..19968

```
[Dashboard] Broadcasting message to 0 connections: {"type":"cognitive_thoughts","timestamp":1770084487664,"data":{"thoughts":[{"type":"system_status","content":"System status: cognition_service_started - 🧠 Cognition service running on port 3003","attribution":"self","context":{"emotionalState":"neutral","confidence":0.5,"cognitiveSystem":"cognition-system","category":"system","tags":["server","startup"],"port":3003},"metadata":{"thoughtType":"system_status","category":"system","tags":["server","startup"],"source":"cognition-system","timestamp":1770084471593,"provenance":"chain-of-thought"},"id":"thought-1770084487663-tslple9","timestamp":1770084487663,"processed":false}]}}
[Dashboard] Broadcasting message to 0 connections: {"type":"cognitive_thoughts","timestamp":1770084489143,"data":{"thoughts":[{"type":"environmental","content":"Awareness: 1 hostile (phantom ~8 blocks (medium)) 1 neutral nearby [new: player, phantom]","attribution":"self","context":{"emotionalState":"aware","confidence":0.85,"cognitiveSystem":"saliency-reasoner"},"metadata":{"thoughtType":"environmental","source":"saliency","trackCount":2,"deltaCount":2,"provenance":"chain-of-thought"},"id":"thought-1770084489142-ugqgw5y","timestamp":1770084489142,"processed":false}]}}
[Dashboard] Broadcasting message to 0 connections: {"type":"cognitive_thoughts","timestamp":1770084489261,"data":{"thoughts":[{"type":"environmental","content":"Awareness: 1 hostile (phantom ~10 blocks (medium)) 1 neutral nearby","attribution":"self","context":{"emotionalState":"aware","confidence":0.85,"cognitiveSystem":"saliency-reasoner"},"metadata":{"thoughtType":"environmental","source":"saliency","trackCount":2,"deltaCount":1,"provenance":"chain-of-thought"},"id":"thought-1770084489260-3898oko","timestamp":1770084489260,"processed":false}]}}
```

---

### Planning -- INFO -- x132

Lines 7772..19933

```
[Planning] 🤖 [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] 🤖 [AUTONOMOUS EXECUTOR] Found 0 active tasks
[Planning] 🤖 [AUTONOMOUS EXECUTOR] Found 0 active tasks
```

---

### Dashboard -- INFO -- x120

Lines 560..20263

```
[Dashboard] GET /api/ws/cognitive-stream/history?limit=100 200 in 414ms
[Dashboard] GET /api/ws/cognitive-stream/history?limit=100 200 in 659ms
[Dashboard] GET /api/ws/cognitive-stream/history?limit=100 200 in 17ms
```

---

### <no-component> -- INFO -- x100

Lines 896..19741

```
Broadcasting message to 0 connections: {"type":"cognitive_thoughts","timestamp":1770084501273,"data":{"thoughts":[{"type":"environmental","content":"Awareness: 2 hostiles (phantom ~0 blocks (high), phantom ~8 blocks (high)) 1 neutral nearby","attribution":"self","context":{"emotionalState":"alert","confidence":0.85,"cognitiveSystem":"saliency-reasoner"},"metadata":{"thoughtType":"environmental","source":"saliency","trackCount":3,"deltaCount":3,"provenance":"chain-of-thought"},"id":"thought-1770084501272-bym8w82","timestamp":1770084501272,"processed":false}]}}
Broadcasting message to 0 connections: {"type":"cognitive_thoughts","timestamp":1770084506815,"data":{"thoughts":[{"type":"environmental","content":"Awareness: 2 hostiles (phantom ~8 blocks (medium), phantom ~10 blocks (low)) 1 neutral nearby","attribution":"self","context":{"emotionalState":"aware","confidence":0.85,"cognitiveSystem":"saliency-reasoner"},"metadata":{"thoughtType":"environmental","source":"saliency","trackCount":3,"deltaCount":2,"provenance":"chain-of-thought"},"id":"thought-1770084506815-x8uulmy","timestamp":1770084506815,"processed":false}]}}
Broadcasting message to 0 connections: {"type":"cognitive_thoughts","timestamp":1770084507390,"data":{"thoughts":[{"type":"environmental","content":"Awareness: 2 hostiles (phantom ~4 blocks (high), phantom ~12 blocks (medium)) 1 neutral nearby","attribution":"self","context":{"emotionalState":"alert","confidence":0.85,"cognitiveSystem":"saliency-reasoner"},"metadata":{"thoughtType":"environmental","source":"saliency","trackCount":3,"deltaCount":4,"provenance":"chain-of-thought"},"id":"thought-1770084507387-av76uka","timestamp":1770084507387,"processed":false}]}}
```

---

### Minecraft Interface -- INFO -- x81

Lines 623..9704

```
[Minecraft Interface] Broadcasting health_changed to 0 clients
[Minecraft Interface] Broadcasting health_changed to 0 clients
[Minecraft Interface] Broadcasting health_changed to 0 clients
```

---

### Minecraft Interface -- INFO -- x72

Lines 479..20248

```
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: <OBJECT>
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: <OBJECT>
[Minecraft Interface] [MINECRAFT INTERFACE] Bot state updated: <OBJECT>
```

---

### Dashboard -- INFO -- x72

Lines 907..20137

```
[Dashboard] GET /api/viewer/status 200 in 675ms
[Dashboard] GET /api/viewer/status 200 in 21ms
[Dashboard] GET /api/viewer/status 200 in 11ms
```

---

### Minecraft Interface -- INFO -- x71

Lines 554..20255

```
[Minecraft Interface] [ThreatPerception] localized threat assessment: 0 threats, level: low
[Minecraft Interface] [ThreatPerception] localized threat assessment: 0 threats, level: low
[Minecraft Interface] [ThreatPerception] localized threat assessment: 0 threats, level: low
```

---

### Planning -- INFO -- x71

Lines 1323..20210

```
[Planning] [MCP] Bot instance updated successfully
[Planning] [MCP] Bot instance updated successfully
[Planning] [MCP] Bot instance updated successfully
```

---

### Minecraft Interface -- INFO -- x71

Lines 1324..20211

```
[Minecraft Interface] Bot instance updated in planning server
[Minecraft Interface] Bot instance updated in planning server
[Minecraft Interface] Bot instance updated in planning server
```

---

### Planning -- INFO -- x67

Lines 4596..20173

```
[Planning] 🤖 Running autonomous task executor...
[Planning] 🤖 Running autonomous task executor...
[Planning] 🤖 Running autonomous task executor...
```

---

### Dashboard -- INFO -- x65

Lines 1006..9028

```
[Dashboard] GET /api/ws/bot-state 200 in 31ms
[Dashboard] GET /api/ws/bot-state 200 in 20ms
[Dashboard] GET /api/ws/bot-state 200 in 798ms
```

---

### Planning -- INFO -- x64

Lines 993..9740

```
[Planning] [WorldStateManager] State update: <OBJECT>
[Planning] [WorldStateManager] State update: <OBJECT>
[Planning] [WorldStateManager] State update: <OBJECT>
```

---

### Dashboard -- INFO -- x63

Lines 1005..8987

```
[Dashboard] SSE connection established. Total connections: 1
[Dashboard] SSE connection established. Total connections: 1
[Dashboard] SSE connection established. Total connections: 1
```

---

### Planning -- INFO -- x63

Lines 9187..20156

```
[Planning] [CognitiveStream] Fetched 10 thoughts [
[Planning] [CognitiveStream] Fetched 10 thoughts [
[Planning] [CognitiveStream] Fetched 10 thoughts [
```

---

### Minecraft Interface -- INFO -- x62

Lines 1002..8980

```
[Minecraft Interface] WebSocket client connected (unknown)
[Minecraft Interface] WebSocket client connected (unknown)
[Minecraft Interface] WebSocket client connected (unknown)
```

---

### Minecraft Interface -- INFO -- x59

Lines 659..9737

```
[Minecraft Interface] Broadcasting position_changed to 0 clients
[Minecraft Interface] Broadcasting position_changed to 0 clients
[Minecraft Interface] Broadcasting position_changed to 0 clients
```

---

### Minecraft Interface -- INFO -- x59

Lines 5932..16109

```
[Minecraft Interface] [ThreatPerception] suppressed 4 LOS logs in last 5000ms (drowned:4)
[Minecraft Interface] [ThreatPerception] suppressed 4 LOS logs in last 5000ms (drowned:4)
[Minecraft Interface] [ThreatPerception] suppressed 4 LOS logs in last 5000ms (drowned:4)
```

---

### Planning -- INFO -- x55

Lines 4616..19862

```
[Planning] Task progress updated: My inventory is bare — I should gather some wood to get started. - 0% (active -> active)
[Planning] Task progress updated: My inventory is bare — I should gather some wood to get started. - 0% (active -> active)
[Planning] Task progress updated: My inventory is bare — I should gather some wood to get started. - 0% (active -> active)
```

---

### Cognition -- INFO -- x55

Lines 11029..20155

```
[Cognition] Enhanced thought generator has 5 recent thoughts
[Cognition] Enhanced thought generator has 5 recent thoughts
[Cognition] Enhanced thought generator has 5 recent thoughts
```

---

### Planning -- INFO -- x53

Lines 4612..20231

```
[Planning] 🤖 [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] 🤖 [AUTONOMOUS EXECUTOR] Bot connected: true
[Planning] 🤖 [AUTONOMOUS EXECUTOR] Bot connected: true
```

---

### Minecraft Interface -- INFO -- x52

Lines 3899..16130

```
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (drowned:3)
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (drowned:3)
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (drowned:3)
```

---

### Planning -- INFO -- x52

Lines 4625..20242

```
[Planning] ❌ [AuditLogger] tool_executed (21ms)
[Planning] ❌ [AuditLogger] tool_executed (21ms)
[Planning] ❌ [AuditLogger] tool_executed (6939ms)
```

---

### Dashboard -- INFO -- x51

Lines 1127..9029

```
[Dashboard] SSE connection closed. Total connections: 0
[Dashboard] SSE connection closed. Total connections: 0
[Dashboard] SSE connection closed. Total connections: 0
```

---

### Minecraft Interface -- INFO -- x50

Lines 1160..8975

```
[Minecraft Interface] Broadcasting health_changed to 1 clients
[Minecraft Interface] Broadcasting health_changed to 1 clients
[Minecraft Interface] Broadcasting health_changed to 1 clients
```

---

