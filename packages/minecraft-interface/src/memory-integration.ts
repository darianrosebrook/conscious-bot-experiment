/**
 * Memory Integration Service
 *
 * Handles integration between Minecraft interface and memory system
 * with seed-based memory versioning and context management.
 *
 * @author @darianrosebrook
 */

import { resilientFetch } from '@conscious-bot/core';
import { BotConfig } from './types';

/**
 * Memory integration configuration
 */
export interface MemoryIntegrationConfig {
  memoryServiceUrl: string;
  autoActivateNamespaces: boolean;
  sessionId?: string;
}

/**
 * Memory context for the current world
 */
export interface WorldMemoryContext {
  worldSeed?: string;
  worldName?: string;
  sessionId: string;
  botUsername: string;
  serverAddress: string;
}

/**
 * Memory Integration Service
 *
 * Manages memory namespace activation and context synchronization
 * between the Minecraft interface and memory system.
 */
export class MemoryIntegrationService {
  private config: MemoryIntegrationConfig;
  private botConfig: BotConfig;
  private currentSessionId: string;
  private isConnected: boolean = false;

  constructor(
    botConfig: BotConfig,
    config: Partial<MemoryIntegrationConfig> = {}
  ) {
    this.botConfig = botConfig;
    this.config = {
      memoryServiceUrl: 'http://localhost:3001',
      autoActivateNamespaces: true,
      ...config,
    };
    this.currentSessionId =
      config.sessionId ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Activate memory namespace for the current world
   */
  async activateWorldMemory(): Promise<boolean> {
    try {
      const context: WorldMemoryContext = {
        worldSeed: this.botConfig.worldSeed,
        worldName: this.botConfig.worldName,
        sessionId: this.currentSessionId,
        botUsername: this.botConfig.username,
        serverAddress: `${this.botConfig.host}:${this.botConfig.port}`,
      };

      const response = await resilientFetch(
        `${this.config.memoryServiceUrl}/versioning/activate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            worldSeed: context.worldSeed,
            worldName: context.worldName,
            sessionId: context.sessionId,
          }),
        }
      );

      if (!response?.ok) {
        throw new Error(
          `Memory service responded with status: ${response?.status ?? 'unavailable'}`
        );
      }

      const result = (await response!.json()) as any; // response non-null after ok check

      if (result.success) {
        console.log(
          `✅ Activated memory namespace: ${result.data.namespace.id}`
        );
        this.isConnected = true;
        return true;
      } else {
        console.error(
          '❌ Failed to activate memory namespace:',
          result.message
        );
        return false;
      }
    } catch (error) {
      console.error('❌ Error activating memory namespace:', error);
      return false;
    }
  }

  /**
   * Get current memory namespace information
   */
  async getActiveNamespace(): Promise<any> {
    try {
      const response = await resilientFetch(
        `${this.config.memoryServiceUrl}/versioning/active`,
        { label: 'memory/versioning/active' }
      );

      if (!response?.ok) {
        throw new Error(
          `Memory service responded with status: ${response?.status ?? 'unavailable'}`
        );
      }

      const result = (await response!.json()) as any;
      return result.success ? result.data : null;
    } catch (error) {
      console.error('❌ Error getting active namespace:', error);
      return null;
    }
  }

  /**
   * Get memory system statistics
   */
  async getMemoryStats(): Promise<any> {
    try {
      const response = await resilientFetch(
        `${this.config.memoryServiceUrl}/stats`,
        { label: 'memory/stats' }
      );

      if (!response?.ok) {
        throw new Error(
          `Memory service responded with status: ${response?.status ?? 'unavailable'}`
        );
      }

      const result = (await response!.json()) as any;
      return result.success ? result.data : null;
    } catch (error) {
      console.error('❌ Error getting memory stats:', error);
      return null;
    }
  }

  /**
   * Store a memory in the current namespace
   */
  async storeMemory(memory: any): Promise<boolean> {
    try {
      const response = await resilientFetch(
        `${this.config.memoryServiceUrl}/episodic`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(memory),
          label: 'memory/episodic',
        }
      );

      if (!response || !response.ok) {
        throw new Error(
          `Memory service responded with status: ${response?.status ?? 'null'}`
        );
      }

      const result = (await response.json()) as any;
      return result.success;
    } catch (error) {
      console.error('❌ Error storing memory:', error);
      return false;
    }
  }

  /**
   * Retrieve memories from the current namespace
   */
  async retrieveMemories(query: any): Promise<any[]> {
    try {
      const response = await resilientFetch(
        `${this.config.memoryServiceUrl}/episodic/retrieve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(query),
          label: 'memory/episodic/retrieve',
        }
      );

      if (!response?.ok) {
        throw new Error(
          `Memory service responded with status: ${response?.status ?? 'unavailable'}`
        );
      }

      const result = (await response!.json()) as any;
      return result.success ? result.data : [];
    } catch (error) {
      console.error('❌ Error retrieving memories:', error);
      return [];
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.currentSessionId;
  }

  /**
   * Check if memory integration is connected
   */
  isMemoryConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get world context information
   */
  getWorldContext(): WorldMemoryContext {
    return {
      worldSeed: this.botConfig.worldSeed,
      worldName: this.botConfig.worldName,
      sessionId: this.currentSessionId,
      botUsername: this.botConfig.username,
      serverAddress: `${this.botConfig.host}:${this.botConfig.port}`,
    };
  }
}
