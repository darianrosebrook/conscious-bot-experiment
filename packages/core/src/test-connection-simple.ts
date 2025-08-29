/**
 * Simple Connection Test
 *
 * Basic test to check if we can connect to the Minecraft server
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';

async function testConnectionSimple() {
  console.log('🔗 Simple Connection Test\n');

  const config = {
    host: process.env.MINECRAFT_HOST || 'localhost',
    port: process.env.MINECRAFT_PORT
      ? parseInt(process.env.MINECRAFT_PORT)
      : 25565,
    username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
    version: process.env.MINECRAFT_VERSION || '1.20.1',
    auth: 'offline' as const,
  };

  console.log('Configuration:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Username: ${config.username}`);
  console.log(`   Version: ${config.version}`);
  console.log(`   Auth: ${config.auth}\n`);

  try {
    console.log('🔗 Attempting to connect...');

    const bot = createBot(config);

    // Set up event listeners
    bot.on('error', (error) => {
      console.log(`❌ Bot error: ${error}`);
    });

    bot.on('kicked', (reason) => {
      console.log(`❌ Bot kicked: ${reason}`);
    });

    bot.on('end', () => {
      console.log('❌ Bot disconnected');
    });

    bot.on('login', () => {
      console.log('✅ Bot logged in successfully');
    });

    bot.on('spawn', () => {
      console.log('✅ Bot spawned successfully');
      console.log(`   Position: ${JSON.stringify(bot.entity?.position)}`);
      console.log(`   Health: ${bot.health}`);
      console.log(`   Food: ${bot.food}`);
    });

    // Wait for spawn with longer timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('⏰ Spawn timeout - checking bot state...');
        if (bot.entity) {
          console.log("✅ Bot has entity but spawn event didn't fire");
          resolve();
        } else {
          reject(new Error('Bot spawn timeout - no entity'));
        }
      }, 45000); // 45 second timeout

      bot.once('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });

      bot.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('\n🎉 Connection successful!');
    console.log('   Bot is connected and spawned');
    console.log('   Ready for testing...');

    // Keep bot active for a bit
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    console.error('❌ Connection failed:', error);

    // Provide troubleshooting tips
    console.log('\n🔧 Troubleshooting tips:');
    console.log('   1. Make sure Minecraft server is running');
    console.log('   2. Check if server is on port 25565');
    console.log('   3. Verify server allows offline mode');
    console.log('   4. Check if server is whitelisted');
    console.log('   5. Try connecting with Minecraft client first');
  } finally {
    console.log('\n🔌 Shutting down...');
    process.exit(0);
  }
}

// Run the test
testConnectionSimple().catch(console.error);

export { testConnectionSimple };
