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
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
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
// Import real planning coordinator
import { createIntegratedPlanningCoordinator } from '@conscious-bot/planning';
import type { Bot } from 'mineflayer';
import { mineflayer as startMineflayerViewer } from 'prismarine-viewer';

// Import viewer enhancements
import { applyViewerEnhancements } from './viewer-enhancements';

// Import leaf implementations for registration
import {
  MoveToLeaf,
  StepForwardSafelyLeaf,
  FollowEntityLeaf,
} from './leaves/movement-leaves';
import {
  DigBlockLeaf,
  PlaceBlockLeaf,
  PlaceTorchIfNeededLeaf,
  RetreatAndBlockLeaf,
  ConsumeFoodLeaf,
} from './leaves/interaction-leaves';
import {
  SenseHostilesLeaf,
  ChatLeaf,
  WaitLeaf,
  GetLightLevelLeaf,
} from './leaves/sensing-leaves';
import { CraftRecipeLeaf, SmeltLeaf } from './leaves/crafting-leaves';
import {
  OpenContainerLeaf,
  TransferItemsLeaf,
  CloseContainerLeaf,
  InventoryManagementLeaf,
} from './leaves/container-leaves';
import {
  AttackEntityLeaf,
  EquipWeaponLeaf,
  RetreatFromThreatLeaf,
  UseItemLeaf,
} from './leaves/combat-leaves';
import {
  TillSoilLeaf,
  PlantCropLeaf,
  HarvestCropLeaf,
  ManageFarmLeaf,
} from './leaves/farming-leaves';
import {
  InteractWithBlockLeaf,
  OperatePistonLeaf,
  ControlRedstoneLeaf,
  BuildStructureLeaf,
  EnvironmentalControlLeaf,
} from './leaves/world-interaction-leaves';
import {
  PrepareSiteLeaf,
  BuildModuleLeaf,
  PlaceFeatureLeaf,
} from './leaves/construction-leaves';

// =============================================================================
// WebSocket Connection State Tracker
// =============================================================================

/**
 * Tracks WebSocket connection state to reduce verbose logging
 * @author @darianrosebrook
 */
class WebSocketStateTracker {
  private connectionStates: Map<string, boolean> = new Map();
  private lastLogTimes: Map<string, number> = new Map();
  private readonly LOG_INTERVAL = 60000; // 1 minute between state change logs

  /**
   * Log connection state change only if it's actually changed
   */
  logConnectionState(clientId: string, isConnected: boolean): void {
    const previousState = this.connectionStates.get(clientId);
    const now = Date.now();
    const lastLogTime = this.lastLogTimes.get(clientId) || 0;

    // Only log if state actually changed or enough time has passed
    if (
      previousState !== isConnected ||
      now - lastLogTime > this.LOG_INTERVAL
    ) {
      if (isConnected) {
        console.log(`WebSocket client connected (${clientId})`);
      } else {
        console.log(`WebSocket client disconnected (${clientId})`);
      }

      this.connectionStates.set(clientId, isConnected);
      this.lastLogTimes.set(clientId, now);
    }
  }

  /**
   * Get current connection count
   */
  getConnectionCount(): number {
    return Array.from(this.connectionStates.values()).filter((state) => state)
      .length;
  }
}

// Global WebSocket state tracker
const wsStateTracker = new WebSocketStateTracker();

// =============================================================================

const app = express();
const server = createServer(app);
const port = process.env.PORT ? parseInt(process.env.PORT) : 3005;
const viewerPort = process.env.VIEWER_PORT
  ? parseInt(process.env.VIEWER_PORT)
  : 3006;

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server });
const connectedClients = new Set<WebSocket>();

// Middleware
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Warn if WORLD_SEED is not set — Mineflayer cannot extract the seed
// from the server protocol. The seed can be provided later via POST /seed or POST /connect.
if (!process.env.WORLD_SEED || process.env.WORLD_SEED === '0') {
  console.warn(
    'WARNING: WORLD_SEED environment variable is not set or is 0.\n' +
      'Per-seed database isolation requires the Minecraft world seed.\n' +
      'You can set it later via POST /seed or by including worldSeed in POST /connect.'
  );
}

