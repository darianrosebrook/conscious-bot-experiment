/**
 * Cognitive Stream Integration Demonstration
 *
 * Demonstrates how the cognitive stream connects to our new MCP capabilities
 * and planning integration, showing the complete cognitive flow.
 *
 * @author @darianrosebrook
 */

import { CognitiveStreamIntegration } from './cognitive-stream-integration.js';

/**
 * Demonstrate cognitive stream integration
 */
export async function demonstrateCognitiveStream() {
  console.log('🧠 Starting Cognitive Stream Integration Demonstration\n');

  try {
    // Step 1: Initialize cognitive stream integration
    console.log('Step 1: Initializing cognitive stream integration...');

    const cognitiveStream = new CognitiveStreamIntegration();
    await cognitiveStream.initialize();

    console.log('✅ Cognitive stream integration initialized\n');

    // Step 2: Simulate bot state updates
    console.log('Step 2: Simulating bot state updates...');

    // Initial state - bot is healthy and above ground
    await cognitiveStream.updateBotState({
      position: { x: 0, y: 70, z: 0 },
      health: 20,
      food: 20,
      inventory: { torch: 10, cobblestone: 20 },
      currentTask: 'exploring surface',
    });

    console.log('✅ Initial state set (healthy, above ground)\n');

    // Step 3: Simulate going underground (triggers torch corridor goal)
    console.log('Step 3: Simulating underground exploration...');

    await cognitiveStream.updateBotState({
      position: { x: 0, y: 45, z: 0 },
      health: 18,
      food: 15,
      inventory: { torch: 8, cobblestone: 20 },
      currentTask: 'mining underground',
    });

    console.log('✅ Bot moved underground (triggers safety goals)\n');

    // Step 4: Simulate low health situation
    console.log('Step 4: Simulating low health situation...');

    await cognitiveStream.updateBotState({
      position: { x: 0, y: 45, z: 0 },
      health: 5,
      food: 8,
      inventory: { torch: 6, cobblestone: 20 },
      currentTask: 'surviving underground',
    });

    console.log('✅ Bot health is low (triggers emergency goals)\n');

    // Step 5: Execute planning cycles for identified goals
    console.log('Step 5: Executing planning cycles for identified goals...');

    const activeGoals = cognitiveStream.getActiveGoals();
    console.log(`📋 Active goals: ${activeGoals.join(', ')}`);

    for (const goal of activeGoals) {
      console.log(`\n🎯 Executing planning cycle for: ${goal}`);
      await cognitiveStream.executePlanningCycle(goal);
    }

    console.log('\n✅ Planning cycles completed\n');

    // Step 6: Show cognitive stream events
    console.log('Step 6: Cognitive stream events:');

    const events = cognitiveStream.getCognitiveStream();
    events.forEach((event, index) => {
      console.log(
        `   ${index + 1}. [${event.type.toUpperCase()}] ${event.content}`
      );
      if (event.metadata) {
        console.log(`       Metadata: ${JSON.stringify(event.metadata)}`);
      }
    });

    console.log('');

    // Step 7: Show MCP capabilities status
    console.log('Step 7: MCP capabilities status:');

    const capabilitiesStatus = await cognitiveStream.getMCPCapabilitiesStatus();
    console.log(
      `   Total Capabilities: ${capabilitiesStatus.totalCapabilities}`
    );
    console.log(
      `   Active Capabilities: ${capabilitiesStatus.activeCapabilities}`
    );
    console.log(
      `   Shadow Capabilities: ${capabilitiesStatus.shadowCapabilities}`
    );
    console.log('');

    // Step 8: Show final bot state
    console.log('Step 8: Final bot state:');

    const finalState = cognitiveStream.getBotState();
    console.log(`   Position: ${JSON.stringify(finalState.position)}`);
    console.log(`   Health: ${finalState.health}`);
    console.log(`   Food: ${finalState.food}`);
    console.log(`   Inventory: ${JSON.stringify(finalState.inventory)}`);
    console.log(`   Current Task: ${finalState.currentTask}`);
    console.log('');

    console.log('🎉 Cognitive Stream Integration Demonstration Complete!');
    console.log('');
    console.log('Key Achievements:');
    console.log('✅ Cognitive stream connected to MCP capabilities');
    console.log('✅ Automatic goal identification from bot state');
    console.log('✅ Planning cycles executed for identified goals');
    console.log('✅ Real-time event tracking and logging');
    console.log('✅ MCP capabilities integrated with planning system');
    console.log('✅ Complete cognitive flow from observation to execution');
  } catch (error) {
    console.error('❌ Cognitive stream demonstration failed:', error);
  }
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateCognitiveStream().catch(console.error);
}
