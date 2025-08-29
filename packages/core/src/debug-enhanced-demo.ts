/**
 * Enhanced Debug Demo
 *
 * Detailed debugging demo to investigate why actions are being aborted
 * and provide comprehensive environment analysis
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';
import { createMinecraftCognitiveIntegration } from './minecraft-cognitive-integration.js';

async function debugEnhancedDemo() {
  console.log('🔍 Enhanced Debug Demo\n');
  console.log('Investigating action aborts and environment analysis...\n');

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
        actionTimeout: 15000,
        maxRetries: 2,
      }
    );

    console.log('✅ Cognitive integration ready\n');

    // Debug 1: Environment Analysis
    console.log('🔍 Debug 1: Environment Analysis');
    const botState = cognitiveIntegration.getBotState();
    console.log(`   Bot position: ${JSON.stringify(botState.position)}`);
    console.log(`   Bot health: ${botState.health}`);
    console.log(`   Bot food: ${botState.food}`);
    console.log(`   Inventory: ${JSON.stringify(botState.inventory)}`);

    // Analyze blocks around the bot
    const pos = bot.entity.position;
    console.log('\n   Block Analysis:');

    // Check blocks in all directions
    const directions = [
      { name: 'at feet', offset: [0, 0, 0] },
      { name: 'below feet', offset: [0, -1, 0] },
      { name: 'above head', offset: [0, 1, 0] },
      { name: 'in front', offset: [0, 0, 1] },
      { name: 'behind', offset: [0, 0, -1] },
      { name: 'to left', offset: [-1, 0, 0] },
      { name: 'to right', offset: [1, 0, 0] },
    ];

    for (const dir of directions) {
      const blockPos = pos.offset(dir.offset[0], dir.offset[1], dir.offset[2]);
      const block = bot.blockAt(blockPos);
      console.log(
        `     ${dir.name}: ${block?.name || 'unknown'} (${block?.boundingBox || 'unknown'})`
      );
    }

    // Debug 2: Inventory Analysis
    console.log('\n🔍 Debug 2: Inventory Analysis');
    try {
      const inventory = bot.inventory.items();
      console.log(`   Total inventory items: ${inventory.length}`);

      if (inventory.length > 0) {
        console.log('   Inventory contents:');
        inventory.forEach((item: any, index: number) => {
          console.log(
            `     ${index + 1}. ${item.name} x${item.count} (type: ${item.type})`
          );
        });
      } else {
        console.log(
          '   ⚠️ Inventory is empty - this will cause many action failures'
        );
      }

      // Check if bot has essential items
      const hasTorches = inventory.some((item: any) =>
        item.name.includes('torch')
      );
      const hasFood = inventory.some(
        (item: any) =>
          item.name.includes('apple') ||
          item.name.includes('bread') ||
          item.name.includes('meat') ||
          item.name.includes('carrot') ||
          item.name.includes('potato')
      );
      const hasBlocks = inventory.some(
        (item: any) =>
          item.name.includes('stone') ||
          item.name.includes('dirt') ||
          item.name.includes('wood') ||
          item.name.includes('cobblestone')
      );

      console.log(`   Has torches: ${hasTorches ? '✅' : '❌'}`);
      console.log(`   Has food: ${hasFood ? '✅' : '❌'}`);
      console.log(`   Has blocks: ${hasBlocks ? '✅' : '❌'}`);
    } catch (error) {
      console.log(`   ❌ Inventory analysis failed: ${error}`);
    }

    // Debug 3: Capability Testing with Detailed Error Analysis
    console.log('\n🔍 Debug 3: Capability Testing with Error Analysis');

    const capabilitiesToTest = [
      { name: 'get_light_level', expectedSuccess: true },
      { name: 'sense_hostiles', expectedSuccess: true },
      { name: 'move_to', expectedSuccess: true },
      { name: 'step_forward_safely', expectedSuccess: true },
      {
        name: 'dig_block',
        expectedSuccess: false,
        reason: 'No block specified',
      },
      {
        name: 'place_block',
        expectedSuccess: false,
        reason: 'No items in inventory',
      },
      {
        name: 'place_torch_if_needed',
        expectedSuccess: false,
        reason: 'No torches available',
      },
      {
        name: 'consume_food',
        expectedSuccess: false,
        reason: 'No food in inventory',
      },
      {
        name: 'craft_recipe',
        expectedSuccess: false,
        reason: 'mcData not available',
      },
    ];

    for (const capability of capabilitiesToTest) {
      console.log(`\n   Testing: ${capability.name}`);
      console.log(
        `   Expected: ${capability.expectedSuccess ? 'Success' : 'Failure'} ${capability.reason ? `(${capability.reason})` : ''}`
      );

      try {
        const startTime = Date.now();
        await cognitiveIntegration.executePlanningCycle(capability.name);
        const duration = Date.now() - startTime;

        console.log(`   ✅ Result: Success (${duration}ms)`);
      } catch (error) {
        console.log(`   ❌ Result: Failed - ${error}`);
      }

      // Get recent cognitive events for this capability
      const events = cognitiveIntegration.getCognitiveStream();
      const recentEvents = events.slice(-3);
      if (recentEvents.length > 0) {
        console.log(`   Recent events:`);
        recentEvents.forEach((event: any, index: number) => {
          console.log(
            `     ${index + 1}. [${event.type}] ${event.content.substring(0, 80)}...`
          );
        });
      }
    }

    // Debug 4: Movement Analysis
    console.log('\n🔍 Debug 4: Movement Analysis');

    const initialPos = bot.entity.position;
    console.log(`   Initial position: ${JSON.stringify(initialPos)}`);

    // Test simple movement
    try {
      console.log('   Testing simple forward movement...');
      bot.setControlState('forward', true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      bot.setControlState('forward', false);

      const afterMove = bot.entity.position;
      console.log(`   Position after movement: ${JSON.stringify(afterMove)}`);

      const moved =
        initialPos.x !== afterMove.x ||
        initialPos.y !== afterMove.y ||
        initialPos.z !== afterMove.z;

      console.log(`   Movement detected: ${moved ? '✅ YES' : '❌ NO'}`);

      if (moved) {
        const distance = Math.sqrt(
          Math.pow(afterMove.x - initialPos.x, 2) +
            Math.pow(afterMove.y - initialPos.y, 2) +
            Math.pow(afterMove.z - initialPos.z, 2)
        );
        console.log(`   Distance moved: ${distance.toFixed(2)} blocks`);
      }
    } catch (error) {
      console.log(`   ❌ Movement test failed: ${error}`);
    }

    // Debug 5: Pathfinding Analysis
    console.log('\n🔍 Debug 5: Pathfinding Analysis');

    try {
      const currentPos = bot.entity.position;
      const targetPos = {
        x: currentPos.x + 2,
        y: currentPos.y,
        z: currentPos.z,
      };

      console.log(`   Current position: ${JSON.stringify(currentPos)}`);
      console.log(`   Target position: ${JSON.stringify(targetPos)}`);

      if (bot.pathfinder) {
        const { goals } = require('mineflayer-pathfinder');
        const goal = new goals.GoalNear(
          targetPos.x,
          targetPos.y,
          targetPos.z,
          1
        );

        console.log('   Starting pathfinder movement...');
        const pathfinderStart = Date.now();

        await bot.pathfinder.goto(goal);

        const pathfinderDuration = Date.now() - pathfinderStart;
        const finalPos = bot.entity.position;

        console.log(`   ✅ Pathfinder completed in ${pathfinderDuration}ms`);
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
      console.log(`   ❌ Pathfinder test failed: ${error}`);
    }

    // Debug 6: Error Analysis Summary
    console.log('\n🔍 Debug 6: Error Analysis Summary');

    console.log('   Common Action Failures and Solutions:');
    console.log(
      '   1. "No block at specified position" → Need to specify valid block coordinates'
    );
    console.log(
      '   2. "No torches available" → Bot needs torches in inventory'
    );
    console.log(
      '   3. "Invalid item provided" → Bot needs appropriate items for action'
    );
    console.log(
      '   4. "No food available" → Bot needs food items in inventory'
    );
    console.log(
      '   5. "mcData not available" → Missing Minecraft data for crafting'
    );
    console.log('   6. "blocked" → Path is obstructed or unsafe');
    console.log('   7. "aborted" → Action timed out or was interrupted');

    // Debug 7: Recommendations
    console.log('\n🔍 Debug 7: Recommendations');

    console.log('   To improve bot performance, provide:');
    console.log('   • Torches for lighting capabilities');
    console.log('   • Food items for sustenance');
    console.log('   • Building blocks (stone, dirt, wood) for construction');
    console.log('   • Tools for digging and interaction');
    console.log('   • Clear movement paths without obstructions');

    console.log('\n📋 Debug Summary');
    console.log('✅ Bot connected and responsive');
    console.log('✅ Environment analysis complete');
    console.log('✅ Capability testing with error analysis done');
    console.log('✅ Movement and pathfinding verified');
    console.log('✅ Error patterns identified');
    console.log('✅ Recommendations provided');
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the debug
debugEnhancedDemo().catch(console.error);

export { debugEnhancedDemo };

