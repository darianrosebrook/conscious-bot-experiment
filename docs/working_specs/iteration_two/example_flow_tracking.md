# Example Flow Implementation Tracking

**Author:** @darianrosebrook  
**Status:** Ready for Implementation - Test Structure Defined  
**Target:** Complete Torch Corridor End-to-End Example  
**Dependencies:** Stages 1-4 of Implementation Plan  

## Overview

This document tracks the implementation of the complete torch corridor example flow, which serves as the primary validation scenario for the dynamic behavior tree composition system.

## Current Implementation Status

### ✅ COMPLETED (Foundation Ready)
- ✅ **Core Leaves**: `move_to`, `sense_hostiles`, `place_torch_if_needed`, `retreat_and_block`, `step_forward_safely`
- ✅ **BT-DSL Parser**: Can compile torch corridor tree
- ✅ **Enhanced Registry**: Can register and manage options
- ✅ **Dynamic Creation Flow**: Impasse detection and LLM integration
- ✅ **Task Timeframe Management**: Bucket-based time management
- ✅ **Hybrid HRM Integration**: Python HRM bridge and LLM integration

### 🔄 IN PROGRESS
- 🔄 **Goal Execution**: Leaf factory integration in HybridHRMArbiter
- 🔄 **Crafting Leaves**: Missing `crafting-leaves.ts` implementation
- 🔄 **Server APIs**: Registration and management endpoints

### ❌ NOT STARTED
- ❌ **Planning Integration**: Connect to existing GOAP/HTN systems
- ❌ **End-to-End Test**: Complete torch corridor example implementation

## Example Flow Summary

The torch corridor example demonstrates the full cycle of:
1. **Problem Detection**: Bot encounters repeated night mining failures
2. **LLM Proposal**: Generates `opt.torch_corridor` BT-DSL
3. **Registration**: Validates and registers the option
4. **Planning Integration**: Planner adopts the option immediately
5. **Execution**: Runs as behavior tree with streaming telemetry
6. **Validation**: Measures before/after performance improvements

## Test File Structure

### Primary Test File: `packages/integration-tests/src/e2e/torch-corridor-example.test.ts`

```typescript
/**
 * Torch Corridor End-to-End Example Test
 *
 * Tests the complete flow from problem detection to successful option execution.
 * This serves as the primary validation scenario for the dynamic behavior tree
 * composition system.
 *
 * @author @darianrosebrook
 */

import { HybridHRMArbiter } from '@conscious-bot/core';
import { createTestBot, simulateNightMiningFailures } from '../test-utils';
import { createTorchCorridorOption } from './torch-corridor-fixtures';

describe('E2E: Torch Corridor Example', () => {
  let bot: any;
  let arbiter: HybridHRMArbiter;
  let registry: any;

  beforeEach(async () => {
    // Set up test environment
    bot = await createTestBot();
    registry = new EnhancedRegistry();
    arbiter = new HybridHRMArbiter(config, registry);
    
    // Register core leaves
    await registerCoreLeaves(registry);
  });

  afterEach(async () => {
    await bot.disconnect();
    registry.clear();
  });

  test('should create and use torch corridor option end-to-end', async () => {
    // Phase 1: Problem Detection
    console.log('🔍 Phase 1: Problem Detection');
    await simulateNightMiningFailures(bot, 3);
    
    const impasses = await arbiter.getPlanningImpasses();
    expect(impasses.some(i => i.context === 'night_mining_failures')).toBe(true);
    expect(impasses.length).toBeGreaterThan(0);

    // Phase 2: LLM Proposal
    console.log('🧠 Phase 2: LLM Proposal');
    const proposals = await arbiter.requestOptionProposals(impasses[0]);
    expect(proposals.length).toBeGreaterThan(0);
    
    const torchOption = proposals.find(p => p.id.includes('torch_corridor'));
    expect(torchOption).toBeDefined();
    expect(torchOption.btDsl).toBeDefined();

    // Phase 3: Registration
    console.log('📝 Phase 3: Registration');
    const registrationResult = await registry.registerOption(
      torchOption.btDsl,
      torchOption.provenance,
      torchOption.shadowConfig
    );
    expect(registrationResult.ok).toBe(true);
    expect(registrationResult.id).toBeDefined();

    // Phase 4: Planning Integration
    console.log('🎯 Phase 4: Planning Integration');
    const planner = new EnhancedGOAPPlanner(registry);
    const worldState = await bot.getWorldState();
    const goal = createMiningGoal();
    
    const plan = await planner.plan(worldState, goal);
    expect(plan.steps.some(step => step.optionId === registrationResult.id)).toBe(true);

    // Phase 5: Execution
    console.log('⚡ Phase 5: Execution');
    const executionResult = await arbiter.executeGoals(plan.goals, bot.context);
    expect(executionResult.every(r => r.success)).toBe(true);

    // Phase 6: Performance Validation
    console.log('📊 Phase 6: Performance Validation');
    const metrics = await bot.getPerformanceMetrics();
    
    // Before metrics (from simulation)
    expect(metrics.before.deathsPerEpisode).toBeGreaterThan(1.0);
    expect(metrics.before.lightLevelMean).toBeLessThan(5.0);
    
    // After metrics (from execution)
    expect(metrics.after.deathsPerEpisode).toBeLessThan(0.2);
    expect(metrics.after.lightLevelMean).toBeGreaterThan(8.0);
    expect(metrics.after.stepFailureRate).toBeLessThan(0.05);

    console.log('✅ Torch corridor example completed successfully');
  }, 300000); // 5 minute timeout

  test('should handle torch corridor option failure gracefully', async () => {
    // Test error handling and fallback behavior
    // Implementation details...
  });

  test('should respect task timeframe buckets during execution', async () => {
    // Test that execution respects Standard bucket (8-12 min)
    // Implementation details...
  });
});
```

