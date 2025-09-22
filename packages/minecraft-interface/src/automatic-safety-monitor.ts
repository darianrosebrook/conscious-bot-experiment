/**
 * Automatic Safety Monitor for Minecraft Bot
 *
 * Continuously monitors bot health and automatically responds to threats
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { ActionTranslator } from './action-translator';

export interface SafetyMonitorConfig {
  healthThreshold: number; // Trigger emergency response when health drops below this
  checkInterval: number; // How often to check health (ms)
  autoFleeEnabled: boolean;
  autoShelterEnabled: boolean;
  maxFleeDistance: number;
}

export interface ThreatAssessment {
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  threats: Array<{
    type: string;
    distance: number;
    threatLevel: number;
  }>;
  recommendedAction: 'none' | 'flee' | 'find_shelter' | 'attack';
}

export class AutomaticSafetyMonitor extends EventEmitter {
  private bot: Bot;
  private actionTranslator: ActionTranslator;
  private config: SafetyMonitorConfig;
  private isMonitoring = false;
  private lastHealth = 20;
  private lastPosition: any = null;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    bot: Bot,
    actionTranslator: ActionTranslator,
    config: Partial<SafetyMonitorConfig> = {}
  ) {
    super();

    this.bot = bot;
    this.actionTranslator = actionTranslator;
    this.config = {
      healthThreshold: 15,
      checkInterval: 2000, // Check every 2 seconds
      autoFleeEnabled: true,
      autoShelterEnabled: true,
      maxFleeDistance: 20,
      ...config,
    };
  }

  /**
   * Start automatic safety monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    console.log('🛡️ Automatic safety monitoring started');

    // Set up health monitoring
    this.bot.on('health', () => {
      const health = this.bot.health || 20;
      this.handleHealthChange(health);
    });

    // Set up entity detection
    this.bot.on('entityMoved', (entity: any) => {
      this.handleEntityMovement(entity);
    });

    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.performSafetyCheck();
    }, this.config.checkInterval);

    this.emit('monitoring-started');
  }

  /**
   * Stop automatic safety monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('🛡️ Automatic safety monitoring stopped');
    this.emit('monitoring-stopped');
  }

  /**
   * Handle health changes
   */
  private async handleHealthChange(health: number): Promise<void> {
    const healthDrop = this.lastHealth - health;
    this.lastHealth = health;

    // If health dropped significantly, trigger emergency response
    if (healthDrop > 2 && health < this.config.healthThreshold) {
      console.log(
        `🚨 Health dropped from ${this.lastHealth + healthDrop} to ${health}! Triggering emergency response`
      );
      await this.triggerEmergencyResponse('health_drop', {
        health,
        healthDrop,
      });
    }

    // If health is critically low, flee immediately
    if (health < 8) {
      console.log(`🚨 Critical health (${health})! Fleeing immediately`);
      await this.triggerEmergencyResponse('critical_health', { health });
    }
  }

  /**
   * Handle entity movement
   */
  private async handleEntityMovement(entity: any): Promise<void> {
    // Check if entity is hostile
    if (this.isHostileEntity(entity)) {
      const distance = this.bot.entity.position.distanceTo(entity.position);

      // If hostile entity is very close, flee
      if (distance < 3) {
        console.log(
          `🚨 Hostile entity (${entity.name}) detected at distance ${distance.toFixed(1)}! Fleeing`
        );
        await this.triggerEmergencyResponse('hostile_nearby', {
          entity: entity.name,
          distance: distance,
        });
      }
    }
  }

  /**
   * Perform periodic safety check
   */
  private async performSafetyCheck(): Promise<void> {
    try {
      const threatAssessment = await this.assessThreats();

      if (threatAssessment.threatLevel === 'critical') {
        console.log(
          '🚨 Critical threat level detected! Taking immediate action'
        );
        await this.triggerEmergencyResponse(
          'critical_threat',
          threatAssessment
        );
      } else if (threatAssessment.threatLevel === 'high') {
        console.log('⚠️ High threat level detected! Taking defensive action');
        await this.triggerEmergencyResponse('high_threat', threatAssessment);
      }
    } catch (error) {
      console.error('Error during safety check:', error);
    }
  }

  /**
   * Assess current threats
   */
  private async assessThreats(): Promise<ThreatAssessment> {
    const threats: ThreatAssessment['threats'] = [];
    let maxThreatLevel = 0;

    // Check for hostile entities
    for (const entity of Object.values(this.bot.entities)) {
      if (this.isHostileEntity(entity)) {
        const distance = this.bot.entity.position.distanceTo(entity.position);
        const threatLevel = this.calculateThreatLevel(entity, distance);

        threats.push({
          type: entity.name || entity.type,
          distance,
          threatLevel,
        });

        maxThreatLevel = Math.max(maxThreatLevel, threatLevel);
      }
    }

    // Check health-based threats
    const healthThreat = Math.max(0, (20 - this.bot.health) / 20) * 100;
    if (healthThreat > 0) {
      threats.push({
        type: 'low_health',
        distance: 0,
        threatLevel: healthThreat,
      });
      maxThreatLevel = Math.max(maxThreatLevel, healthThreat);
    }

    // Determine overall threat level
    let threatLevel: ThreatAssessment['threatLevel'] = 'low';
    if (maxThreatLevel > 80) threatLevel = 'critical';
    else if (maxThreatLevel > 60) threatLevel = 'high';
    else if (maxThreatLevel > 30) threatLevel = 'medium';

    // Determine recommended action
    let recommendedAction: ThreatAssessment['recommendedAction'] = 'none';
    if (threatLevel === 'critical') {
      recommendedAction = 'flee';
    } else if (threatLevel === 'high') {
      recommendedAction = this.bot.health < 10 ? 'flee' : 'find_shelter';
    } else if (threatLevel === 'medium') {
      recommendedAction = 'find_shelter';
    }

    return {
      threatLevel,
      threats,
      recommendedAction,
    };
  }

  /**
   * Trigger emergency response
   */
  private async triggerEmergencyResponse(
    reason: string,
    context: any
  ): Promise<void> {
    console.log(`🚨 Emergency response triggered: ${reason}`, context);

    try {
      const threatAssessment = await this.assessThreats();

      switch (threatAssessment.recommendedAction) {
        case 'flee':
          if (this.config.autoFleeEnabled) {
            await this.fleeFromThreats();
          }
          break;

        case 'find_shelter':
          if (this.config.autoShelterEnabled) {
            await this.findShelter();
          }
          break;

        default:
          console.log('No emergency action needed');
      }

      this.emit('emergency-response', {
        reason,
        context,
        threatAssessment,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Emergency response failed:', error);
      this.emit('emergency-response-failed', { reason, error });
    }
  }

  /**
   * Flee from threats
   */
  private async fleeFromThreats(): Promise<void> {
    console.log('🏃 Fleeing from threats...');

    try {
      // Move away from current position
      const currentPos = this.bot.entity.position;
      const fleeDirection = this.calculateFleeDirection();

      // Move in the flee direction
      await this.actionTranslator.executeAction({
        type: 'move_forward',
        parameters: {
          distance: this.config.maxFleeDistance,
          direction: fleeDirection,
        },
        timeout: 10000,
      });

      console.log('✅ Flee action completed');
    } catch (error) {
      console.error('Flee action failed:', error);
    }
  }

  /**
   * Find shelter
   */
  private async findShelter(): Promise<void> {
    console.log('🏠 Finding shelter...');

    try {
      await this.actionTranslator.executeAction({
        type: 'find_shelter',
        parameters: { priority: 'high' },
        timeout: 15000,
      });

      console.log('✅ Shelter found');
    } catch (error) {
      console.error('Find shelter action failed:', error);
    }
  }

  /**
   * Check if bot is in water
   */
  private isInWater(): boolean {
    if (!this.bot.entity) return false;

    const pos = this.bot.entity.position;
    const block = this.bot.blockAt(pos);

    if (block && block.type !== 0) {
      // Block type 0 is air
      if (block.name.includes('water')) {
        console.log(
          `💧 Bot is in water block: ${block.name} at ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`
        );
        return true;
      }
    }

    // Check if we're in water by checking nearby blocks
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const checkPos = pos.offset(dx, dy, dz);
          const checkBlock = this.bot.blockAt(checkPos);
          if (checkBlock && checkBlock.name.includes('water')) {
            console.log(
              `💧 Bot is near water block: ${checkBlock.name} at ${checkPos.x.toFixed(1)}, ${checkPos.y.toFixed(1)}, ${checkPos.z.toFixed(1)}`
            );
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Find a safe surface position above the bot
   */
  private findSurfacePosition(): { x: number; y: number; z: number } {
    if (!this.bot.entity) return { x: 0, y: 0, z: 0 };

    const pos = this.bot.entity.position;
    console.log(
      `🔍 Looking for surface from position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`
    );

    // Look upward to find the surface
    for (let y = pos.y; y < pos.y + 20; y++) {
      const checkPos = new Vec3(pos.x, y, pos.z);
      const block = this.bot.blockAt(checkPos);

      if (block && block.type === 0) {
        // Air block
        // Check if there's a solid block below to stand on
        const belowPos = new Vec3(pos.x, y - 1, pos.z);
        const belowBlock = this.bot.blockAt(belowPos);
        if (
          belowBlock &&
          belowBlock.type !== 0 &&
          !belowBlock.name.includes('water')
        ) {
          console.log(
            `✅ Found surface at: ${pos.x.toFixed(1)}, ${y.toFixed(1)}, ${pos.z.toFixed(1)}`
          );
          return { x: pos.x, y: y, z: pos.z };
        }
      }
    }

    // If no surface found, return a position slightly above current position
    console.log(
      `⚠️ No surface found, using elevated position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1) + 2}, ${pos.z.toFixed(1)}`
    );
    return { x: pos.x, y: pos.y + 2, z: pos.z };
  }

  /**
   * Check if bot is in a pit or low area
   */
  private checkIfInPit(): boolean {
    if (!this.bot.entity) return false;

    const pos = this.bot.entity.position;
    const block = this.bot.blockAt(pos);

    // If we're in water, we already handled this case
    if (block && block.name.includes('water')) {
      return false;
    }

    // Check if we're surrounded by walls above us
    let wallCount = 0;
    const checkDistance = 2;

    for (let x = -checkDistance; x <= checkDistance; x++) {
      for (let z = -checkDistance; z <= checkDistance; z++) {
        if (x === 0 && z === 0) continue; // Skip current position

        // Check blocks above us
        for (let y = 1; y <= 5; y++) {
          const checkPos = new Vec3(pos.x + x, pos.y + y, pos.z + z);
          const checkBlock = this.bot.blockAt(checkPos);

          if (checkBlock && checkBlock.type !== 0) {
            // Not air
            wallCount++;
            break; // Found a wall at this horizontal position
          }
        }
      }
    }

    // If we're surrounded by walls above us, we're likely in a pit
    const pitThreshold = 8; // Number of walls needed to consider it a pit
    const isPit = wallCount >= pitThreshold;

    if (isPit) {
      console.log(
        `🕳️ Bot appears to be in a pit with ${wallCount} walls above`
      );
    }

    return isPit;
  }

  /**
   * Find an escape position from a pit
   */
  private findEscapePosition(): { x: number; y: number; z: number } {
    if (!this.bot.entity) return { x: 0, y: 0, z: 0 };

    const pos = this.bot.entity.position;

    // Look for an opening in the walls around us
    const searchRadius = 3;
    let bestEscapePos: { x: number; y: number; z: number } | null = null;
    let bestScore = -Infinity;

    for (let x = -searchRadius; x <= searchRadius; x++) {
      for (let z = -searchRadius; z <= searchRadius; z++) {
        if (x === 0 && z === 0) continue; // Skip current position

        // Check positions at different heights
        for (let y = -2; y <= 5; y++) {
          const checkPos = new Vec3(pos.x + x, pos.y + y, pos.z + z);
          const block = this.bot.blockAt(checkPos);

          // Prefer air blocks that have solid ground below
          if (block && block.type === 0) {
            // Air block
            const belowPos = new Vec3(pos.x + x, pos.y + y - 1, pos.z + z);
            const belowBlock = this.bot.blockAt(belowPos);

            if (
              belowBlock &&
              belowBlock.type !== 0 &&
              !belowBlock.name.includes('water')
            ) {
              // Score this position (higher is better)
              const distance = Math.sqrt(x * x + y * y + z * z);
              const heightScore = y; // Prefer higher positions
              const score = heightScore - distance * 0.1;

              if (score > bestScore) {
                bestScore = score;
                bestEscapePos = { x: pos.x + x, y: pos.y + y, z: pos.z + z };
              }
            }
          }
        }
      }
    }

    if (bestEscapePos) {
      console.log(
        `🛤️ Found escape position: ${bestEscapePos.x.toFixed(1)}, ${bestEscapePos.y.toFixed(1)}, ${bestEscapePos.z.toFixed(1)}`
      );
      return bestEscapePos;
    }

    // If no good escape found, try to go up
    console.log(
      `⚠️ No good escape found, trying to go up from current position`
    );
    return { x: pos.x, y: pos.y + 3, z: pos.z };
  }

  /**
   * Calculate flee direction (away from threats)
   */
  private calculateFleeDirection(): { x: number; y: number; z: number } {
    const botPos = this.bot.entity.position;
    let totalX = 0,
      totalZ = 0;

    console.log(
      `🏃 Calculating flee direction from position: ${botPos.x.toFixed(1)}, ${botPos.y.toFixed(1)}, ${botPos.z.toFixed(1)}`
    );

    // If in water, prioritize upward movement to reach surface
    if (this.isInWater()) {
      const surfacePos = this.findSurfacePosition();
      const fleeVector = {
        x: surfacePos.x - botPos.x,
        y: surfacePos.y - botPos.y,
        z: surfacePos.z - botPos.z,
      };

      console.log(
        `💧 In water - fleeing to surface: ${surfacePos.x.toFixed(1)}, ${surfacePos.y.toFixed(1)}, ${surfacePos.z.toFixed(1)}`
      );

      // Normalize the vector
      const magnitude = Math.sqrt(
        fleeVector.x ** 2 + fleeVector.y ** 2 + fleeVector.z ** 2
      );
      if (magnitude > 0) {
        return {
          x: fleeVector.x / magnitude,
          y: fleeVector.y / magnitude,
          z: fleeVector.z / magnitude,
        };
      }
    }

    // Check if we're in a pit or low area and need to move upward
    const isInPit = this.checkIfInPit();
    if (isInPit) {
      console.log(`🕳️ In pit - moving upward to escape`);
      const escapePos = this.findEscapePosition();
      const fleeVector = {
        x: escapePos.x - botPos.x,
        y: escapePos.y - botPos.y,
        z: escapePos.z - botPos.z,
      };

      const magnitude = Math.sqrt(
        fleeVector.x ** 2 + fleeVector.y ** 2 + fleeVector.z ** 2
      );
      if (magnitude > 0) {
        return {
          x: fleeVector.x / magnitude,
          y: fleeVector.y / magnitude,
          z: fleeVector.z / magnitude,
        };
      }
    }

    // Calculate horizontal flee direction from threats
    let threatCount = 0;

    // Calculate average direction away from threats
    for (const entity of Object.values(this.bot.entities)) {
      if (this.isHostileEntity(entity)) {
        const dx = botPos.x - entity.position.x;
        const dz = botPos.z - entity.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance > 0) {
          totalX += dx / distance;
          totalZ += dz / distance;
          threatCount++;
        }
      }
    }

    if (threatCount === 0) {
      // No threats, move in a random direction
      const angle = Math.random() * Math.PI * 2;
      return {
        x: Math.cos(angle),
        y: 0,
        z: Math.sin(angle),
      };
    }

    // Normalize the flee direction
    const magnitude = Math.sqrt(totalX * totalX + totalZ * totalZ);
    return {
      x: totalX / magnitude,
      y: 0,
      z: totalZ / magnitude,
    };
  }

  /**
   * Check if entity is hostile
   */
  private isHostileEntity(entity: any): boolean {
    const hostileTypes = [
      'zombie',
      'skeleton',
      'spider',
      'creeper',
      'enderman',
      'witch',
      'slime',
      'ghast',
      'blaze',
      'magma_cube',
      'husk',
      'drowned',
      'pillager',
      'ravager',
      'hoglin',
      'zoglin',
      'piglin_brute',
    ];

    return hostileTypes.includes(entity.name || entity.type);
  }

  /**
   * Calculate threat level based on entity and distance
   */
  private calculateThreatLevel(entity: any, distance: number): number {
    let baseThreat = 50;

    // Adjust based on entity type
    if (entity.name === 'creeper') baseThreat = 90;
    else if (entity.name === 'enderman') baseThreat = 80;
    else if (entity.name === 'zombie') baseThreat = 60;
    else if (entity.name === 'spider') baseThreat = 70;

    // Adjust based on distance (closer = more threatening)
    const distanceFactor = Math.max(0, 1 - distance / 10);
    return baseThreat * distanceFactor;
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isMonitoring: boolean;
    lastHealth: number;
    config: SafetyMonitorConfig;
  } {
    return {
      isMonitoring: this.isMonitoring,
      lastHealth: this.lastHealth,
      config: this.config,
    };
  }
}
