# Core Module

**Package:** `packages/core/`
**Purpose:** Signal-driven control architecture, leaf execution, and integration services
**Author:** @darianrosebrook

## Overview

The Core module provides the foundational control architecture for the conscious bot. It implements the central arbiter, signal processing pipeline, performance monitoring, behavioral tree leaf execution, and integration services (LLM, Sterling, TTS) that coordinate all other cognitive modules.

## Module Inventory

### Arbiter System (`arbiter.ts`)
- Central control system with preemption ladder
- Module coordination with priority-based routing
- Real-time constraint enforcement
- Safe mode activation for emergency responses
- Event-driven architecture for loose coupling

### Signal Processor (`signal-processor.ts`)
- Homeostatic monitoring of internal signals
- Need generation from signal patterns
- Trend analysis and signal normalization
- Configurable rules for different need types
- Signal history with bounded memory

### Performance Monitor (`performance-monitor.ts`)
- Real-time budget enforcement (50ms/200ms targets)
- Module latency tracking and metrics
- Preemption detection and logging
- Safe mode triggers for performance violations
- Percentile calculations (P50/P95/P99)

### Leaves (`leaves/`)
**Primitive Bot Operations**
- `crafting-leaves.ts` — CraftRecipeLeaf (recipe crafting with timeout/retry), SmeltLeaf (furnace smelting with fuel management), IntrospectRecipeLeaf (recipe lookup without execution)
- `movement-leaves.ts` — goto, pathfinding, position control
- `interaction-leaves.ts` — block/entity interaction (place, break, interact)
- `sensing-leaves.ts` — environmental sensing (scan, observe)

Each leaf implements `LeafImpl` with typed input/output schemas, permissions, timeouts, and retry policies.

### MCP Capabilities (`mcp-capabilities/`)
**Capability-Driven Execution Engine**
- `leaf-contracts.ts` — LeafImpl, LeafContext, LeafResult, LeafSpec interface definitions
- `leaf-factory.ts`, `working-leaf-factory.ts` — leaf instantiation from specs with context binding
- `bt-dsl-parser.ts`, `bt-dsl-schema.ts` — behavior tree DSL parsing and validation
- `capability-registry.ts`, `capability-specs.ts` — runtime capability registration and discovery
- `llm-integration.ts`, `llm-interface.ts` — LLM-based dynamic leaf generation
- `constitutional-filter.ts` — safety-based action filtering
- `rate-limiter.ts` — capability usage rate control
- `dynamic-creation-flow.ts` — runtime leaf creation

### Real-Time (`real-time/`)
**Performance Monitoring & Constraint Enforcement**
- `performance-tracker.ts` — latency tracking with percentile calculation
- `budget-enforcer.ts` — loop-time budget enforcement (50ms target, 200ms max)
- `degradation-manager.ts` — graceful fallback to simpler modules on violation
- `alerting-system.ts` — real-time violation alerting

### LLM (`llm/`)
**Local LLM Integration**
- `sidecar-client.ts` — MLX-LM sidecar HTTP client supporting native `/api/generate` and OpenAI-compatible `/v1/chat/completions` endpoints. Configurable temperature, timeout, model selection via environment (`LLM_SIDECAR_URL`, `OLLAMA_MODEL`). Legacy `OLLAMA_HOST` accepted as deprecated fallback.

### Sterling (`sterling/`)
**Sterling Reasoning Service Client**
- `sterling-client.ts` — WebSocket client with circuit breaker (5-failure threshold), automatic reconnection (exponential backoff), ping-based health monitoring. Environment-configured via STERLING_WS_URL.
- Fully typed message protocol (discover, solve, metrics, error, reset)

### TTS (`tts/`)
**Text-to-Speech Synthesis**
- `tts-client.ts` — Kokoro-ONNX OpenAI-compatible client. Streams PCM audio to sox for speaker playback. Fire-and-forget with silent degradation if service unavailable.

### Logging (`logging/`)
**Debug Configuration**
- `config.ts` — category-based debug flags (environment, inventory, resources, actions, health). Environment variable integration (DEBUG_MODE, DEBUG_ENVIRONMENT, etc.). Helper functions: `getLoggingConfig()`, `debugLog()`, `isDebugEnabled()`.

### Utils (`utils/`)
**Shared Client Infrastructure**
- `http-client.ts` — shared HTTP client with exponential backoff (3 retries), per-service circuit breakers, 10s timeout default
- `resilient-service-client.ts` — resilient service communication layer
- Service client factory for: minecraft, planning, cognition, memory, world, dashboard

## Architecture

### Signal-Driven Control
```
Signals → Needs → Goals → Actions
   ↓        ↓       ↓       ↓
Processor → Arbiter → Modules → Leaf Execution
```

### Preemption Ladder
1. **Emergency Reflex** (Priority 0) — immediate safety responses
2. **Reactive GOAP** (Priority 1) — goal-oriented action planning
3. **Hierarchical HTN** (Priority 2) — hierarchical task networks
4. **Cognitive LLM** (Priority 3) — language model reasoning

### Performance Guarantees
- Target loop time: 50ms (hazardous) / 200ms (routine)
- Safe mode activation on budget violations
- Graceful degradation via fallback to simpler modules

## Top-Level Integration Files

- `cognitive-stream-integration.ts` — integration with cognition stream
- `minecraft-cognitive-integration.ts` — Minecraft-specific cognitive wiring
- `advanced-need-generator.ts` — enhanced need generation
- `goal-template-manager.ts` — goal template management
- `priority-ranker.ts` — priority-based action ranking

## Dependencies

- `eventemitter3` — event-driven communication
- `zod` — runtime type validation
- Sterling backend (WebSocket) — graph-search reasoning
- Ollama — local LLM inference
- Kokoro-ONNX — text-to-speech (optional)
