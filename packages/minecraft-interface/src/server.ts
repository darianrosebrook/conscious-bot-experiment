/**
 * Minecraft Bot HTTP Server
 *
 * Provides HTTP API endpoints for the Minecraft bot interface.
 * Keeps the bot connected and provides real-time game state.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';
import {
  createSimpleMinecraftInterface,
  DEFAULT_SIMPLE_CONFIG,
  SimpleBotConfig,
  SimpleMinecraftInterface,
} from './standalone-simple';
import { mineflayer as startMineflayerViewer } from 'prismarine-viewer';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3005;
const viewerPort = process.env.VIEWER_PORT
  ? parseInt(process.env.VIEWER_PORT)
  : 3006;

// Middleware
app.use(cors());
app.use(express.json());

// Bot configuration
const botConfig: SimpleBotConfig = {
  ...DEFAULT_SIMPLE_CONFIG,
  host: process.env.MINECRAFT_HOST || 'localhost',
  port: process.env.MINECRAFT_PORT
    ? parseInt(process.env.MINECRAFT_PORT)
    : 25565,
  username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
  version: process.env.MINECRAFT_VERSION || '1.20.1',
  auth: 'offline',
};

// Bot instance
let minecraftInterface: SimpleMinecraftInterface | null = null;
let isConnecting = false;
let viewerActive = false;
let autoConnectInterval: NodeJS.Timeout | null = null;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: minecraftInterface?.connected ? 'connected' : 'disconnected',
    system: 'minecraft-bot',
    timestamp: Date.now(),
    version: '0.1.0',
    viewer: {
      port: viewerPort,
      active: viewerActive,
      url: `http://localhost:${viewerPort}`,
    },
    config: {
      host: botConfig.host,
      port: botConfig.port,
      username: botConfig.username,
    },
  });
});

// Connect to Minecraft server
app.post('/connect', async (req, res) => {
  try {
    if (minecraftInterface?.connected) {
      return res.json({
        success: true,
        message: 'Already connected',
        status: 'connected',
      });
    }

    if (isConnecting) {
      return res.status(409).json({
        success: false,
        message: 'Connection already in progress',
        status: 'connecting',
      });
    }

    isConnecting = true;
    console.log('🔌 Connecting to Minecraft server...');

    minecraftInterface = createSimpleMinecraftInterface(botConfig);

    // Set up event listeners
    minecraftInterface.on('connected', () => {
      console.log('✅ Bot connected to Minecraft server');
      // Start Prismarine viewer on first connect
      try {
        const bot = minecraftInterface?.botInstance;
        if (bot && !viewerActive) {
          startMineflayerViewer(bot as any, {
            port: viewerPort,
            firstPerson: true,
          });
          viewerActive = true;
          console.log(
            `🖥️ Prismarine viewer running at http://localhost:${viewerPort}`
          );
        }
      } catch (err) {
        console.error('Failed to start Prismarine viewer:', err);
        viewerActive = false;
      }
    });

    minecraftInterface.on('disconnected', (reason) => {
      console.log('🔌 Bot disconnected:', reason);
      minecraftInterface = null;
      viewerActive = false;
    });

    await minecraftInterface.connect();
    isConnecting = false;

    res.json({
      success: true,
      message: 'Connected to Minecraft server',
      status: 'connected',
    });
  } catch (error) {
    isConnecting = false;
    console.error('❌ Connection failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect to Minecraft server',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Auto-connect function
async function attemptAutoConnect() {
  if (minecraftInterface?.connected || isConnecting) {
    return;
  }

  try {
    console.log('🔄 Auto-connecting to Minecraft server...');
    isConnecting = true;

    minecraftInterface = createSimpleMinecraftInterface(botConfig);

    // Set up event listeners
    minecraftInterface.on('connected', () => {
      console.log('✅ Bot auto-connected to Minecraft server');
      // Start Prismarine viewer on first connect
      try {
        const bot = minecraftInterface?.botInstance;
        if (bot && !viewerActive) {
          startMineflayerViewer(bot as any, {
            port: viewerPort,
            firstPerson: true,
          });
          viewerActive = true;
          console.log(
            `🖥️ Prismarine viewer running at http://localhost:${viewerPort}`
          );
        }
      } catch (err) {
        console.error('Failed to start Prismarine viewer:', err);
        viewerActive = false;
      }
    });

    minecraftInterface.on('disconnected', (reason) => {
      console.log('🔌 Bot disconnected:', reason);
      minecraftInterface = null;
      viewerActive = false;
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (!minecraftInterface?.connected && !isConnecting) {
          attemptAutoConnect();
        }
      }, 5000);
    });

    await minecraftInterface.connect();
    isConnecting = false;
  } catch (error) {
    isConnecting = false;
    console.error('❌ Auto-connection failed:', error);
    // Retry after 10 seconds
    setTimeout(() => {
      if (!minecraftInterface?.connected && !isConnecting) {
        attemptAutoConnect();
      }
    }, 10000);
  }
}

// Start auto-connection when server starts
setTimeout(() => {
  attemptAutoConnect();
}, 2000); // Wait 2 seconds after server starts

// Disconnect from server
app.post('/disconnect', async (req, res) => {
  try {
    if (!minecraftInterface?.connected) {
      return res.json({
        success: true,
        message: 'Not connected',
        status: 'disconnected',
      });
    }

    await minecraftInterface.disconnect();
    minecraftInterface = null;
    viewerActive = false;

    res.json({
      success: true,
      message: 'Disconnected from Minecraft server',
      status: 'disconnected',
    });
  } catch (error) {
    console.error('❌ Disconnect failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect from Minecraft server',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Stop auto-connection
app.post('/stop-auto-connect', async (req, res) => {
  try {
    if (autoConnectInterval) {
      clearInterval(autoConnectInterval);
      autoConnectInterval = null;
    }

    res.json({
      success: true,
      message: 'Auto-connection stopped',
    });
  } catch (error) {
    console.error('❌ Failed to stop auto-connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop auto-connection',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start auto-connection
app.post('/start-auto-connect', async (req, res) => {
  try {
    if (!minecraftInterface?.connected && !isConnecting) {
      attemptAutoConnect();
    }

    res.json({
      success: true,
      message: 'Auto-connection started',
    });
  } catch (error) {
    console.error('❌ Failed to start auto-connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start auto-connection',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get chat history
app.get('/chat', (req, res) => {
  try {
    if (!minecraftInterface?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    const chatHistory = minecraftInterface.getChatHistory();
    res.json({
      success: true,
      status: 'connected',
      data: chatHistory,
    });
  } catch (error) {
    console.error('❌ Failed to get chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat history',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get bot state
app.get('/state', async (req, res) => {
  try {
    if (!minecraftInterface?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    const gameState = await minecraftInterface.getGameState();

    res.json({
      success: true,
      status: 'connected',
      data: gameState,
    });
  } catch (error) {
    console.error('❌ Failed to get bot state:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bot state',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get inventory
app.get('/inventory', async (req, res) => {
  try {
    if (!minecraftInterface?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    const gameState = await minecraftInterface.getGameState();
    const inventory = gameState.inventory || [];

    res.json({
      success: true,
      status: 'connected',
      data: inventory,
    });
  } catch (error) {
    console.error('❌ Failed to get inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get inventory',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Execute action
app.post('/action', async (req, res) => {
  try {
    if (!minecraftInterface?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    const { type, parameters } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Action type is required',
      });
    }

    const result = await minecraftInterface.executeAction({
      type,
      parameters: parameters || {},
    });

    res.json({
      success: true,
      action: type,
      result,
    });
  } catch (error) {
    console.error('❌ Action failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute action',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get telemetry data
app.get('/telemetry', (req, res) => {
  try {
    const telemetry = {
      events: [
        {
          id: `minecraft-${Date.now()}`,
          timestamp: Date.now(),
          source: 'minecraft-bot',
          type: 'bot_state',
          data: {
            connected: minecraftInterface?.connected || false,
            viewerActive,
            viewerUrl: `http://localhost:${viewerPort}`,
            config: {
              host: botConfig.host,
              port: botConfig.port,
              username: botConfig.username,
            },
            metrics: {
              uptime: minecraftInterface?.connected ? process.uptime() : 0,
              memoryUsage: process.memoryUsage(),
            },
          },
        },
      ],
    };

    res.json(telemetry);
  } catch (error) {
    console.error('Error getting minecraft telemetry:', error);
    res.status(500).json({ error: 'Failed to get telemetry' });
  }
});

// Get screenshots
app.get('/screenshots', (req, res) => {
  try {
    // Get query parameters
    const sessionId = req.query.sessionId as string;
    const limit = parseInt((req.query.limit as string) || '10');

    // Generate some placeholder screenshots
    const screenshots = [];
    const now = Date.now();

    // Use placeholder image URLs since Prismarine viewer is disabled
    const placeholderUrls = [
      'https://via.placeholder.com/640x480?text=Minecraft+View',
      'https://via.placeholder.com/640x480?text=Forest+Biome',
      'https://via.placeholder.com/640x480?text=Plains+Biome',
      'https://via.placeholder.com/640x480?text=Cave+Exploration',
      'https://via.placeholder.com/640x480?text=Village+Encounter',
    ];

    for (let i = 0; i < Math.min(limit, 5); i++) {
      screenshots.push({
        id: `screenshot-${now - i * 60000}`,
        ts: new Date(now - i * 60000).toISOString(),
        url: placeholderUrls[i % placeholderUrls.length],
        eventId: `event-${now - i * 60000}`,
      });
    }

    res.json(screenshots);
  } catch (error) {
    console.error('Error getting screenshots:', error);
    res.status(500).json({ error: 'Failed to get screenshots' });
  }
});

// Get nearest screenshot
app.get('/screenshots/nearest', (req, res) => {
  try {
    // Get query parameters
    const sessionId = req.query.sessionId as string;
    const timestamp = req.query.at as string;

    if (!sessionId || !timestamp) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Generate a placeholder screenshot with a static image URL
    const now = Date.now();
    const screenshot = {
      id: `screenshot-${now}`,
      ts: new Date(now).toISOString(),
      url:
        'https://via.placeholder.com/640x480?text=Minecraft+View+at+' +
        new Date(parseInt(timestamp)).toISOString().split('T')[0],
      eventId: `event-${now}`,
    };

    res.json(screenshot);
  } catch (error) {
    console.error('Error getting nearest screenshot:', error);
    res.status(500).json({ error: 'Failed to get nearest screenshot' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Minecraft bot server running on port ${port}`);
  console.log(
    `Bot config: ${botConfig.username}@${botConfig.host}:${botConfig.port}`
  );
  console.log(`Use POST /connect to start the bot`);
  console.log(`Prismarine viewer port reserved at ${viewerPort}`);
});
