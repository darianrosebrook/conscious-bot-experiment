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
  createMinecraftInterface,
  createMinecraftInterfaceWithoutConnect,
  BotConfig,
  PlanExecutor,
  BotAdapter,
  ObservationMapper,
  MemoryIntegrationService,
} from './index';
import {
  HybridArbiterIntegration,
  HybridArbiterConfig,
} from './hybrid-arbiter-integration';
import { createIntegratedPlanningCoordinator } from '@conscious-bot/planning';
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
const botConfig: BotConfig = {
  host: process.env.MINECRAFT_HOST || 'localhost',
  port: process.env.MINECRAFT_PORT
    ? parseInt(process.env.MINECRAFT_PORT)
    : 25565,
  username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
  version: process.env.MINECRAFT_VERSION || '1.21.4',
  auth: 'offline',

  // World configuration for memory versioning
  worldSeed: process.env.WORLD_SEED,
  worldName: process.env.WORLD_NAME,

  pathfindingTimeout: 30000,
  actionTimeout: 10000,
  observationRadius: 32,
  autoReconnect: true, // Re-enabled for automatic connection
  maxReconnectAttempts: 3,
  emergencyDisconnect: false,
};

// Bot instance
let minecraftInterface: {
  botAdapter: BotAdapter;
  observationMapper: ObservationMapper;
  planExecutor: PlanExecutor;
} | null = null;
let planningCoordinator: any = null;
let memoryIntegration: MemoryIntegrationService | null = null;
let isConnecting = false;
let viewerActive = false;
let autoConnectInterval: NodeJS.Timeout | null = null;

// Health check endpoint
app.get('/health', (req, res) => {
  const botStatus = minecraftInterface?.botAdapter.getStatus();
  const executionStatus = minecraftInterface?.planExecutor.getExecutionStatus();

  // Check if bot is connected and spawned
  const isConnected =
    (executionStatus && executionStatus.bot && executionStatus.bot.connected) ||
    (botStatus?.connected && botStatus?.connectionState === 'spawned');

  // Check if bot is alive (health > 0)
  const isAlive = botStatus?.health && botStatus.health > 0;

  // Check if viewer can be started
  const viewerCheck = minecraftInterface?.botAdapter.canStartViewer();
  const canStartViewer = viewerCheck?.canStart || false;

  // Determine overall status
  let status = 'disconnected';
  if (isConnected && isAlive) {
    status = 'connected';
  } else if (isConnected && !isAlive) {
    status = 'dead';
  }

  res.json({
    status,
    system: 'minecraft-bot',
    timestamp: Date.now(),
    version: '0.1.0',
    viewer: {
      port: viewerPort,
      active: viewerActive,
      canStart: canStartViewer,
      reason: viewerCheck?.reason,
      url: `http://localhost:${viewerPort}`,
    },
    config: {
      host: botConfig.host,
      port: botConfig.port,
      username: botConfig.username,
    },
    botStatus: botStatus,
    executionStatus: executionStatus,
    connectionState: minecraftInterface?.botAdapter.getConnectionState(),
    isAlive,
  });
});

// Connect to Minecraft server
app.post('/connect', async (req, res) => {
  if (isConnecting) {
    return res.status(400).json({
      success: false,
      message: 'Connection already in progress',
    });
  }

  isConnecting = true;

  try {
    console.log('🔄 Connecting to Minecraft server...');

    // Initialize memory integration service
    memoryIntegration = new MemoryIntegrationService(botConfig, {
      autoActivateNamespaces: true,
    });

    // Activate memory namespace for this world
    const memoryActivated = await memoryIntegration.activateWorldMemory();
    if (memoryActivated) {
      console.log('✅ Memory namespace activated for world');
    } else {
      console.warn(
        '⚠️ Failed to activate memory namespace, continuing without memory integration'
      );
    }

    // Initialize planning coordinator
    planningCoordinator = createIntegratedPlanningCoordinator();

    // Create minecraft interface
    minecraftInterface = await createMinecraftInterface(botConfig, planningCoordinator);

    console.log('✅ Connected to Minecraft server');
    console.log('✅ Memory integration initialized');
    console.log('✅ Planning coordinator initialized');

    res.json({
      success: true,
      message: 'Connected to Minecraft server',
      memoryIntegration: memoryActivated,
    });
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect to Minecraft server',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    isConnecting = false;
  }
});

