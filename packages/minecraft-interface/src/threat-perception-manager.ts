/**
 * Threat Perception Manager for Minecraft Bot
 *
 * Handles localized threat detection with raycasting, line-of-sight checks,
 * and memory persistence to avoid omniscient behavior.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { AutomaticSafetyMonitor } from './automatic-safety-monitor';

export interface ThreatEntity {
  id: string;
  type: string;
  position: Vec3;
  lastSeen: number;
  distance: number;
  hasLineOfSight: boolean;
  threatLevel: number;
}

export interface PerceptionConfig {
  maxDetectionRadius: number; // e.g., 50 blocks for localized awareness
  lineOfSightRequired: boolean;
  persistenceWindowMs: number; // e.g., 5 minutes to avoid re-detection
  raycastTimeoutMs: number;
}

export class ThreatPerceptionManager {
  private bot: Bot;
  private config: PerceptionConfig;
  private knownThreats = new Map<string, ThreatEntity>();
  private safetyMonitor: AutomaticSafetyMonitor;

  constructor(
    bot: Bot,
    safetyMonitor: AutomaticSafetyMonitor,
    config: Partial<PerceptionConfig> = {}
  ) {
    this.bot = bot;
    this.safetyMonitor = safetyMonitor;
    this.config = {
      maxDetectionRadius: 50,
      lineOfSightRequired: true,
      persistenceWindowMs: 300000, // 5 minutes
      raycastTimeoutMs: 2000,
      ...config,
    };
  }

  /**
   * Assess threats with localized perception using raycasting and memory.
   * Fail-fast to safe defaults on errors.
   */
  async assessThreats(): Promise<{
    threats: ThreatEntity[];
    overallThreatLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendedAction: 'none' | 'flee' | 'find_shelter' | 'attack';
  }> {
    // Safe default: No threats detected
    const threats: ThreatEntity[] = [];
    let maxThreatLevel = 0;

    try {
      // Get current bot health for context
      const botHealth = this.bot.health ?? 20;

      // Scan entities within radius
      const nearbyEntities = this.getEntitiesInRadius(
        this.config.maxDetectionRadius
      );

      for (const entity of nearbyEntities) {
        if (!this.safetyMonitor['isHostileEntity'](entity)) continue;

        const distance = this.bot.entity.position.distanceTo(entity.position);
        const entityId = `${entity.name || entity.type}_${entity.id}`;

        // Skip if recently detected (memory/persistence)
        const lastSeen = this.knownThreats.get(entityId)?.lastSeen ?? 0;
        if (Date.now() - lastSeen < this.config.persistenceWindowMs) {
          continue;
        }

        // Perform line-of-sight check via raycasting
        let hasLineOfSight = false;
        if (this.config.lineOfSightRequired) {
          hasLineOfSight = await this.checkLineOfSight(entity.position);
          if (!hasLineOfSight) {
            console.log(
              `🚫 No line-of-sight to ${entity.name} at distance ${distance.toFixed(1)} - ignoring`
            );
            continue;
          }
        }

        // Calculate threat level (similar to original logic, but contextual)
        const threatLevel = this.calculateContextualThreatLevel(
          entity,
          distance,
          botHealth
        );
        maxThreatLevel = Math.max(maxThreatLevel, threatLevel);

        const threat: ThreatEntity = {
          id: entityId,
          type: entity.name || entity.type,
          position: entity.position,
          lastSeen: Date.now(),
          distance,
          hasLineOfSight,
          threatLevel,
        };

        threats.push(threat);
        this.knownThreats.set(entityId, threat);
      }

      // Add health-based threat if critical
      if (botHealth <= 6) {
        const healthThreat: ThreatEntity = {
          id: 'low_health_self',
          type: 'low_health',
          position: this.bot.entity.position,
          lastSeen: Date.now(),
          distance: 0,
          hasLineOfSight: true,
          threatLevel: Math.max(0, (20 - botHealth) / 20) * 100,
        };
        threats.push(healthThreat);
        maxThreatLevel = Math.max(maxThreatLevel, healthThreat.threatLevel);
      }

      // Determine overall level and action (per original logic, but refined)
      const overallThreatLevel = this.determineThreatLevel(maxThreatLevel);
      const recommendedAction = this.determineRecommendedAction(
        overallThreatLevel,
        botHealth
      );

      console.log(
        `🧠 Localized threat assessment: ${threats.length} threats, level: ${overallThreatLevel}`
      );
      return { threats, overallThreatLevel, recommendedAction };
    } catch (error) {
      console.error('Error in threat assessment:', error);
      // Fail-fast: Return safe default
      return {
        threats: [],
        overallThreatLevel: 'low',
        recommendedAction: 'none',
      };
    }
  }

  /**
   * Check line-of-sight using the world package's raycasting system.
   */
  private async checkLineOfSight(targetPos: Vec3): Promise<boolean> {
    try {
      const botPos = this.bot.entity.position;
      const direction = targetPos.minus(botPos).normalize();
      const rayLength = targetPos.distanceTo(botPos);

      // Use the world package's raycasting API
      const worldUrl = process.env.WORLD_SERVICE_URL || 'http://localhost:3004';

      const response = await fetch(`${worldUrl}/api/perception/raycast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { x: botPos.x, y: botPos.y, z: botPos.z },
          direction: { x: direction.x, y: direction.y, z: direction.z },
          maxDistance: rayLength,
          algorithm: 'mineflayer', // Use Mineflayer integration
        }),
      });

      if (!response.ok) {
        console.log(`World raycast API failed, falling back to basic check`);
        return this.fallbackLineOfSightCheck(targetPos);
      }

      const result = (await response.json()) as {
        hit: { distance: number } | null;
      };
      return result.hit === null || result.hit.distance >= rayLength;
    } catch (error) {
      console.log(
        `Raycast failed for ${targetPos} - falling back to basic check:`,
        error
      );
      return this.fallbackLineOfSightCheck(targetPos);
    }
  }

  /**
   * Fallback line-of-sight check using basic block detection
   */
  private fallbackLineOfSightCheck(targetPos: Vec3): boolean {
    try {
      const blockAtTarget = this.bot.blockAt(targetPos);
      return !blockAtTarget || blockAtTarget.type === 0; // Direct path assumed if no solid block
    } catch (error) {
      return false; // Safe default: Assume no line-of-sight on error
    }
  }

  /**
   * Get entities within detection radius.
   */
  private getEntitiesInRadius(radius: number): any[] {
    const botPos = this.bot.entity.position;
    const entities: any[] = [];

    for (const entity of Object.values(this.bot.entities)) {
      const distance = botPos.distanceTo(entity.position);
      if (distance <= radius) {
        entities.push(entity);
      }
    }

    return entities;
  }

  /**
   * Calculate threat level with contextual factors.
   */
  private calculateContextualThreatLevel(
    entity: any,
    distance: number,
    botHealth: number
  ): number {
    let baseThreat = 50;

    // Base threat by type (from original)
    if (entity.name === 'creeper') baseThreat = 90;
    else if (entity.name === 'enderman') baseThreat = 80;
    else if (entity.name === 'zombie') baseThreat = 60;
    else if (entity.name === 'spider') baseThreat = 70;

    // Adjust for distance and health
    const distanceFactor = Math.max(
      0,
      1 - distance / this.config.maxDetectionRadius
    );
    const healthFactor = botHealth <= 6 ? 1.5 : 1; // Amplify if low health

    return baseThreat * distanceFactor * healthFactor;
  }

  /**
   * Determine overall threat level.
   */
  private determineThreatLevel(
    maxThreatLevel: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (maxThreatLevel > 80) return 'critical';
    if (maxThreatLevel > 60) return 'high';
    if (maxThreatLevel > 30) return 'medium';
    return 'low';
  }

  /**
   * Determine recommended action based on level and health.
   */
  private determineRecommendedAction(
    level: 'low' | 'medium' | 'high' | 'critical',
    health: number
  ): 'none' | 'flee' | 'find_shelter' | 'attack' {
    if (level === 'critical') return 'flee';
    if (level === 'high') return health < 10 ? 'flee' : 'find_shelter';
    if (level === 'medium') return 'find_shelter';
    return 'none';
  }

  /**
   * Clean up old threats from memory.
   */
  cleanupOldThreats(): void {
    const now = Date.now();
    for (const [id, threat] of this.knownThreats.entries()) {
      if (now - threat.lastSeen > this.config.persistenceWindowMs) {
        this.knownThreats.delete(id);
      }
    }
  }
}
