# Cognitive Architecture: Dependency Resolution & Executor Contracts

## Overview

This document describes the major architectural improvements made to resolve circular dependencies and enhance the tool execution pipeline for the Conscious Bot's cognitive architecture.

## Problem Statement

The original architecture suffered from a circular dependency chain:
```
@conscious-bot/core → @conscious-bot/planning → @conscious-bot/mcp-server → @conscious-bot/core
```

This cycle prevented:
- Reliable builds
- Tool access functionality  
- Proper MCP integration
- Clean separation of concerns

## Solution Architecture

### 1. Dependency-Aware Package Structure

The new architecture implements strict layered dependencies:

```
executor-contracts (foundation layer)
    ↑
  core, mcp-server (infrastructure layer)
    ↑
  planning → memory, world (cognitive layer)
    ↑  
  cognition, safety, minecraft-interface (application layer)
    ↑
  dashboard, evaluation (interface layer)
```

### 2. Executor Contracts Package

**Purpose**: Shared execution interfaces and contracts that prevent circular dependencies.

**Key Components**:
- `LeafImpl`, `LeafSpec`, `LeafContext`, `LeafResult` - Tool definition interfaces
- `LeafFactory` - Tool registration and execution with validation
- `PBIEnforcer` - Plan-Body Interface enforcement with acceptance criteria
- `CapabilityRegistry` - Built-in capabilities with permissions and rate limiting

**Benefits**:
- Prevents future circular dependencies
- Provides clean contracts between planning and execution
- Enables shared tool interfaces across packages
- Supports execution validation and error handling

### 3. Enhanced MCP Integration

**Fallback Support**: When the full MCP server is unavailable, a fallback implementation ensures continued operation.

**Tool Execution Pipeline**:
1. Cognitive reflection generates actionable thoughts
2. Planning converts thoughts to executable tasks
3. Tools are registered through shared executor contracts
4. MCP server executes tools with proper validation
5. Results flow back through the cognitive stream

**Key Improvements**:
- Resilient tool registration and execution
- Proper error handling and validation
- Rate limiting and permission enforcement
- Graceful degradation when dependencies fail

## Cognitive Architecture Benefits

### 1. Reliable Tool Access
- Bot can consistently access and execute Minecraft tools
- Cognitive reflections like "Gather wood to craft tools" convert to actual actions
- No more build failures blocking tool functionality

### 2. Clean Separation of Concerns
- Each package has clear responsibilities
- Shared contracts prevent coupling
- Modular architecture supports independent development

### 3. Enhanced Resilience
- Fallback mechanisms ensure continued operation
- Graceful degradation when components are unavailable
- Error handling preserves system stability

### 4. Scalable Architecture
- Easy to add new tools and capabilities
- Shared interfaces prevent architectural debt
- Clean dependency graph supports growth

## Implementation Details

### Package Dependencies (After Resolution)
```json
{
  "@conscious-bot/executor-contracts": {},
  "@conscious-bot/core": {},
  "@conscious-bot/mcp-server": ["@conscious-bot/executor-contracts"],
  "@conscious-bot/planning": ["@conscious-bot/executor-contracts", "@conscious-bot/mcp-server", "@conscious-bot/memory", "@conscious-bot/world"],
  "@conscious-bot/cognition": ["@conscious-bot/core", "@conscious-bot/memory", "@conscious-bot/planning"]
}
```

### Tool Registration Flow
```typescript
// Planning → Executor Contracts → MCP Server
const spec: LeafSpec = {
  name: "gather_wood",
  version: "1.0.0",
  permissions: ["movement", "dig"],
  timeoutMs: 10000,
  retries: 3,
  implementation: woodGatheringTool
};

const result = await leafFactory.register(spec);
```

### Cognitive Reflection Processing
```typescript
// Cognitive thought: "Gather wood to craft tools"
const actionableSteps = detectActionableSteps(thoughtContent);
if (actionableSteps) {
  const tasks = await convertCognitiveReflectionToTasks(thought);
  await mcpIntegration.executeTools(tasks);
}
```

## Verification & Testing

### Build Verification
- All 11 packages build successfully
- No circular dependency errors
- Clean dependency graph verified

### Functional Testing
- Tool access functionality restored
- MCP integration working with fallback
- Cognitive reflections convert to actions
- System startup successful

### Architecture Testing
- Dependency injection working properly
- Shared contracts function correctly
- Error handling and fallback mechanisms tested

## Future Considerations

### Extensibility
- New packages should follow the layered dependency structure
- Use executor-contracts for shared tool interfaces
- Avoid direct dependencies between cognitive layers

### Maintenance
- Monitor for new circular dependencies during development
- Keep shared interfaces in executor-contracts package
- Use dependency analysis tools to verify architecture

### Evolution
- Consider breaking down large packages as they grow
- Maintain clean separation between infrastructure and cognitive layers
- Expand capability registry as new tools are added

## Conclusion

The dependency resolution and executor contracts architecture provides a solid foundation for the Conscious Bot's cognitive systems. The clean separation of concerns, reliable tool access, and resilient execution pipeline enable robust artificial consciousness research while maintaining architectural integrity.

## Author

@darianrosebrook
