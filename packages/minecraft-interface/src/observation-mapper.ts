/**
 * ObservationMapper: Converts Minecraft bot state to PlanningContext.worldState
 *
 * Bridges the gap between mineflayer's raw game state and our planning system's
 * expected world state format for cognitive reasoning.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { PlanningContext } from './types';
import { resilientFetch } from '@conscious-bot/core';

// Minimal type definition to avoid circular dependency
export interface HomeostasisState {
  health: number;
  hunger: number;
  energy: number;
  safety: number;
  social: number;
  achievement: number;
  curiosity: number;
  creativity: number;
  exploration: number;
  timestamp: number;
  [key: string]: number;
}
import {
  MinecraftWorldState,
  MinecraftItem,
  MinecraftBlock,
  MinecraftEntity,
  BotConfig,
} from './types';
import {
  MinecraftSignalProcessor,
  MinecraftSignal,
  MinecraftHomeostasisState,
  createMinecraftSignalProcessor,
} from './signal-processor';

export class ObservationMapper {
  private config: BotConfig;
  private lastObservation: MinecraftWorldState | null = null;
  private signalProcessor: MinecraftSignalProcessor;

  constructor(config: BotConfig) {
    this.config = config;
    this.signalProcessor = createMinecraftSignalProcessor();
  }

  /**
   * Main mapping function: Bot state → PlanningContext.worldState
   */
  mapBotStateToPlanningContext(bot: Bot): PlanningContext {
    const minecraftWorldState = this.extractMinecraftWorldState(bot);
    const homeostasisState = this.deriveHomeostasisState(minecraftWorldState);
    const worldState = this.convertToGenericWorldState(minecraftWorldState);

    return {
      goal: 'survive', // Default goal
      worldState: worldState,
      currentState: homeostasisState,
      resources: {}, // Empty resources object
      urgency: 'medium' as const, // Default urgency
      activeGoals: [], // Planning system will populate this
      availableResources: this.extractResources(minecraftWorldState),
      timeConstraints: this.assessTimeConstraints(minecraftWorldState),
      situationalFactors: this.assessSituationalFactors(minecraftWorldState),
    };
  }

  /**
   * Generate internal signals for the planning system
   */
  generateSignals(bot: Bot): MinecraftSignal[] {
    const minecraftWorldState = this.extractMinecraftWorldState(bot);
    return this.signalProcessor.processWorldState(minecraftWorldState, bot);
  }

  /**
   * Get enhanced homeostasis state using signal processor
   */
  getEnhancedHomeostasisState(bot: Bot): MinecraftHomeostasisState {
    const minecraftWorldState = this.extractMinecraftWorldState(bot);
    return this.signalProcessor.getHomeostasisState(minecraftWorldState, bot);
  }

  /**
   * Send a simple thought to the cognition system
   */
  async sendThoughtToCognition(
    content: string,
    thoughtType: string = 'observation'
  ): Promise<boolean> {
    try {
      const cognitionUrl =
        process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
      const thought = {
        type: thoughtType,
        content: content,
        attribution: 'minecraft-bot',
        context: {
          cognitiveSystem: 'minecraft-interface',
        },
        metadata: {
          thoughtType: 'bot-experience',
          source: 'minecraft-interface',
        },
        timestamp: Date.now(),
      };

      const response = await resilientFetch(`${cognitionUrl}/thoughts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thought),
        timeoutMs: 5000,
      });

      if (response?.ok) {
        console.log(`✅ Sent thought to cognition server: ${thoughtType}`);
        return true;
      }
      if (response) {
        console.error(
          `Failed to send thought to cognition server: ${response.status}`
        );
      }
      return false;
    } catch (error) {
      console.error('Error sending thought to cognition server:', error);
      return false;
    }
  }

  /**
   * Extract raw Minecraft world state from mineflayer bot
   */
  public extractMinecraftWorldState(bot: Bot): MinecraftWorldState {
    // Ensure bot is spawned before accessing position
    if (!bot.entity || !bot.entity.position) {
      throw new Error('Bot not fully spawned - cannot extract world state');
    }

    return {
      player: {
        position: bot.entity.position.clone(),
        health: bot.health ?? 20,
        food: bot.food ?? 20,
        experience: bot.experience.points,
        gameMode: bot.game.gameMode,
        dimension: bot.game.dimension,
      },

      inventory: this.extractInventoryState(bot),
      environment: this.extractEnvironmentState(bot),
      server: this.extractServerState(bot),
    };
  }

  /**
   * Extract inventory information
   */
  public extractInventoryState(bot: Bot | null | undefined) {
    // Guard clause: return empty inventory if bot is not available
    if (!bot || !bot.inventory) {
      return {
        items: [],
        totalSlots: 36,
        usedSlots: 0,
      };
    }

    const items: MinecraftItem[] = [];
    let usedSlots = 0;

    // Use the correct mineflayer API method to get inventory items
    // Additional check: ensure inventory.items() exists and is callable
    const inventoryItems = bot.inventory.items?.() || [];

    // Process all inventory items
    inventoryItems.forEach((item) => {
      // Check if item exists and has a valid name
      if (item && item.name) {
        items.push({
          type: item.name,
          count: item.count,
          slot: item.slot,
          metadata: item.metadata,
        });
        usedSlots++;
      }
    });

    return {
      items,
      totalSlots: 36,
      usedSlots,
    };
  }

  /**
   * Extract environment information within observation radius
   */
  private extractEnvironmentState(bot: Bot) {
    // Reduce radius for better performance and less duplication
    const radius = Math.min(this.config.observationRadius, 8);

    // Ensure bot is spawned before accessing position
    if (!bot.entity || !bot.entity.position) {
      throw new Error(
        'Bot not fully spawned - cannot extract environment state'
      );
    }

    const playerPos = bot.entity.position;

    return {
      timeOfDay: bot.time.timeOfDay,
      isRaining: bot.isRaining,
      nearbyBlocks: this.findNearbyBlocks(bot, playerPos, radius),
      nearbyEntities: this.findNearbyEntities(bot, playerPos, radius),
    };
  }

  /**
   * Find interesting blocks within radius - optimized to reduce duplication
   */
  private findNearbyBlocks(
    bot: Bot,
    center: Vec3,
    radius: number
  ): MinecraftBlock[] {
    const blockGroups = new Map<
      string,
      {
        type: string;
        count: number;
        positions: Vec3[];
        properties: any;
        hardness: number;
        tool: string;
      }
    >();

    const interestingBlocks = new Set([
      'oak_log',
      'birch_log',
      'spruce_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'stone',
      'coal_ore',
      'iron_ore',
      'diamond_ore',
      'gold_ore',
      'crafting_table',
      'furnace',
      'chest',
      'water',
      'lava',
      'grass_block',
      'dirt',
      'sand',
      'gravel',
      'clay',
    ]);

    // Search in a cube around the player
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        for (let z = -radius; z <= radius; z++) {
          const pos = center.offset(x, y, z);
          const block = bot.blockAt(pos);

          if (block && interestingBlocks.has(block.name)) {
            const key = block.name;

            if (!blockGroups.has(key)) {
              blockGroups.set(key, {
                type: block.name,
                count: 0,
                positions: [],
                properties: block.getProperties(),
                hardness: block.hardness,
                tool: this.getOptimalTool(block.name) || 'hand',
              });
            }

            const group = blockGroups.get(key)!;
            group.count++;
            group.positions.push(pos.clone());
          }
        }
      }
    }

    // Convert groups to abstract block representations
    const blocks: MinecraftBlock[] = [];

    for (const [blockType, group] of blockGroups) {
      // For common blocks like stone, dirt, grass, create abstract representations
      if (group.count > 5) {
        // Create an abstract representation for large groups
        blocks.push({
          type: this.getAbstractBlockType(blockType),
          position: group.positions[0].clone(), // Representative position
          properties: {
            ...group.properties,
            abstract: true,
            totalCount: group.count,
            area: this.calculateArea(group.positions),
          },
          hardness: group.hardness,
          tool: group.tool,
        });
      } else {
        // For rare blocks, keep individual entries but limit them
        const limitedPositions = group.positions.slice(0, 3); // Max 3 instances
        limitedPositions.forEach((pos) => {
          blocks.push({
            type: blockType,
            position: pos,
            properties: group.properties,
            hardness: group.hardness,
            tool: group.tool,
          });
        });
      }
    }

    return blocks;
  }

  /**
   * Get abstract block type for common blocks
   */
  private getAbstractBlockType(blockType: string): string {
    const abstractions: Record<string, string> = {
      stone: 'stone_wall',
      dirt: 'dirt_ground',
      grass_block: 'grass_ground',
      sand: 'sand_ground',
      gravel: 'gravel_patch',
      clay: 'clay_deposit',
      oak_log: 'tree_trunk',
      birch_log: 'tree_trunk',
      spruce_log: 'tree_trunk',
      jungle_log: 'tree_trunk',
      acacia_log: 'tree_trunk',
      dark_oak_log: 'tree_trunk',
    };

    return abstractions[blockType] || blockType;
  }

  /**
   * Calculate approximate area covered by block positions
   */
  private calculateArea(positions: Vec3[]): string {
    if (positions.length <= 1) return 'single_block';

    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const zs = positions.map((p) => p.z);

    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    const zRange = Math.max(...zs) - Math.min(...zs);

    const volume = xRange * yRange * zRange;

    if (volume <= 8) return 'small_patch';
    if (volume <= 64) return 'medium_area';
    return 'large_area';
  }

  /**
   * Find nearby entities
   */
  private findNearbyEntities(
    bot: Bot,
    center: Vec3,
    radius: number
  ): MinecraftEntity[] {
    const entities: MinecraftEntity[] = [];

    Object.values(bot.entities).forEach((entity) => {
      if (entity === bot.entity) return; // Skip self

      const distance = entity.position.distanceTo(center);
      if (distance <= radius) {
        entities.push({
          id: entity.id,
          type: entity.name || entity.type,
          position: entity.position.clone(),
          health: entity.health,
          isHostile: this.isHostileEntity(entity.name || entity.type),
        });
      }
    });

    return entities;
  }

  /**
   * Extract server information
   */
  private extractServerState(bot: Bot) {
    return {
      playerCount: Object.keys(bot.players).length,
      difficulty: bot.game.difficulty || 'normal',
      version: bot.version,
      worldSeed: this.config.worldSeed, // Include configured world seed
      worldName: this.config.worldName, // Include configured world name
    };
  }

  /**
   * Convert Minecraft world state to generic planning world state
   */
  private convertToGenericWorldState(
    minecraftState: MinecraftWorldState
  ): Record<string, any> {
    return {
      // Player state
      playerPosition: [
        minecraftState.player.position.x,
        minecraftState.player.position.y,
        minecraftState.player.position.z,
      ],
      health: minecraftState.player.health,
      hunger: minecraftState.player.food,

      // Inventory - preserve both detailed items and summary
      inventory: {
        items: minecraftState.inventory.items, // Detailed items for UI
        summary: this.summarizeInventory(minecraftState.inventory.items), // Summary for planning
        space: {
          used: minecraftState.inventory.usedSlots,
          total: minecraftState.inventory.totalSlots,
          free:
            minecraftState.inventory.totalSlots -
            minecraftState.inventory.usedSlots,
        },
      },

      // Environment
      timeOfDay: minecraftState.environment.timeOfDay,
      weather: minecraftState.environment.isRaining ? 'rain' : 'clear',

      // Nearby resources
      nearbyLogs: this.countNearbyBlocksByType(
        minecraftState.environment.nearbyBlocks,
        'log'
      ),
      nearbyOres: this.countNearbyBlocksByType(
        minecraftState.environment.nearbyBlocks,
        'ore'
      ),
      nearbyWater: this.countNearbyBlocksByType(
        minecraftState.environment.nearbyBlocks,
        'water'
      ),

      // Threats and opportunities
      nearbyHostiles: minecraftState.environment.nearbyEntities.filter(
        (e) => e.isHostile
      ).length,
      nearbyPassives: minecraftState.environment.nearbyEntities.filter(
        (e) => !e.isHostile
      ).length,

      // Raw data for detailed planning
      _minecraftState: minecraftState,
    };
  }

  /**
   * Derive homeostasis state from Minecraft conditions
   */
  private deriveHomeostasisState(
    worldState: MinecraftWorldState
  ): HomeostasisState {
    const player = worldState.player;
    const environment = worldState.environment;

    // Map Minecraft stats to homeostasis values (0-1 scale)
    const health = Math.max(0, Math.min(1, player.health / 20)); // MC health is 0-20
    const hunger = Math.max(0, Math.min(1, player.food / 20)); // MC food is 0-20

    // Calculate safety based on health, threats, and time of day
    const threatLevel = environment.nearbyEntities.filter(
      (e) => e.isHostile
    ).length;
    const nightTime =
      environment.timeOfDay > 12000 && environment.timeOfDay < 24000;
    const safety = Math.max(
      0,
      Math.min(
        1,
        health * 0.5 +
          (1 - Math.min(threatLevel / 5, 1)) * 0.3 +
          (nightTime ? 0.1 : 0.2)
      )
    );

    // Energy based on food and general vitality
    const energy = Math.max(0, Math.min(1, hunger * 0.7 + health * 0.3));

    // Social needs (simplified - based on multiplayer presence)
    const social = worldState.server.playerCount > 1 ? 0.7 : 0.3;

    // Achievement drive based on inventory progress
    const hasBasicTools = worldState.inventory.items.some(
      (item) => item.type.includes('pickaxe') || item.type.includes('axe')
    );
    const achievement = hasBasicTools ? 0.7 : 0.4;

    // Curiosity based on exploration needs
    const hasExplorationItems = worldState.inventory.items.some(
      (item) => item.type.includes('map') || item.type.includes('compass')
    );
    const curiosity = hasExplorationItems ? 0.4 : 0.6;

    return {
      health,
      hunger,
      energy,
      safety,
      social,
      achievement,
      curiosity,
      creativity: 0.5, // Default creativity level
      exploration: 0.5, // Default exploration level
      timestamp: Date.now(),
    };
  }

  /**
   * Extract available resources for planning
   */
  private extractResources(worldState: MinecraftWorldState): any[] {
    const resources: any[] = [
      {
        id: 'time',
        type: 'time' as any,
        name: 'Time',
        quantity: 1000,
        maxQuantity: 1000,
        unit: 'ms',
        value: 1,
      },
      {
        id: 'energy',
        type: 'energy' as any,
        name: 'Energy',
        quantity: Math.floor(worldState.player.food * 5),
        maxQuantity: 100,
        unit: 'units',
        value: 1,
      },
    ];

    // Add inventory items as resources
    worldState.inventory.items.forEach((item, index) => {
      resources.push({
        id: `item_${index}`,
        type: 'inventory_item' as any,
        name: item.type,
        quantity: item.count,
        maxQuantity: 64,
        unit: 'items',
        value: 1,
      });
    });

    return resources;
  }

  /**
   * Assess time constraints based on game state
   */
  private assessTimeConstraints(worldState: MinecraftWorldState) {
    const healthRatio = worldState.player.health / 20;
    const foodRatio = worldState.player.food / 20;
    const threatCount = worldState.environment.nearbyEntities.filter(
      (e) => e.isHostile
    ).length;

    let urgency: 'low' | 'medium' | 'high' | 'emergency' = 'low';

    if (healthRatio < 0.2 || foodRatio < 0.1) {
      urgency = 'emergency';
    } else if (healthRatio < 0.5 || foodRatio < 0.3 || threatCount > 2) {
      urgency = 'high';
    } else if (healthRatio < 0.8 || foodRatio < 0.6 || threatCount > 0) {
      urgency = 'medium';
    }

    return {
      urgency,
      maxPlanningTime:
        urgency === 'emergency' ? 100 : urgency === 'high' ? 500 : 2000,
    };
  }

  /**
   * Assess situational factors for planning context
   */
  private assessSituationalFactors(worldState: MinecraftWorldState) {
    const threatLevel = Math.min(
      1,
      worldState.environment.nearbyEntities.filter((e) => e.isHostile).length /
        5
    );

    const opportunityLevel = Math.min(
      1,
      (worldState.environment.nearbyBlocks.length +
        worldState.environment.nearbyEntities.filter((e) => !e.isHostile)
          .length) /
        20
    );

    const socialContext =
      worldState.server.playerCount > 1
        ? ['multiplayer', 'social_interaction_possible']
        : ['singleplayer', 'isolated'];

    const environmentalFactors = [
      worldState.environment.isRaining ? 'raining' : 'clear_weather',
      worldState.environment.timeOfDay > 12000 ? 'night' : 'day',
    ];

    return {
      threatLevel,
      opportunityLevel,
      socialContext,
      environmentalFactors,
    };
  }

  // ==================== Helper Methods ====================

  private summarizeInventory(items: MinecraftItem[]): Record<string, number> {
    const summary: Record<string, number> = {};
    items.forEach((item) => {
      summary[item.type] = (summary[item.type] || 0) + item.count;
    });
    return summary;
  }

  private countNearbyBlocksByType(
    blocks: MinecraftBlock[],
    typePattern: string
  ): number {
    return blocks.filter((block) => block.type.includes(typePattern)).length;
  }

  private getOptimalTool(blockType: string): string | undefined {
    if (blockType.includes('log') || blockType.includes('wood')) return 'axe';
    if (blockType.includes('stone') || blockType.includes('ore'))
      return 'pickaxe';
    if (blockType.includes('dirt') || blockType.includes('sand'))
      return 'shovel';
    return undefined;
  }

  private isHostileEntity(entityType: string): boolean {
    const hostileTypes = [
      'zombie',
      'skeleton',
      'creeper',
      'spider',
      'enderman',
      'witch',
      'blaze',
      'ghast',
      'slime',
      'magma_cube',
    ];
    return hostileTypes.some((hostile) => entityType.includes(hostile));
  }

  /**
   * Get the last observed world state for comparison
   */
  getLastObservation(): MinecraftWorldState | null {
    return this.lastObservation;
  }

  /**
   * Update the last observation cache
   */
  updateLastObservation(worldState: MinecraftWorldState): void {
    this.lastObservation = worldState;
  }
}
