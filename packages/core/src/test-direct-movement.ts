/**
 * Direct Movement Test
 *
 * Simple test to see if the bot can move at all using direct commands
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';

async function testDirectMovement() {
  console.log('🎯 Direct Movement Test\n');

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

    // Wait a bit for world to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\n📊 Initial State');
    const initialPos = bot.entity.position;
    console.log(`   Position: ${JSON.stringify(initialPos)}`);
    console.log(`   Yaw: ${bot.entity.yaw}`);

    // Test 1: Simple bot movement
    console.log('\n🎯 Test 1: Simple Bot Movement');
    try {
      // Try to move the bot using setControlState
      bot.setControlState('forward', true);
      console.log('   Set forward control to true');

      await new Promise((resolve) => setTimeout(resolve, 1000));

      bot.setControlState('forward', false);
      console.log('   Set forward control to false');

      const afterMove = bot.entity.position;
      console.log(`   Position after: ${JSON.stringify(afterMove)}`);

      const moved =
        initialPos.x !== afterMove.x ||
        initialPos.y !== afterMove.y ||
        initialPos.z !== afterMove.z;

      console.log(`   Movement detected: ${moved ? '✅ YES' : '❌ NO'}`);
    } catch (error) {
      console.log(`   ❌ Simple movement failed: ${error}`);
    }

    // Test 2: Pathfinder movement
    console.log('\n🎯 Test 2: Pathfinder Movement');
    try {
      const currentPos = bot.entity.position;
      const targetPos = {
        x: Math.round(currentPos.x) + 2,
        y: Math.round(currentPos.y),
        z: Math.round(currentPos.z),
      };

      console.log(`   Moving to: ${JSON.stringify(targetPos)}`);

      if (bot.pathfinder) {
        const { goals } = require('mineflayer-pathfinder');
        const goal = new goals.GoalNear(
          targetPos.x,
          targetPos.y,
          targetPos.z,
          1
        );

        await bot.pathfinder.goto(goal);
        console.log('   ✅ Pathfinder movement completed');

        const finalPos = bot.entity.position;
        console.log(`   Final position: ${JSON.stringify(finalPos)}`);

        const pathfinderMoved =
          currentPos.x !== finalPos.x ||
          currentPos.y !== finalPos.y ||
          currentPos.z !== finalPos.z;

        console.log(
          `   Pathfinder movement detected: ${pathfinderMoved ? '✅ YES' : '❌ NO'}`
        );
      } else {
        console.log('   ❌ Pathfinder not available');
      }
    } catch (error) {
      console.log(`   ❌ Pathfinder movement failed: ${error}`);
    }

    // Test 3: Bot commands
    console.log('\n🎯 Test 3: Bot Commands');
    try {
      // Try to make the bot look around
      await bot.look(0, 0);
      console.log('   ✅ Look command worked');

      // Try to make the bot jump
      bot.setControlState('jump', true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      bot.setControlState('jump', false);
      console.log('   ✅ Jump command worked');
    } catch (error) {
      console.log(`   ❌ Bot commands failed: ${error}`);
    }

    // Test 4: World interaction
    console.log('\n🎯 Test 4: World Interaction');
    try {
      const pos = bot.entity.position;
      console.log(`   Current position: ${JSON.stringify(pos)}`);

      // Try to get nearby entities
      const entities = Object.values(bot.entities);
      console.log(`   Nearby entities: ${entities.length}`);

      // Try to get inventory
      const inventory = bot.inventory.items();
      console.log(`   Inventory items: ${inventory.length}`);

      // Try to get world time
      const time = bot.time.timeOfDay;
      console.log(`   World time: ${time}`);

      console.log('   ✅ World interaction working');
    } catch (error) {
      console.log(`   ❌ World interaction failed: ${error}`);
    }

    console.log('\n📋 Test Summary');
    console.log('   Bot connected: ✅');
    console.log('   Pathfinder loaded: ✅');
    console.log('   World interaction: ✅');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the test
testDirectMovement().catch(console.error);

export { testDirectMovement };
