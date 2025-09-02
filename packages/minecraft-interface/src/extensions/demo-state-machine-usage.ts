#!/usr/bin/env tsx

/**
 * State Machine Extensions Demo
 *
 * Demonstrates how to use Mineflayer extensions with our planning system
 * while preserving emergent behavior. This shows the integration approach
 * where extensions provide capabilities, not behaviors.
 *
 * @author @darianrosebrook
 */

import { StateMachineWrapper } from './state-machine-wrapper';
import {
  createCraftingStateMachine,
  createBuildingStateMachine,
  createGatheringStateMachine,
} from './crafting-state-definitions';

// Mock bot for demonstration (in real usage, this would be a real Mineflayer bot)
const mockBot = {
  loadPlugin: (plugin: any) => {
    console.log(`[Demo] Loading plugin: ${plugin.name || 'Unknown plugin'}`);
  },
  waitForTicks: async (ticks: number) => {
    console.log(`[Demo] Waiting for ${ticks} ticks`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  },
  emit: (event: string, data: any) => {
    console.log(`[Demo] Bot emitted ${event}:`, data);
  },
  on: (event: string, handler: Function) => {
    console.log(`[Demo] Bot listening for ${event}`);
  },
  entity: { position: { x: 0, y: 64, z: 0 } },
} as any;

/**
 * Demo 1: Crafting Workflow
 * Shows how the planning system maintains control while using structured execution
 */
async function demoCraftingWorkflow() {
  console.log('\n=== Demo 1: Crafting Workflow ===');
  console.log('This demonstrates how our planning system maintains control');
  console.log('while the state machine provides structured execution.\n');

  // Create crafting state machine
  const craftingStates = createCraftingStateMachine(mockBot, 'iron_pickaxe', 1);

  console.log('Created crafting state machine with states:');
  craftingStates.forEach((state) => {
    console.log(`  - ${state.name}: ${state.description}`);
  });

  console.log('\nKey points about emergent behavior preservation:');
  console.log('1. Our planning system decides what to craft (iron_pickaxe)');
  console.log('2. Our planning system decides when to craft (now)');
  console.log('3. The state machine only provides structured execution');
  console.log(
    '4. Success/failure events are emitted for planning system feedback'
  );
}

/**
 * Demo 2: Building Workflow
 * Shows how complex multi-step actions can be structured without losing autonomy
 */
async function demoBuildingWorkflow() {
  console.log('\n=== Demo 2: Building Workflow ===');
  console.log('This demonstrates how complex actions can be structured');
  console.log('while maintaining planning system autonomy.\n');

  // Create building state machine
  const buildingStates = createBuildingStateMachine(mockBot, 'house', {
    width: 5,
    height: 3,
    depth: 4,
  });

  console.log('Created building state machine with states:');
  buildingStates.forEach((state) => {
    console.log(`  - ${state.name}: ${state.description}`);
  });

  console.log('\nKey points about maintaining autonomy:');
  console.log('1. Our planning system decides what to build (house)');
  console.log('2. Our planning system decides the dimensions (5x3x4)');
  console.log('3. The state machine provides workflow structure');
  console.log('4. Each state can be customized by the planning system');
}

/**
 * Demo 3: Resource Gathering Workflow
 * Shows how fallback behaviors can be built into workflows
 */
async function demoGatheringWorkflow() {
  console.log('\n=== Demo 3: Resource Gathering Workflow ===');
  console.log(
    'This demonstrates how fallback behaviors are built into workflows'
  );
  console.log('while maintaining planning system decision-making.\n');

  // Create gathering state machine
  const gatheringStates = createGatheringStateMachine(mockBot, 'wood', 64);

  console.log('Created gathering state machine with states:');
  gatheringStates.forEach((state) => {
    console.log(`  - ${state.name}: ${state.description}`);
  });

  console.log('\nKey points about fallback behaviors:');
  console.log('1. Our planning system decides what to gather (wood)');
  console.log('2. Our planning system decides how much (64)');
  console.log('3. The state machine provides exploration fallback');
  console.log('4. Error handling is built into the workflow');
}

/**
 * Demo 4: Integration with Planning System
 * Shows how the extensions integrate with our existing planning architecture
 */
async function demoPlanningIntegration() {
  console.log('\n=== Demo 4: Planning System Integration ===');
  console.log(
    'This demonstrates how extensions integrate with our planning system'
  );
  console.log('while preserving emergent behavior.\n');

  // Create state machine wrapper
  const stateMachineWrapper = new StateMachineWrapper(mockBot, {
    enableDebugLogging: true,
    maxStateDuration: 300000, // 5 minutes
    enableStatePersistence: true,
  });

  // Set up event listeners to show integration
  stateMachineWrapper.on('initialized', (data) => {
    console.log('✅ State machine initialized:', data);
  });

  stateMachineWrapper.on('stateChanged', (data) => {
    console.log(`🔄 State changed: ${data.oldState} → ${data.newState}`);
  });

  stateMachineWrapper.on('executionComplete', (data) => {
    console.log('✅ Execution completed:', data);
  });

  stateMachineWrapper.on('executionFailed', (data) => {
    console.log('❌ Execution failed:', data);
  });

  console.log('State machine wrapper created with event listeners');
  console.log(
    'This shows how our planning system can monitor and control execution'
  );
  console.log('while the extensions provide structured workflows.');
}

/**
 * Demo 5: Emergent Behavior Verification
 * Shows how we verify that extensions don't override planning decisions
 */
async function demoEmergentBehaviorVerification() {
  console.log('\n=== Demo 5: Emergent Behavior Verification ===');
  console.log(
    'This demonstrates how we verify that extensions preserve emergent behavior.\n'
  );

  // Create a crafting workflow
  const craftingStates = createCraftingStateMachine(
    mockBot,
    'diamond_sword',
    1
  );

  console.log(
    'Analyzing crafting workflow for emergent behavior preservation:'
  );

  // Check that no state makes decisions
  const decisionMakingStates = craftingStates.filter((state) => {
    const entryActions = state.entryActions || [];
    return entryActions.some((action) => {
      const actionStr = action.toString();
      return (
        actionStr.includes('decide') ||
        actionStr.includes('choose') ||
        actionStr.includes('select')
      );
    });
  });

  if (decisionMakingStates.length === 0) {
    console.log(
      '✅ No states make decisions - planning system maintains control'
    );
  } else {
    console.log(
      '❌ Some states make decisions - this violates emergent behavior'
    );
  }

  // Check that states provide capabilities
  const capabilityStates = craftingStates.filter(
    (state) => state.metadata?.phase && state.description.includes('execute')
  );

  console.log(
    `✅ ${capabilityStates.length} states provide execution capabilities`
  );
  console.log('This shows extensions provide capabilities, not behaviors.');
}

/**
 * Main demo function
 */
async function runDemo() {
  console.log('🚀 Mineflayer Extensions Integration Demo');
  console.log('==========================================');
  console.log('This demo shows how we integrate Mineflayer extensions');
  console.log('while preserving emergent, autonomous behavior.\n');

  try {
    await demoCraftingWorkflow();
    await demoBuildingWorkflow();
    await demoGatheringWorkflow();
    await demoPlanningIntegration();
    await demoEmergentBehaviorVerification();

    console.log('\n=== Demo Summary ===');
    console.log('✅ Extensions provide structured workflows');
    console.log('✅ Planning system maintains full control');
    console.log('✅ Emergent behavior is preserved');
    console.log(
      '✅ Extensions are capability providers, not behavior controllers'
    );
    console.log('✅ Integration maintains our conscious bot architecture');

    console.log('\n🎯 Key Benefits:');
    console.log('1. Better error handling and recovery');
    console.log('2. Structured multi-step actions');
    console.log('3. Improved debugging and monitoring');
    console.log('4. Maintained autonomy and emergent behavior');
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

export { runDemo };