// Bot configuration
const botConfig: BotConfig = {
  host: process.env.MINECRAFT_HOST || 'localhost',
  port: process.env.MINECRAFT_PORT
    ? parseInt(process.env.MINECRAFT_PORT)
    : 25565,
  username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
  version: process.env.MINECRAFT_VERSION || '1.20.1',
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

// Thought generation interval
let thoughtGenerationInterval: NodeJS.Timeout | null = null;
let hudUpdateInterval: NodeJS.Timeout | null = null;
let botInstanceSyncInterval: NodeJS.Timeout | null = null;
let planningCoordinator: any = null;
let memoryIntegration: MemoryIntegrationService | null = null;
let isConnecting = false;
let isRunningPlanningCycle = false;
let viewerActive = false;
let autoConnectInterval: NodeJS.Timeout | null = null;
let systemReady = process.env.SYSTEM_READY_ON_BOOT === '1';
let readyAt: string | null = systemReady ? new Date().toISOString() : null;
let readySource: string | null = systemReady ? 'env' : null;
let pendingThoughtGeneration = false;

/**
 * Start automatic thought generation from bot experiences
 */
function startThoughtGeneration() {
  if (!systemReady) {
    pendingThoughtGeneration = true;
    console.log('⏸️ Waiting for system readiness; autonomous loop paused');
    return;
  }

  if (thoughtGenerationInterval) {
    clearInterval(thoughtGenerationInterval);
  }

  thoughtGenerationInterval = setInterval(async () => {
    if (!minecraftInterface || isRunningPlanningCycle) {
      return;
    }

    try {
      const bot = minecraftInterface.botAdapter.getBot();
      if (!bot.entity) {
        return; // Bot not ready
      }

      // Check if already executing a plan — don't overlap
      const status = minecraftInterface.planExecutor.getExecutionStatus();
      if (status.isExecuting) {
        return; // Already running a planning cycle
      }

      // Send a contextual thought to cognition (preserve existing behavior)
      const worldState = minecraftInterface.observationMapper.mapBotStateToPlanningContext(bot);
      const healthPct = Math.round((worldState.worldState?.health ?? 0) / 20 * 100);
      const hungerPct = Math.round((worldState.worldState?.hunger ?? 0) / 20 * 100);
      const thought = `Health: ${healthPct}%, Hunger: ${hungerPct}%. Observing environment and deciding next action.`;

      minecraftInterface.observationMapper.sendThoughtToCognition(thought, 'status')
        .catch(() => {}); // Fire-and-forget, don't block execution

      // Execute an autonomous planning cycle with concurrency guard
      isRunningPlanningCycle = true;
      console.log('🔄 Starting autonomous planning cycle...');
      try {
        const result = await minecraftInterface.planExecutor.executePlanningCycle();

        if (result.success) {
          console.log(`✅ Planning cycle complete: ${result.executedSteps}/${result.totalSteps} steps executed`);
        } else {
          console.log(`⚠️ Planning cycle ended: ${result.error || 'no plan generated'} (${result.executedSteps}/${result.totalSteps} steps)`);
        }
      } finally {
        isRunningPlanningCycle = false;
      }
    } catch (error) {
      isRunningPlanningCycle = false;
      console.error('❌ Error in autonomous planning cycle:', error instanceof Error ? error.message : error);
    }
  }, 15000); // Every 15 seconds

  console.log('✅ Autonomous planning loop started (15s intervals)');
}

function tryStartThoughtGeneration(reason: string) {
  if (!systemReady) {
    pendingThoughtGeneration = true;
    console.log(
      `⏸️ Deferring autonomous planning loop until system readiness (${reason})`
    );
    return;
  }
  pendingThoughtGeneration = false;
  startThoughtGeneration();
}

/**
 * Stop automatic thought generation
 */
function stopThoughtGeneration() {
  if (thoughtGenerationInterval) {
    clearInterval(thoughtGenerationInterval);
    thoughtGenerationInterval = null;
    console.log('🛑 Autonomous planning loop stopped');
  }
}

/**
 * Broadcast bot state updates to all connected WebSocket clients
 */
function broadcastBotStateUpdate(eventType: string, data: any) {
  const message = JSON.stringify({
    type: eventType,
    timestamp: Date.now(),
    data,
  });

  console.log(`Broadcasting ${eventType} to ${connectedClients.size} clients`);

  connectedClients.forEach((client) => {
    if (client.readyState === 1) {
      // WebSocket.OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error('Failed to send message to WebSocket client:', error);
      }
    } else {
      console.log(`Client not ready, state: ${client.readyState}`);
    }
  });
}

/**
 * Setup WebSocket event handlers for bot state updates
 */
