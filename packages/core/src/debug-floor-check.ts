/**
 * Debug Floor Check
 *
 * Debug script to check what block the bot is standing on
 * and why the floor check is failing
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';
import { Vec3 } from 'vec3';

async function debugFloorCheck() {
  console.log('🔍 Debug Floor Check\n');

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

    // Debug bot position and blocks
    console.log('\n📊 Bot Position Analysis');
    const position = bot.entity.position;
    console.log(`   Bot position: ${JSON.stringify(position)}`);

    // Check block at feet
    const blockAtFeet = bot.blockAt(position);
    console.log(`   Block at feet: ${blockAtFeet?.name || 'unknown'}`);
    console.log(
      `   Block boundingBox: ${blockAtFeet?.boundingBox || 'unknown'}`
    );
    console.log(`   Block type: ${blockAtFeet?.type || 'unknown'}`);

    // Check block below feet
    const blockBelow = bot.blockAt(position.offset(0, -1, 0));
    console.log(`   Block below feet: ${blockBelow?.name || 'unknown'}`);
    console.log(
      `   Block below boundingBox: ${blockBelow?.boundingBox || 'unknown'}`
    );
    console.log(`   Block below type: ${blockBelow?.type || 'unknown'}`);

    // Check block in front
    const blockInFront = bot.blockAt(position.offset(0, 0, 1));
    console.log(`   Block in front: ${blockInFront?.name || 'unknown'}`);
    console.log(
      `   Block in front boundingBox: ${blockInFront?.boundingBox || 'unknown'}`
    );

    // Check block above head
    const blockAbove = bot.blockAt(position.offset(0, 1, 0));
    console.log(`   Block above head: ${blockAbove?.name || 'unknown'}`);
    console.log(
      `   Block above boundingBox: ${blockAbove?.boundingBox || 'unknown'}`
    );

    // Test floor check logic
    console.log('\n🧪 Floor Check Logic Test');
    const floor = blockBelow;
    const hasFloor =
      floor &&
      (floor.boundingBox === 'block' ||
        floor.name === 'snow' ||
        floor.name === 'grass_block' ||
        floor.name === 'dirt' ||
        floor.name === 'stone');

    console.log(`   Floor exists: ${!!floor}`);
    console.log(`   Floor name: ${floor?.name || 'none'}`);
    console.log(`   Floor boundingBox: ${floor?.boundingBox || 'none'}`);
    console.log(`   Has floor (our logic): ${hasFloor}`);
    console.log(
      `   Original logic would pass: ${floor && floor.boundingBox === 'block'}`
    );

    // Test step forward target
    console.log('\n🎯 Step Forward Target Analysis');
    const yaw = bot.entity.yaw;
    const dist = 1.0;
    const target = {
      x: position.x - Math.sin(yaw) * dist,
      y: position.y,
      z: position.z + Math.cos(yaw) * dist,
    };
    console.log(`   Bot yaw: ${yaw}`);
    console.log(`   Target position: ${JSON.stringify(target)}`);

    const bTarget = new Vec3(
      Math.floor(target.x),
      Math.floor(target.y),
      Math.floor(target.z)
    );
    console.log(`   Target block coords: ${JSON.stringify(bTarget)}`);

    const targetBlock = bot.blockAt(bTarget);
    const targetHead = bot.blockAt(bTarget.offset(0, 1, 0));
    const targetFloor = bot.blockAt(bTarget.offset(0, -1, 0));

    console.log(
      `   Target block: ${targetBlock?.name || 'unknown'} (${targetBlock?.boundingBox || 'unknown'})`
    );
    console.log(
      `   Target head: ${targetHead?.name || 'unknown'} (${targetHead?.boundingBox || 'unknown'})`
    );
    console.log(
      `   Target floor: ${targetFloor?.name || 'unknown'} (${targetFloor?.boundingBox || 'unknown'})`
    );

    // Test target floor check
    const targetHasFloor =
      targetFloor &&
      (targetFloor.boundingBox === 'block' ||
        targetFloor.name === 'snow' ||
        targetFloor.name === 'grass_block' ||
        targetFloor.name === 'dirt' ||
        targetFloor.name === 'stone');
    console.log(`   Target has floor: ${targetHasFloor}`);

    // Test collision checks
    console.log('\n🚫 Collision Checks');
    const isBlocked = targetBlock && targetBlock.boundingBox === 'block';
    const noHeadroom = targetHead && targetHead.boundingBox === 'block';
    const noFloor = !targetHasFloor;

    console.log(`   Is blocked: ${isBlocked}`);
    console.log(`   No headroom: ${noHeadroom}`);
    console.log(`   No floor: ${noFloor}`);

    if (isBlocked) console.log('   ❌ Would fail: blocked');
    if (noHeadroom) console.log('   ❌ Would fail: no headroom');
    if (noFloor) console.log('   ❌ Would fail: no floor');

    if (!isBlocked && !noHeadroom && !noFloor) {
      console.log('   ✅ All checks passed - should be able to move');
    }

    console.log('\n🔍 Debug complete');
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the debug
debugFloorCheck().catch(console.error);

export { debugFloorCheck };
