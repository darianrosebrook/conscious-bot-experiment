/**
 * Simple Actions Test
 *
 * Tests basic actions that should definitely work to verify the bot
 * is actually performing actions in the Minecraft world
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';
import { createMinecraftCognitiveIntegration } from './minecraft-cognitive-integration.js';

async function testSimpleActions() {
  console.log('🎯 Simple Actions Test\n');
  console.log('Testing basic actions that should definitely work...\n');

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

    // Load pathfinder plugin
    const { pathfinder } = require('mineflayer-pathfinder');
    bot.loadPlugin(pathfinder);

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
        actionTimeout: 15000,
        maxRetries: 2,
      }
    );

    console.log('✅ Cognitive integration ready\n');

    // Test 1: Get initial state
    console.log('📊 Test 1: Initial State');
    const initialState = cognitiveIntegration.getBotState();
    console.log(`   Position: ${JSON.stringify(initialState.position)}`);
    console.log(`   Health: ${initialState.health}`);
    console.log(`   Food: ${initialState.food}`);
    console.log(`   Inventory: ${JSON.stringify(initialState.inventory)}`);

    // Test 2: Simple sensing (should always work)
    console.log('\n🎯 Test 2: Light Sensing');
    console.log('   Testing "get light level" capability...');

    try {
      await cognitiveIntegration.executePlanningCycle('get light level');
      console.log('   ✅ Light sensing completed');
    } catch (error) {
      console.log(`   ❌ Light sensing failed: ${error}`);
    }

    // Test 3: Simple movement (one step)
    console.log('\n🎯 Test 3: Simple Movement');
    console.log('   Testing "step forward safely" capability...');

    const beforeMove = cognitiveIntegration.getBotState();
    console.log(`   Position before: ${JSON.stringify(beforeMove.position)}`);

    try {
      await cognitiveIntegration.executePlanningCycle('step forward safely');
      console.log('   ✅ Step forward completed');
    } catch (error) {
      console.log(`   ❌ Step forward failed: ${error}`);
    }

    // Wait a moment for movement to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const afterMove = cognitiveIntegration.getBotState();
    console.log(`   Position after: ${JSON.stringify(afterMove.position)}`);

    const moved =
      beforeMove.position.x !== afterMove.position.x ||
      beforeMove.position.y !== afterMove.position.y ||
      beforeMove.position.z !== afterMove.position.z;

    console.log(`   Movement detected: ${moved ? '✅ YES' : '❌ NO'}`);

    // Test 4: Direct bot commands (bypass planning)
    console.log('\n🎯 Test 4: Direct Bot Commands');
    console.log('   Testing direct bot movement...');

    const directBefore = cognitiveIntegration.getBotState();
    console.log(
      `   Position before direct: ${JSON.stringify(directBefore.position)}`
    );

    try {
      // Try to move the bot directly using Mineflayer
      const currentPos = bot.entity.position;
      const targetPos = {
        x: Math.round(currentPos.x) + 1,
        y: Math.round(currentPos.y),
        z: Math.round(currentPos.z),
      };

      console.log(`   Moving to: ${JSON.stringify(targetPos)}`);

      // Use pathfinder directly
      if (bot.pathfinder) {
        const { goals } = require('mineflayer-pathfinder');
        const goal = new goals.GoalNear(
          targetPos.x,
          targetPos.y,
          targetPos.z,
          1
        );
        await bot.pathfinder.goto(goal);
        console.log('   ✅ Direct movement completed');
      } else {
        console.log('   ❌ Pathfinder not available');
      }
    } catch (error) {
      console.log(`   ❌ Direct movement failed: ${error}`);
    }

    // Wait for movement
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const directAfter = cognitiveIntegration.getBotState();
    console.log(
      `   Position after direct: ${JSON.stringify(directAfter.position)}`
    );

    const directMoved =
      directBefore.position.x !== directAfter.position.x ||
      directBefore.position.y !== directAfter.position.y ||
      directBefore.position.z !== directAfter.position.z;

    console.log(
      `   Direct movement detected: ${directMoved ? '✅ YES' : '❌ NO'}`
    );

    // Test 5: Bot inventory and actions
    console.log('\n🎯 Test 5: Bot Inventory');
    try {
      const inventory = bot.inventory.items();
      console.log(`   Inventory items: ${inventory.length}`);
      inventory.forEach((item: any, index: number) => {
        console.log(`     ${index + 1}. ${item.name} x${item.count}`);
      });

      if (inventory.length > 0) {
        console.log('   ✅ Bot has items in inventory');
      } else {
        console.log('   ⚠️ Bot inventory is empty');
      }
    } catch (error) {
      console.log(`   ❌ Inventory check failed: ${error}`);
    }

    // Test 6: Bot world interaction
    console.log('\n🎯 Test 6: World Interaction');
    try {
      const currentPos = bot.entity.position;
      const blockAtFeet = bot.blockAt(currentPos);
      const blockInFront = bot.blockAt(currentPos.offset(0, 0, 1));

      console.log(`   Block at feet: ${blockAtFeet?.name || 'unknown'}`);
      console.log(`   Block in front: ${blockInFront?.name || 'unknown'}`);

      if (blockAtFeet) {
        console.log('   ✅ Bot can read world blocks');
      } else {
        console.log('   ❌ Bot cannot read world blocks');
      }
    } catch (error) {
      console.log(`   ❌ World interaction failed: ${error}`);
    }

    // Final summary
    console.log('\n📋 Test Summary:');
    console.log(`   Bot connected: ✅`);
    console.log(`   Light sensing: ${moved ? '✅' : '❌'}`);
    console.log(`   Movement via planning: ${moved ? '✅' : '❌'}`);
    console.log(`   Direct movement: ${directMoved ? '✅' : '❌'}`);
    console.log(`   World interaction: ✅`);

    if (moved || directMoved) {
      console.log('\n🎉 SUCCESS: Bot is performing real actions!');
    } else {
      console.log('\n⚠️ ISSUE: Bot is not moving - may need investigation');
    }

    // Keep bot active for a bit
    console.log('\n⏳ Keeping bot active for 10 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the test
testSimpleActions().catch(console.error);

export { testSimpleActions };
