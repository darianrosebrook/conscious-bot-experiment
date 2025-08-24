'use strict';
/**
 * Simplified Standalone Minecraft Interface
 *
 * A minimal version for testing basic Minecraft connectivity
 * without any planning system dependencies.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.DEFAULT_SIMPLE_CONFIG = exports.SimpleMinecraftInterface = void 0;
exports.createSimpleMinecraftInterface = createSimpleMinecraftInterface;
const mineflayer_1 = require('mineflayer');
const events_1 = require('events');
class SimpleMinecraftInterface extends events_1.EventEmitter {
  constructor(config) {
    super();
    this.bot = null;
    this.isConnected = false;
    this.config = config;
  }
  /**
   * Connect to Minecraft server
   */
  async connect() {
    if (this.bot) {
      throw new Error('Already connected');
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);
      this.bot = (0, mineflayer_1.createBot)({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        version: this.config.version,
        auth: this.config.auth || 'offline',
      });
      this.bot.once('login', () => {
        clearTimeout(timeoutId);
        console.log(' Logged in to Minecraft server');
      });
      this.bot.once('spawn', () => {
        this.isConnected = true;
        console.log(' Spawned in world');
        this.emit('connected');
        resolve();
      });
      this.bot.once('error', (error) => {
        clearTimeout(timeoutId);
        console.error(' Connection error:', error.message);
        reject(error);
      });
      this.bot.once('end', (reason) => {
        this.isConnected = false;
        console.log(' Disconnected:', reason);
        this.emit('disconnected', reason);
      });
    });
  }
  /**
   * Disconnect from server
   */
  async disconnect() {
    if (this.bot) {
      this.bot.quit();
      this.bot = null;
      this.isConnected = false;
      console.log(' Disconnected from server');
    }
  }
  /**
   * Get current game state
   */
  async getGameState() {
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
  async executeAction(action) {
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
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      console.error(` Action ${action.type} failed:`, error);
      throw error;
    }
  }
  /**
   * Move forward
   */
  async moveForward(distance) {
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
  async turnLeft(angle) {
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
  async turnRight(angle) {
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
  async jump() {
    if (!this.bot) throw new Error('Bot not connected');
    this.bot.setControlState('jump', true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.bot.setControlState('jump', false);
    return { success: true };
  }
  /**
   * Send chat message
   */
  async sendChat(message) {
    if (!this.bot) throw new Error('Bot not connected');
    this.bot.chat(message);
    return { success: true, message };
  }
  /**
   * Check if connected
   */
  get connected() {
    return this.isConnected;
  }
  /**
   * Get bot instance
   */
  get botInstance() {
    return this.bot;
  }
}
exports.SimpleMinecraftInterface = SimpleMinecraftInterface;
/**
 * Create a simple Minecraft interface
 */
function createSimpleMinecraftInterface(config) {
  return new SimpleMinecraftInterface(config);
}
/**
 * Default configuration
 */
exports.DEFAULT_SIMPLE_CONFIG = {
  host: 'localhost',
  port: 58897,
  username: 'SimpleBot',
  version: '1.21.4',
  auth: 'offline',
};