function setupBotStateWebSocket() {
  if (!minecraftInterface) return;

  // Listen to bot adapter events and broadcast them
  minecraftInterface.botAdapter.on('health_changed', (data) => {
    broadcastBotStateUpdate('health_changed', data);
  });

  minecraftInterface.botAdapter.on('inventory_changed', (data) => {
    broadcastBotStateUpdate('inventory_changed', data);
  });

  minecraftInterface.botAdapter.on('position_changed', (data) => {
    broadcastBotStateUpdate('position_changed', data);
  });

  minecraftInterface.botAdapter.on('block_broken', (data) => {
    broadcastBotStateUpdate('block_broken', data);
  });

  minecraftInterface.botAdapter.on('block_placed', (data) => {
    broadcastBotStateUpdate('block_placed', data);
  });

  minecraftInterface.botAdapter.on('connected', (data) => {
    broadcastBotStateUpdate('connected', data);
  });

  minecraftInterface.botAdapter.on('disconnected', (data) => {
    broadcastBotStateUpdate('disconnected', data);

    // Stop thought generation when bot disconnects
    console.log('🔌 Bot disconnected, stopping thought generation...');
    stopThoughtGeneration();
  });

  minecraftInterface.botAdapter.on('spawned', (data) => {
    broadcastBotStateUpdate('spawned', data);

    // Start thought generation when bot spawns
    console.log('🤖 Bot spawned, starting thought generation...');
    tryStartThoughtGeneration('bot spawned');
  });

  minecraftInterface.botAdapter.on('warning', (data) => {
    broadcastBotStateUpdate('warning', data);
  });

  // Handle bot death and respawn events
  minecraftInterface.botAdapter.on('error', (data) => {
    // Check if this is a death error
    if (data.error === 'Bot died') {
      // Broadcast health update with 0 health
      broadcastBotStateUpdate('health_changed', {
        health: 0,
        food: data.food || 0,
        saturation: 0,
      });

      // Stop thought generation when bot dies
      console.log('💀 Bot died, stopping thought generation...');
      stopThoughtGeneration();
    }
    broadcastBotStateUpdate('error', data);
  });

  minecraftInterface.botAdapter.on('respawned', (data) => {
    // Broadcast health update with respawned health
    broadcastBotStateUpdate('health_changed', {
      health: data.health || 20,
      food: data.food || 20,
      saturation: 5.2,
    });
    broadcastBotStateUpdate('respawned', data);

    // Restart thought generation when bot respawns
    console.log('🔄 Bot respawned, restarting thought generation...');
    startThoughtGeneration();
  });

  // Send periodic HUD updates every 5 seconds (clear previous to prevent duplicates)
  if (hudUpdateInterval) {
    clearInterval(hudUpdateInterval);
  }
  hudUpdateInterval = setInterval(() => {
    if (minecraftInterface) {
      try {
        const state = minecraftInterface.botAdapter.getStatus();
        if (state?.data?.worldState) {
          const hudData = {
            health: state.data.worldState.player?.health ?? 0,
            food: state.data.worldState.player?.food ?? 0,
            energy: state.data.currentState?.energy || 1,
            safety: state.data.currentState?.safety || 0.9,
            social: state.data.currentState?.social || 0.7,
            achievement: state.data.currentState?.achievement || 0.4,
            curiosity: state.data.currentState?.curiosity || 0.6,
            creativity: state.data.currentState?.creativity || 0.5,
          };

          console.log('Sending periodic HUD update:', hudData);
          broadcastBotStateUpdate('hud_update', hudData);
        } else {
          console.log('No world state available for HUD update');
        }
      } catch (error) {
        console.error('Failed to send periodic HUD update:', error);
      }
    } else {
      console.log('No minecraft interface available for HUD update');
    }
  }, 5000);
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  connectedClients.add(ws);
  wsStateTracker.logConnectionState(ws.url || 'unknown', true);

  // Send initial bot state
  if (minecraftInterface) {
    try {
      const botStatus = minecraftInterface.botAdapter.getStatus();
      const executionStatus =
        minecraftInterface.planExecutor.getExecutionStatus();

      const initialState = {
        type: 'initial_state',
        timestamp: Date.now(),
        data: {
          botStatus,
          executionStatus,
          connected: botStatus?.connected || false,
        },
      };

      ws.send(JSON.stringify(initialState));
    } catch (error) {
      console.error('Failed to send initial state:', error);
    }
  }

  ws.on('close', () => {
    connectedClients.delete(ws);
    wsStateTracker.logConnectionState(ws.url || 'unknown', false);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    connectedClients.delete(ws);
    wsStateTracker.logConnectionState(ws.url || 'unknown', false);
  });
});

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
    websocket: {
      active: true,
      connectedClients: wsStateTracker.getConnectionCount(),
      endpoint: `ws://localhost:${port}`,
    },
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

// Startup readiness endpoint
app.get('/system/ready', (_req, res) => {
  res.json({ ready: systemReady, readyAt, source: readySource });
});

app.post('/system/ready', (req, res) => {
  if (!systemReady) {
    systemReady = true;
    readyAt = new Date().toISOString();
    readySource =
      typeof req.body?.source === 'string' ? req.body.source : 'startup';
  }

  if (pendingThoughtGeneration) {
    const bot = minecraftInterface?.botAdapter.getBot();
    if (bot?.entity) {
      tryStartThoughtGeneration('system ready');
    }
  }

  res.json({ ready: systemReady, readyAt, accepted: true });
});

