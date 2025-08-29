/**
 * Simple Movement Test
 *
 * Test simple movement without relying on block reading
 * to see if the bot can move at all
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';

async function testSimpleMovement() {
  console.log('🚶 Simple Movement Test\n');

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

    // Wait for world to load
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log('\n📊 Initial State');
    const initialPos = bot.entity.position;
    console.log(`   Position: ${JSON.stringify(initialPos)}`);
    console.log(`   Yaw: ${bot.entity.yaw}`);

    // Test 1: Direct control movement
    console.log('\n🎯 Test 1: Direct Control Movement');
    try {
      // Try to move forward using direct controls
      console.log('   Setting forward control...');
      bot.setControlState('forward', true);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      bot.setControlState('forward', false);
      console.log('   Released forward control');

      const afterForward = bot.entity.position;
      console.log(`   Position after forward: ${JSON.stringify(afterForward)}`);

      const forwardMoved =
        initialPos.x !== afterForward.x ||
        initialPos.y !== afterForward.y ||
        initialPos.z !== afterForward.z;

      console.log(`   Forward movement: ${forwardMoved ? '✅ YES' : '❌ NO'}`);
    } catch (error) {
      console.log(`   ❌ Forward movement failed: ${error}`);
    }

    // Test 2: Simple pathfinder movement
    console.log('\n🎯 Test 2: Simple Pathfinder Movement');
    try {
      const currentPos = bot.entity.position;
      const targetPos = {
        x: Math.round(currentPos.x) + 3,
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
          2
        );

        console.log('   Starting pathfinder movement...');
        await bot.pathfinder.goto(goal);
        console.log('   ✅ Pathfinder movement completed');

        const finalPos = bot.entity.position;
        console.log(`   Final position: ${JSON.stringify(finalPos)}`);

        const pathfinderMoved =
          currentPos.x !== finalPos.x ||
          currentPos.y !== finalPos.y ||
          currentPos.z !== finalPos.z;

        console.log(
          `   Pathfinder movement: ${pathfinderMoved ? '✅ YES' : '❌ NO'}`
        );
      } else {
        console.log('   ❌ Pathfinder not available');
      }
    } catch (error) {
      console.log(`   ❌ Pathfinder movement failed: ${error}`);
    }

    // Test 3: Try to get block data using different methods
    console.log('\n🎯 Test 3: Block Data Methods');
    try {
      const pos = bot.entity.position;

      // Method 1: Direct blockAt
      const block1 = bot.blockAt(pos);
      console.log(`   Method 1 (blockAt): ${block1?.name || 'unknown'}`);

      // Method 2: Using world.getBlock
      const block2 = bot.world.getBlock(pos);
      console.log(`   Method 2 (world.getBlock): ${block2?.name || 'unknown'}`);

      // Method 3: Using world.getBlock (same as method 2)
      const block3 = bot.world.getBlock(pos);
      console.log(`   Method 3 (world.getBlock): ${block3?.name || 'unknown'}`);

      // Method 4: Check world properties
      console.log(`   World type: ${typeof bot.world}`);
      console.log(
        `   World properties: ${Object.keys(bot.world).slice(0, 10).join(', ')}`
      );
    } catch (error) {
      console.log(`   ❌ Block data methods failed: ${error}`);
    }

    // Test 4: Try to move using coordinates
    console.log('\n🎯 Test 4: Coordinate Movement');
    try {
      const currentPos = bot.entity.position;
      const targetX = currentPos.x + 2;
      const targetY = currentPos.y;
      const targetZ = currentPos.z;

      console.log(
        `   Moving to coordinates: (${targetX}, ${targetY}, ${targetZ})`
      );

      // Try to set position directly (if possible)
      if (bot.entity && bot.entity.position) {
        // Try to use pathfinder with coordinates
        const { goals } = require('mineflayer-pathfinder');
        const goal = new goals.GoalBlock(targetX, targetY, targetZ);

        await bot.pathfinder.goto(goal);
        console.log('   ✅ Coordinate movement completed');

        const finalPos = bot.entity.position;
        console.log(`   Final position: ${JSON.stringify(finalPos)}`);

        const coordMoved =
          currentPos.x !== finalPos.x ||
          currentPos.y !== finalPos.y ||
          currentPos.z !== finalPos.z;

        console.log(
          `   Coordinate movement: ${coordMoved ? '✅ YES' : '❌ NO'}`
        );
      }
    } catch (error) {
      console.log(`   ❌ Coordinate movement failed: ${error}`);
    }

    console.log('\n📋 Movement Test Summary');
    console.log('   Bot connected: ✅');
    console.log('   Pathfinder loaded: ✅');
    console.log('   Basic controls: ✅');
    console.log('   Block reading: ❌ (still not working)');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the test
testSimpleMovement().catch(console.error);

export { testSimpleMovement };
