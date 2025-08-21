/**
 * Standalone Minecraft Interface
 *
 * A simplified version of the Minecraft interface that doesn't require
 * the full planning system integration. Useful for testing and development.
 *
 * @author @darianrosebrook
 */

import { BotAdapter } from './bot-adapter';
import { ObservationMapper } from './observation-mapper';
import { ActionTranslator } from './action-translator';
import { BotConfig } from './types';

export interface StandaloneMinecraftInterface {
  botAdapter: BotAdapter;
  observationMapper: ObservationMapper;
  actionTranslator: ActionTranslator;
  isConnected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getGameState(): Promise<any>;
  executeAction(action: any): Promise<any>;
}

export class StandaloneMinecraftInterface
  implements StandaloneMinecraftInterface
{
  public botAdapter: BotAdapter;
  public observationMapper: ObservationMapper;
  public actionTranslator: ActionTranslator;
  public isConnected: boolean = false;

  constructor(config: BotConfig) {
    this.botAdapter = new BotAdapter(config);
    this.observationMapper = new ObservationMapper(config);
    this.actionTranslator = new ActionTranslator(config);
  }

  /**
   * Connect to Minecraft server
   */
  async connect(): Promise<void> {
    try {
      await this.botAdapter.connect();
      this.isConnected = true;
      console.log('✅ Connected to Minecraft server');
    } catch (error) {
      console.error('❌ Failed to connect to Minecraft server:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Minecraft server
   */
  async disconnect(): Promise<void> {
    try {
      await this.botAdapter.disconnect();
      this.isConnected = false;
      console.log('✅ Disconnected from Minecraft server');
    } catch (error) {
      console.error('❌ Error disconnecting from Minecraft server:', error);
      throw error;
    }
  }

  /**
   * Get current game state
   */
  async getGameState(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to Minecraft server');
    }

    try {
      const gameState = await this.botAdapter.getGameState();
      return gameState;
    } catch (error) {
      console.error('❌ Error getting game state:', error);
      throw error;
    }
  }

  /**
   * Execute a single action
   */
  async executeAction(action: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to Minecraft server');
    }

    try {
      const commands = this.actionTranslator.translateActionToCommands(action);
      const results = [];

      for (const command of commands) {
        const result = await this.botAdapter.executeCommand(command);
        results.push(result);
      }

      return {
        action,
        commands,
        results,
        success: results.every((r) => r.success),
      };
    } catch (error) {
      console.error('❌ Error executing action:', error);
      throw error;
    }
  }

  /**
   * Get cognitive context from current game state
   */
  async getCognitiveContext(): Promise<any> {
    const gameState = await this.getGameState();
    return this.observationMapper.mapGameStateToContext(gameState);
  }

  /**
   * Run a simple test scenario
   */
  async runTestScenario(): Promise<any> {
    console.log('🧪 Running test scenario...');

    try {
      // Get initial state
      const initialState = await this.getGameState();
      console.log('📊 Initial state:', initialState);

      // Execute a simple movement action
      const movementAction = {
        type: 'move_forward',
        parameters: { distance: 3 },
        priority: 1,
      };

      const movementResult = await this.executeAction(movementAction);
      console.log('🚶 Movement result:', movementResult);

      // Get state after movement
      const finalState = await this.getGameState();
      console.log('📊 Final state:', finalState);

      return {
        success: true,
        initialState,
        movementResult,
        finalState,
      };
    } catch (error) {
      console.error('❌ Test scenario failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create a standalone Minecraft interface
 */
export function createStandaloneMinecraftInterface(
  config: BotConfig
): StandaloneMinecraftInterface {
  return new StandaloneMinecraftInterface(config);
}

/**
 * Default configuration for standalone testing
 */
export const DEFAULT_STANDALONE_CONFIG: BotConfig = {
  host: 'localhost',
  port: 25565,
  username: 'StandaloneBot',
  version: '1.20.1',
  auth: 'offline',
  viewDistance: 'tiny',
  chatLengthLimit: 100,
  skipValidation: true,
  connectTimeout: 30000,
  keepAlive: true,
  checkTimeoutInterval: 60000,
  loadInternalPlugins: true,
  plugins: {},
  chat: 'enabled',
  colorsEnabled: true,
  logErrors: true,
  hideErrors: false,
  client: {
    username: 'StandaloneBot',
    version: '1.20.1',
    protocol: 763,
  },
};
