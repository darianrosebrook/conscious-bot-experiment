'use strict';
/**
 * Simulation Stub for Offline Minecraft Testing
 *
 * Provides a mock Minecraft environment for testing without requiring
 * a real Minecraft server. This allows for rapid development and testing
 * of the interface logic.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.SimulatedMinecraftInterface = exports.DEFAULT_SIMULATION_CONFIG =
  void 0;
exports.createSimulatedMinecraftInterface = createSimulatedMinecraftInterface;
const events_1 = require('events');
/**
 * Default simulation configuration
 */
exports.DEFAULT_SIMULATION_CONFIG = {
  worldSize: { width: 100, height: 64, depth: 100 },
  initialPosition: { x: 50, y: 64, z: 50 },
  blockTypes: ['stone', 'dirt', 'grass', 'wood', 'leaves', 'water', 'air'],
  entityTypes: ['player', 'zombie', 'skeleton', 'cow', 'pig', 'chicken'],
  tickRate: 50,
};
/**
 * Simulated Minecraft Interface
 *
 * Provides the same interface as the real Minecraft interface
 * but operates in a simulated environment.
 */
class SimulatedMinecraftInterface extends events_1.EventEmitter {
  constructor(config = {}) {
    super();
    this.isConnected = false;
    this.config = { ...exports.DEFAULT_SIMULATION_CONFIG, ...config };
    this.gameState = this.createInitialGameState();
  }
  /**
   * Create initial game state
   */
  createInitialGameState() {
    return {
      position: { ...this.config.initialPosition },
      health: 20,
      food: 20,
      inventory: [],
      blocks: this.generateRandomBlocks(),
      entities: this.generateRandomEntities(),
      time: 0,
      weather: 'clear',
    };
  }
  /**
   * Generate random blocks in the world
   */
  generateRandomBlocks() {
    const blocks = [];
    // Generate ground level
    for (let x = 0; x < this.config.worldSize.width; x += 2) {
      for (let z = 0; z < this.config.worldSize.depth; z += 2) {
        const y = Math.floor(Math.random() * 10) + 60;
        const type =
          this.config.blockTypes[
            Math.floor(Math.random() * this.config.blockTypes.length)
          ];
        blocks.push({ x, y, z, type });
      }
    }
    return blocks;
  }
  /**
   * Generate random entities
   */
  generateRandomEntities() {
    const entities = [];
    for (let i = 0; i < 5; i++) {
      const type =
        this.config.entityTypes[
          Math.floor(Math.random() * this.config.entityTypes.length)
        ];
      const x = Math.floor(Math.random() * this.config.worldSize.width);
      const y = this.config.initialPosition.y;
      const z = Math.floor(Math.random() * this.config.worldSize.depth);
      entities.push({ id: `entity_${i}`, type, position: { x, y, z } });
    }
    return entities;
  }
  /**
   * Connect to the simulated environment
   */
  async connect() {
    if (this.isConnected) {
      throw new Error('Already connected to simulation');
    }
    console.log(' Connecting to simulated Minecraft environment...');
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.isConnected = true;
    this.startSimulation();
    this.emit('connected');
    console.log(' Connected to simulation');
  }
  /**
   * Disconnect from the simulated environment
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }
    console.log(' Disconnecting from simulation...');
    this.stopSimulation();
    this.isConnected = false;
    this.emit('disconnected');
    console.log(' Disconnected from simulation');
  }
  /**
   * Get current game state
   */
  async getGameState() {
    if (!this.isConnected) {
      throw new Error('Not connected to simulation');
    }
    return { ...this.gameState };
  }
  /**
   * Execute an action in the simulation
   */
  async executeAction(action) {
    if (!this.isConnected) {
      throw new Error('Not connected to simulation');
    }
    console.log(` Executing action: ${action.type}`, action.parameters);
    try {
      switch (action.type) {
        case 'move_forward':
          return this.executeMoveForward(action.parameters?.distance ?? 1);
        case 'turn_left':
          return this.executeTurnLeft(action.parameters?.angle ?? 90);
        case 'turn_right':
          return this.executeTurnRight(action.parameters?.angle ?? 90);
        case 'jump':
          return this.executeJump();
        case 'chat':
          return this.executeChat(action.parameters?.message ?? 'Hello!');
        case 'mine_block':
          return this.executeMineBlock(action.parameters?.position);
        case 'place_block':
          return this.executePlaceBlock(
            action.parameters?.position,
            action.parameters?.blockType
          );
        default:
          return {
            success: false,
            message: `Unknown action type: ${action.type}`,
          };
      }
    } catch (error) {
      return { success: false, message: `Action failed: ${error}` };
    }
  }
  /**
   * Execute move forward action
   */
  executeMoveForward(distance) {
    const newX = this.gameState.position.x + distance;
    if (newX >= 0 && newX < this.config.worldSize.width) {
      this.gameState.position.x = newX;
      return {
        success: true,
        message: `Moved forward ${distance} blocks`,
        data: { newPosition: this.gameState.position },
      };
    }
    return { success: false, message: 'Cannot move outside world boundaries' };
  }
  /**
   * Execute turn left action
   */
  executeTurnLeft(angle) {
    return {
      success: true,
      message: `Turned left ${angle} degrees`,
      data: { angle },
    };
  }
  /**
   * Execute turn right action
   */
  executeTurnRight(angle) {
    return {
      success: true,
      message: `Turned right ${angle} degrees`,
      data: { angle },
    };
  }
  /**
   * Execute jump action
   */
  executeJump() {
    return {
      success: true,
      message: 'Jumped!',
      data: { height: 1 },
    };
  }
  /**
   * Execute chat action
   */
  executeChat(message) {
    this.emit('chat', message);
    return {
      success: true,
      message: `Sent chat message: "${message}"`,
      data: { message },
    };
  }
  /**
   * Execute mine block action
   */
  executeMineBlock(position) {
    const targetPos = position ?? this.gameState.position;
    // Find block at position
    const blockIndex = this.gameState.blocks.findIndex(
      (block) =>
        block.x === targetPos.x &&
        block.y === targetPos.y &&
        block.z === targetPos.z
    );
    if (blockIndex >= 0) {
      const block = this.gameState.blocks[blockIndex];
      this.gameState.blocks.splice(blockIndex, 1);
      // Add to inventory
      this.gameState.inventory.push({ id: block.type, count: 1 });
      return {
        success: true,
        message: `Mined ${block.type} block`,
        data: { blockType: block.type, inventory: this.gameState.inventory },
      };
    }
    return { success: false, message: 'No block found at position' };
  }
  /**
   * Execute place block action
   */
  executePlaceBlock(position, blockType) {
    const targetPos = position ?? this.gameState.position;
    const type = blockType ?? 'stone';
    // Check if we have the block in inventory
    const inventoryIndex = this.gameState.inventory.findIndex(
      (item) => item.id === type
    );
    if (inventoryIndex >= 0) {
      // Remove from inventory
      this.gameState.inventory[inventoryIndex].count--;
      if (this.gameState.inventory[inventoryIndex].count <= 0) {
        this.gameState.inventory.splice(inventoryIndex, 1);
      }
      // Add block to world
      this.gameState.blocks.push({
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        type,
      });
      return {
        success: true,
        message: `Placed ${type} block`,
        data: { blockType: type, position: targetPos },
      };
    }
    return { success: false, message: `No ${type} blocks in inventory` };
  }
  /**
   * Start the simulation tick loop
   */
  startSimulation() {
    this.tickInterval = setInterval(() => {
      this.gameState.time++;
      // Simulate some world changes
      if (this.gameState.time % 100 === 0) {
        this.gameState.weather =
          this.config.blockTypes[Math.floor(Math.random() * 3)];
      }
      this.emit('tick', this.gameState);
    }, this.config.tickRate);
  }
  /**
   * Stop the simulation tick loop
   */
  stopSimulation() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }
  /**
   * Get simulation statistics
   */
  getSimulationStats() {
    return {
      connected: this.isConnected,
      worldSize: this.config.worldSize,
      blockCount: this.gameState.blocks.length,
      entityCount: this.gameState.entities.length,
      time: this.gameState.time,
    };
  }
}
exports.SimulatedMinecraftInterface = SimulatedMinecraftInterface;
/**
 * Factory function to create a simulated Minecraft interface
 */
function createSimulatedMinecraftInterface(config) {
  return new SimulatedMinecraftInterface(config);
}
//# sourceMappingURL=simulation-stub.js.map
