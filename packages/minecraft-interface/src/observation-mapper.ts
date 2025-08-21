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
import { PlanningContext, HomeostasisState } from '@conscious-bot/planning';
import {
  MinecraftWorldState,
  MinecraftItem,
  MinecraftBlock,
  MinecraftEntity,
  BotConfig,
} from './types';

export class ObservationMapper {
  private config: BotConfig;
  private lastObservation: MinecraftWorldState | null = null;

  constructor(config: BotConfig) {
    this.config = config;
  }

  /**
   * Main mapping function: Bot state → PlanningContext.worldState
   */
  mapBotStateToPlanningContext(bot: Bot): PlanningContext {
    const minecraftWorldState = this.extractMinecraftWorldState(bot);
    const homeostasisState = this.deriveHomeostasisState(minecraftWorldState);

    return {
      worldState: this.convertToGenericWorldState(minecraftWorldState),
      currentState: homeostasisState,
      activeGoals: [], // Planning system will populate this
      availableResources: this.extractResources(minecraftWorldState),
      timeConstraints: this.assessTimeConstraints(minecraftWorldState),
      situationalFactors: this.assessSituationalFactors(minecraftWorldState),
    };
  }

  /**
   * Extract raw Minecraft world state from mineflayer bot
   */
  private extractMinecraftWorldState(bot: Bot): MinecraftWorldState {
    return {
      player: {
        position: bot.entity.position.clone(),
        health: bot.health,
        food: bot.food,
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
  private extractInventoryState(bot: Bot) {
    const items: MinecraftItem[] = [];
    let usedSlots = 0;

    // Main inventory (slots 9-35) + hotbar (slots 0-8)
    for (let slot = 0; slot < 36; slot++) {
      const item = bot.inventory.slots[slot];
      if (item) {
        items.push({
          type: item.name,
          count: item.count,
          slot: slot,
          metadata: item.metadata,
        });
        usedSlots++;
      }
    }

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
    const radius = this.config.observationRadius;
    const playerPos = bot.entity.position;

    return {
      timeOfDay: bot.time.timeOfDay,
      isRaining: bot.isRaining,
      nearbyBlocks: this.findNearbyBlocks(bot, playerPos, radius),
      nearbyEntities: this.findNearbyEntities(bot, playerPos, radius),
    };
  }

  /**
   * Find interesting blocks within radius
   */
  private findNearbyBlocks(
    bot: Bot,
    center: Vec3,
    radius: number
  ): MinecraftBlock[] {
    const blocks: MinecraftBlock[] = [];
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
    ]);

    // Search in a cube around the player
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        for (let z = -radius; z <= radius; z++) {
          const pos = center.offset(x, y, z);
          const block = bot.blockAt(pos);

          if (block && interestingBlocks.has(block.name)) {
            blocks.push({
              type: block.name,
              position: pos.clone(),
              properties: block.getProperties(),
              hardness: block.hardness,
              tool: this.getOptimalTool(block.name),
            });
          }
        }
      }
    }

    return blocks;
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
      difficulty: bot.game.difficulty,
      version: bot.version,
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

      // Inventory summary
      inventory: this.summarizeInventory(minecraftState.inventory.items),
      inventorySpace: {
        used: minecraftState.inventory.usedSlots,
        total: minecraftState.inventory.totalSlots,
        free:
          minecraftState.inventory.totalSlots -
          minecraftState.inventory.usedSlots,
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
      timestamp: Date.now(),
    };
  }

  /**
   * Extract available resources for planning
   */
  private extractResources(worldState: MinecraftWorldState) {
    const resources = [
      { type: 'time', amount: 1000, availability: 'available' as const },
      {
        type: 'energy',
        amount: Math.floor(worldState.player.food * 5),
        availability: 'available' as const,
      },
    ];

    // Add inventory items as resources
    worldState.inventory.items.forEach((item) => {
      resources.push({
        type: item.type,
        amount: item.count,
        availability: 'available' as const,
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