// Auto-connect function
async function attemptAutoConnect() {
  if (minecraftInterface?.botAdapter.getStatus()?.connected || isConnecting) {
    return;
  }

  try {
    // Only log auto-connect attempts in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(' Auto-connecting to Minecraft server...');
    }
    isConnecting = true;

    // Create planning coordinator
    planningCoordinator = createIntegratedPlanningCoordinator({
      coordinatorConfig: {
        routingStrategy: 'adaptive',
        fallbackTimeout: 30000,
        enablePlanMerging: true,
        enableCrossValidation: false,
      },
    });

    // Create full minecraft interface
    minecraftInterface = await createMinecraftInterfaceWithoutConnect(
      botConfig,
      planningCoordinator
    );

    // Manually initialize the plan executor to connect to Minecraft
    await minecraftInterface.planExecutor.initialize();

    // Set up event listeners
    minecraftInterface.planExecutor.on('initialized', (event) => {
      // Only log successful auto-connect in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(' Bot auto-connected to Minecraft server');
      }
      // Start Prismarine viewer on first connect
      try {
        const bot = minecraftInterface?.botAdapter.getBot();
        if (bot && !viewerActive) {
          startViewerSafely(bot, viewerPort);
        }
      } catch (err) {
        console.error('Failed to start Prismarine viewer:', err);
        viewerActive = false;
      }
    });

    minecraftInterface.planExecutor.on('shutdown', () => {
      // Only log disconnections in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(' Bot disconnected');
      }
      minecraftInterface = null;
      viewerActive = false;
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (
          !minecraftInterface?.botAdapter.getStatus()?.connected &&
          !isConnecting
        ) {
          attemptAutoConnect();
        }
      }, 10000); // Increased from 5 to 10 seconds to reduce reconnection spam
    });

    isConnecting = false;
  } catch (error) {
    isConnecting = false;
    console.error(' Auto-connection failed:', error);

    // Don't retry on protocol version errors - this is a compatibility issue
    if (error instanceof Error && error.message.includes('protocol version')) {
      console.log(
        ' Protocol version incompatibility detected. Skipping auto-reconnect.'
      );
      console.log(
        ' To resolve: Use Minecraft server version 1.21.1 or earlier, or wait for minecraft-protocol library update.'
      );
      return;
    }

    // Retry after 60 seconds for other errors
    setTimeout(() => {
      if (
        !minecraftInterface?.botAdapter.getStatus()?.connected &&
        !isConnecting
      ) {
        attemptAutoConnect();
      }
    }, 60000); // Increased from 30 to 60 seconds to reduce reconnection spam
  }
}

// Start auto-connection when server starts
setTimeout(() => {
  attemptAutoConnect();
}, 5000); // Wait 5 seconds after server starts to reduce initial spam

