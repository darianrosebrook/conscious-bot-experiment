# Mineflayer Extensions Integration

## Overview

This package provides integration with useful Mineflayer extensions while preserving the emergent, autonomous behavior that's central to our conscious bot architecture. Extensions are treated as **capability providers**, not **behavior controllers**.

## Philosophy

**Core Principle**: Our planning system maintains full control over decision-making while extensions provide structured workflows and enhanced capabilities.

```
Conscious Bot Planning (Emergent Behavior)
           ↓
    Action Translator Layer
           ↓
    Mineflayer Extensions (Capabilities)
           ↓
    Mineflayer Core (Protocol)
```

## Available Extensions

### 1. State Machine Integration

**Package**: `mineflayer-statemachine`

**Purpose**: Provides structured workflows for complex multi-step actions like crafting, building, and resource gathering.

**Benefits**:
- Better error handling and recovery
- Structured multi-step execution
- Improved debugging and monitoring
- Maintained bot autonomy

## Quick Start

### Installation

The extensions are already included in this package. No additional installation needed.

### Basic Usage

```typescript
import { 
  StateMachineWrapper, 
  createCraftingStateMachine 
} from '@conscious-bot/minecraft-interface';

// Create state machine wrapper
const stateMachine = new StateMachineWrapper(bot, {
  enableDebugLogging: true,
  maxStateDuration: 300000 // 5 minutes
});

// Initialize with crafting workflow
const craftingStates = createCraftingStateMachine(bot, 'iron_pickaxe', 1);
await stateMachine.initialize(craftingStates);

// Execute plan step (our planning system maintains control)
const result = await stateMachine.executePlanStep(planStep);
```

### Event-Driven Integration

```typescript
// Listen for state changes
stateMachine.on('stateChanged', (data) => {
  console.log(`State: ${data.oldState} → ${data.newState}`);
});

// Listen for completion
stateMachine.on('executionComplete', (data) => {
  console.log('Workflow completed:', data);
});

// Listen for failures
stateMachine.on('executionFailed', (data) => {
  console.log('Workflow failed:', data);
});
```

## Available Workflows

### Crafting Workflow

**States**: 8 states from `crafting` to `done`

**Features**:
- Material checking and gathering
- Crafting execution and verification
- Success/failure event emission
- Error handling and recovery

```typescript
const craftingStates = createCraftingStateMachine(bot, 'diamond_pickaxe', 1);
```

### Building Workflow

**States**: 6 states from `building` to `done`

**Features**:
- Structure planning and design
- Material gathering for construction
- Building execution and verification
- Customizable dimensions

```typescript
const buildingStates = createBuildingStateMachine(bot, 'house', { 
  width: 5, 
  height: 3, 
  depth: 4 
});
```

### Resource Gathering Workflow

**States**: 7 states from `gathering` to `done`

**Features**:
- Resource location and exploration
- Collection and quantity verification
- Built-in exploration fallback
- Error handling and recovery

```typescript
const gatheringStates = createGatheringStateMachine(bot, 'wood', 64);
```

## Configuration Options

### StateMachineWrapper Configuration

```typescript
interface StateMachineConfig {
  enableDebugLogging?: boolean;      // Enable debug logging
  maxStateDuration?: number;         // Maximum time per state (ms)
  enableStatePersistence?: boolean;  // Enable state persistence
  stateRecoveryTimeout?: number;     // State recovery timeout (ms)
}
```

### Default Values

```typescript
{
  enableDebugLogging: false,
  maxStateDuration: 300000,        // 5 minutes
  enableStatePersistence: true,
  stateRecoveryTimeout: 60000      // 1 minute
}
```

## Integration with Planning System

### How It Works

1. **Planning System Decides**: What to do, when to do it, how to prioritize
2. **Extensions Execute**: Provide structured workflows and error handling
3. **Events Communicate**: Success/failure events feed back to planning system
4. **Autonomy Maintained**: Bot remains autonomous and emergent

