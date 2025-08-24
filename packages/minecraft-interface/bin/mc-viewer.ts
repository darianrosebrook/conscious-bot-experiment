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

async function main() {
  // Get configuration from environment variables
  const config: ViewerConfig = {
    serverAddress: process.env.MINECRAFT_SERVER || 'localhost',
    serverPort: parseInt(process.env.MINECRAFT_PORT || '25565'),
    version: process.env.MINECRAFT_VERSION || '1.21.4',
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

    // Handle connection events
    bot.on('spawn', () => {
      console.log(' Bot spawned successfully');
      console.log(` Position: ${bot.entity.position}`);

      // Start the viewer
      const viewer = createViewer(bot, { port: config.viewerPort });
      console.log(` Viewer started on port ${config.viewerPort}`);

      // Log viewer URL
      console.log(
        ` Open http://localhost:${config.viewerPort} in your browser`
      );
    });

    bot.on('login', () => {
      console.log(' Logged in successfully');
    });

    bot.on('error', (error) => {
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
