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
  } catch (error) {
    console.error('Failed to fetch world state from planning server:', error);
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

// Start polling for world state updates
setInterval(updateWorldState, 5000); // Poll every 5 seconds

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

// Update bot position
app.post('/bot-position', (req, res) => {
  try {
    const { x, y, z } = req.body;

    // TODO: Implement actual position update logic with bot state management
    const result = {
      updated: true,
      position: { x, y, z },
      timestamp: Date.now(),
    };

    res.json(result);
  } catch (error) {
    console.error('Error updating bot position:', error);
    res.status(500).json({ error: 'Failed to update bot position' });
  }
});

// Get telemetry data
app.get('/telemetry', (req, res) => {
  try {
    const telemetry = {
      events: [
        {
          id: `world-${Date.now()}`,
          timestamp: Date.now(),
          source: 'world-system',
          type: 'world_state',
          data: {
            navigationActive: false, // TODO: Connect to actual navigation system
            perceptionActive: true, // TODO: Connect to actual perception system
            motorControlActive: false, // TODO: Connect to actual sensorimotor system
            metrics: {
              activeProcesses: 0,
              memoryUsage: process.memoryUsage(),
              uptime: process.uptime(),
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
