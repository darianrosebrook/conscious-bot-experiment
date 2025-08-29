/**
 * Mock Minecraft Server for Testing
 *
 * Provides a mock HTTP server that simulates the minecraft interface API
 * for comprehensive end-to-end testing without requiring actual Minecraft.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import { Server } from 'http';

export interface MockMinecraftState {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  inventory: Array<{ name: string; count: number }>;
  time: number;
  weather: string;
  connected: boolean;
}

export interface MockWorldBlock {
  position: { x: number; y: number; z: number };
  type: string;
  harvestable: boolean;
}

export class MockMinecraftServer {
  private app: express.Application;
  private server: Server | null = null;
  private port: number;
  private state: MockMinecraftState;
  private world: Map<string, MockWorldBlock>;
  private chatHistory: Array<{
    timestamp: number;
    message: string;
    sender: string;
  }> = [];

  constructor(port: number = 3005) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());

    // Initialize mock state
    this.state = {
      position: { x: 0, y: 64, z: 0 },
      health: 20,
      food: 20,
      inventory: [
        { name: 'oak_log', count: 5 },
        { name: 'stick', count: 2 },
      ],
      time: 1000,
      weather: 'clear',
      connected: true,
    };

    // Initialize mock world with some blocks
    this.world = new Map();
    this.initializeWorld();
    this.setupRoutes();
  }

  private initializeWorld(): void {
    // Add some blocks around the spawn area
    const blocks = [
      { pos: { x: 0, y: 63, z: 0 }, type: 'stone', harvestable: true },
      { pos: { x: 1, y: 63, z: 0 }, type: 'stone', harvestable: true },
      { pos: { x: -1, y: 63, z: 0 }, type: 'stone', harvestable: true },
      { pos: { x: 0, y: 63, z: 1 }, type: 'coal_ore', harvestable: true },
      { pos: { x: 0, y: 63, z: -1 }, type: 'iron_ore', harvestable: true },
      { pos: { x: 2, y: 64, z: 0 }, type: 'oak_log', harvestable: true },
      { pos: { x: -2, y: 64, z: 0 }, type: 'oak_log', harvestable: true },
    ];

    blocks.forEach((block) => {
      const key = `${block.pos.x},${block.pos.y},${block.pos.z}`;
      this.world.set(key, {
        position: block.pos,
        type: block.type,
        harvestable: block.harvestable,
      });
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', connected: this.state.connected });
    });

    // Get game state
    this.app.get('/state', (req, res) => {
      res.json(this.state);
    });

    // Get inventory
    this.app.get('/inventory', (req, res) => {
      res.json({ inventory: this.state.inventory });
    });

    // Execute actions
    this.app.post('/action', (req, res) => {
      const { type, parameters } = req.body;

      try {
        const result = this.executeAction(type, parameters);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Get chat history
    this.app.get('/chat', (req, res) => {
      res.json({ chatHistory: this.chatHistory });
    });

    // Connect endpoint
    this.app.post('/connect', (req, res) => {
      this.state.connected = true;
      res.json({ success: true, message: 'Connected to mock server' });
    });

    // Disconnect endpoint
    this.app.post('/disconnect', (req, res) => {
      this.state.connected = false;
      res.json({ success: true, message: 'Disconnected from mock server' });
    });
  }

  private executeAction(type: string, parameters: any): any {
    if (!this.state.connected) {
      throw new Error('Not connected to server');
    }

    switch (type) {
      case 'move_forward':
        return this.moveForward(parameters.distance || 1);

      case 'turn_left':
        return this.turnLeft(parameters.angle || 90);

      case 'turn_right':
        return this.turnRight(parameters.angle || 90);

      case 'jump':
        return this.jump();

      case 'chat':
        return this.sendChat(parameters.message || 'Hello!');

      case 'can_craft':
        return this.canCraftItem(parameters.item);

      case 'craft_item':
        return this.craftItem(parameters.item, parameters.quantity || 1);

      case 'mine_block':
        return this.mineBlock(parameters.position);

      case 'place_block':
        return this.placeBlock(parameters.position, parameters.blockType);

      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  private moveForward(distance: number): any {
    // Validate distance
    if (distance <= 0) {
      return {
        success: false,
        error: 'Distance must be positive',
        distance: 0,
      };
    }

    // Check if movement is blocked
    const newPosition = {
      ...this.state.position,
      z: this.state.position.z + distance,
    };
    const blockKey = `${newPosition.x},${newPosition.y},${newPosition.z}`;
    const blockingBlock = this.world.get(blockKey);

    if (blockingBlock && blockingBlock.type !== 'air') {
      return {
        success: false,
        error: `Movement blocked by ${blockingBlock.type}`,
        distance: 0,
        blockedBy: blockingBlock.type,
      };
    }

    // Update position
    this.state.position = newPosition;
    return {
      success: true,
      distance,
      newPosition: { ...this.state.position },
      message: `Moved forward ${distance} blocks`,
    };
  }

  private turnLeft(angle: number): any {
    return { success: true, angle, direction: 'left' };
  }

  private turnRight(angle: number): any {
    return { success: true, angle, direction: 'right' };
  }

  private jump(): any {
    return { success: true, action: 'jump' };
  }

  private sendChat(message: string): any {
    const chatMessage = {
      timestamp: Date.now(),
      message,
      sender: 'TestBot',
    };
    this.chatHistory.push(chatMessage);

    // Keep only last 100 messages
    if (this.chatHistory.length > 100) {
      this.chatHistory = this.chatHistory.slice(-100);
    }

    return { success: true, message };
  }

  private canCraftItem(itemName: string): any {
    const recipes: Record<
      string,
      { materials: Record<string, number>; result: string }
    > = {
      wooden_pickaxe: {
        materials: { oak_log: 3, stick: 2 },
        result: 'wooden_pickaxe',
      },
      stick: {
        materials: { oak_log: 1 },
        result: 'stick',
      },
      crafting_table: {
        materials: { oak_log: 4 },
        result: 'crafting_table',
      },
    };

    const recipe = recipes[itemName];
    if (!recipe) {
      return {
        success: true,
        canCraft: false,
        error: `No recipe found for ${itemName}`,
      };
    }

    // Check if we have the required materials
    const canCraft = Object.entries(recipe.materials).every(
      ([material, required]) => {
        const inventoryItem = this.state.inventory.find(
          (item) => item.name === material
        );
        return inventoryItem && inventoryItem.count >= required;
      }
    );

    return {
      success: true,
      canCraft,
      item: itemName,
      hasRecipe: true,
      requiresMaterials: !canCraft,
      requiredMaterials: recipe.materials,
    };
  }

  private craftItem(itemName: string, quantity: number): any {
    const canCraftResult = this.canCraftItem(itemName);

    if (!canCraftResult.canCraft) {
      return {
        success: false,
        error: `Cannot craft ${itemName}: ${canCraftResult.error || 'Insufficient materials'}`,
      };
    }

    // Consume materials from inventory
    const recipe = canCraftResult.requiredMaterials;
    Object.entries(recipe).forEach(([material, required]) => {
      const inventoryItem = this.state.inventory.find(
        (item) => item.name === material
      );
      if (inventoryItem) {
        inventoryItem.count -= (required as number) * quantity;
        if (inventoryItem.count <= 0) {
          this.state.inventory = this.state.inventory.filter(
            (item) => item !== inventoryItem
          );
        }
      }
    });

    // Add crafted item to inventory
    const existingItem = this.state.inventory.find(
      (item) => item.name === itemName
    );
    if (existingItem) {
      existingItem.count += quantity;
    } else {
      this.state.inventory.push({ name: itemName, count: quantity });
    }

    return {
      success: true,
      item: itemName,
      quantity,
      crafted: true,
    };
  }

  private mineBlock(position: { x: number; y: number; z: number }): any {
    const key = `${position.x},${position.y},${position.z}`;
    const block = this.world.get(key);

    if (!block) {
      return {
        success: false,
        error: `No block found at position ${position.x}, ${position.y}, ${position.z}`,
      };
    }

    if (!block.harvestable) {
      return {
        success: false,
        error: `Block ${block.type} at position ${position.x}, ${position.y}, ${position.z} is not harvestable`,
      };
    }

    // Remove block from world
    this.world.delete(key);

    // Add block to inventory
    const existingItem = this.state.inventory.find(
      (item) => item.name === block.type
    );
    if (existingItem) {
      existingItem.count += 1;
    } else {
      this.state.inventory.push({ name: block.type, count: 1 });
    }

    return {
      success: true,
      block: block.type,
      position,
      harvested: true,
    };
  }

  private placeBlock(
    position: { x: number; y: number; z: number },
    blockType: string
  ): any {
    // Validate position
    if (
      !position ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      typeof position.z !== 'number'
    ) {
      return {
        success: false,
        error: 'Invalid position provided',
      };
    }

    // Validate block type
    if (!blockType || typeof blockType !== 'string') {
      return {
        success: false,
        error: 'Invalid block type provided',
      };
    }

    // Check if we have the block in inventory
    const inventoryItem = this.state.inventory.find(
      (item) => item.name === blockType
    );
    if (!inventoryItem || inventoryItem.count <= 0) {
      return {
        success: false,
        error: `No ${blockType} found in inventory`,
        required: blockType,
        available: this.state.inventory.map((item) => item.name),
      };
    }

    // Check if position is already occupied
    const key = `${position.x},${position.y},${position.z}`;
    if (this.world.has(key)) {
      const existingBlock = this.world.get(key);
      return {
        success: false,
        error: `Position ${position.x}, ${position.y}, ${position.z} is already occupied by ${existingBlock?.type}`,
        position,
        existingBlock: existingBlock?.type,
      };
    }

    // Remove block from inventory
    inventoryItem.count -= 1;
    if (inventoryItem.count <= 0) {
      this.state.inventory = this.state.inventory.filter(
        (item) => item !== inventoryItem
      );
    }

    // Place block in world
    this.world.set(key, {
      position,
      type: blockType,
      harvestable: true,
    });

    return {
      success: true,
      block: blockType,
      position,
      placed: true,
      message: `Placed ${blockType} at ${position.x}, ${position.y}, ${position.z}`,
    };
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(` Mock Minecraft server running on port ${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log(' Mock Minecraft server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getState(): MockMinecraftState {
    return { ...this.state };
  }

  public setState(newState: Partial<MockMinecraftState>): void {
    this.state = { ...this.state, ...newState };
  }

  public getWorld(): Map<string, MockWorldBlock> {
    return new Map(this.world);
  }

  public addBlock(
    position: { x: number; y: number; z: number },
    type: string,
    harvestable: boolean = true
  ): void {
    const key = `${position.x},${position.y},${position.z}`;
    this.world.set(key, { position, type, harvestable });
  }

  public removeBlock(position: { x: number; y: number; z: number }): boolean {
    const key = `${position.x},${position.y},${position.z}`;
    return this.world.delete(key);
  }

  public getChatHistory(): Array<{
    timestamp: number;
    message: string;
    sender: string;
  }> {
    return [...this.chatHistory];
  }

  public clearChatHistory(): void {
    this.chatHistory = [];
  }
}
