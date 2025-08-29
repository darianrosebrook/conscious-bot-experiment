#!/usr/bin/env tsx

import mineflayer from 'mineflayer';
import { createViewer } from 'prismarine-viewer';
import { join } from 'path';

interface ViewerConfig {
  serverAddress: string;
  serverPort: number;
  version: string;
  username: string;
  viewerPort: number;
}

// Entity filter to handle unknown entity types
function createEntityFilter() {
  const knownEntityTypes = new Set([
    'player',
    'zombie',
    'skeleton',
    'spider',
    'creeper',
    'enderman',
    'cow',
    'pig',
    'sheep',
    'chicken',
    'villager',
    'iron_golem',
    'snow_golem',
    'wolf',
    'cat',
    'horse',
    'donkey',
    'mule',
    'llama',
    'trader_llama',
    'rabbit',
    'fox',
    'panda',
    'bee',
    'dolphin',
    'turtle',
    'fish',
    'squid',
    'glow_squid',
    'guardian',
    'elder_guardian',
    'shulker',
    'endermite',
    'silverfish',
    'slime',
    'magma_cube',
    'ghast',
    'blaze',
    'wither_skeleton',
    'zombie_villager',
    'husk',
    'stray',
    'drowned',
    'phantom',
    'vex',
    'evoker',
    'vindicator',
    'pillager',
    'ravager',
    'hoglin',
    'zoglin',
    'piglin',
    'piglin_brute',
    'strider',
    'zombified_piglin',
    'wither',
    'ender_dragon',
    'item',
    'experience_orb',
    'arrow',
    'spectral_arrow',
    'trident',
    'snowball',
    'egg',
    'ender_pearl',
    'eye_of_ender',
    'firework_rocket',
    'tnt',
    'falling_block',
    'boat',
    'minecart',
    'chest_minecart',
    'furnace_minecart',
    'hopper_minecart',
    'tnt_minecart',
    'command_block_minecart',
    'spawner_minecart',
    'furnace_minecart',
    'hopper_minecart',
    'area_effect_cloud',
    'lightning_bolt',
    'painting',
    'item_frame',
    'armor_stand',
    'marker',
    'tnt_minecart',
    'command_block_minecart',
    'spawner_minecart',
    'furnace_minecart',
    'hopper_minecart',
    'area_effect_cloud',
    'lightning_bolt',
    'painting',
    'item_frame',
    'armor_stand',
    'marker',
    'text_display',
    'block_display',
    'interaction',
  ]);

  return function filterEntity(entity: any): boolean {
    if (!entity || !entity.type) {
      return false;
    }

    // Check if entity type is known
    if (!knownEntityTypes.has(entity.type)) {
      console.log(`Filtering out unknown entity type: ${entity.type}`);
      return false;
    }

    // Additional filtering for problematic entities
    if (entity.type === 'item' && (!entity.item || !entity.item.name)) {
      console.log('Filtering out item entity without item data');
      return false;
    }

    return true;
  };
}

async function main() {
  // Get configuration from environment variables
  const config: ViewerConfig = {
    serverAddress: process.env.MINECRAFT_SERVER || 'localhost',
    serverPort: parseInt(process.env.MINECRAFT_PORT || '25565'),
    version: process.env.MINECRAFT_VERSION || '1.20.1',
    username: process.env.MINECRAFT_USERNAME || 'conscious-bot',
    viewerPort: parseInt(process.env.VIEWER_PORT || '3005'),
  };

  console.log(' Minecraft Viewer Bot Starting...');
  console.log(
    ` Connecting to ${config.serverAddress}:${config.serverPort} (${config.version})`
  );
  console.log(` Username: ${config.username}`);
  console.log(
    ` Viewer will be available at http://localhost:${config.viewerPort}`
  );

  try {
    // Create the bot
    const bot = mineflayer({
      host: config.serverAddress,
      port: config.serverPort,
      version: config.version,
      username: config.username,
      auth: 'offline', // No authentication required
    });

    // Enhanced error handling for unknown entities
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const errorMessages: string[] = [];
    const warningMessages: string[] = [];

    // Temporarily suppress unknown entity errors and warnings
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      if (
        message.includes('Unknown entity') ||
        message.includes('Unknown entity type') ||
        message.includes('trader_llama') ||
        message.includes('glow_squid') ||
        message.includes('Unknown entity item')
      ) {
        errorMessages.push(message);
        return;
      }
      originalConsoleError(...args);
    };

    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      if (
        message.includes('Unknown entity') ||
        message.includes('Unknown entity type') ||
        message.includes('trader_llama') ||
        message.includes('glow_squid') ||
        message.includes('Unknown entity item')
      ) {
        warningMessages.push(message);
        return;
      }
      originalConsoleWarn(...args);
    };

    // Handle connection events
    bot.on('spawn', () => {
      console.log(' Bot spawned successfully');
      console.log(` Position: ${bot.entity.position}`);

      // Start the viewer
      const viewer = createViewer(bot, {
        port: config.viewerPort,
      });
      console.log(` Viewer started on port ${config.viewerPort}`);

      // Log viewer URL
      console.log(
        ` Open http://localhost:${config.viewerPort} in your browser`
      );

      // Restore console methods
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;

      if (errorMessages.length > 0 || warningMessages.length > 0) {
        console.log(
          `⚠️ Suppressed ${errorMessages.length} unknown entity errors and ${warningMessages.length} warnings during viewer startup`
        );
      }
    });

    bot.on('login', () => {
      console.log(' Logged in successfully');
    });

    bot.on('error', (error) => {
      // Filter out entity-related errors
      if (error && typeof error.message === 'string') {
        if (
          error.message.includes('Unknown entity') ||
          error.message.includes('Unknown entity type') ||
          error.message.includes('trader_llama') ||
          error.message.includes('glow_squid') ||
          error.message.includes('Unknown entity item')
        ) {
          return; // Suppress these specific entity errors
        }
      }
      console.error(' Bot error:', error);
    });

    bot.on('kicked', (reason) => {
      console.log(' Kicked from server:', reason);
    });

    bot.on('end', () => {
      console.log(' Connection ended');
    });

    // Handle chat messages
    bot.on('message', (message) => {
      console.log(` ${message.toAnsi()}`);
    });

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log(' Shutting down...');
      bot.quit();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log(' Shutting down...');
      bot.quit();
      process.exit(0);
    });
  } catch (error) {
    console.error(' Failed to start viewer:', error);
    process.exit(1);
  }
}

// Run the viewer
main().catch((error) => {
  console.error(' Viewer failed:', error);
  process.exit(1);
});
