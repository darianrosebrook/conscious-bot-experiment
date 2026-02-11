/**
 * World System HTTP Server
 *
 * Provides HTTP API endpoints for the world system.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Bot state management
interface BotState {
  id: string;
  position: { x: number; y: number; z: number };
  health: number;
  hunger: number;
  inventory: Array<{
    type: string;
    count: number;
    slot: number;
  }>;
  connected: boolean;
  lastUpdated: number;
}

// World state cache
interface WorldState {
  player?: {
    position?: { x: number; y: number; z: number };
    health?: number;
    inventory?: any[];
  };
  environment?: {
    timeOfDay?: number;
    weather?: string;
    biome?: string;
    biomeTemperature?: number;
    biomeHumidity?: number;
    biomeCategory?: string;
  };
  navigation?: {
    currentPath?: any;
    destination?: any;
    pathfindingActive?: boolean;
  };
  perception?: {
    visibleEntities?: any[];
    recognizedObjects?: any[];
    perceptionQuality?: number;
  };
  placeGraph?: {
    knownPlaces?: any[];
    currentPlace?: any;
    placeConnections?: any[];
  };
  sensorimotor?: {
    currentAction?: any;
    actionQueue?: any[];
    motorControlActive?: boolean;
  };
  sensing?: {
    sensorData?: any;
    sensorStatus?: string;
  };
}

// Bot state storage
const botStates = new Map<string, BotState>();

let currentWorldState: WorldState = {
  sensing: {
    sensorStatus: 'active',
  },
};

// Event emitter for world state updates
const worldStateEmitter = new EventEmitter();

// Fetch world state from planning server
async function fetchWorldStateFromPlanning(): Promise<WorldState | null> {
  try {
    const response = await fetch('http://localhost:3002/world-state');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as any;
    if (!data) {
      throw new Error('No data returned from planning server');
    }

    // Transform planning server data to world server format
    return {
      player: {
        position: data.agentPosition,
        health: data.agentHealth,
        inventory: data.inventory,
      },
      environment: {
        timeOfDay: data.timeOfDay,
        weather: data.weather,
        biome: data.biome,
        biomeTemperature: data.biomeTemperature,
        biomeHumidity: data.biomeHumidity,
        biomeCategory: data.biomeCategory,
      },
      navigation: {
        currentPath: data.navigation?.currentPath,
        destination: data.navigation?.destination,
        pathfindingActive: data.navigation?.pathfindingActive,
      },
      perception: {
        visibleEntities: data.perception?.visibleEntities || [],
        recognizedObjects: data.perception?.recognizedObjects || [],
        perceptionQuality: data.perception?.perceptionQuality || 0.5,
      },
      placeGraph: {
        knownPlaces: data.placeGraph?.knownPlaces || [],
        currentPlace: data.placeGraph?.currentPlace,
        placeConnections: data.placeGraph?.placeConnections || [],
      },
      sensorimotor: {
        currentAction: data.sensorimotor?.currentAction,
        actionQueue: data.sensorimotor?.actionQueue || [],
        motorControlActive: data.sensorimotor?.motorControlActive || false,
      },
      sensing: {
        sensorData: data.sensing?.sensorData || {},
        sensorStatus: data.sensing?.sensorStatus || 'active',
      },
    };
  } catch (error: any) {
    // Suppress stack traces for connection errors during startup race
    const code = error?.cause?.code ?? error?.code;
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
      console.warn('[World] Planning server not yet reachable — will retry');
    } else {
      console.error('[World] Failed to fetch world state:', error?.message ?? error);
    }
    return null;
  }
}

// Update world state periodically
async function updateWorldState() {
  try {
    const newState = await fetchWorldStateFromPlanning();
    if (newState) {
      currentWorldState = newState;
      worldStateEmitter.emit('updated', currentWorldState);
    }
  } catch (error) {
    console.error('Failed to update world state:', error);
  }
}

let systemReady = process.env.SYSTEM_READY_ON_BOOT === '1';
let readyAt: string | null = systemReady ? new Date().toISOString() : null;
let readySource: string | null = systemReady ? 'env' : null;
let worldPollInterval: NodeJS.Timeout | null = null;

function startWorldPolling() {
  if (worldPollInterval) return;
  worldPollInterval = setInterval(updateWorldState, 5000); // Poll every 5 seconds
  updateWorldState().catch(() => {});
}

if (systemReady) {
  startWorldPolling();
}

// Get current world state
function getWorldState(): WorldState {
  return currentWorldState;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'world',
    timestamp: Date.now(),
    version: '0.1.0',
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
    startWorldPolling();
  }
  res.json({ ready: systemReady, readyAt, accepted: true });
});

// Get world system state
app.get('/state', (req, res) => {
  try {
    const state = getWorldState();
    res.json({
      navigation: state.navigation || {
        currentPath: null,
        destination: null,
        pathfindingActive: false,
      },
      perception: state.perception || {
        visibleEntities: [],
        recognizedObjects: [],
        perceptionQuality: 0.5,
      },
      placeGraph: state.placeGraph || {
        knownPlaces: [],
        currentPlace: null,
        placeConnections: [],
      },
      sensorimotor: state.sensorimotor || {
        currentAction: null,
        actionQueue: [],
        motorControlActive: false,
      },
      sensing: state.sensing || {
        sensorData: {},
        sensorStatus: 'active',
      },
      player: state.player,
      environment: state.environment,
    });
  } catch (error) {
    console.error('Error getting world state:', error);
    res.status(500).json({ error: 'Failed to get world state' });
  }
});

// GET /snapshot - Enhanced world snapshot with grounded context
app.get('/snapshot', (req, res) => {
  try {
    const stateId = `snapshot-${Date.now()}`;
    const snapshot = {
      stateId,
      position: {
        x: 100.0,
        y: 64.0,
        z: 100.0,
      },
      biome: 'plains',
      time: 6000, // Minecraft time (0-24000)
      light: 15,
      hazards: ['none'],
      nearbyEntities: [
        {
          id: 'entity-1',
          type: 'cow',
          position: { x: 105.0, y: 64.0, z: 100.0 },
          hostile: false,
        },
      ],
      nearbyBlocks: [
        {
          type: 'grass_block',
          position: { x: 100.0, y: 63.0, z: 100.0 },
          hardness: 0.6,
        },
      ],
      weather: 'clear',
    };

    res.json(snapshot);
  } catch (error) {
    console.error('Error getting world snapshot:', error);
    res.status(500).json({ error: 'Failed to get world snapshot' });
  }
});

// GET /inventory - Enhanced inventory with versioning
app.get('/inventory', (req, res) => {
  try {
    const stateId = `inventory-${Date.now()}`;
    const inventory = {
      stateId,
      items: [
        {
          id: 'item-1',
          name: 'wooden_pickaxe',
          quantity: 1,
          durability: 59,
        },
        {
          id: 'item-2',
          name: 'oak_log',
          quantity: 8,
        },
      ],
      armor: [
        {
          slot: 'head',
          item: {
            id: 'item-3',
            name: 'leather_helmet',
            quantity: 1,
            durability: 55,
          },
        },
      ],
      tools: [
        {
          type: 'pickaxe',
          item: {
            id: 'item-1',
            name: 'wooden_pickaxe',
            quantity: 1,
            durability: 59,
          },
        },
      ],
    };

    res.json(inventory);
  } catch (error) {
    console.error('Error getting inventory:', error);
    res.status(500).json({ error: 'Failed to get inventory' });
  }
});

// GET /waypoints - Get known waypoints
app.get('/waypoints', (req, res) => {
  try {
    const waypoints = [
      {
        name: 'spawn',
        pos: { x: 100.0, y: 64.0, z: 100.0 },
        kind: 'spawn',
      },
      {
        name: 'mine_entrance',
        pos: { x: 120.0, y: 64.0, z: 100.0 },
        kind: 'mine',
      },
    ];

    res.json(waypoints);
  } catch (error) {
    console.error('Error getting waypoints:', error);
    res.status(500).json({ error: 'Failed to get waypoints' });
  }
});

// Get bot position and environment data (legacy endpoint)
app.get('/bot-state', (req, res) => {
  try {
    const botState = {
      position: {
        x: 100.0,
        y: 64.0,
        z: 100.0,
      },
      orientation: {
        yaw: 0.0,
        pitch: 0.0,
      },
      health: 20,
      hunger: 20,
      environment: {
        time: 6000, // Minecraft time (0-24000)
        lightLevel: 15,
        weather: 'clear',
        biome: 'plains',
      },
      inventory: {
        items: [],
        selectedSlot: 0,
      },
      movement: {
        onGround: true,
        velocity: { x: 0, y: 0, z: 0 },
      },
    };

    res.json(botState);
  } catch (error) {
    console.error('Error getting bot state:', error);
    res.status(500).json({ error: 'Failed to get bot state' });
  }
});

// Get bot state
app.get('/bot-state/:botId?', (req, res) => {
  try {
    const botId = req.params.botId || 'default';
    const botState = botStates.get(botId);

    if (!botState) {
      return res.status(404).json({ error: `Bot ${botId} not found` });
    }

    res.json({
      botId: botState.id,
      position: botState.position,
      health: botState.health,
      hunger: botState.hunger,
      inventory: botState.inventory,
      connected: botState.connected,
      lastUpdated: botState.lastUpdated,
    });
  } catch (error) {
    console.error('Error getting bot state:', error);
    res.status(500).json({ error: 'Failed to get bot state' });
  }
});

// Update bot position
app.post('/bot-position', (req, res) => {
  try {
    const { botId = 'default', x, y, z } = req.body;

    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof z !== 'number'
    ) {
      return res.status(400).json({
        error: 'Invalid position coordinates. x, y, z must be numbers.',
      });
    }

    // Update bot state with new position
    const currentBotState = botStates.get(botId);
    const newPosition = { x, y, z };

    if (currentBotState) {
      // Update existing bot state
      currentBotState.position = newPosition;
      currentBotState.lastUpdated = Date.now();
    } else {
      // Create new bot state
      const newBotState: BotState = {
        id: botId,
        position: newPosition,
        health: 20,
        hunger: 20,
        inventory: [],
        connected: true,
        lastUpdated: Date.now(),
      };
      botStates.set(botId, newBotState);
    }

    // Update world state with bot position
    if (!currentWorldState.player) {
      currentWorldState.player = {};
    }
    currentWorldState.player.position = newPosition;

    // Update navigation state
    if (!currentWorldState.navigation) {
      currentWorldState.navigation = {};
    }
    currentWorldState.navigation.pathfindingActive = true;

    // Emit position update event
    worldStateEmitter.emit('position-updated', {
      botId,
      position: newPosition,
      timestamp: Date.now(),
    });

    const result = {
      updated: true,
      position: newPosition,
      botId,
      timestamp: Date.now(),
      botState: botStates.get(botId),
    };

    console.log(`🤖 Bot ${botId} position updated to (${x}, ${y}, ${z})`);
    res.json(result);
  } catch (error) {
    console.error('Error updating bot position:', error);
    res.status(500).json({ error: 'Failed to update bot position' });
  }
});

// Get telemetry data
app.get('/telemetry', (req, res) => {
  try {
    // Calculate bot connection status
    const connectedBots = Array.from(botStates.values()).filter(
      (bot) => bot.connected
    );
    const activeBots = connectedBots.length;

    // Check system activity
    const navigationActive =
      currentWorldState.navigation?.pathfindingActive || false;
    const perceptionActive = currentWorldState.perception?.perceptionQuality
      ? currentWorldState.perception.perceptionQuality > 0
      : false;
    const motorControlActive =
      currentWorldState.sensorimotor?.motorControlActive || false;

    const telemetry = {
      events: [
        {
          id: `world-${Date.now()}`,
          timestamp: Date.now(),
          source: 'world-system',
          type: 'world_state',
          data: {
            navigationActive,
            perceptionActive,
            motorControlActive,
            botConnections: {
              total: botStates.size,
              active: activeBots,
              bots: Array.from(botStates.values()).map((bot) => ({
                id: bot.id,
                position: bot.position,
                health: bot.health,
                connected: bot.connected,
              })),
            },
            metrics: {
              activeProcesses: activeBots,
              memoryUsage: process.memoryUsage(),
              uptime: process.uptime(),
              navigationActive,
              perceptionActive,
              motorControlActive,
            },
          },
        },
      ],
    };

    res.json(telemetry);
  } catch (error) {
    console.error('Error getting world telemetry:', error);
    res.status(500).json({ error: 'Failed to get telemetry' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`World system server running on port ${port}`);
});
