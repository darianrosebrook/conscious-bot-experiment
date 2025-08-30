# Enhanced Intrusive Thought Processor Implementation

## Overview

Successfully implemented the enhanced intrusive thought processor that transforms the system from simple logging to actual behavior-shaping through MCP integration. The processor now uses a pipe-and-filter architecture with safety gates, deduplication, grounding, and executable task generation.

## Key Features Implemented

### 1. **MCP Integration**
- **Direct Integration**: Hooks into existing MCP server via planning server endpoints (`http://localhost:3002/mcp/*`)
- **Resource Reading**: Reads `world://snapshot` for grounding decisions
- **Tool Listing**: Queries available MCP tools for plan composition
- **Option Management**: Lists and registers BT options via MCP registry

### 2. **Safety & Policy Gates**
- **Dangerous Action Rejection**: Blocks "dig straight down" and similar unsafe actions
- **Policy Rewriting**: Modifies risky actions (e.g., "explore lava" → "explore nearby safe area")
- **Permission Enforcement**: Respects MCP tool permissions and registry policies

### 3. **Deduplication & Suppression**
- **Canonicalization**: Normalizes thoughts (trim, lowercase, whitespace normalization)
- **Time-based Suppression**: 8-minute suppression window per canonical intent
- **Grounding-aware**: Suppression overridden when world state changes significantly

### 4. **World Grounding**
- **Snapshot Integration**: Uses real Mineflayer bot state via `world://snapshot`
- **Survival Priority**: Automatically elevates priority when health/hunger is low
- **Environmental Awareness**: Adjusts behavior based on time of day (night → prefer lighting)

### 5. **Plan Selection Pipeline**
- **Option Matching**: Tries to match thoughts to existing BT options first
- **Leaf Composition**: Falls back to composing sequences of available MCP leaves
- **Auto-registration**: Proposes and registers new BT options when needed (shadow mode)

### 6. **Bucket & Time Management**
- **Bucket Selection**: Assigns tasks to Tactical/Short/Standard/Long buckets based on complexity
- **Time Caps**: Enforces maximum execution times (60s/4m/10m/25m respectively)
- **Idempotency**: Generates unique keys based on thought + plan + world state

### 7. **Executable Task Generation**
- **Option-based Steps**: Creates steps that map to actual MCP options
- **Leaf-based Steps**: Creates steps that map to individual MCP leaves
- **Proposal Queuing**: Handles shadow options with proper queuing

## Architecture

```
intrusive thought
   │
   ▼
[Normalize] → trim, lowercase, strip chatter
   │
   ▼
[Deduplicate] → 8min suppression window
   │
   ▼
[Safety Filter] → deny/patch risky intents
   │
   ▼
[Grounding] → query world://snapshot
   │
   ▼
[Priority Adjust] → survival/environmental factors
   │
   ▼
[Plan Selection] → option → sequence → proposal
   │
   ▼
[Bucket Selector] → time cap assignment
   │
   ▼
[Task Builder] → executable steps + idempotency
   │
   ▼
[Dispatch] → planning system + optional immediate execution
```

## Testing Results

### ✅ Safety Policy Working
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"type":"intrusion","content":"dig straight down"}' \
  http://localhost:3003/process

# Response: {"processed":false,"response":"Unsafe or disallowed: dig straight down"}
```

### ✅ Deduplication Working
```bash
# First request creates task
curl -X POST -H "Content-Type: application/json" \
  -d '{"type":"intrusion","content":"gather wood near base"}' \
  http://localhost:3003/process

# Second request suppressed
curl -X POST -H "Content-Type: application/json" \
  -d '{"type":"intrusion","content":"gather wood near base"}' \
  http://localhost:3003/process

# Response: {"processed":true,"response":"Suppressed duplicate thought: \"gather wood near base\""}
```

### ✅ MCP Integration Working
- Successfully connects to planning server MCP endpoints
- Reads world snapshot for grounding decisions
- Lists available options and tools
- Registers new options when needed

### ✅ Task Generation Working
- Creates tasks with proper bucket assignment
- Generates executable steps from MCP options/leaves
- Includes idempotency keys and metadata
- Integrates with planning system

## Configuration

The enhanced processor automatically creates an MCP client when planning integration is enabled:

```typescript
const intrusiveThoughtProcessor = new IntrusiveThoughtProcessor({
  enableActionParsing: true,
  enableTaskCreation: true,
  enablePlanningIntegration: true,
  enableMinecraftIntegration: true,
  planningEndpoint: 'http://localhost:3002',
  minecraftEndpoint: 'http://localhost:3005',
  // MCP client auto-created from planningEndpoint
  suppressionMs: 8 * 60_000, // 8 minutes
});
```

## Next Steps

1. **Improve Option Matching**: Enhance the `optionMatches` method for better semantic matching
2. **Add More Safety Rules**: Expand the policy rewrite rules for more edge cases
3. **Enhance Grounding**: Add more sophisticated world state analysis
4. **Performance Optimization**: Add caching for MCP calls and world snapshots
5. **Monitoring**: Add metrics for suppression rates, safety blocks, and plan selection

## Files Modified

- `packages/cognition/src/enhanced-intrusive-thought-processor.ts` - Main implementation
- `packages/cognition/src/server.ts` - Integration with cognition server

The enhanced intrusive thought processor is now fully operational and successfully shapes bot behavior through the MCP integration, providing a robust foundation for autonomous decision-making.