// Set world seed at runtime
app.post('/seed', async (req, res) => {
  try {
    const { worldSeed } = req.body;
    if (!worldSeed || String(worldSeed) === '0') {
      return res.status(400).json({
        success: false,
        message: 'worldSeed is required and must be non-zero.',
      });
    }

    const seedStr = String(worldSeed);
    botConfig.worldSeed = seedStr;
    process.env.WORLD_SEED = seedStr;

    // Propagate to memory service
    try {
      await fetch(`${process.env.MEMORY_ENDPOINT || 'http://localhost:3001'}/enhanced/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldSeed: seedStr }),
      });
    } catch {
      console.warn('⚠️ Failed to propagate seed to memory service');
    }

    res.json({
      success: true,
      message: `World seed updated to ${seedStr}`,
      worldSeed: seedStr,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update world seed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
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
    // Accept optional worldSeed in request body
    const { worldSeed } = req.body || {};
    if (worldSeed) {
      const seedStr = String(worldSeed);
      botConfig.worldSeed = seedStr;
      process.env.WORLD_SEED = seedStr;
      console.log(`🌱 World seed set to ${seedStr} via POST /connect`);
      // Propagate to memory service
      try {
        await fetch(`${process.env.MEMORY_ENDPOINT || 'http://localhost:3001'}/enhanced/seed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worldSeed: seedStr }),
        });
      } catch {
        console.warn('⚠️ Failed to propagate seed to memory service');
      }
    }

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

    // Initialize planning coordinator with proper configuration
    planningCoordinator = createIntegratedPlanningCoordinator({
      hrmConfig: {
        maxRefinements: 3,
        qualityThreshold: 0.7,
        hrmLatencyTarget: 100,
        enableIterativeRefinement: true,
      },
      htnConfig: {
        maxDecompositionDepth: 5,
        methodCacheSize: 100,
        preferenceWeights: { gathering: 0.8, crafting: 0.9, exploration: 0.6 },
      },
      goapConfig: {
        maxPlanLength: 10,
        planningBudgetMs: 5000,
        repairThreshold: 0.5,
      },
      coordinatorConfig: {
        routingStrategy: 'hybrid',
        fallbackTimeout: 3000,
        enablePlanMerging: true,
        enableCrossValidation: true,
        enableTaskBootstrap: true,
      },
    });

    // Create minecraft interface
    minecraftInterface = await createMinecraftInterface(
      botConfig,
      planningCoordinator
    );

    // Setup WebSocket event handlers for real-time updates
    setupBotStateWebSocket();

    // Register core leaves with the capability registry
    await registerCoreLeaves();

    console.log('✅ Connected to Minecraft server');
    console.log('✅ Memory integration initialized');
    console.log('✅ Planning coordinator initialized');
    console.log('✅ Core leaves registered');

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

/**
 * Register core leaves with the local leaf factory
 */