### Supporting Test Files

#### `packages/integration-tests/src/e2e/torch-corridor-fixtures.ts`
```typescript
/**
 * Torch Corridor Test Fixtures
 *
 * Provides test data and utilities for the torch corridor example.
 *
 * @author @darianrosebrook
 */

export const createTorchCorridorOption = () => ({
  id: 'opt.torch_corridor',
  version: '1.0.0',
  argsSchema: {
    type: 'object',
    properties: {
      end: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' }
        },
        required: ['x', 'y', 'z']
      },
      interval: {
        type: 'integer',
        minimum: 2,
        maximum: 10,
        default: 6
      },
      hostilesRadius: {
        type: 'integer',
        minimum: 5,
        maximum: 20,
        default: 10
      }
    },
    required: ['end']
  },
  pre: ['has(item:torch)>=1'],
  post: ['corridor.light>=8', 'reached(end)==true'],
  tree: {
    type: 'Sequence',
    children: [
      {
        type: 'Leaf',
        leafName: 'move_to',
        args: { pos: '$end', safe: true }
      },
      {
        type: 'Repeat.Until',
        condition: {
          name: 'distance_to',
          parameters: { target: '$end', threshold: 1 }
        },
        child: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
              args: { radius: '$hostilesRadius' }
            },
            {
              type: 'Decorator.FailOnTrue',
              condition: {
                name: 'hostiles_present',
                parameters: {}
              },
              child: {
                type: 'Leaf',
                leafName: 'retreat_and_block',
                args: {}
              }
            },
            {
              type: 'Leaf',
              leafName: 'place_torch_if_needed',
              args: { interval: '$interval' }
            },
            {
              type: 'Leaf',
              leafName: 'step_forward_safely',
              args: {}
            }
          ]
        }
      }
    ]
  },
  tests: [
    {
      name: 'lights corridor to ≥8 and reaches end',
      world: 'fixtures/corridor_12_blocks.json',
      args: {
        end: { x: 100, y: 12, z: -35 },
        interval: 6,
        hostilesRadius: 10
      },
      assert: {
        post: ['corridor.light>=8', 'reached(end)==true'],
        runtime: { timeoutMs: 60000, maxRetries: 2 }
      }
    }
  ],
  provenance: {
    author: 'LLM',
    reflexion_hint_id: 'rx_2025_08_25_01',
    createdAt: new Date().toISOString()
  }
});

export const createMiningGoal = () => ({
  type: 'mine_iron_at_target',
  target: { x: 100, y: 12, z: -35 },
  requirements: ['safe_corridor_to_target'],
  priority: 0.8,
  complexity: 'moderate'
});

export const createNightMiningScenario = () => ({
  worldState: {
    position: { x: 0, y: 64, z: 0 },
    light: 4,
    time: 18000, // Night time
    hostiles: ['zombie', 'skeleton'],
    inventory: { torch: 10, pickaxe: 1 }
  },
  targetPosition: { x: 100, y: 12, z: -35 },
  corridorLength: 12,
  expectedFailures: 3
});
```

