# run.log audit summary

Generated: 2026-02-03T00:32:47.413980Z

Log file: `post-fix-run.log`

Total unique signatures: 314

## Severity breakdown

| Severity | Line count |
|----------|------------|
| ERROR | 7 |
| WARN | 7 |
| INFO | 1028 |

## Component hotspots

| Component | Line count |
|-----------|------------|
| <no-component> | 667 |
| Dashboard | 167 |
| ThreatPerception | 78 |
| Planning | 59 |
| Cognition | 22 |
| 2026-02-01T00:57:40.571Z | 18 |
| 2026-02-01T00:57:40.572Z | 9 |
| Sterling | 2 |
| 2026-02-01T00:57:39.284Z | 2 |
| MCP | 2 |
| 2026-02-01T00:57:34.603Z | 1 |
| 2026-02-01T00:57:35.106Z | 1 |
| 2026-02-01T00:57:35.609Z | 1 |
| 2026-02-01T00:57:36.112Z | 1 |
| 2026-02-01T00:57:36.614Z | 1 |
| 2026-02-01T00:57:37.115Z | 1 |
| 2026-02-01T00:57:37.619Z | 1 |
| 2026-02-01T00:57:38.121Z | 1 |
| 2026-02-01T00:57:38.782Z | 1 |
| 2026-02-01T00:57:39.302Z | 1 |

---

## Top clusters

### <no-component> | ERROR | x7

Lines 203..807

```
[Minecraft Interface] Planning cycle error: Error: No plan available for execution
[Minecraft Interface] Planning cycle error: Error: No plan available for execution
[Minecraft Interface] Planning cycle error: Error: No plan available for execution
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | WARN | x7

Keywords: `timeout`

Lines 206..810

```
    at async Timeout._onTimeout (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface/src/server.ts:281:11)
    at async Timeout._onTimeout (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface/src/server.ts:281:11)
    at async Timeout._onTimeout (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface/src/server.ts:281:11)
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x67

Lines 10..1045

```
}
}
}
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### ThreatPerception | INFO | x62

Lines 22..1036

```
[Minecraft Interface] [ThreatPerception] 🧠 localized threat assessment: 0 threats, level: low
[Minecraft Interface] [ThreatPerception] 🧠 localized threat assessment: 0 threats, level: low
[Minecraft Interface] [ThreatPerception] 🧠 localized threat assessment: 0 threats, level: low
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x42

Lines 86..1042

```
  position: { x: 67.5, y: 63, z: -105.5 },
  position: { x: 67.5, y: 63, z: -105.5 },
  position: { x: 67.5, y: 63, z: -105.5 },
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x42

Lines 87..1043

```
  health: 20,
  health: 20,
  health: 20,
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Planning | INFO | x38

Lines 83..1039

```
[Planning] WorldStateManager poll result: {
[Planning] WorldStateManager poll result: {
[Planning] WorldStateManager poll result: {
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x38

Lines 84..1040

```
  connected: true,
  connected: true,
  connected: true,
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x38

Lines 85..1041

```
  hasPosition: true,
  hasPosition: true,
  hasPosition: true,
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x38

Lines 88..1044

```
  inventoryCount: 0
  inventoryCount: 0
  inventoryCount: 0
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x30

Lines 170..1046

```
WorldStateManager no meaningful change
WorldStateManager no meaningful change
WorldStateManager no meaningful change
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x25

Lines 18..920

```
[Minecraft Interface] No world state available for HUD update
[Minecraft Interface] No world state available for HUD update
[Minecraft Interface] No world state available for HUD update
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x22

Lines 6..1022

```
  },
  },
  },
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Dashboard | INFO | x22

Lines 37..1038

```
[Dashboard] POST /api/ws/bot-state 200 in 7ms
[Dashboard] POST /api/ws/bot-state 200 in 7ms
[Dashboard] POST /api/ws/bot-state 200 in 7ms
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Dashboard | INFO | x17

Lines 235..786

