#!/usr/bin/env ts-node

/**
 * Simple Connection Test
 *
 * Basic test to verify bot can connect to Minecraft server.
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';

async function main() {
  console.log('🚀 Starting Simple Connection Test');
  console.log('==================================');

  // Bot configuration
  const config = {
    host: 'localhost',
    port: 25565,
    username: 'ConnectionTester',
    version: false, // Auto-detect version
    auth: 'offline',
  };

  console.log('📋 Configuration:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Username: ${config.username}`);
  console.log(`   Version: Auto-detect`);
  console.log(`   Auth: ${config.auth}`);

  try {
    console.log('\n🔌 Attempting to connect...');

    // Create bot
    const bot = createBot(config);

    bot.on('login', () => {
      console.log('✅ Successfully logged in to server');
      console.log(`   Username: ${bot.username}`);
      console.log(`   Server version: ${bot.version}`);
    });

    bot.on('spawn', () => {
      console.log('✅ Bot spawned successfully');
      console.log(`   Game mode: ${bot.game.gameMode}`);
      console.log(`   Dimension: ${bot.game.dimension}`);

      if (bot.entity && bot.entity.position) {
        console.log(
          `   Position: ${bot.entity.position.x}, ${bot.entity.position.y}, ${bot.entity.position.z}`
        );
      }

      // Disconnect after successful spawn
      setTimeout(() => {
        console.log('\n👋 Disconnecting...');
        bot.quit();
        process.exit(0);
      }, 2000);
    });

    bot.on('error', (error) => {
      console.error('❌ Bot error:', error);
      process.exit(1);
    });

    bot.on('kicked', (reason) => {
      console.log('👢 Bot kicked:', reason);
      process.exit(1);
    });

    bot.on('end', (reason) => {
      console.log('🔌 Bot disconnected:', reason);
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to create bot:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
