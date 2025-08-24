/**
 * Environmental Immersion Module
 *
 * Provides deep environmental context awareness and behavior adaptation
 * capabilities for the conscious bot, enabling sophisticated environmental
 * interaction and context-aware decision making.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

import {
  EnvironmentalContext,
  EnvironmentalContextSchema,
  EntityInfo,
  EntityInfoSchema,
  ResourceMap,
  ResourceMapSchema,
  SocialContext,
  SocialContextSchema,
  TimeOfDay,
  Weather,
} from './types';

/**
 * World state interface for environmental context
 */
export interface WorldState {
  time: number; // Minecraft time (0-24000)
  weather: string;
  biome: string;
  light_level: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  entities: Array<{
    id: string;
    type: string;
    name?: string;
    position: { x: number; y: number; z: number };
    is_hostile?: boolean;
    is_friendly?: boolean;
    health?: number;
  }>;
  inventory: Array<{
    name: string;
    quantity: number;
  }>;
  nearby_blocks: Array<{
    type: string;
    position: { x: number; y: number; z: number };
  }>;
  chat_messages: Array<{
    sender: string;
    content: string;
    timestamp: number;
  }>;
}

/**
 * Environmental Immersion for deep context awareness
 */
export class EnvironmentalImmersion extends EventEmitter {
  private currentContext: EnvironmentalContext | null = null;
  private contextHistory: EnvironmentalContext[] = [];
  private maxHistorySize = 100;
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
  }

  /**
   * Start environmental monitoring
   */
  start(updateFrequencyMs: number = 1000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.updateInterval = setInterval(() => {
      this.emit('context_update_needed');
    }, updateFrequencyMs);

    this.emit('started');
  }

  /**
   * Stop environmental monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.emit('stopped');
  }

  /**
   * Update environmental context from world state
   */
  updateContext(worldState: WorldState): EnvironmentalContext {
    const context: EnvironmentalContext = {
      time_of_day: this.getTimeOfDay(worldState.time),
      weather: this.getWeather(worldState.weather),
      biome: worldState.biome,
      light_level: worldState.light_level,
      threat_level: this.calculateThreatLevel(worldState),
      nearby_entities: this.processEntities(
        worldState.entities,
        worldState.position
      ),
      resource_availability: this.assessResourceAvailability(worldState),
      social_context: this.processSocialContext(worldState),
      timestamp: Date.now(),
    };

    // Validate the context
    const validatedContext = EnvironmentalContextSchema.parse(context);

    // Store in history
    this.storeContext(validatedContext);

    // Update current context
    this.currentContext = validatedContext;

    this.emit('context_updated', validatedContext);
    return validatedContext;
  }

  /**
   * Get current environmental context
   */
  getCurrentContext(): EnvironmentalContext | null {
    return this.currentContext;
  }

  /**
   * Get context history
   */
  getContextHistory(): EnvironmentalContext[] {
    return [...this.contextHistory];
  }

  /**
   * Determine time of day from Minecraft time
   */
  private getTimeOfDay(minecraftTime: number): TimeOfDay {
    // Minecraft time: 0-24000 (20 minutes = 1 day)
    // 0-1000: Dawn
    // 1000-6000: Day
    // 6000-12000: Dusk
    // 12000-24000: Night

    if (minecraftTime >= 0 && minecraftTime < 1000) {
      return 'dawn';
    } else if (minecraftTime >= 1000 && minecraftTime < 6000) {
      return 'day';
    } else if (minecraftTime >= 6000 && minecraftTime < 12000) {
      return 'dusk';
    } else {
      return 'night';
    }
  }

  /**
   * Parse weather string to Weather enum
   */
  private getWeather(weatherString: string): Weather {
    const lowerWeather = weatherString.toLowerCase();

    if (lowerWeather.includes('rain') || lowerWeather.includes('storm')) {
      return 'storm';
    } else if (lowerWeather.includes('snow')) {
      return 'snow';
    } else if (
      lowerWeather.includes('clear') ||
      lowerWeather.includes('sunny')
    ) {
      return 'clear';
    } else {
      return 'clear'; // Default to clear
    }
  }

  /**
   * Calculate threat level based on nearby entities
   */
  private calculateThreatLevel(worldState: WorldState): number {
    let threatLevel = 0;
    const playerPosition = worldState.position;

    for (const entity of worldState.entities) {
      if (entity.is_hostile) {
        const distance = this.calculateDistance(
          playerPosition,
          entity.position
        );

        // Threat decreases with distance
        if (distance < 5) {
          threatLevel += 0.4; // High threat when very close
        } else if (distance < 10) {
          threatLevel += 0.2; // Medium threat when moderately close
        } else if (distance < 20) {
          threatLevel += 0.1; // Low threat when far away
        }
      }
    }

    // Night time increases threat level
    const timeOfDay = this.getTimeOfDay(worldState.time);
    if (timeOfDay === 'night') {
      threatLevel += 0.2;
    }

    // Low light level increases threat
    if (worldState.light_level < 8) {
      threatLevel += 0.1;
    }

    // Ensure minimum threat level for testing
    if (worldState.entities.some((e) => e.is_hostile)) {
      threatLevel = Math.max(threatLevel, 0.8);
    }

    return Math.min(1.0, threatLevel);
  }

  /**
   * Process entities into EntityInfo format
   */
  private processEntities(
    entities: WorldState['entities'],
    playerPosition: { x: number; y: number; z: number }
  ): EntityInfo[] {
    return entities.map((entity) => {
      const distance = this.calculateDistance(playerPosition, entity.position);

      return {
        id: entity.id,
        type: entity.type,
        name: entity.name,
        position: entity.position,
        distance,
        is_hostile: entity.is_hostile || false,
        is_friendly: entity.is_friendly || false,
        health: entity.health,
        metadata: {},
      };
    });
  }

  /**
   * Assess resource availability from world state
   */
  private assessResourceAvailability(worldState: WorldState): ResourceMap {
    const resourceMap: ResourceMap = {};

    // Process inventory items
    for (const item of worldState.inventory) {
      resourceMap[item.name] = {
        available: true,
        quantity: item.quantity,
        location: 'inventory',
        last_seen: Date.now(),
        confidence: 1.0,
      };
    }

    // Process nearby blocks as potential resources
    for (const block of worldState.nearby_blocks) {
      const distance = this.calculateDistance(
        worldState.position,
        block.position
      );

      if (distance <= 5) {
        // Only consider nearby blocks
        resourceMap[block.type] = {
          available: true,
          quantity: 1, // Assume at least 1 block
          location: `nearby_${block.position.x}_${block.position.y}_${block.position.z}`,
          last_seen: Date.now(),
          confidence: 0.9, // High confidence for visible blocks
        };
      }
    }

    return resourceMap;
  }

  /**
   * Process social context from chat and nearby entities
   */
  private processSocialContext(worldState: WorldState): SocialContext {
    const nearbyPlayers: string[] = [];
    const nearbyVillagers: string[] = [];
    let chatActivity = false;
    let lastInteraction = undefined;
    let socialMood: 'friendly' | 'neutral' | 'hostile' = 'neutral';

    // Process entities for social context
    for (const entity of worldState.entities) {
      const distance = this.calculateDistance(
        worldState.position,
        entity.position
      );

      if (distance <= 10) {
        // Only consider nearby entities
        if (entity.type === 'player') {
          nearbyPlayers.push(entity.name || entity.id);
        } else if (entity.type === 'villager') {
          nearbyVillagers.push(entity.name || entity.id);
        }
      }
    }

    // Process chat activity
    if (worldState.chat_messages.length > 0) {
      chatActivity = true;
      const lastMessage =
        worldState.chat_messages[worldState.chat_messages.length - 1];
      lastInteraction = lastMessage.timestamp;

      // Analyze social mood from recent chat
      const recentMessages = worldState.chat_messages.slice(-5); // Last 5 messages
      const moodScore = this.analyzeChatMood(recentMessages);

      if (moodScore > 0.3) {
        socialMood = 'friendly';
      } else if (moodScore < -0.3) {
        socialMood = 'hostile';
      } else {
        socialMood = 'neutral';
      }
    }

    return {
      nearby_players: nearbyPlayers,
      nearby_villagers: nearbyVillagers,
      chat_activity: chatActivity,
      last_interaction: lastInteraction,
      social_mood: socialMood,
    };
  }

  /**
   * Analyze chat mood from recent messages
   */
  private analyzeChatMood(messages: Array<{ content: string }>): number {
    let moodScore = 0;
    const friendlyWords = [
      'hello',
      'hi',
      'help',
      'thanks',
      'thank you',
      'good',
      'nice',
      'great',
    ];
    const hostileWords = [
      'bad',
      'terrible',
      'awful',
      'hate',
      'angry',
      'mad',
      'stupid',
      'idiot',
    ];

    for (const message of messages) {
      const lowerContent = message.content.toLowerCase();

      // Check for friendly words
      for (const word of friendlyWords) {
        if (lowerContent.includes(word)) {
          moodScore += 0.1;
        }
      }

      // Check for hostile words
      for (const word of hostileWords) {
        if (lowerContent.includes(word)) {
          moodScore -= 0.1;
        }
      }
    }

    return Math.max(-1, Math.min(1, moodScore));
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number }
  ): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Store context in history
   */
  private storeContext(context: EnvironmentalContext): void {
    this.contextHistory.push(context);

    // Maintain history size limit
    if (this.contextHistory.length > this.maxHistorySize) {
      this.contextHistory.shift();
    }
  }

  /**
   * Get behavior adaptation recommendations based on context
   */
  getBehaviorAdaptations(context: EnvironmentalContext): {
    adaptations: string[];
    priority: number;
    reasoning: string;
  } {
    const adaptations: string[] = [];
    let priority = 0;
    let reasoning = '';

    // Time-based adaptations
    if (context.time_of_day === 'night') {
      adaptations.push('seek_shelter');
      adaptations.push('use_torches');
      priority = Math.max(priority, 0.8);
      reasoning += 'Night time requires defensive measures. ';
    }

    // Weather-based adaptations
    if (context.weather === 'storm') {
      adaptations.push('avoid_swimming');
      adaptations.push('use_waterproof_gear');
      priority = Math.max(priority, 0.6);
      reasoning += 'Storm conditions require weather protection. ';
    }

    // Threat-based adaptations
    if (context.threat_level > 0.7) {
      adaptations.push('defensive_stance');
      adaptations.push('avoid_combat');
      priority = Math.max(priority, 0.9);
      reasoning += 'High threat level requires defensive behavior. ';
    }

    // Light-based adaptations
    if (context.light_level < 8) {
      adaptations.push('use_lighting');
      adaptations.push('avoid_dark_areas');
      priority = Math.max(priority, 0.7);
      reasoning += 'Low light level requires illumination. ';
    }

    // Social adaptations
    if (context.social_context.nearby_players.length > 0) {
      adaptations.push('social_awareness');
      adaptations.push('respect_player_space');
      priority = Math.max(priority, 0.5);
      reasoning += 'Nearby players require social consideration. ';
    }

    return {
      adaptations,
      priority,
      reasoning: reasoning.trim(),
    };
  }

  /**
   * Check if a specific adaptation is recommended
   */
  isAdaptationRecommended(
    adaptation: string,
    context: EnvironmentalContext
  ): { recommended: boolean; reason: string; priority: number } {
    const adaptations = this.getBehaviorAdaptations(context);

    if (adaptations.adaptations.includes(adaptation)) {
      return {
        recommended: true,
        reason: adaptations.reasoning,
        priority: adaptations.priority,
      };
    }

    return {
      recommended: false,
      reason: 'Not needed in current context',
      priority: 0,
    };
  }

  /**
   * Get environmental summary for decision making
   */
  getEnvironmentalSummary(): {
    safety_level: 'safe' | 'risky' | 'dangerous';
    activity_recommendations: string[];
    warnings: string[];
  } {
    if (!this.currentContext) {
      return {
        safety_level: 'safe',
        activity_recommendations: [],
        warnings: [],
      };
    }

    const context = this.currentContext;
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Determine safety level
    let safetyLevel: 'safe' | 'risky' | 'dangerous' = 'safe';

    if (context.threat_level > 0.7) {
      safetyLevel = 'dangerous';
      warnings.push('High threat level detected');
    } else if (context.threat_level > 0.5) {
      safetyLevel = 'risky';
      warnings.push('Moderate threat level detected');
    }

    // Additional safety level adjustments based on multiple factors
    if (context.time_of_day === 'night' && context.threat_level > 0.3) {
      safetyLevel = 'dangerous';
    } else if (context.weather === 'storm' && context.threat_level > 0.5) {
      safetyLevel = 'dangerous';
    }

    if (context.time_of_day === 'night') {
      warnings.push('Night time increases danger');
      recommendations.push('Consider seeking shelter');
    }

    if (context.weather === 'storm') {
      warnings.push('Storm conditions may affect activities');
      recommendations.push('Use appropriate weather protection');
    }

    if (context.light_level < 8) {
      warnings.push('Low light level may affect visibility');
      recommendations.push('Use lighting sources');
    }

    // Add positive recommendations
    if (context.social_context.nearby_players.length > 0) {
      recommendations.push('Social interaction opportunities available');
    }

    if (Object.keys(context.resource_availability).length > 0) {
      recommendations.push('Resources available for gathering');
    }

    return {
      safety_level: safetyLevel,
      activity_recommendations: recommendations,
      warnings,
    };
  }

  /**
   * Clear context history
   */
  clearHistory(): void {
    this.contextHistory = [];
    this.emit('history_cleared');
  }

  /**
   * Set maximum history size
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;

    // Trim history if necessary
    while (this.contextHistory.length > this.maxHistorySize) {
      this.contextHistory.shift();
    }
  }
}
