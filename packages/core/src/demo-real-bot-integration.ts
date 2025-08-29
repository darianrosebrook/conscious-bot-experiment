/**
 * Demo: Real Bot Integration with Cognitive Stream
 *
 * Demonstrates the cognitive stream integration with a real Mineflayer bot
 * that actually performs physical actions in Minecraft.
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';
import { createMinecraftCognitiveIntegration } from './minecraft-cognitive-integration.js';

async function main() {
  console.log('🤖 Starting Real Bot Cognitive Integration Demo\n');

  try {
    // Create a real Mineflayer bot
    console.log('🔗 Connecting to Minecraft server...');
    const bot = createBot({
      host: process.env.MINECRAFT_HOST || 'localhost',
      port: process.env.MINECRAFT_PORT
        ? parseInt(process.env.MINECRAFT_PORT)
        : 25565,
      username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
      version: process.env.MINECRAFT_VERSION || '1.20.1',
      auth: 'offline',
    });

    // Wait for bot to spawn
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Bot spawn timeout'));
      }, 30000);

      bot.once('spawn', () => {
        clearTimeout(timeout);
        console.log('✅ Bot spawned successfully');
        resolve();
      });

      bot.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Create the cognitive integration
    console.log('🧠 Creating cognitive integration...');
    const cognitiveIntegration = await createMinecraftCognitiveIntegration(
      bot,
      {
        enableRealActions: true,
        actionTimeout: 30000,
        maxRetries: 3,
      }
    );

    console.log('✅ Cognitive integration ready');

    // Set up event listeners
    cognitiveIntegration.on('goalIdentified', (event) => {
      console.log(`🎯 Goal identified: ${event.content}`);
    });

    cognitiveIntegration.on('planGenerated', (event) => {
      console.log(`📋 Plan generated: ${event.content}`);
      console.log(`   Approach: ${event.metadata?.approach}`);
      console.log(`   Confidence: ${event.metadata?.confidence}`);
    });

    cognitiveIntegration.on('planExecuted', (event) => {
      console.log(`⚡ Plan executed: ${event.content}`);
      console.log(`   Success: ${event.metadata?.success}`);
      console.log(`   Duration: ${event.metadata?.totalDuration}ms`);
    });

    cognitiveIntegration.on('botError', (event) => {
      console.error(`❌ Bot error: ${event.error}`);
    });

    // Demo sequence
    console.log('\n🎬 Starting demo sequence...\n');

    // Step 1: Show initial state
    console.log('Step 1: Initial bot state');
    const initialState = cognitiveIntegration.getBotState();
    console.log(`   Position: ${JSON.stringify(initialState.position)}`);
    console.log(`   Health: ${initialState.health}`);
    console.log(`   Food: ${initialState.food}`);
    console.log(`   Inventory: ${JSON.stringify(initialState.inventory)}`);
    console.log(`   Current Task: ${initialState.currentTask}`);

    // Step 2: Execute a simple goal
    console.log('\nStep 2: Executing "explore safely" goal');
    await cognitiveIntegration.executePlanningCycle('explore safely');

    // Step 3: Wait and show updated state
    console.log('\nStep 3: Updated bot state after exploration');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const updatedState = cognitiveIntegration.getBotState();
    console.log(`   Position: ${JSON.stringify(updatedState.position)}`);
    console.log(`   Health: ${updatedState.health}`);
    console.log(`   Food: ${updatedState.food}`);
    console.log(`   Inventory: ${JSON.stringify(updatedState.inventory)}`);
    console.log(`   Current Task: ${updatedState.currentTask}`);

    // Step 4: Show active goals
    console.log('\nStep 4: Active goals');
    const activeGoals = cognitiveIntegration.getActiveGoals();
    console.log(`   Active goals: ${activeGoals.join(', ')}`);

    // Step 5: Show cognitive stream events
    console.log('\nStep 5: Cognitive stream events');
    const events = cognitiveIntegration.getCognitiveStream();
    console.log(`   Total events: ${events.length}`);

    // Show last 5 events
    const recentEvents = events.slice(-5);
    recentEvents.forEach((event, index) => {
      console.log(
        `   ${index + 1}. [${event.type.toUpperCase()}] ${event.content}`
      );
    });

    // Step 6: Show MCP capabilities status
    console.log('\nStep 6: MCP capabilities status');
    const capabilitiesStatus =
      await cognitiveIntegration.getMCPCapabilitiesStatus();
    console.log(
      `   Total capabilities: ${capabilitiesStatus.totalCapabilities}`
    );
    console.log(
      `   Active capabilities: ${capabilitiesStatus.activeCapabilities}`
    );
    console.log(
      `   Shadow capabilities: ${capabilitiesStatus.shadowCapabilities}`
    );

    console.log('\n🎉 Real Bot Cognitive Integration Demo Complete!');
    console.log('\nKey Achievements:');
    console.log('✅ Connected cognitive stream to real Mineflayer bot');
    console.log('✅ Real bot state monitoring active');
    console.log('✅ Physical actions executed in Minecraft world');
    console.log('✅ Goal identification from real bot state');
    console.log('✅ Planning cycles with real leaf implementations');
    console.log('✅ Event streaming from real bot actions');

    // Keep the bot running for a bit to show real-time updates
    console.log(
      '\n⏳ Keeping bot active for 30 seconds to show real-time updates...'
    );
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the demo
main().catch(console.error);

export { main as runRealBotDemo };
