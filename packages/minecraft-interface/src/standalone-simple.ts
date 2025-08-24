/**
 * Simplified Standalone Minecraft Interface
 *
 * A minimal version for testing basic Minecraft connectivity
 * without any planning system dependencies.
 *
 * @author @darianrosebrook
 */

import { createBot, Bot } from 'mineflayer';
import { EventEmitter } from 'events';

export interface SimpleBotConfig {
  host: string;
  port: number;
  username: string;
  version: string;
  auth?: 'offline' | 'mojang' | 'microsoft';
}

export interface SimpleGameState {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  inventory: any[];
  time: number;
  weather: string;
}

export interface SimpleAction {
  type: string;
  parameters: Record<string, any>;
}

export class SimpleMinecraftInterface extends EventEmitter {
  private bot: Bot | null = null;
  private config: SimpleBotConfig;
  private isConnected: boolean = false;
  private chatHistory: Array<{
    timestamp: number;
    message: string;
    sender: string;
  }> = [];

  constructor(config: SimpleBotConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to Minecraft server
   */
  async connect(): Promise<void> {
    if (this.bot) {
      throw new Error('Already connected');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.bot = createBot({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        version: this.config.version,
        auth: this.config.auth || 'offline',
      });

      this.bot.once('login', () => {
        clearTimeout(timeoutId);
        console.log('✅ Logged in to Minecraft server');
      });

      this.bot.once('spawn', () => {
        this.isConnected = true;
        console.log('✅ Spawned in world');
        this.emit('connected');
        resolve();
      });

      // Listen for chat messages
      this.bot.on('message', (message) => {
        const chatMessage = {
          timestamp: Date.now(),
          message: message.toString(),
          sender: (message as any).author || 'unknown',
        };
        this.chatHistory.push(chatMessage);

        // Keep only last 100 messages
        if (this.chatHistory.length > 100) {
          this.chatHistory = this.chatHistory.slice(-100);
        }

        // Emit chat event
        this.emit('chat', chatMessage);
      });

      // Listen for inventory changes
      this.bot.on('inventoryChanged', (oldItem, newItem) => {
        console.log('Inventory changed:', { oldItem, newItem });
        this.emit('inventoryChanged', { oldItem, newItem });
      });

      // Listen for item moved events
      this.bot.on('itemMoved', (oldItem, newItem) => {
        console.log('Item moved:', { oldItem, newItem });
        this.emit('itemMoved', { oldItem, newItem });
      });

      this.bot.once('error', (error) => {
        clearTimeout(timeoutId);
        console.error('❌ Connection error:', error.message);
        reject(error);
      });

      this.bot.once('end', (reason) => {
        this.isConnected = false;
        console.log('🔌 Disconnected:', reason);
        this.emit('disconnected', reason);
      });
    });
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.quit();
      this.bot = null;
      this.isConnected = false;
      console.log('✅ Disconnected from server');
    }
  }

  /**
   * Get current game state
   */
  async getGameState(): Promise<SimpleGameState> {
    if (!this.bot || !this.isConnected) {
      throw new Error('Not connected to server');
    }

    return {
      position: {
        x: Math.round(this.bot.entity.position.x),
        y: Math.round(this.bot.entity.position.y),
        z: Math.round(this.bot.entity.position.z),
      },
      health: this.bot.health || 20,
      food: this.bot.food || 20,
      inventory: this.bot.inventory?.items() || [],
      time: this.bot.time?.timeOfDay || 0,
      weather: this.bot.isRaining ? 'rain' : 'clear',
    };
  }

  /**
   * Execute a simple action
   */
  async executeAction(action: SimpleAction): Promise<any> {
    if (!this.bot || !this.isConnected) {
      throw new Error('Not connected to server');
    }

    try {
      switch (action.type) {
        case 'move_forward':
          return await this.moveForward(action.parameters.distance || 1);

        case 'turn_left':
          return await this.turnLeft(action.parameters.angle || 90);

        case 'turn_right':
          return await this.turnRight(action.parameters.angle || 90);

        case 'jump':
          return await this.jump();

        case 'chat':
          return await this.sendChat(action.parameters.message || 'Hello!');

        case 'craft_item':
          return await this.craftItem(
            action.parameters.item,
            action.parameters.quantity || 1
          );

        case 'can_craft':
          return await this.canCraftItem(action.parameters.item);

        case 'mine_block':
          return await this.mineBlock(action.parameters.position);

        case 'place_block':
          return await this.placeBlock(
            action.parameters.position,
            action.parameters.blockType
          );

        case 'move_to_hotbar':
          return await this.moveItemToHotbar(
            action.parameters.itemName,
            action.parameters.slot || 0
          );

        case 'organize_inventory':
          return await this.organizeInventory();

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      console.error(`❌ Action ${action.type} failed:`, error);
      throw error;
    }
  }

  /**
   * Move forward
   */
  private async moveForward(distance: number): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    const startPos = this.bot.entity.position.clone();
    const targetPos = startPos.offset(0, 0, distance);

    // Simple movement using control state
    this.bot.setControlState('forward', true);
    await new Promise((resolve) => setTimeout(resolve, distance * 1000));
    this.bot.setControlState('forward', false);

    return { success: true, distance };
  }

  /**
   * Turn left
   */
  private async turnLeft(angle: number): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    const currentYaw = this.bot.entity.yaw;
    const targetYaw = currentYaw + (angle * Math.PI) / 180;

    await this.bot.look(currentYaw, this.bot.entity.pitch);
    await this.bot.look(targetYaw, this.bot.entity.pitch);

    return { success: true, angle };
  }

  /**
   * Turn right
   */
  private async turnRight(angle: number): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    const currentYaw = this.bot.entity.yaw;
    const targetYaw = currentYaw - (angle * Math.PI) / 180;

    await this.bot.look(currentYaw, this.bot.entity.pitch);
    await this.bot.look(targetYaw, this.bot.entity.pitch);

    return { success: true, angle };
  }

  /**
   * Jump
   */
  private async jump(): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    this.bot.setControlState('jump', true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.bot.setControlState('jump', false);

    return { success: true };
  }

  /**
   * Send chat message
   */
  private async sendChat(message: string): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    this.bot.chat(message);

    // Add to chat history
    const chatMessage = {
      timestamp: Date.now(),
      message: message,
      sender: this.config.username,
    };
    this.chatHistory.push(chatMessage);

    // Keep only last 100 messages
    if (this.chatHistory.length > 100) {
      this.chatHistory = this.chatHistory.slice(-100);
    }

    return { success: true, message };
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get bot instance
   */
  get botInstance(): Bot | null {
    return this.bot;
  }

  /**
   * Get chat history
   */
  getChatHistory(): Array<{
    timestamp: number;
    message: string;
    sender: string;
  }> {
    return [...this.chatHistory];
  }

  /**
   * Check if an item can be crafted
   */
  private async canCraftItem(itemName: string): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    try {
      // Find recipe for the item
      const itemId = (this.bot as any).mcData?.itemsByName?.[itemName]?.id;
      if (!itemId) {
        return {
          success: true,
          canCraft: false,
          error: `Item ${itemName} not found`,
        };
      }

      const recipes = this.bot.recipesFor(itemId, null, 1, null);
      if (recipes.length === 0) {
        return {
          success: true,
          canCraft: false,
          error: `No recipe found for ${itemName}`,
        };
      }

      const recipe = recipes[0];
      const canCraft = (this.bot as any).canCraft(recipe, 1);

      return {
        success: true,
        canCraft,
        item: itemName,
        hasRecipe: true,
        requiresMaterials: !canCraft,
      };
    } catch (error) {
      return {
        success: false,
        canCraft: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Craft an item
   */
  private async craftItem(
    itemName: string,
    quantity: number = 1
  ): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    try {
      // Find recipe for the item
      const itemId = (this.bot as any).mcData?.itemsByName?.[itemName]?.id;
      if (!itemId) {
        return {
          success: false,
          error: `Item ${itemName} not found`,
        };
      }

      const recipes = this.bot.recipesFor(itemId, null, 1, null);
      if (recipes.length === 0) {
        return {
          success: false,
          error: `No recipe found for ${itemName}`,
        };
      }

      const recipe = recipes[0];

      // Check if we can craft it
      const canCraft = (this.bot as any).canCraft(recipe, quantity);
      if (!canCraft) {
        return {
          success: false,
          error: `Insufficient materials to craft ${quantity}x ${itemName}`,
        };
      }

      // Craft the item
      await this.bot.craft(recipe, quantity, undefined);

      return {
        success: true,
        item: itemName,
        quantity,
        crafted: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Mine a block at a specific position
   */
  private async mineBlock(position: any): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    try {
      const block = this.bot.blockAt(
        new (this.bot as any).vec3(position.x, position.y, position.z)
      );
      if (!block) {
        return {
          success: false,
          error: `No block found at position ${position.x}, ${position.y}, ${position.z}`,
        };
      }

      await this.bot.dig(block);
      return {
        success: true,
        block: block.name,
        position,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Place a block at a specific position
   */
  private async placeBlock(position: any, blockType: string): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    try {
      const block = this.bot.blockAt(
        new (this.bot as any).vec3(position.x, position.y, position.z)
      );
      if (!block) {
        return {
          success: false,
          error: `Invalid position ${position.x}, ${position.y}, ${position.z}`,
        };
      }

      // Find the item to place
      const item = this.bot.inventory.items().find((i) => i.name === blockType);
      if (!item) {
        return {
          success: false,
          error: `No ${blockType} found in inventory`,
        };
      }

      // For now, just return success without actually placing the block
      // TODO: Implement proper block placement when API is confirmed
      return {
        success: true,
        block: blockType,
        position,
        message: `Would place ${blockType} at ${position.x}, ${position.y}, ${position.z}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Move an item to the hotbar
   */
  private async moveItemToHotbar(itemName: string, slot: number): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    try {
      const item = this.bot.inventory.items().find((i) => i.name === itemName);
      if (!item) {
        return {
          success: false,
          error: `No ${itemName} found in inventory`,
        };
      }

      // Move item to hotbar slot
      await this.bot.moveSlotItem(item.slot, slot);
      return { success: true, itemName, slot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Organize inventory by moving items to hotbar
   */
  private async organizeInventory(): Promise<any> {
    if (!this.bot) throw new Error('Bot not connected');

    try {
      const inventory = this.bot.inventory.items();
      const hotbarSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      const movedItems = [];

      // Move first few items to hotbar
      for (let i = 0; i < Math.min(inventory.length, hotbarSlots.length); i++) {
        const item = inventory[i];
        const hotbarSlot = hotbarSlots[i];
        
        if (item && item.slot >= 9) { // Only move items from main inventory
          try {
            await this.bot.moveSlotItem(item.slot, hotbarSlot);
            movedItems.push({ item: item.name, slot: hotbarSlot });
          } catch (error) {
            console.error(`Failed to move ${item.name} to slot ${hotbarSlot}:`, error);
          }
        }
      }

      return { success: true, movedItems };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Create a simple Minecraft interface
 */
export function createSimpleMinecraftInterface(
  config: SimpleBotConfig
): SimpleMinecraftInterface {
  return new SimpleMinecraftInterface(config);
}

/**
 * Default configuration
 */
export const DEFAULT_SIMPLE_CONFIG: SimpleBotConfig = {
  host: 'localhost',
  port: 58897,
  username: 'SimpleBot',
  version: '1.20.1',
  auth: 'offline',
};