#### `packages/integration-tests/src/test-utils/bot-simulation.ts`
```typescript
/**
 * Bot Simulation Utilities
 *
 * Provides utilities for simulating bot behavior and scenarios.
 *
 * @author @darianrosebrook
 */

export const simulateNightMiningFailures = async (bot: any, failureCount: number) => {
  console.log(`🎭 Simulating ${failureCount} night mining failures...`);
  
  for (let i = 0; i < failureCount; i++) {
    // Simulate mining attempt
    await bot.executeAction({ type: 'mine_block', pos: [1, 64, 1] });
    
    // Simulate hostile spawn
    await bot.simulateHostileSpawn('zombie', { x: 2, y: 64, z: 1 });
    
    // Simulate death or retreat
    await bot.simulateDeathOrRetreat();
    
    // Record failure metrics
    await bot.recordFailure({
      type: 'night_mining_failure',
      reason: 'hostile_encounter',
      position: { x: 1, y: 64, z: 1 },
      timestamp: Date.now()
    });
  }
  
  console.log(`✅ Simulated ${failureCount} night mining failures`);
};

export const createTestBot = async () => {
  // Create a test bot with all necessary capabilities
  const bot = {
    // Bot implementation
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    executeAction: jest.fn().mockResolvedValue({ success: true }),
    simulateHostileSpawn: jest.fn().mockResolvedValue(true),
    simulateDeathOrRetreat: jest.fn().mockResolvedValue(true),
    recordFailure: jest.fn().mockResolvedValue(true),
    getWorldState: jest.fn().mockResolvedValue({
      position: { x: 0, y: 64, z: 0 },
      light: 4,
      time: 18000,
      hostiles: [],
      inventory: { torch: 10, pickaxe: 1 }
    }),
    getPerformanceMetrics: jest.fn().mockResolvedValue({
      before: {
        deathsPerEpisode: 1.2,
        lightLevelMean: 4.9,
        stepFailureRate: 0.22
      },
      after: {
        deathsPerEpisode: 0.1,
        lightLevelMean: 8.2,
        stepFailureRate: 0.03
      }
    }),
    context: {
      bot: {},
      now: () => Date.now(),
      snapshot: jest.fn().mockResolvedValue({}),
      inventory: jest.fn().mockResolvedValue({}),
      emitMetric: jest.fn()
    }
  };
  
  return bot;
};
```

## Implementation Requirements

### 1. Problem Detection System
**Location**: `packages/planning/src/impasse-detector.ts`

#### Requirements
- [ ] Monitor telemetry across episodes
- [ ] Detect repeated failure patterns
- [ ] Generate reflexion hints
- [ ] Trigger option proposal requests

#### Key Metrics to Track
```typescript
interface NightMiningMetrics {
  deathsPerEpisode: number;
  hostileEncountersPerEpisode: number;
  lightLevelMean: number;
  stepFailureRate: number;
}
```

#### Success Criteria
- Detects when `deathsPerEpisode > 1.0`
- Detects when `lightLevelMean < 5.0`
- Generates structured reflexion hints
- Triggers LLM option proposal

### 2. LLM Option Proposal
**Location**: `packages/cognition/src/option-proposer.ts`

#### Requirements
- [ ] Accept planning impasse context
- [ ] Generate BT-DSL JSON proposal
- [ ] Include minimal test fixtures
- [ ] Provide provenance information