```
[Dashboard] POST /api/ws/bot-state 200 in 6ms
[Dashboard] POST /api/ws/bot-state 200 in 6ms
[Dashboard] POST /api/ws/bot-state 200 in 6ms
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Dashboard | INFO | x11

Lines 210..1000

```
[Dashboard] POST /api/ws/cognitive-stream received: {
[Dashboard] POST /api/ws/cognitive-stream received: {
[Dashboard] POST /api/ws/cognitive-stream received: {
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x11

Lines 211..815

```
  type: 'status',
  type: 'status',
  type: 'status',
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x11

Lines 212..816

```
  content: 'Health: 100%, Hunger: 100%. Observing environment and deciding next action.',
  content: 'Health: 100%, Hunger: 100%. Observing environment and deciding next action.',
  content: 'Health: 100%, Hunger: 100%. Observing environment and deciding next action.',
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x10

Lines 213..1003

```
  attribution: 'self'
  attribution: 'self'
  attribution: 'self'
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x9

Lines 8..1024

```
  timestamp: 1769907445608,
  timestamp: 1769907475490,
  timestamp: 1769907490399,
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x9

Lines 9..1025

```
  processed: false
  processed: false
  processed: false
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x9

Lines 12..1028

```
Successfully sent message to 0 connections (0 dead connections removed)
Successfully sent message to 0 connections (0 dead connections removed)
Successfully sent message to 0 connections (0 dead connections removed)
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x9

Lines 345..739

```
  '"Health: 100%, Hunger: 100%. Observing environment and deciding next action."',
  '"Health: 100%, Hunger: 100%. Observing environment and deciding next action."',
  '"Health: 100%, Hunger: 100%. Observing environment and deciding next action."',
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Dashboard | INFO | x8

Lines 34..759

```
[Dashboard] POST /api/ws/bot-state 200 in 8ms
[Dashboard] POST /api/ws/bot-state 200 in 8ms
[Dashboard] POST /api/ws/bot-state 200 in 8ms
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Dashboard | INFO | x8

Lines 215..1005

```
[Dashboard] New thought added to history: {
[Dashboard] New thought added to history: {
[Dashboard] New thought added to history: {
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Dashboard | INFO | x7

Lines 17..792

```
[Dashboard] POST /api/ws/bot-state 200 in 9ms
[Dashboard] POST /api/ws/bot-state 200 in 9ms
[Dashboard] POST /api/ws/bot-state 200 in 9ms
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Planning | INFO | x7

Lines 139..805

```
[Planning] WorldStateManager no meaningful change
[Planning] WorldStateManager no meaningful change
[Planning] WorldStateManager no meaningful change
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x7

Lines 202..806

```
[Minecraft Interface] 🔄 Starting autonomous planning cycle...
[Minecraft Interface] 🔄 Starting autonomous planning cycle...
[Minecraft Interface] 🔄 Starting autonomous planning cycle...
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x7

Lines 204..808

```
    at PlanExecutor.executePlanningCycle (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface/src/plan-executor.ts:197:15)
    at PlanExecutor.executePlanningCycle (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface/src/plan-executor.ts:197:15)
    at PlanExecutor.executePlanningCycle (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/minecraft-interface/src/plan-executor.ts:197:15)
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x7

Lines 205..809

```
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x7

Lines 207..811

```
[Minecraft Interface] ⚠️ Planning cycle ended: No plan available for execution (0/0 steps)
[Minecraft Interface] ⚠️ Planning cycle ended: No plan available for execution (0/0 steps)
[Minecraft Interface] ⚠️ Planning cycle ended: No plan available for execution (0/0 steps)
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Cognition | INFO | x7

Lines 208..812

```
[Cognition] ✅ Received external thought: status - Health: 100%, Hunger: 100%. Observing environment ...
[Cognition] ✅ Received external thought: status - Health: 100%, Hunger: 100%. Observing environment ...
[Cognition] ✅ Received external thought: status - Health: 100%, Hunger: 100%. Observing environment ...
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x7

Lines 209..813

```
[Minecraft Interface] ✅ Sent thought to cognition server: status
[Minecraft Interface] ✅ Sent thought to cognition server: status
[Minecraft Interface] ✅ Sent thought to cognition server: status
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x7

Lines 218..1008

```
  attribution: 'self',
  attribution: 'self',
  attribution: 'self',
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x7

Lines 219..1009

```
  context: {
  context: {
  context: {
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Cognition | INFO | x7

Lines 233..820

```
[Cognition] ✅ Thought sent to cognitive stream: Health: 100%, Hunger: 100%. Observing environment ...
[Cognition] ✅ Thought sent to cognitive stream: Health: 100%, Hunger: 100%. Observing environment ...
[Cognition] ✅ Thought sent to cognitive stream: Health: 100%, Hunger: 100%. Observing environment ...
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### ThreatPerception | INFO | x7

Lines 565..1037

```
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:3)
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:3)
[Minecraft Interface] [ThreatPerception] suppressed 3 LOS logs in last 5000ms (creeper:3)
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Cognition | INFO | x4

Lines 140..733

```
[Cognition] 📋 Enhanced thought generator has 0 recent thoughts
[Cognition] 📋 Enhanced thought generator has 0 recent thoughts
[Cognition] 📋 Enhanced thought generator has 0 recent thoughts
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### Planning | INFO | x4

Lines 158..760

```
[Planning] [MCP] Bot instance updated successfully
[Planning] [MCP] Bot instance updated successfully
[Planning] [MCP] Bot instance updated successfully
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

### <no-component> | INFO | x4

Lines 159..761

```
[Minecraft Interface] ✅ Bot instance updated in planning server
[Minecraft Interface] ✅ Bot instance updated in planning server
[Minecraft Interface] ✅ Bot instance updated in planning server
```

- [ ] Unit/integration test covers this?
- [ ] Invariant/guardrail prevents silent damage?
- [ ] Observability hook (structured log/metric) to detect early?

---

