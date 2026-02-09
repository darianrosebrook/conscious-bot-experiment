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
import {
  RaycastEngine,
  validateSensingConfig,
  SensingConfig,
  Orientation,
} from '@conscious-bot/world';

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
  fieldOfViewDegrees: number;
}

export class ThreatPerceptionManager {
  private bot: Bot;
  private config: PerceptionConfig;
  private knownThreats = new Map<string, ThreatEntity>();
  private safetyMonitor: AutomaticSafetyMonitor;
  private raycastEngine: RaycastEngine;
  private raycastConfig: SensingConfig;
  private lastAssessmentLogAt = 0;
  private assessmentLogThrottleMs = 30000; // 30 seconds - reduce log spam
  private lastLosLogAt = new Map<string, number>();
  private losLogThrottleMs = 30000; // 30 seconds - reduce log spam
  private losSuppressedCount = new Map<string, number>();
  private losSuppressedByType = new Map<string, number>();
  private lastLosSummaryAt = 0;
  private losSummaryIntervalMs = 5000;
  private observationLogDebug = process.env.OBSERVATION_LOG_DEBUG === '1';

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
      fieldOfViewDegrees: 90,
      ...config,
    };
    this.raycastConfig = validateSensingConfig({
      maxDistance: this.config.maxDetectionRadius,
      fovDegrees: this.config.fieldOfViewDegrees,
      angularResolution: 6,
      panoramicSweep: false,
      maxRaysPerTick: 120,
      tickBudgetMs: 5,
    });
    this.raycastEngine = new RaycastEngine(this.raycastConfig, bot as any);
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
    const now = Date.now();

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

        // Check if recently detected (memory/persistence)
        const known = this.knownThreats.get(entityId);
        const lastSeen = known?.lastSeen ?? 0;
        const recentlyDetected = Date.now() - lastSeen < this.config.persistenceWindowMs;

        // For recently-detected entities: skip LOS check (we already know
        // they're there) but still include them in the threat list so
        // re-assessments during emergency response see the full picture.
        if (recentlyDetected && known) {
          // Update position/distance but keep in the threat list
          const updatedThreat: ThreatEntity = {
            ...known,
            position: entity.position,
            distance,
            lastSeen: Date.now(),
            threatLevel: this.calculateContextualThreatLevel(entity, distance, botHealth),
          };
          threats.push(updatedThreat);
          this.knownThreats.set(entityId, updatedThreat);
          maxThreatLevel = Math.max(maxThreatLevel, updatedThreat.threatLevel);
          continue;
        }

        // Perform line-of-sight check via raycasting (first detection only)
        // Entities within melee range (≤4 blocks) bypass FOV — the bot can
        // "feel" a hit even without facing the attacker.
        const withinMeleeRange = distance <= 4;
        let hasLineOfSight = withinMeleeRange; // melee-range = implicit LOS
        if (this.config.lineOfSightRequired && !withinMeleeRange) {
          hasLineOfSight = await this.checkLineOfSight(entity.position);
          if (!hasLineOfSight) {
            if (this.observationLogDebug && this.shouldLogLos(entityId, now)) {
              console.log(
                `[ThreatPerception] 🚫 no line-of-sight to ${entity.name} at ${distance.toFixed(1)} - ignoring`
              );
            } else {
              this.losSuppressedCount.set(
                entityId,
                (this.losSuppressedCount.get(entityId) ?? 0) + 1
              );
              const typeKey = entity.name || entity.type || 'unknown';
              this.losSuppressedByType.set(
                typeKey,
                (this.losSuppressedByType.get(typeKey) ?? 0) + 1
              );
            }
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

      // When low_health is the ONLY threat, don't let it trigger "critical" flee.
      // The bot can't flee from its own HP — it should seek shelter/food instead.
      const hasExternalThreats = threats.some(t => t.type !== 'low_health');
      if (!hasExternalThreats && botHealth <= 6) {
        maxThreatLevel = Math.min(maxThreatLevel, 60);
      }

      // Determine overall level and action (per original logic, but refined)
      const overallThreatLevel = this.determineThreatLevel(maxThreatLevel);
      const recommendedAction = this.determineRecommendedAction(
        overallThreatLevel,
        botHealth,
        threats,
      );

      if (now - this.lastAssessmentLogAt >= this.assessmentLogThrottleMs) {
        console.log(
          `[ThreatPerception] localized threat assessment: ${threats.length} threats, level: ${overallThreatLevel}`
        );
        this.lastAssessmentLogAt = now;
      }

      this.maybeLogLosSummary(now);
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
   * Public for use as evidence enrichment by entity belief system.
   */
  async checkLineOfSight(targetPos: Vec3): Promise<boolean> {
    const observer = this.getEyePosition();
    const orientation = this.getOrientation();
    const rayLength = targetPos.distanceTo(observer);

    return this.raycastEngine.hasLineOfSight(
      { x: observer.x, y: observer.y, z: observer.z },
      { x: targetPos.x, y: targetPos.y, z: targetPos.z },
      {
        maxDistance: rayLength,
        orientation,
        fovDegrees: this.config.fieldOfViewDegrees,
        requireFov: true,
        algorithm: 'mineflayer',
        assumeBlockedOnError: true,
      }
    );
  }

  private getEyePosition(): Vec3 {
    return this.bot.entity.position.offset(0, this.bot.entity.height, 0);
  }

  private getOrientation(): Orientation {
    return {
      yaw: this.bot.entity.yaw,
      pitch: this.bot.entity.pitch,
    };
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
   * Public for use as evidence enrichment by entity belief system.
   */
  calculateContextualThreatLevel(
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
   * Determine recommended action based on level, health, and threat composition.
   *
   * Fight conditions (all must be true):
   * - Bot is holding a weapon (sword/axe/bow/crossbow/trident)
   * - Health > 10 (half hearts)
   * - At most 2 external threats (not overwhelmed)
   * - All threats are fightable (creepers require a ranged weapon)
   *
   * Creeper rule: creepers trigger fight only if bot has a ranged weapon.
   */
  private determineRecommendedAction(
    level: 'low' | 'medium' | 'high' | 'critical',
    health: number,
    threats: ThreatEntity[] = [],
  ): 'none' | 'flee' | 'find_shelter' | 'attack' {
    // Always flee if critically low health
    if (health <= 6) return 'flee';

    // Check if bot has a weapon
    const hasWeapon = this.botHasWeapon();
    const hasRangedWeapon = this.botHasRangedWeapon();

    // Check if all threats are fightable (non-creeper, or creeper + ranged)
    const externalThreats = threats.filter(t => t.type !== 'low_health');
    const allFightable = externalThreats.every(t => {
      if (t.type === 'creeper') return hasRangedWeapon;
      return true;
    });

    // Fight conditions: armed, enough health, not overwhelmed, fightable threats
    const canFight =
      hasWeapon &&
      health > 10 &&
      externalThreats.length <= 2 &&
      externalThreats.length > 0 &&
      allFightable;

    if (level === 'critical') return canFight ? 'attack' : 'flee';
    if (level === 'high') return canFight ? 'attack' : (health < 10 ? 'flee' : 'find_shelter');
    if (level === 'medium') {
      // At medium threat, fight if armed and a threat is within melee range —
      // seeking shelter while being punched is futile.
      const meleeContact = externalThreats.some(t => t.distance <= 4);
      return canFight && meleeContact ? 'attack' : 'find_shelter';
    }
    return 'none';
  }

  /**
   * Check if bot is currently holding a melee or ranged weapon.
   */
  private botHasWeapon(): boolean {
    // Check held item first
    const held = this.bot.heldItem;
    if (held && /sword|axe|bow|crossbow|trident/.test(held.name)) return true;
    // Also check inventory — the safety monitor will equip before attacking
    const items = this.bot.inventory?.items() ?? [];
    return items.some((item: any) => /sword|axe|bow|crossbow|trident/.test(item.name));
  }

  /**
   * Check if bot is currently holding a ranged weapon (bow, crossbow, trident).
   */
  private botHasRangedWeapon(): boolean {
    const held = this.bot.heldItem;
    if (held && /bow|crossbow|trident/.test(held.name)) return true;
    const items = this.bot.inventory?.items() ?? [];
    return items.some((item: any) => /bow|crossbow|trident/.test(item.name));
  }

  private shouldLogLos(entityId: string, now: number): boolean {
    const last = this.lastLosLogAt.get(entityId) ?? 0;
    if (now - last < this.losLogThrottleMs) return false;
    this.lastLosLogAt.set(entityId, now);
    return true;
  }

  private maybeLogLosSummary(now: number): void {
    if (now - this.lastLosSummaryAt < this.losSummaryIntervalMs) return;
    let suppressedTotal = 0;
    for (const count of this.losSuppressedCount.values()) {
      suppressedTotal += count;
    }
    if (suppressedTotal > 0) {
      const byType = Array.from(this.losSuppressedByType.entries())
        .map(([type, count]) => `${type}:${count}`)
        .join(', ');
      console.log(
        `[ThreatPerception] suppressed ${suppressedTotal} LOS logs in last ${this.losSummaryIntervalMs}ms` +
          (byType ? ` (${byType})` : '')
      );
      this.losSuppressedCount.clear();
      this.losSuppressedByType.clear();
    }
    this.lastLosSummaryAt = now;
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