// Disconnect from server
app.post('/disconnect', async (req, res) => {
  try {
    if (!minecraftInterface?.botAdapter.getStatus()?.connected) {
      return res.json({
        success: true,
        message: 'Not connected',
        status: 'disconnected',
      });
    }

    await minecraftInterface.planExecutor.shutdown();
    minecraftInterface = null;
    viewerActive = false;

    res.json({
      success: true,
      message: 'Disconnected from Minecraft server',
      status: 'disconnected',
    });
  } catch (error) {
    console.error(' Disconnect failed:', error);
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
    console.error(' Failed to stop auto-connection:', error);
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
    if (
      !minecraftInterface?.botAdapter.getStatus()?.connected &&
      !isConnecting
    ) {
      attemptAutoConnect();
    }

    res.json({
      success: true,
      message: 'Auto-connection started',
    });
  } catch (error) {
    console.error(' Failed to start auto-connection:', error);
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
    if (!minecraftInterface?.botAdapter.getStatus()?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    // Return empty chat history for now - can be implemented later
    const chatHistory: any[] = [];
    res.json({
      success: true,
      status: 'connected',
      data: chatHistory,
    });
  } catch (error) {
    console.error(' Failed to get chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat history',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get player interactions
app.get('/player-interactions', (req, res) => {
  try {
    if (!minecraftInterface?.botAdapter.getStatus()?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    // Return empty player interactions for now - can be implemented later
    const playerInteractions: any[] = [];
    res.json({
      success: true,
      status: 'connected',
      data: playerInteractions,
    });
  } catch (error) {
    console.error(' Failed to get player interactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get player interactions',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get recent processed messages
app.get('/processed-messages', (req, res) => {
  try {
    if (!minecraftInterface?.botAdapter.getStatus()?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    const count = parseInt(req.query.count as string) || 10;
    // Return empty processed messages for now - can be implemented later
    const processedMessages: any[] = [];
    res.json({
      success: true,
      status: 'connected',
      data: processedMessages,
    });
  } catch (error) {
    console.error(' Failed to get processed messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get processed messages',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get bot state
app.get('/state', async (req, res) => {
  try {
    const botStatus = minecraftInterface?.botAdapter.getStatus();
    const executionStatus =
      minecraftInterface?.planExecutor.getExecutionStatus();

    // Check if bot is connected and spawned
    const isConnected =
      (executionStatus &&
        executionStatus.bot &&
        executionStatus.bot.connected) ||
      (botStatus?.connected && botStatus?.connectionState === 'spawned');

    // Check if bot is alive
    const isAlive = botStatus?.health && botStatus.health > 0;

    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    // If minecraftInterface is null or botAdapter fails, create a minimal response
    if (!minecraftInterface || !botStatus?.connected) {
      // Return basic bot state from execution status
      const basicState = {
        worldState: {
          player: {
            position: executionStatus?.bot?.position || { x: 0, y: 64, z: 0 },
            health: executionStatus?.bot?.health || 20,
            food: executionStatus?.bot?.food || 20,
            experience: 0,
            gameMode: executionStatus?.bot?.gameMode || 'survival',
            dimension: executionStatus?.bot?.dimension || 'overworld',
          },
          inventory: {
            items: [],
            totalSlots: 36,
            usedSlots: 0,
          },
          environment: {
            timeOfDay: 0,
            isRaining: false,
            nearbyBlocks: [],
            nearbyEntities: [],
          },
          server: {
            playerCount: 1,
            difficulty: executionStatus?.bot?.server?.difficulty || 'normal',
            version: executionStatus?.bot?.server?.version || '1.21.4',
          },
        },
        planningContext: {
          currentGoals: [],
          activeTasks: [],
          recentEvents: [],
          emotionalState: {
            confidence: 0.5,
            anxiety: 0.1,
            excitement: 0.3,
            caution: 0.2,
          },
        },
      };

      return res.json({
        success: true,
        status: isAlive ? 'connected' : 'dead',
        data: basicState,
        isAlive,
      });
    }

    const bot = minecraftInterface.botAdapter.getBot();

    const gameState =
      minecraftInterface.observationMapper.mapBotStateToPlanningContext(bot);

    res.json({
      success: true,
      status: isAlive ? 'connected' : 'dead',
      data: gameState,
      isAlive,
    });
  } catch (error) {
    console.error(' Failed to get bot state:', error);
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
    const botStatus = minecraftInterface?.botAdapter.getStatus();
    const executionStatus =
      minecraftInterface?.planExecutor.getExecutionStatus();

    // Use execution status if available, otherwise fall back to bot adapter status
    const isConnected =
      (executionStatus &&
        executionStatus.bot &&
        executionStatus.bot.connected) ||
      (botStatus?.connected && botStatus?.connectionState === 'spawned');

    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    // If minecraftInterface is null or botAdapter fails, return empty inventory
    if (!minecraftInterface || !botStatus?.connected) {
      return res.json({
        success: true,
        status: 'connected',
        data: [],
      });
    }

    const bot = minecraftInterface.botAdapter.getBot();
    const gameState =
      minecraftInterface.observationMapper.mapBotStateToPlanningContext(bot);
    const inventory = gameState.worldState.inventory?.items || [];

    res.json({
      success: true,
      status: 'connected',
      data: inventory,
    });
  } catch (error) {
    console.error(' Failed to get inventory:', error);
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
    const botStatus = minecraftInterface?.botAdapter.getStatus();
    const isConnected =
      botStatus?.connected && botStatus?.connectionState === 'spawned';

    if (!isConnected) {
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

    // Create a plan step for the action
    const planStep = {
      id: `action-${Date.now()}`,
      planId: `manual-action-${Date.now()}`,
      action: {
        id: `action-${type}-${Date.now()}`,
        name: type,
        description: `Manual action: ${type}`,
        type: type as any,
        parameters: parameters || {},
        preconditions: [],
        effects: [],
        cost: 1,
        duration: 5000,
        successProbability: 0.9,
      },
      preconditions: [],
      effects: [],
      status: 'pending' as any,
      order: 0,
      estimatedDuration: 5000,
      dependencies: [],
    };

    // Execute the action through the action translator
    if (!minecraftInterface) {
      throw new Error('Minecraft interface not initialized');
    }

    const planExecutor = minecraftInterface.planExecutor;
    const actionTranslator = (planExecutor as any).actionTranslator;
    const result = await actionTranslator.executePlanStep(planStep);

    res.json({
      success: true,
      action: type,
      result,
    });
  } catch (error) {
    console.error(' Action failed:', error);
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
            connected:
              minecraftInterface?.botAdapter.getStatus()?.connected || false,
            viewerActive,
            viewerUrl: `http://localhost:${viewerPort}`,
            config: {
              host: botConfig.host,
              port: botConfig.port,
              username: botConfig.username,
            },
            metrics: {
              uptime: minecraftInterface?.botAdapter.getStatus()?.connected
                ? process.uptime()
                : 0,
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

// Execute planning scenario
app.post('/execute-scenario', async (req, res) => {
  try {
    const botStatus = minecraftInterface?.botAdapter.getStatus();
    const isConnected =
      botStatus?.connected && botStatus?.connectionState === 'spawned';

    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    const { scenario, signals } = req.body;

    if (!scenario) {
      return res.status(400).json({
        success: false,
        message: 'Scenario is required',
      });
    }

    // Execute planning cycle with the scenario signals
    if (!minecraftInterface) {
      throw new Error('Minecraft interface not initialized');
    }

    const result = await minecraftInterface.planExecutor.executePlanningCycle(
      signals || []
    );

    res.json({
      success: true,
      scenario,
      result,
    });
  } catch (error) {
    console.error(' Scenario execution failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute scenario',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test with simulation (no Minecraft server required)
app.post('/test-simulation', async (req, res) => {
  try {
    const { createSimulatedMinecraftInterface } = await import(
      './simulation-stub'
    );

    // Create a simulated interface for testing
    const simulation = createSimulatedMinecraftInterface({
      worldSize: { width: 50, height: 64, depth: 50 },
      initialPosition: { x: 25, y: 64, z: 25 },
      tickRate: 100,
    });

    // Connect to simulation
    await simulation.connect();

    // Test basic actions
    const testResults = [];

    // Test movement
    const moveResult = await simulation.executeAction({
      type: 'move_forward',
      parameters: { distance: 3 },
    });
    testResults.push({ action: 'move_forward', result: moveResult });

    // Test mining
    const mineResult = await simulation.executeAction({
      type: 'mine_block',
      parameters: { position: { x: 25, y: 63, z: 25 } },
    });
    testResults.push({ action: 'mine_block', result: mineResult });

    // Test chat
    const chatResult = await simulation.executeAction({
      type: 'chat',
      parameters: { message: 'Hello from simulation!' },
    });
    testResults.push({ action: 'chat', result: chatResult });

    // Get final state
    const finalState = await simulation.getGameState();

    res.json({
      success: true,
      message: 'Simulation test completed',
      testResults,
      finalState,
    });
  } catch (error) {
    console.error(' Simulation test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run simulation test',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Check viewer readiness
app.get('/viewer-status', (req, res) => {
  try {
    if (!minecraftInterface) {
      return res.json({
        canStart: false,
        reason: 'Minecraft interface not initialized',
        viewerActive: false,
      });
    }

    const botStatus = minecraftInterface.botAdapter.getStatus();
    const executionStatus =
      minecraftInterface.planExecutor.getExecutionStatus();
    const viewerCheck = minecraftInterface.botAdapter.canStartViewer();

    res.json({
      canStart: viewerCheck.canStart,
      reason: viewerCheck.reason,
      viewerActive: viewerActive,
      botStatus: botStatus,
      executionStatus: executionStatus,
      connectionState: minecraftInterface.botAdapter.getConnectionState(),
    });
  } catch (error) {
    console.error('Error checking viewer status:', error);
    res.status(500).json({
      canStart: false,
      reason: 'Error checking viewer status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start Prismarine viewer endpoint
app.post('/start-viewer', async (req, res) => {
  try {
    if (viewerActive) {
      return res.json({
        success: true,
        message: 'Viewer already active',
        url: `http://localhost:${viewerPort}`,
      });
    }

    // Check if minecraftInterface exists
    if (!minecraftInterface) {
      return res.status(400).json({
        success: false,
        message: 'Minecraft interface not initialized',
      });
    }

    const botStatus = minecraftInterface.botAdapter.getStatus();
    const executionStatus =
      minecraftInterface.planExecutor.getExecutionStatus();

    // Use execution status if available, otherwise fall back to bot adapter status
    const isConnected =
      (executionStatus &&
        executionStatus.bot &&
        executionStatus.bot.connected) ||
      (botStatus?.connected && botStatus?.connectionState === 'spawned');

    if (!isConnected) {
      return res.status(400).json({
        success: false,
        message: 'Bot not connected',
        details: {
          botStatus: botStatus,
          executionStatus: executionStatus,
        },
      });
    }

    // Check if bot adapter can start viewer
    const viewerCheck = minecraftInterface.botAdapter.canStartViewer();
    if (!viewerCheck.canStart) {
      return res.status(400).json({
        success: false,
        message: 'Bot adapter not ready for viewer',
        details: {
          reason: viewerCheck.reason,
          connectionState: minecraftInterface.botAdapter.getConnectionState(),
          botStatus: botStatus,
        },
      });
    }

    // Try to get the bot instance
    let bot = null;
    try {
      bot = minecraftInterface.botAdapter.getBot();
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Bot adapter disconnected, cannot start viewer',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          connectionState: minecraftInterface.botAdapter.getConnectionState(),
          botStatus: botStatus,
        },
      });
    }

    if (!bot) {
      return res.status(400).json({
        success: false,
        message: 'Bot instance not available',
      });
    }

    startViewerSafely(bot, viewerPort);

    res.json({
      success: true,
      message: 'Viewer started successfully',
      url: `http://localhost:${viewerPort}`,
    });
  } catch (error) {
    console.error('Failed to start viewer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start viewer',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Robust viewer startup function with error handling
function startViewerSafely(bot: any, port: number) {
  if (viewerActive) {
    console.log('Viewer already active, skipping startup');
    return;
  }

  try {
    // Add error handling to prevent crashes from unknown entities
    const originalConsoleError = console.error;
    const errorMessages: string[] = [];

    // Temporarily suppress unknown entity errors
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      if (
        message.includes('Unknown entity') ||
        message.includes('Unknown entity type')
      ) {
        errorMessages.push(message);
        // Don't log these errors to avoid spam
        return;
      }
      originalConsoleError(...args);
    };

    startMineflayerViewer(bot as any, {
      port: port,
      firstPerson: true,
    });

    // Restore console.error
    console.error = originalConsoleError;

    viewerActive = true;
    console.log(`🖥️ Prismarine viewer started at http://localhost:${port}`);

    if (errorMessages.length > 0) {
      console.log(
        `⚠️ Suppressed ${errorMessages.length} unknown entity errors during viewer startup`
      );
    }
  } catch (err) {
    console.error('Failed to start Prismarine viewer:', err);
    viewerActive = false;
  }
}

// Start server
app.listen(port, () => {
  console.log(`Minecraft bot server running on port ${port}`);
  console.log(
    `Bot config: ${botConfig.username}@${botConfig.host}:${botConfig.port}`
  );
  console.log(`Use POST /connect to start the bot`);
  console.log(`Prismarine viewer port reserved at ${viewerPort}`);

  // Attempt to start viewer if bot is already connected
  setTimeout(() => {
    try {
      const botStatus = minecraftInterface?.botAdapter.getStatus();
      const executionStatus =
        minecraftInterface?.planExecutor.getExecutionStatus();

      // Use execution status if available, otherwise fall back to bot adapter status
      const isConnected =
        (executionStatus &&
          executionStatus.bot &&
          executionStatus.bot.connected) ||
        (botStatus?.connected && botStatus?.connectionState === 'spawned');

      if (isConnected && !viewerActive && minecraftInterface) {
        const viewerCheck = minecraftInterface.botAdapter.canStartViewer();
        if (viewerCheck.canStart) {
          try {
            const bot = minecraftInterface.botAdapter.getBot();
            if (bot) {
              startViewerSafely(bot, viewerPort);
            }
          } catch (err) {
            console.error('Failed to auto-start Prismarine viewer:', err);
          }
        } else {
          console.log('Auto-start viewer skipped:', viewerCheck.reason);
        }
      }
    } catch (err) {
      console.error('Failed to check bot status for auto-start viewer:', err);
    }
  }, 5000); // Wait 5 seconds for bot to connect
});

// Get memory integration status
app.get('/memory/status', async (req, res) => {
  try {
    if (!memoryIntegration) {
      return res.json({
        success: false,
        message: 'Memory integration not initialized',
        data: null,
      });
    }

    const namespace = await memoryIntegration.getActiveNamespace();
    const stats = await memoryIntegration.getMemoryStats();
    const context = memoryIntegration.getWorldContext();

    res.json({
      success: true,
      data: {
        connected: memoryIntegration.isMemoryConnected(),
        namespace,
        stats,
        context,
        sessionId: memoryIntegration.getSessionId(),
      },
    });
  } catch (error) {
    console.error('Failed to get memory status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get memory status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get memory namespace information
app.get('/memory/namespace', async (req, res) => {
  try {
    if (!memoryIntegration) {
      return res.json({
        success: false,
        message: 'Memory integration not initialized',
        data: null,
      });
    }

    const namespace = await memoryIntegration.getActiveNamespace();
    const context = memoryIntegration.getWorldContext();

    res.json({
      success: true,
      data: {
        namespace,
        context,
        sessionId: memoryIntegration.getSessionId(),
      },
    });
  } catch (error) {
    console.error('Failed to get memory namespace:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get memory namespace',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Store a memory
app.post('/memory/store', async (req, res) => {
  try {
    if (!memoryIntegration) {
      return res.status(400).json({
        success: false,
        message: 'Memory integration not initialized',
      });
    }

    const memory = req.body;
    const success = await memoryIntegration.storeMemory(memory);

    res.json({
      success,
      message: success
        ? 'Memory stored successfully'
        : 'Failed to store memory',
    });
  } catch (error) {
    console.error('Failed to store memory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to store memory',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Retrieve memories
app.post('/memory/retrieve', async (req, res) => {
  try {
    if (!memoryIntegration) {
      return res.status(400).json({
        success: false,
        message: 'Memory integration not initialized',
      });
    }

    const query = req.body;
    const memories = await memoryIntegration.retrieveMemories(query);

    res.json({
      success: true,
      data: memories,
    });
  } catch (error) {
    console.error('Failed to retrieve memories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve memories',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
