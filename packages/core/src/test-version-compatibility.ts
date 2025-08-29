/**
 * Version Compatibility Test
 *
 * Test to check Mineflayer version compatibility and identify issues
 * with current Minecraft versions
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';

async function testVersionCompatibility() {
  console.log('🔍 Version Compatibility Test\n');

  try {
    // Check Node.js version
    console.log('📊 Environment Check');
    console.log(`   Node.js version: ${process.version}`);
    console.log(`   Mineflayer version: 4.32.0`);
    console.log(
      `   Target Minecraft version: ${process.env.MINECRAFT_VERSION || '1.20.1'}`
    );

    // Check if Node.js version meets requirements
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    console.log(`   Node.js major version: ${majorVersion}`);
    console.log(
      `   Meets Mineflayer requirement (>=22): ${majorVersion >= 22 ? '✅' : '❌'}`
    );

    if (majorVersion < 22) {
      console.log(
        '\n⚠️ WARNING: Node.js version is below Mineflayer requirement!'
      );
      console.log('   Mineflayer 4.32.0 requires Node.js >= 22');
      console.log('   This may cause compatibility issues.');
    }

    // Test bot connection with different versions
    console.log('\n🎯 Testing Bot Connection');

    const versionsToTest = [
      '1.20.4', // LTS version
      '1.21.1', // Earlier 1.21
      '1.20.1', // Current target
      '1.20.1', // Older stable
    ];

    for (const version of versionsToTest) {
      console.log(`\n   Testing Minecraft ${version}...`);

      try {
        const bot = createBot({
          host: process.env.MINECRAFT_HOST || 'localhost',
          port: process.env.MINECRAFT_PORT
            ? parseInt(process.env.MINECRAFT_PORT)
            : 25565,
          username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
          version: version,
          auth: 'offline',
        });

        // Wait for spawn with timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Spawn timeout for ${version}`));
          }, 10000);

          bot.once('spawn', () => {
            clearTimeout(timeout);
            console.log(`     ✅ ${version}: Connected successfully`);

            // Test basic functionality
            const position = bot.entity?.position;
            const health = bot.health;
            const inventory = bot.inventory?.items();

            console.log(`       Position: ${position ? '✅' : '❌'}`);
            console.log(`       Health: ${health ? '✅' : '❌'}`);
            console.log(`       Inventory: ${inventory ? '✅' : '❌'}`);

            // Test world reading
            if (position) {
              const blockAtFeet = bot.blockAt(position);
              console.log(`       World reading: ${blockAtFeet ? '✅' : '❌'}`);
            }

            bot.quit();
            resolve();
          });

          bot.once('error', (error) => {
            clearTimeout(timeout);
            console.log(
              `     ❌ ${version}: Connection failed - ${error.message}`
            );
            resolve();
          });
        });
      } catch (error) {
        console.log(`     ❌ ${version}: Test failed - ${error}`);
      }
    }

    // Test with current version and debug world reading
    console.log('\n🔍 Debugging World Reading Issue');

    try {
      const bot = createBot({
        host: process.env.MINECRAFT_HOST || 'localhost',
        port: process.env.MINECRAFT_PORT
          ? parseInt(process.env.MINECRAFT_PORT)
          : 25565,
        username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
        version: process.env.MINECRAFT_VERSION || '1.20.1',
        auth: 'offline',
      });

      await new Promise<void>((resolve) => {
        bot.once('spawn', () => {
          console.log('   ✅ Bot spawned, testing world reading...');

          // Wait for world to load
          setTimeout(() => {
            try {
              const position = bot.entity.position;
              console.log(`   Bot position: ${JSON.stringify(position)}`);

              // Test different block reading methods
              const blockAtFeet = bot.blockAt(position);
              console.log(
                `   blockAt(position): ${blockAtFeet ? blockAtFeet.name : 'null'}`
              );

              const blockAtCoords = bot.blockAt(position.floored());
              console.log(
                `   blockAt(floored): ${blockAtCoords ? blockAtCoords.name : 'null'}`
              );

              // Test world object
              console.log(`   World loaded: ${!!bot.world}`);
              console.log(
                `   World chunks: ${bot.world ? 'Available' : 'N/A'}`
              );

              // Test entity reading
              console.log(`   Entity exists: ${!!bot.entity}`);
              console.log(`   Entity type: ${bot.entity?.type || 'unknown'}`);

              bot.quit();
              resolve();
            } catch (error) {
              console.log(`   ❌ World reading error: ${error}`);
              bot.quit();
              resolve();
            }
          }, 3000);
        });

        bot.once('error', (error) => {
          console.log(`   ❌ Bot error: ${error.message}`);
          resolve();
        });
      });
    } catch (error) {
      console.log(`   ❌ Debug test failed: ${error}`);
    }

    // Summary
    console.log('\n📋 Compatibility Summary');
    console.log(
      '   Node.js version issue: ' + (majorVersion < 22 ? '❌ YES' : '✅ NO')
    );
    console.log('   Mineflayer version: 4.32.0 (latest)');
    console.log(
      '   World reading issue: Likely Node.js version or server permissions'
    );

    if (majorVersion < 22) {
      console.log('\n🔧 Recommended Fixes:');
      console.log('   1. Upgrade Node.js to version 22 or higher');
      console.log('   2. Check server permissions for the bot');
      console.log('   3. Ensure bot spawns in a proper location');
      console.log('   4. Try different Minecraft versions');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the test
testVersionCompatibility().catch(console.error);

export { testVersionCompatibility };