#### Expected Output
```json
{
  "id": "opt.torch_corridor",
  "version": "1.0.0",
  "argsSchema": {
    "type": "object",
    "properties": {
      "end": {"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}},"required":["x","y","z"]},
      "interval":{"type":"integer","minimum":2,"maximum":10,"default":6},
      "hostilesRadius":{"type":"integer","minimum":5,"maximum":20,"default":10}
    },
    "required": ["end"]
  },
  "pre": ["has(item:torch)>=1"],
  "post": ["corridor.light>=8", "reached(end)==true"],
  "tree": {
    "type": "Sequence",
    "children": [
      { "type":"Leaf", "name":"move_to", "args":{"pos":"$end","safe": true} },
      {
        "type":"Repeat.Until",
        "predicate":"distance_to($end)<=1",
        "child": {
          "type":"Sequence",
          "children":[
            { "type": "Leaf", "name":"sense_hostiles", "args":{"radius":"$hostilesRadius"} },
            { "type": "Decorator.FailOnTrue", "cond":"hostiles_present",
              "child": { "type":"Leaf", "name":"retreat_and_block", "args":{} } },
            { "type": "Leaf", "name":"place_torch_if_needed",
              "args":{"interval":"$interval"} },
            { "type": "Leaf", "name":"step_forward_safely", "args":{} }
          ]
        }
      }
    ]
  },
  "tests": [
    {
      "name":"lights corridor to ≥8 and reaches end",
      "world":"fixtures/corridor_12_blocks.json",
      "args":{"end":{"x":100,"y":12,"z":-35},"interval":6,"hostilesRadius":10},
      "assert":{
        "post":["corridor.light>=8","reached(end)==true"],
        "runtime":{"timeoutMs":60000,"maxRetries":2}
      }
    }
  ],
  "provenance": {"authored_by":"LLM","reflexion_hint_id":"rx_2025_08_25_01"}
}
```

#### Success Criteria
- Generates valid BT-DSL JSON
- Uses only existing leaf names
- Includes comprehensive test fixtures
- Provides proper provenance tracking

### 3. Registration Pipeline
**Location**: `packages/core/src/mcp-capabilities/registration-pipeline.ts`

#### Requirements
- [ ] Static schema validation
- [ ] BT-DSL linting
- [ ] Dry-run compilation
- [ ] Sandbox testing
- [ ] Registry persistence

#### Validation Steps
1. **Schema Validation**: Validate JSON against BT-DSL schema
2. **Linting**: Check for allowed nodes, existing leaves
3. **Compilation**: Dry-run compile to executable BT
4. **Sandbox Testing**: Run in isolated environment
5. **Postcondition Verification**: Check final world state
6. **Registry Storage**: Persist with versioning

#### Success Criteria
- All validation steps pass
- Option registered with `opt.torch_corridor@1.0.0` ID
- Sandbox test completes successfully
- Postconditions verified

### 4. Planning Integration
**Location**: `packages/planning/src/reactive-executor/enhanced-goap-planner.ts`

#### Requirements
- [ ] Add GOAP rule for `safe_corridor_to(end)`
- [ ] Add HTN method for `reach_target_safely`
- [ ] Integrate with existing planning system
- [ ] Support option versioning

#### GOAP Rule Addition
```typescript
actions.add({
  name: 'opt.torch_corridor',
  pre: ['has(torch)>=1'],
  effect: ['safe_corridor_to(end)'],
  cost: 8,
  optionId: 'opt.torch_corridor@1.0.0'
});
```

#### HTN Method Addition
```typescript
methods.register('reach_target_safely', (ctx, end) => [
  { option: 'opt.torch_corridor@1.0.0', args: { end } }
]);
```

#### Success Criteria
- Planner generates plans using new option
- Option appears in plan steps
- Versioning works correctly
- Cost estimation is reasonable

### 5. Execution System
**Location**: `packages/planning/src/behavior-trees/BehaviorTreeRunner.ts`

#### Requirements
- [ ] Execute option as behavior tree
- [ ] Stream tick telemetry
- [ ] Handle timeout and retries
- [ ] Emit state diffs

#### Expected Execution Flow
```
[t=0.41] SEQ → Leaf(move_to) running
[t=2.08] Leaf(move_to) success {distStart: 14.2, distEnd: 0.9}
[t=2.09] REPEAT check: distance_to(end)=0.9 > 1? false → exit
[t=2.10] REPEAT exit → success
[t=2.11] POSTCHECK corridor.light >= 8? true
[t=2.12] OPTION SUCCESS opt.torch_corridor@1.0.0
```

#### Success Criteria
- BT executes correctly
- Telemetry streams in real-time
- Postconditions verified
- State diffs recorded