### Example Integration

```typescript
// Our planning system decides to craft a pickaxe
const planStep = {
  id: 'craft_pickaxe',
  action: { type: 'craft', parameters: { item: 'iron_pickaxe', quantity: 1 } }
};

// State machine executes the workflow
const result = await stateMachine.executePlanStep(planStep);

// Planning system receives feedback
if (result.success) {
  console.log('Crafting completed successfully');
} else {
  console.log('Crafting failed:', result.error);
}
```

## Testing

### Run Tests

```bash
# Run all extension tests
pnpm test src/extensions/__tests__/

# Run specific test file
pnpm test src/extensions/__tests__/extensions-integration.test.ts
```

### Demo Script

```bash
# Run the demo to see extensions in action
npx tsx src/extensions/demo-state-machine-usage.ts
```

## Architecture Benefits

### 1. Enhanced Capabilities
- **Structured Workflows**: Complex actions are organized and manageable
- **Better Error Handling**: Built-in fallback behaviors and recovery
- **Improved Debugging**: State-based execution with comprehensive logging

### 2. Maintained Autonomy
- **Planning System Control**: Conscious bot still makes all decisions
- **Emergent Behavior**: No hardcoded sequences override bot autonomy
- **Flexible Integration**: Extensions adapt to our planning system

### 3. Performance Improvements
- **Efficient Execution**: Structured workflows reduce redundant operations
- **Better Resource Management**: State-based resource tracking
- **Optimized Error Recovery**: Faster recovery from failures

## Best Practices

### 1. Always Maintain Planning Control
```typescript
// ✅ Good: Planning system decides
const planStep = { action: { type: 'craft', parameters: { item: 'iron_pickaxe' } } };

// ❌ Bad: Hardcoded behavior
const hardcodedAction = 'craft iron_pickaxe';
```

### 2. Use Events for Communication
```typescript
// ✅ Good: Listen for events
stateMachine.on('executionComplete', handleCompletion);

// ❌ Bad: Poll for status
setInterval(() => checkStatus(), 1000);
```

### 3. Configure Timeouts Appropriately
```typescript
// ✅ Good: Reasonable timeouts
const stateMachine = new StateMachineWrapper(bot, {
  maxStateDuration: 300000, // 5 minutes
  stateRecoveryTimeout: 60000 // 1 minute
});
```

## Troubleshooting

### Common Issues

1. **State Machine Not Initialized**
   - Ensure you call `initialize()` before using
   - Check that the bot is properly connected

2. **Execution Timeouts**
   - Increase `maxStateDuration` for complex workflows
   - Check for infinite loops in state transitions

3. **Event Not Firing**
   - Verify event listener registration
   - Check that the state machine is properly initialized

### Debug Mode

Enable debug logging to see detailed execution information:

```typescript
const stateMachine = new StateMachineWrapper(bot, {
  enableDebugLogging: true
});
```

## Future Extensions

### Planned Integrations

- **Phase 2**: `mineflayer-collectblock`, `mineflayer-auto-eat`
- **Phase 3**: `mineflayer-tool`, `mineflayer-utils`
- **Phase 4**: Advanced integration and optimization

### Contributing

When adding new extensions:
1. Maintain the capability provider philosophy
2. Don't override planning system decisions
3. Use events for communication
4. Provide comprehensive testing
5. Document usage examples

## Examples

See the `demo-state-machine-usage.ts` file for comprehensive examples of how to use these extensions in practice.

## Support

For questions or issues with the extensions:
1. Check the test files for usage examples
2. Review the demo script for working implementations
3. Ensure you're following the emergent behavior principles
4. Verify that your planning system maintains control

---

**Author**: @darianrosebrook  
**Status**: Phase 1 Complete - Ready for Production Use  
**Test Status**: ✅ All tests passing  
**Demo Status**: ✅ Fully functional