async function registerCoreLeaves() {
  try {
    console.log('📝 Registering core leaves...');

    // Import the LeafFactory from core
    const { LeafFactory } = await import('@conscious-bot/core');

    // Create a local leaf factory for the minecraft interface
    const leafFactory = new LeafFactory();

    // Register movement leaves
    const movementLeaves = [
      new MoveToLeaf(),
      new StepForwardSafelyLeaf(),
      new FollowEntityLeaf(),
    ];

    // Register interaction leaves
    const interactionLeaves = [
      new DigBlockLeaf(),
      new PlaceBlockLeaf(),
      new PlaceTorchIfNeededLeaf(),
      new RetreatAndBlockLeaf(),
      new ConsumeFoodLeaf(),
    ];

    // Register sensing leaves
    const sensingLeaves = [
      new SenseHostilesLeaf(),
      new ChatLeaf(),
      new WaitLeaf(),
      new GetLightLevelLeaf(),
    ];

    // Register crafting leaves
    const craftingLeaves = [new CraftRecipeLeaf(), new SmeltLeaf()];

    // Register container leaves
    const containerLeaves = [
      new OpenContainerLeaf(),
      new TransferItemsLeaf(),
      new CloseContainerLeaf(),
      new InventoryManagementLeaf(),
    ];

    // Register combat leaves
    const combatLeaves = [
      new AttackEntityLeaf(),
      new EquipWeaponLeaf(),
      new RetreatFromThreatLeaf(),
      new UseItemLeaf(),
    ];

    // Register farming leaves
    const farmingLeaves = [
      new TillSoilLeaf(),
      new PlantCropLeaf(),
      new HarvestCropLeaf(),
      new ManageFarmLeaf(),
    ];

    // Register world interaction leaves
    const worldInteractionLeaves = [
      new InteractWithBlockLeaf(),
      new OperatePistonLeaf(),
      new ControlRedstoneLeaf(),
      new BuildStructureLeaf(),
      new EnvironmentalControlLeaf(),
    ];

    // Register construction leaves (P0 stubs — no inventory/world mutation)
    const constructionLeaves = [
      new PrepareSiteLeaf(),
      new BuildModuleLeaf(),
      new PlaceFeatureLeaf(),
    ];

    const allLeaves = [
      ...movementLeaves,
      ...interactionLeaves,
      ...sensingLeaves,
      ...craftingLeaves,
      ...containerLeaves,
      ...combatLeaves,
      ...farmingLeaves,
      ...worldInteractionLeaves,
      ...constructionLeaves,
    ];

    for (const leaf of allLeaves) {
      const result = leafFactory.register(leaf);
      if (result.ok) {
        console.log(
          `✅ Registered leaf: ${leaf.spec.name}@${leaf.spec.version}`
        );
      } else {
        console.warn(
          `⚠️ Failed to register leaf: ${leaf.spec.name}@${leaf.spec.version}: ${result.error}`
        );
      }
    }

    console.log(
      `✅ Registered ${allLeaves.length} core leaves with local leaf factory`
    );

    // Store the leaf factory globally so it can be used by the action executor
    (global as any).minecraftLeafFactory = leafFactory;
  } catch (error) {
    console.error('❌ Failed to register core leaves:', error);
    throw error;
  }
}

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

    // Create planning coordinator with proper configuration
    planningCoordinator = createIntegratedPlanningCoordinator({
      hrmConfig: {
        maxRefinements: 3,
        qualityThreshold: 0.7,
        hrmLatencyTarget: 100,
        enableIterativeRefinement: true,
      },
      htnConfig: {
        maxDecompositionDepth: 5,
        methodCacheSize: 100,
        preferenceWeights: { gathering: 0.8, crafting: 0.9, exploration: 0.6 },
      },
      goapConfig: {
        maxPlanLength: 10,
        planningBudgetMs: 5000,
        repairThreshold: 0.5,
      },
      coordinatorConfig: {
        routingStrategy: 'hybrid',
        fallbackTimeout: 3000,
        enablePlanMerging: true,
        enableCrossValidation: true,
        enableTaskBootstrap: true,
      },
    });

    // Create full minecraft interface
    minecraftInterface = await createMinecraftInterfaceWithoutConnect(
      botConfig,
      planningCoordinator
    );

    // Manually initialize the plan executor to connect to Minecraft
    await minecraftInterface.planExecutor.initialize();

    // Register core leaves with the capability registry
    await registerCoreLeaves();

    // Setup WebSocket event handlers and start autonomous planning
    // (must be after initialize() completes, not in 'initialized' event which already fired)
    setupBotStateWebSocket();
    startThoughtGeneration();

    // Set up event listeners
    minecraftInterface.planExecutor.on('initialized', (event) => {
      // Only log successful auto-connect in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(' Bot auto-connected to Minecraft server');
      }

      // Start Prismarine viewer on first connect with retry logic
      const startViewerWithRetry = async (retryCount = 0) => {
        try {
          if (!minecraftInterface) {
            return;
          }
          const bot = minecraftInterface.botAdapter.getBot();
          if (bot && !viewerActive) {
            const viewerCheck = minecraftInterface.botAdapter.canStartViewer();
            if (viewerCheck.canStart) {
              startViewerSafely(bot, viewerPort);
            } else if (retryCount < 3) {
              // Retry after 2 seconds if not ready
              setTimeout(() => startViewerWithRetry(retryCount + 1), 2000);
            } else {
              console.log(
                'Viewer auto-start failed after retries:',
                viewerCheck.reason
              );
            }
          }
        } catch (err) {
          console.error('Failed to start Prismarine viewer:', err);
          viewerActive = false;
          // Retry once more after error
          if (retryCount < 1) {
            setTimeout(() => startViewerWithRetry(retryCount + 1), 3000);
          }
        }
      };

      startViewerWithRetry();
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

// Send chat message
app.post('/chat', async (req, res) => {
  try {
    const { message, target } = req.body;

    if (
      !message ||
      typeof message !== 'string' ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Message is required and must be a non-empty string',
      });
    }

    if (!minecraftInterface?.botAdapter.getStatus()?.connected) {
      return res.status(503).json({
        success: false,
        message: 'Bot not connected',
        status: 'disconnected',
      });
    }

    const bot = minecraftInterface.botAdapter.getBot();
    if (!bot) {
      return res.status(503).json({
        success: false,
        message: 'Bot instance not available',
        status: 'disconnected',
      });
    }

    // Format message with target if specified
    const formattedMessage = target ? `/msg ${target} ${message}` : message;

    // Send the chat message
    await bot.chat(formattedMessage);

    console.log(`✅ Bot sent chat message: "${formattedMessage}"`);

    res.json({
      success: true,
      message: 'Chat message sent successfully',
      data: {
        message: formattedMessage,
        target: target || null,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('❌ Failed to send chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send chat message',
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

// Get safety status
app.get('/safety', (req, res) => {
  try {
    const safetyStatus = minecraftInterface?.botAdapter.getSafetyStatus();
    res.json({
      success: true,
      safety: safetyStatus,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to get safety status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get safety status',
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
      // Only log once per minute to avoid spam
      const now = Date.now();
      if (!global.lastStateLog || now - global.lastStateLog > 60000) {
        console.log(
          '🔍 [MINECRAFT INTERFACE] Bot not connected, returning 503'
        );
        global.lastStateLog = now;
      }
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
            items: [], // This will be populated with actual bot inventory items
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
            version: executionStatus?.bot?.server?.version || '1.20.1',
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

    let bot: Bot | null = null;
    try {
      bot = minecraftInterface.botAdapter.getBot();
    } catch (error) {
      console.error(
        '[Minecraft Interface] Failed to get bot instance:',
        error instanceof Error ? error.message : error
      );
      // Return basic state if bot is not available
      return res.json({
        success: true,
        status: 'disconnected',
        data: {
          position: { x: 0, y: 64, z: 0 },
          health: 0,
          food: 0,
          inventory: {
            items: [],
            totalSlots: 36,
            usedSlots: 0,
          },
        },
        isAlive: false,
      });
    }

    if (!bot) {
      return res.json({
        success: true,
        status: 'disconnected',
        data: {
          position: { x: 0, y: 64, z: 0 },
          health: 0,
          food: 0,
          inventory: {
            items: [],
            totalSlots: 36,
            usedSlots: 0,
          },
        },
        isAlive: false,
      });
    }

    console.log('🔍 [MINECRAFT INTERFACE] Got connected bot, mapping state...');

    const gameState =
      minecraftInterface.observationMapper.mapBotStateToPlanningContext(bot);

    // Safely extract inventory state with fallback
    let inventoryState;
    try {
      inventoryState =
        minecraftInterface.observationMapper.extractInventoryState(bot);
    } catch (error) {
      console.error(
        '[Minecraft Interface] Failed to extract inventory state:',
        error instanceof Error ? error.message : error
      );
      // Fallback to empty inventory
      inventoryState = {
        items: [],
        totalSlots: 36,
        usedSlots: 0,
      };
    }

    const ws = gameState.worldState;
    if (!ws) {
      return res.status(500).json({
        success: false,
        message: 'Failed to read world state from bot',
      });
    }

    // Convert to format expected by cognition system
    const convertedState = {
      worldState: {
        player: {
          position: {
            x: ws.playerPosition[0],
            y: ws.playerPosition[1],
            z: ws.playerPosition[2],
          },
          health: ws.health,
          food: ws.hunger,
          experience: 0, // Not in the converted state
          gameMode: 'survival', // Default
          dimension: 'overworld', // Default
        },
        environment: {
          timeOfDay:
            gameState.timeConstraints?.urgency === 'night' ? 18000 : 6000,
          weather: 'clear',
          biome: 'plains',
        },
        nearbyEntities: [],
        nearbyBlocks: [],
      },
      status: 'connected',
      data: {
        position: {
          x: ws.playerPosition[0],
          y: ws.playerPosition[1],
          z: ws.playerPosition[2],
        },
        health: ws.health,
        food: ws.hunger,
        inventory: inventoryState,
      },
      isAlive: ws.health > 0,
    };

    // Only log converted state when connection status changes
    const now = Date.now();
    if (
      !global.lastConvertedStateLog ||
      now - global.lastConvertedStateLog > 30000
    ) {
      console.log('🔍 [MINECRAFT INTERFACE] Bot state updated:', {
        position: convertedState.data.position,
        health: convertedState.data.health,
        inventoryItems: convertedState.data.inventory?.items?.length || 0,
      });
      global.lastConvertedStateLog = now;
    }

    res.json({
      success: true,
      status: isAlive ? 'connected' : 'dead',
      data: convertedState,
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
    console.log('🔍 [MINECRAFT INTERFACE] /inventory endpoint called');

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
      console.log(
        '🔍 [MINECRAFT INTERFACE] Inventory - Bot not connected, returning 503'
      );
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
    const inventory = gameState.worldState?.inventory?.items || [];

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

    // Get the bot from the botAdapter
    const bot = minecraftInterface.botAdapter.getBot();
    if (!bot) {
      throw new Error('Bot not available');
    }

    // Create ActionTranslator directly
    const { ActionTranslator } = await import('./action-translator');
    console.log('🔧 Creating ActionTranslator for request...');
    console.log('🔍 Bot state for ActionTranslator:', {
      hasBot: !!bot,
      hasEntity: !!bot.entity,
      hasPosition: !!bot.entity?.position,
      hasPathfinder: !!(bot as any).pathfinder,
    });

    const actionTranslator = new ActionTranslator(bot, {
      actionTimeout: 15000,
      pathfindingTimeout: 30000,
    });
    console.log('✅ ActionTranslator created for request');

    // Execute the action directly instead of as a plan step
    const action = {
      type: type as any,
      parameters: parameters || {},
      timeout: 15000,
    };

    const result = await actionTranslator.executeAction(action);

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

// Robust viewer startup function with error handling
function startViewerSafely(bot: any, port: number) {
  if (viewerActive) {
    console.log('Viewer already active, skipping startup');
    return;
  }

  try {
    // Enhanced error handling to prevent crashes from unknown entities
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
        // Don't log these errors to avoid spam
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
        // Don't log these warnings to avoid spam
        return;
      }
      originalConsoleWarn(...args);
    };

    // Create a custom error handler for the bot to catch entity-related errors
    const originalBotEmit = bot.emit;
    bot.emit = function (event: string, ...args: any[]) {
      // Filter out entity-related errors before they reach the viewer
      if (event === 'error') {
        const error = args[0];
        if (error && typeof error.message === 'string') {
          if (
            error.message.includes('Unknown entity') ||
            error.message.includes('Unknown entity type') ||
            error.message.includes('trader_llama') ||
            error.message.includes('glow_squid') ||
            error.message.includes('Unknown entity item')
          ) {
            // Suppress these specific entity errors
            return;
          }
        }
      }
      return originalBotEmit.apply(this, [event, ...args]);
    };

    // Enhanced viewer configuration for better rendering
    startMineflayerViewer(bot as any, {
      port: port,
      firstPerson: true,
      viewDistance: 8, // Increased from default 6 for better visibility
      prefix: '', // No prefix for cleaner URLs
    });

    // Apply enhanced viewer features for better entity rendering and lighting
    try {
      const enhancedViewer = applyViewerEnhancements(bot, {
        enableEntityAnimation: true,
        enableLightingUpdates: true,
        enableTimeSync: true,
        entityUpdateInterval: 100, // ms
        lightingUpdateInterval: 1000, // ms
        timeSyncInterval: 5000, // ms
      });

      // Log enhanced viewer status
      enhancedViewer.on('started', () => {
        console.log('✅ Enhanced viewer features activated');
      });

      enhancedViewer.on('error', (error) => {
        // Only log non-critical errors
        if (error.type !== 'entityUpdate') {
          console.warn(
            '⚠️ Enhanced viewer error:',
            error.type,
            error.error?.message
          );
        }
      });
    } catch (err) {
      console.warn('⚠️ Failed to apply viewer enhancements:', err);
    }

    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;

    viewerActive = true;
    console.log(`🖥️ Prismarine viewer started at http://localhost:${port}`);

    if (errorMessages.length > 0 || warningMessages.length > 0) {
      console.log(
        `⚠️ Suppressed ${errorMessages.length} unknown entity errors and ${warningMessages.length} warnings during viewer startup`
      );
    }

    // Set up periodic cleanup of suppressed messages
    setInterval(() => {
      errorMessages.length = 0;
      warningMessages.length = 0;
    }, 60000); // Clear every minute
  } catch (err) {
    console.error('Failed to start Prismarine viewer:', err);
    viewerActive = false;
  }
}

// Stop viewer endpoint
app.post('/stop-viewer', async (req, res) => {
  try {
    if (!viewerActive) {
      return res.json({
        success: true,
        message: 'Viewer not active',
      });
    }

    // Note: prismarine-viewer doesn't provide a direct stop method
    // We can only mark it as inactive and let it be cleaned up
    viewerActive = false;
    console.log('🖥️ Prismarine viewer stopped');

    res.json({
      success: true,
      message: 'Viewer stopped successfully',
    });
  } catch (error) {
    console.error('Failed to stop viewer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop viewer',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start server
server.listen(port, async () => {
  console.log(`Minecraft bot server running on port ${port}`);
  console.log(
    `Bot config: ${botConfig.username}@${botConfig.host}:${botConfig.port}`
  );
  console.log(`Use POST /connect to start the bot`);
  console.log(`Prismarine viewer port reserved at ${viewerPort}`);

  // Register leaves on startup
  try {
    await registerCoreLeaves();
  } catch (error) {
    console.error('❌ Failed to register leaves on startup:', error);
  }

  // Attempt to start viewer if bot is already connected - DISABLED to prevent conflicts
  // setTimeout(() => {
  //   try {
  //     // Only check if minecraftInterface exists and is properly initialized
  //     if (!minecraftInterface) {
  //       return;
  //     }

  //     const botStatus = minecraftInterface.botAdapter.getStatus();
  //     const executionStatus =
  //       minecraftInterface.planExecutor.getExecutionStatus();

  //     // Use execution status if available, otherwise fall back to bot adapter status
  //     const isConnected =
  //       (executionStatus &&
  //         executionStatus.bot &&
  //         executionStatus.bot.connected) ||
  //       (botStatus?.connected && botStatus?.connectionState === 'spawned');

  //     if (isConnected && !viewerActive) {
  //       const viewerCheck = minecraftInterface.botAdapter.canStartViewer();
  //       if (viewerCheck.canStart) {
  //         try {
  //           const bot = minecraftInterface.botAdapter.getBot();
  //           if (bot) {
  //           startViewerSafely(bot, viewerPort);
  //           }
  //         } catch (err) {
  //           console.error('Failed to auto-start Prismarine viewer:', err);
  //         }
  //       } else {
  //         // Only log in development mode
  //         if (process.env.NODE_ENV === 'development') {
  //           console.log('Auto-start viewer skipped:', viewerCheck.reason);
  //         }
  //       }
  //     }
  //   } catch (err) {
  //     // Only log in development mode
  //     if (process.env.NODE_ENV === 'development') {
  //       console.error('Failed to check bot status for auto-start viewer:', err);
  //     }
  //   }
  // }, 5000); // Wait 5 seconds for bot to connect

  // Periodic viewer health check and auto-restart - DISABLED to prevent constant restarts
  // setInterval(() => {
  //   try {
  //     if (
  //       !minecraftInterface ||
  //       !minecraftInterface.botAdapter.getStatus()?.connected
  //     ) {
  //       return;
  //     }

  //     const botStatus = minecraftInterface.botAdapter.getStatus();
  //     const isConnected =
  //       botStatus?.connected && botStatus?.connectionState === 'spawned';

  //     if (isConnected && !viewerActive) {
  //       const viewerCheck = minecraftInterface.botAdapter.canStartViewer();
  //       if (viewerCheck.canStart) {
  //         try {
  //           const bot = minecraftInterface.botAdapter.getBot();
  //           if (bot) {
  //           console.log('Auto-restarting viewer due to inactivity...');
  //           startViewerSafely(bot, viewerPort);
  //           }
  //         } catch (err) {
  //           console.error('Failed to auto-restart Prismarine viewer:', err);
  //         }
  //       }
  //     }
  //   } catch (err) {
  //     // Only log in development mode
  //     if (process.env.NODE_ENV === 'development') {
  //       console.error('Failed to check viewer health:', err);
  //     }
  //   }
  // }, 30000); // Check every 30 seconds
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

// Get available leaves for MCP integration
app.get('/leaves', (req, res) => {
  try {
    const leafFactory = (global as any).minecraftLeafFactory;
    if (!leafFactory) {
      return res.json({
        success: false,
        message: 'Leaf factory not initialized',
        data: [],
      });
    }

    const leaves = leafFactory.listLeaves();
    const leafInfo = leaves.map((leaf: any) => ({
      name: leaf.spec.name,
      version: leaf.spec.version,
      description: leaf.spec.description,
      permissions: leaf.spec.permissions || [],
      inputSchema: leaf.spec.inputSchema,
      outputSchema: leaf.spec.outputSchema,
    }));

    res.json({
      success: true,
      data: leafInfo,
      count: leafInfo.length,
    });
  } catch (error) {
    console.error('Failed to get leaves:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaves',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Auto-update bot instance in planning server when available
async function updateBotInstanceInPlanningServer() {
  try {
    if (!minecraftInterface) return;
    const bot = minecraftInterface.botAdapter.getBot();
    if (bot) {
      // Send only essential bot data that can be serialized
      const botData = {
        entity: {
          position: bot.entity?.position
            ? {
                x: bot.entity.position.x,
                y: bot.entity.position.y,
                z: bot.entity.position.z,
              }
            : null,
          velocity: bot.entity?.velocity
            ? {
                x: bot.entity.velocity.x,
                y: bot.entity.velocity.y,
                z: bot.entity.velocity.z,
              }
            : null,
          onGround: bot.entity?.onGround || false,
        },
        player: {
          username: bot.player?.username || 'bot',
          uuid: bot.player?.uuid || 'unknown',
        },
        health: bot.health || 20,
        food: bot.food || 20,
        experience: bot.experience || { level: 0, progress: 0, total: 0 },
        game: {
          gameMode: bot.game?.gameMode || 'unknown',
          hardcore: bot.game?.hardcore || false,
          dimension: bot.game?.dimension || 'unknown',
        },
        inventory: {
          items: (bot.inventory?.items() || []).map((item) => ({
            type: item.type,
            slot: item.slot,
            count: item.count,
            metadata: item.metadata,
          })),
          slots: bot.inventory?.slots || [],
          selectedSlot: (bot.inventory as any)?.selectedSlot || 0,
        },
        isConnected: (bot as any).isConnected || false,
        version: (bot as any).version || 'unknown',
      };

      const response = await fetch(
        'http://localhost:3002/update-bot-instance',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botInstance: botData }),
        }
      );

      if (response.ok) {
        console.log('✅ Bot instance updated in planning server');
      } else {
        console.warn(
          '⚠️ Failed to update bot instance in planning server:',
          response.status
        );
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not update bot instance in planning server:', error);
  }
}

// Try to update bot instance periodically (tracked for cleanup)
botInstanceSyncInterval = setInterval(updateBotInstanceInPlanningServer, 30000); // Every 30 seconds (reduced from 10)