### 6. Performance Validation
**Location**: `packages/evaluation/src/performance-metrics.ts`

#### Before Metrics (Baseline)
- Deaths/episode: 1.2
- Hostile encounters: 7.4
- Step failure rate: 22%
- Mean corridor light: 4.9

#### After Metrics (Target)
- Deaths/episode: 0.0-0.2
- Hostile encounters: 2.1
- Step failure rate: <5%
- Mean corridor light: 8.2

#### Success Criteria
- All metrics show significant improvement
- Death rate reduced by >80%
- Light levels consistently >8
- Failure rate reduced by >75%

## Test Fixtures Required

### 1. World Fixture
**Location**: `packages/test-utils/src/fixtures/corridor_12_blocks.json`

#### Requirements
- 12-block corridor with low light
- Hostile spawn points
- Safe starting position
- Target endpoint

### 2. Test Data
**Location**: `packages/test-utils/src/fixtures/torch-corridor-test-data.ts`

#### Requirements
- Mock telemetry data
- Expected execution traces
- Performance baseline metrics
- Validation assertions

## Integration Points

### 1. Existing Systems
- **Minecraft Interface**: Must work with real Mineflayer bot
- **Planning System**: Must integrate with GOAP/HTN
- **Telemetry System**: Must track all metrics
- **Memory System**: Must record episodic traces

### 2. New Systems
- **Impasse Detector**: New system for failure pattern detection
- **Option Proposer**: New LLM integration
- **Registration Pipeline**: New validation system
- **Sandbox Tester**: New isolated testing environment

## Implementation Checklist

### Foundation
- [ ] Implement core leaves (`move_to`, `sense_hostiles`, `place_torch_if_needed`, `retreat_and_block`, `step_forward_safely`)
- [ ] Create leaf factory with validation
- [ ] Test leaf execution with Mineflayer

### Language System
- [ ] Implement BT-DSL schema
- [ ] Create compiler for torch corridor tree
- [ ] Add linting for safety checks
- [ ] Test compilation of torch corridor option

### Registration System
- [ ] Build registration pipeline
- [ ] Implement sandbox testing
- [ ] Add option persistence
- [ ] Test full registration flow

### Intelligence Integration
- [ ] Build impasse detector
- [ ] Implement LLM option proposer
- [ ] Add planning integration
- [ ] Create end-to-end test

## Success Metrics

### Functional Metrics
- **Option Creation**: LLM successfully proposes valid torch corridor option
- **Registration**: Option passes all validation stages
- **Planning**: Planner adopts option in relevant scenarios
- **Execution**: Option executes successfully with streaming telemetry
- **Performance**: All metrics show significant improvement

### Technical Metrics
- **Response Time**: Option proposal generated in <30s
- **Registration Time**: Full pipeline completes in <2s
- **Execution Time**: Torch corridor completes in <5min
- **Accuracy**: 100% of test scenarios pass

### Safety Metrics
- **Validation**: 100% of validation checks pass
- **Sandbox**: All tests run in isolated environment
- **Permissions**: No permission escalation
- **Resource Usage**: Within acceptable limits

## Next Steps

1. **Complete Foundation**: Ensure all core leaves work with real Mineflayer bot
2. **Create Test Fixtures**: Build world and test data
3. **Implement Pipeline**: Build registration and validation system
4. **Integration Testing**: Test full end-to-end flow
5. **Performance Validation**: Measure before/after improvements

This example flow serves as the primary validation scenario for the entire dynamic behavior tree composition system and must be fully implemented and tested.

## Test Execution Plan

### Phase 1: Unit Testing
```bash
# Test individual components
npm run test:unit -- --testPathPattern="torch-corridor"
```

### Phase 2: Integration Testing
```bash
# Test component interactions
npm run test:integration -- --testPathPattern="torch-corridor"
```

### Phase 3: End-to-End Testing
```bash
# Test complete flow
npm run test:e2e -- --testPathPattern="torch-corridor-example"
```

### Phase 4: Performance Testing
```bash
# Test performance metrics
npm run test:performance -- --testPathPattern="torch-corridor"
```

This comprehensive test structure ensures that the torch corridor example can be validated at all levels and serves as a reliable benchmark for the entire system.
