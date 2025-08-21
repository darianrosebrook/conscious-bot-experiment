/**
 * Simulation Stub for Offline Minecraft Testing
 *
 * Provides a mock Minecraft environment for testing without requiring
 * a real Minecraft server. This allows for rapid development and testing
 * of the interface logic.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

/**
 * Mock game state for simulation
 */
export interface SimulatedGameState {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  inventory: Array<{ id: string; count: number }>;
  blocks: Array<{ x: number; y: number; z: number; type: string }>;
  entities: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
  }>;
  time: number;
  weather: 'clear' | 'rain' | 'thunder';
}

/**
 * Simulation configuration
 */
export interface SimulationConfig {
  worldSize: { width: number; height: number; depth: number };
  initialPosition: { x: number; y: number; z: number };
  blockTypes: string[];
  entityTypes: string[];
  tickRate: number; // milliseconds
}

/**
 * Default simulation configuration
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
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
export class SimulatedMinecraftInterface extends EventEmitter {
  private config: SimulationConfig;
  private gameState: SimulatedGameState;
  private isConnected: boolean = false;
  private tickInterval?: NodeJS.Timeout;

  constructor(config: Partial<SimulationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SIMULATION_CONFIG, ...config };
    this.gameState = this.createInitialGameState();
  }

  /**
   * Create initial game state
   */
  private createInitialGameState(): SimulatedGameState {
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
  private generateRandomBlocks(): Array<{
    x: number;
    y: number;
    z: number;
    type: string;
  }> {
    const blocks: Array<{ x: number; y: number; z: number; type: string }> = [];

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
  private generateRandomEntities(): Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
  }> {
    const entities: Array<{
      id: string;
      type: string;
      position: { x: number; y: number; z: number };
    }> = [];

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
  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected to simulation');
    }

    console.log('🔌 Connecting to simulated Minecraft environment...');

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.isConnected = true;
    this.startSimulation();

    this.emit('connected');
    console.log('✅ Connected to simulation');
  }

  /**
   * Disconnect from the simulated environment
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    console.log('🔌 Disconnecting from simulation...');

    this.stopSimulation();
    this.isConnected = false;

    this.emit('disconnected');
    console.log('✅ Disconnected from simulation');
  }

  /**
   * Get current game state
   */
  async getGameState(): Promise<SimulatedGameState> {
    if (!this.isConnected) {
      throw new Error('Not connected to simulation');
    }

    return { ...this.gameState };
  }

  /**
   * Execute an action in the simulation
   */
  async executeAction(action: {
    type: string;
    parameters?: Record<string, any>;
  }): Promise<{ success: boolean; message: string; data?: any }> {
    if (!this.isConnected) {
      throw new Error('Not connected to simulation');
    }

    console.log(`🎯 Executing action: ${action.type}`, action.parameters);

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
  private executeMoveForward(distance: number): {
    success: boolean;
    message: string;
    data?: any;
  } {
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
  private executeTurnLeft(angle: number): {
    success: boolean;
    message: string;
    data?: any;
  } {
    return {
      success: true,
      message: `Turned left ${angle} degrees`,
      data: { angle },
    };
  }

  /**
   * Execute turn right action
   */
  private executeTurnRight(angle: number): {
    success: boolean;
    message: string;
    data?: any;
  } {
    return {
      success: true,
      message: `Turned right ${angle} degrees`,
      data: { angle },
    };
  }

  /**
   * Execute jump action
   */
  private executeJump(): { success: boolean; message: string; data?: any } {
    return {
      success: true,
      message: 'Jumped!',
      data: { height: 1 },
    };
  }

  /**
   * Execute chat action
   */
  private executeChat(message: string): {
    success: boolean;
    message: string;
    data?: any;
  } {
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
  private executeMineBlock(position?: { x: number; y: number; z: number }): {
    success: boolean;
    message: string;
    data?: any;
  } {
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
  private executePlaceBlock(
    position?: { x: number; y: number; z: number },
    blockType?: string
  ): { success: boolean; message: string; data?: any } {
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
  private startSimulation(): void {
    this.tickInterval = setInterval(() => {
      this.gameState.time++;

      // Simulate some world changes
      if (this.gameState.time % 100 === 0) {
        this.gameState.weather = this.config.blockTypes[
          Math.floor(Math.random() * 3)
        ] as 'clear' | 'rain' | 'thunder';
      }

      this.emit('tick', this.gameState);
    }, this.config.tickRate);
  }

  /**
   * Stop the simulation tick loop
   */
  private stopSimulation(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }

  /**
   * Get simulation statistics
   */
  getSimulationStats(): {
    connected: boolean;
    worldSize: { width: number; height: number; depth: number };
    blockCount: number;
    entityCount: number;
    time: number;
  } {
    return {
      connected: this.isConnected,
      worldSize: this.config.worldSize,
      blockCount: this.gameState.blocks.length,
      entityCount: this.gameState.entities.length,
      time: this.gameState.time,
    };
  }
}

/**
 * Factory function to create a simulated Minecraft interface
 */
export function createSimulatedMinecraftInterface(
  config?: Partial<SimulationConfig>
): SimulatedMinecraftInterface {
  return new SimulatedMinecraftInterface(config);
}
