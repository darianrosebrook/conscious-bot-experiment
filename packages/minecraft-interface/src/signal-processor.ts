/**
 * Minecraft Signal Processor
 *
 * Converts Minecraft world state into internal signals for the planning system.
 * Implements homeostasis monitoring and need detection for conscious behavior.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { MinecraftWorldState } from './types';

export interface MinecraftSignal {
  type:
    | 'health'
    | 'hunger'
    | 'fatigue'
    | 'threat'
    | 'social'
    | 'memory'
    | 'intrusion'
    | 'exploration'
    | 'resource_opportunity';
  intensity: number; // 0-100 urgency
  source: string;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface MinecraftHomeostasisState {
  health: number; // 0-100
  hunger: number; // 0-100
  fatigue: number; // 0-100 (derived from time played)
  safety: number; // 0-100 (inverse of threat level)
  social: number; // 0-100 (player interaction level)
  exploration: number; // 0-100 (new area discovery rate)
  progress: number; // 0-100 (goal achievement rate)
}

export class MinecraftSignalProcessor {
  private lastProcessedTime = 0;
  private explorationHistory: Set<string> = new Set();
  private threatHistory: Array<{ timestamp: number; threatLevel: number }> = [];
  private socialHistory: Array<{ timestamp: number; playerCount: number }> = [];

  /**
   * Process Minecraft world state into internal signals for planning
   */
  processWorldState(
    worldState: MinecraftWorldState,
    bot: Bot
  ): MinecraftSignal[] {
    const signals: MinecraftSignal[] = [];
    const currentTime = Date.now();

    // Health signals
    const healthSignal = this.processHealthSignal(worldState, currentTime);
    if (healthSignal) signals.push(healthSignal);

    // Hunger signals
    const hungerSignal = this.processHungerSignal(worldState, currentTime);
    if (hungerSignal) signals.push(hungerSignal);

    // Threat signals
    const threatSignal = this.processThreatSignal(worldState, bot, currentTime);
    if (threatSignal) signals.push(threatSignal);

    // Social signals
    const socialSignal = this.processSocialSignal(worldState, currentTime);
    if (socialSignal) signals.push(socialSignal);

    // Exploration signals
    const explorationSignal = this.processExplorationSignal(
      worldState,
      currentTime
    );
    if (explorationSignal) signals.push(explorationSignal);

    // Resource opportunity signals
    const resourceSignals = this.processResourceOpportunitySignals(
      worldState,
      currentTime
    );
    signals.push(...resourceSignals);

    this.lastProcessedTime = currentTime;
    return signals;
  }

  /**
   * Get current homeostasis state for planning context
   */
  getHomeostasisState(
    worldState: MinecraftWorldState,
    bot: Bot
  ): MinecraftHomeostasisState {
    const currentTime = Date.now();

    return {
      health: worldState.player.health * 5, // Convert 0-20 to 0-100
      hunger: worldState.player.food * 5, // Convert 0-20 to 0-100
      fatigue: this.calculateFatigue(currentTime),
      safety: this.calculateSafety(worldState, bot),
      social: this.calculateSocialLevel(worldState, currentTime),
      exploration: this.calculateExplorationLevel(worldState, currentTime),
      progress: this.calculateProgressLevel(currentTime),
    };
  }

  private processHealthSignal(
    worldState: MinecraftWorldState,
    timestamp: number
  ): MinecraftSignal | null {
    const health = worldState.player.health;

    if (health <= 6) {
      // Critical health (≤ 3 hearts)
      return {
        type: 'health',
        intensity: Math.max(0, 100 - health * 5), // Higher intensity for lower health
        source: 'homeostasis_monitor',
        timestamp,
        metadata: {
          currentHealth: health,
          maxHealth: 20,
          criticalThreshold: 6,
          causeAnalysis: this.analyzeHealthLoss(worldState),
        },
      };
    }

    return null;
  }

  private processHungerSignal(
    worldState: MinecraftWorldState,
    timestamp: number
  ): MinecraftSignal | null {
    const hunger = worldState.player.food;

    if (hunger <= 12) {
      // Hunger getting low (≤ 6 drumsticks)
      return {
        type: 'hunger',
        intensity: Math.max(0, 100 - hunger * 5), // Higher intensity for lower hunger
        source: 'homeostasis_monitor',
        timestamp,
        metadata: {
          currentHunger: hunger,
          maxHunger: 20,
          foodAvailable: this.checkAvailableFood(worldState),
          starvationRisk: hunger <= 4,
        },
      };
    }

    return null;
  }

  private processThreatSignal(
    worldState: MinecraftWorldState,
    bot: Bot,
    timestamp: number
  ): MinecraftSignal | null {
    const threats = this.detectThreats(worldState, bot);

    if (threats.length > 0) {
      const maxThreatLevel = Math.max(...threats.map((t) => t.threatLevel));

      this.threatHistory.push({ timestamp, threatLevel: maxThreatLevel });
      this.threatHistory = this.threatHistory.filter(
        (h) => timestamp - h.timestamp < 60000
      ); // Keep last minute

      return {
        type: 'threat',
        intensity: maxThreatLevel,
        source: 'threat_detector',
        timestamp,
        metadata: {
          threats,
          lightLevel: this.getLightLevel(worldState, bot),
          timeOfDay: this.getTimeOfDay(worldState),
          safetyOptions: this.identifySafetyOptions(worldState, bot),
        },
      };
    }

    return null;
  }

  private processSocialSignal(
    worldState: MinecraftWorldState,
    timestamp: number
  ): MinecraftSignal | null {
    const playerCount = worldState.server.playerCount - 1; // Exclude self

    this.socialHistory.push({ timestamp, playerCount });
    this.socialHistory = this.socialHistory.filter(
      (h) => timestamp - h.timestamp < 300000
    ); // Keep last 5 minutes

    if (playerCount > 0) {
      return {
        type: 'social',
        intensity: Math.min(100, playerCount * 20), // Higher intensity with more players
        source: 'social_detector',
        timestamp,
        metadata: {
          nearbyPlayerCount: playerCount,
          socialOpportunities: this.identifySocialOpportunities(worldState),
          communicationOptions: ['chat', 'signs', 'books'],
        },
      };
    }

    return null;
  }

  private processExplorationSignal(
    worldState: MinecraftWorldState,
    timestamp: number
  ): MinecraftSignal | null {
    const currentPosition = worldState.player.position;
    const positionKey = `${Math.floor(currentPosition.x / 16)},${Math.floor(currentPosition.z / 16)}`; // Chunk-level

    if (!this.explorationHistory.has(positionKey)) {
      this.explorationHistory.add(positionKey);

      return {
        type: 'exploration',
        intensity: 30, // Moderate baseline exploration drive
        source: 'exploration_monitor',
        timestamp,
        metadata: {
          newChunk: true,
          chunkPosition: positionKey,
          totalExploredChunks: this.explorationHistory.size,
          interestingFeatures: this.scanForInterestingFeatures(worldState),
        },
      };
    }

    return null;
  }

  private processResourceOpportunitySignals(
    worldState: MinecraftWorldState,
    timestamp: number
  ): MinecraftSignal[] {
    const signals: MinecraftSignal[] = [];
    const nearbyBlocks = worldState.environment.nearbyBlocks;

    // Scan for valuable resources
    const valuableResources = this.identifyValuableResources(nearbyBlocks);

    for (const resource of valuableResources) {
      signals.push({
        type: 'resource_opportunity',
        intensity: resource.value,
        source: 'resource_scanner',
        timestamp,
        metadata: {
          resourceType: resource.type,
          position: resource.position,
          abundance: resource.abundance,
          toolRequired: resource.toolRequired,
          accessibility: resource.accessibility,
        },
      });
    }

    return signals;
  }

  private calculateFatigue(currentTime: number): number {
    const hoursPlayed =
      (currentTime - this.lastProcessedTime) / (1000 * 60 * 60);
    return Math.min(100, hoursPlayed * 10); // Increase fatigue over time
  }

  private calculateSafety(worldState: MinecraftWorldState, bot: Bot): number {
    const threats = this.detectThreats(worldState, bot);
    const lightLevel = this.getLightLevel(worldState, bot);
    const timeOfDay = this.getTimeOfDay(worldState);

    let safety = 100;

    // Reduce safety for each threat
    threats.forEach((threat) => {
      safety -= threat.threatLevel;
    });

    // Reduce safety for darkness
    if (lightLevel < 8) {
      safety -= (8 - lightLevel) * 5;
    }

    // Reduce safety at night
    if (timeOfDay === 'night') {
      safety -= 20;
    }

    return Math.max(0, safety);
  }

  private calculateSocialLevel(
    worldState: MinecraftWorldState,
    currentTime: number
  ): number {
    const recentSocial = this.socialHistory.filter(
      (h) => currentTime - h.timestamp < 60000
    );
    const avgPlayerCount =
      recentSocial.length > 0
        ? recentSocial.reduce((sum, h) => sum + h.playerCount, 0) /
          recentSocial.length
        : 0;

    return Math.min(100, avgPlayerCount * 25);
  }

  private calculateExplorationLevel(
    worldState: MinecraftWorldState,
    currentTime: number
  ): number {
    const recentExploration = this.explorationHistory.size;
    return Math.min(100, recentExploration * 2);
  }

  private calculateProgressLevel(currentTime: number): number {
    // TODO: Implement based on goal achievement tracking
    return 50; // Placeholder - neutral progress level
  }

  private analyzeHealthLoss(worldState: MinecraftWorldState): string {
    // Analyze recent events to determine cause of health loss
    if (
      worldState.environment.nearbyEntities.some((e) => e.type === 'hostile')
    ) {
      return 'combat_damage';
    }
    if (worldState.player.food < 4) {
      return 'starvation';
    }
    return 'environmental_damage';
  }

  private checkAvailableFood(worldState: MinecraftWorldState): boolean {
    return worldState.inventory.items.some((item) =>
      [
        'bread',
        'apple',
        'cooked_beef',
        'cooked_pork',
        'cooked_chicken',
      ].includes(item.type)
    );
  }

  private detectThreats(
    worldState: MinecraftWorldState,
    bot: Bot
  ): Array<{ type: string; threatLevel: number; distance: number }> {
    const threats: Array<{
      type: string;
      threatLevel: number;
      distance: number;
    }> = [];

    // Check for hostile entities including phantoms
    for (const entity of worldState.environment.nearbyEntities) {
      const isHostile =
        entity.type === 'hostile' ||
        entity.name === 'phantom' ||
        entity.name === 'zombie' ||
        entity.name === 'skeleton' ||
        entity.name === 'creeper' ||
        entity.name === 'spider' ||
        entity.name === 'enderman';

      if (isHostile) {
        const distance = this.calculateDistance(
          worldState.player.position,
          entity.position
        );
        const threatLevel = this.calculateThreatLevel(
          entity,
          distance,
          worldState
        );

        threats.push({
          type: entity.name || entity.type,
          threatLevel,
          distance,
        });
      }
    }

    // Check for damage-based threats (health loss)
    const currentHealth = worldState.player.health;
    const maxHealth = 100; // Assuming max health is 100
    const healthPercentage = (currentHealth / maxHealth) * 100;

    // If health is low, create a high-priority threat signal
    if (healthPercentage < 80) {
      threats.push({
        type: 'low_health',
        threatLevel: 90 + (80 - healthPercentage), // Higher threat for lower health
        distance: 0, // Self-inflicted threat
      });
    }

    // Check for night-time vulnerability (phantoms spawn at night)
    const timeOfDay = this.getTimeOfDay(worldState);
    if (timeOfDay === 'night' && currentHealth < 90) {
      threats.push({
        type: 'night_vulnerability',
        threatLevel: 85,
        distance: 0,
      });
    }

    // Critical health emergency
    if (healthPercentage < 30) {
      threats.push({
        type: 'critical_health',
        threatLevel: 95,
        distance: 0,
      });
    }

    return threats;
  }

  private calculateThreatLevel(
    entity: any,
    distance: number,
    worldState: MinecraftWorldState
  ): number {
    let threatLevel = 50; // Base threat

    // Closer threats are more dangerous
    if (distance < 5) threatLevel += 30;
    else if (distance < 10) threatLevel += 15;

    // Specific threat types with appropriate threat levels
    if (entity.name === 'phantom') {
      threatLevel += 40; // Phantoms are very dangerous, especially at night
      // Phantoms are more dangerous at night
      if (this.getTimeOfDay(worldState) === 'night') {
        threatLevel += 20;
      }
    } else if (entity.name === 'creeper') {
      threatLevel += 35; // Creepers are extremely dangerous
    } else if (entity.name === 'enderman') {
      threatLevel += 25;
    } else if (entity.name === 'zombie') {
      threatLevel += 15;
    } else if (entity.name === 'skeleton') {
      threatLevel += 20;
    } else if (entity.name === 'spider') {
      threatLevel += 15;
    }

    // Player vulnerability increases threat
    if (worldState.player.health < 10) threatLevel += 30;
    else if (worldState.player.health < 30) threatLevel += 20;
    else if (worldState.player.health < 50) threatLevel += 10;

    // Low light level increases threat
    const lightLevel = this.getLightLevel(worldState, null as any);
    if (lightLevel < 8) threatLevel += 15;

    return Math.min(100, threatLevel);
  }

  private getLightLevel(worldState: MinecraftWorldState, bot: Bot): number {
    // TODO: Get actual light level from bot
    return worldState.environment.timeOfDay > 13000 ? 4 : 15; // Simplified
  }

  private getTimeOfDay(
    worldState: MinecraftWorldState
  ): 'day' | 'night' | 'dawn' | 'dusk' {
    const time = worldState.environment.timeOfDay;
    if (time < 1000 || time > 23000) return 'dawn';
    if (time < 13000) return 'day';
    if (time < 14000) return 'dusk';
    return 'night';
  }

  private identifySafetyOptions(
    worldState: MinecraftWorldState,
    bot: Bot
  ): string[] {
    const options: string[] = [];

    // Check for light sources
    if (
      worldState.inventory.items.some((i) =>
        ['torch', 'lantern'].includes(i.type)
      )
    ) {
      options.push('place_light');
    }

    // Check for building materials
    if (worldState.inventory.items.some((i) => i.type.includes('block'))) {
      options.push('build_shelter');
    }

    // Check for food
    if (this.checkAvailableFood(worldState)) {
      options.push('heal_with_food');
    }

    return options;
  }

  private identifySocialOpportunities(
    worldState: MinecraftWorldState
  ): string[] {
    // TODO: Implement social opportunity detection
    return ['chat', 'trade', 'collaborate'];
  }

  private scanForInterestingFeatures(
    worldState: MinecraftWorldState
  ): string[] {
    const features: string[] = [];

    for (const block of worldState.environment.nearbyBlocks) {
      if (
        ['diamond_ore', 'gold_ore', 'iron_ore', 'coal_ore'].includes(block.type)
      ) {
        features.push('ore_deposit');
      }
      if (['village', 'temple', 'dungeon'].includes(block.type)) {
        features.push('structure');
      }
    }

    return features;
  }

  private identifyValuableResources(blocks: any[]): Array<{
    type: string;
    value: number;
    position: any;
    abundance: number;
    toolRequired: string;
    accessibility: number;
  }> {
    const resources: Array<{
      type: string;
      value: number;
      position: any;
      abundance: number;
      toolRequired: string;
      accessibility: number;
    }> = [];

    const resourceValues: Record<string, number> = {
      diamond_ore: 90,
      gold_ore: 70,
      iron_ore: 60,
      coal_ore: 40,
      log: 30,
      stone: 20,
    };

    for (const block of blocks) {
      const value = resourceValues[block.type];
      if (value) {
        resources.push({
          type: block.type,
          value,
          position: block.position,
          abundance: 1, // TODO: Calculate actual abundance
          toolRequired: this.getRequiredTool(block.type),
          accessibility: this.calculateAccessibility(block.position),
        });
      }
    }

    return resources;
  }

  private getRequiredTool(blockType: string): string {
    const tools: Record<string, string> = {
      diamond_ore: 'iron_pickaxe',
      gold_ore: 'iron_pickaxe',
      iron_ore: 'stone_pickaxe',
      coal_ore: 'wooden_pickaxe',
      stone: 'pickaxe',
      log: 'axe',
    };

    return tools[blockType] || 'hand';
  }

  private calculateAccessibility(position: any): number {
    // TODO: Implement proper accessibility calculation
    return 80; // Placeholder - assume most resources are accessible
  }

  private calculateDistance(pos1: any, pos2: any): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

/**
 * Factory function to create a configured signal processor
 */
export function createMinecraftSignalProcessor(): MinecraftSignalProcessor {
  return new MinecraftSignalProcessor();
}
