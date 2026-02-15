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
import { ActionTranslator, type NavLeaseParams } from './action-translator';
import { ThreatPerceptionManager } from './threat-perception-manager';
import type { BeliefBus } from './entity-belief/belief-bus';
import { assessReflexThreats } from './reflex/reflex-safety';
import type { ReflexArbitrator } from './reflex/reflex-arbitrator';

export interface SafetyMonitorConfig {
  healthThreshold: number; // Trigger emergency response when health drops below this
  checkInterval: number; // How often to check health (ms)
  autoFleeEnabled: boolean;
  autoShelterEnabled: boolean;
  autoAttackEnabled: boolean;
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
  private threatPerceptionManager: ThreatPerceptionManager;
  private config: SafetyMonitorConfig;
  private isMonitoring = false;
  private lastHealth = 20;
  private lastPosition: any = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastLogAt = new Map<string, number>();
  private lastEmergencyAt = new Map<string, number>();
  private lastEntityObservation = new Map<string, { lastSeen: number; lastDistance: number }>();
  private readonly logThrottleMs = 1000;
  private readonly waterLogThrottleMs = 5000;
  private readonly emergencyCooldownMs = 15000;
  private readonly entityObservationCooldownMs = 1000;
  private readonly entityDistanceDelta = 0.5;
  private observationLogDebug = process.env.OBSERVATION_LOG_DEBUG === '1';
  private lastWaterStrategyKey: string | null = null;
  private lastWaterStrategyLogAt = 0;
  private beliefBus: BeliefBus | null = null;
  private reflexArbitrator: ReflexArbitrator | null = null;
  private fleeFailCount = 0;
  private lastFleePos: Vec3 | null = null;
  private fleeBackoffUntil = 0;
  private combatInProgress = false;

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
      autoAttackEnabled: true,
      maxFleeDistance: 20,
      ...config,
    };

    // Initialize threat perception manager for localized detection
    this.threatPerceptionManager = new ThreatPerceptionManager(bot, this, {
      maxDetectionRadius: 50,
      lineOfSightRequired: true,
      persistenceWindowMs: 300000,
    });
  }

  /**
   * Inject belief system references for snapshot-based threat assessment.
   * When set, performSafetyCheck reads from belief snapshot instead of
   * direct entity scan.
   */
  setBeliefSystem(beliefBus: BeliefBus, reflexArbitrator: ReflexArbitrator): void {
    this.beliefBus = beliefBus;
    this.reflexArbitrator = reflexArbitrator;
  }

  /**
   * Start automatic safety monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    // Safety monitoring started (verbose logging suppressed)

    // Initialize lastHealth from the bot's actual health so we don't trigger
    // a false health_drop on the first poll (e.g. bot reconnects at 5 HP,
    // lastHealth was 20 → spurious 15 HP "drop" → constant flee loops).
    this.lastHealth = this.bot.health ?? 20;

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
      // Clean up old threats from memory
      this.threatPerceptionManager.cleanupOldThreats();
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
      if (this.shouldLog('health-drop', this.logThrottleMs)) {
        console.log(
          `[SafetyMonitor] 🚨 Health dropped from ${this.lastHealth +
            healthDrop} to ${health}! Triggering emergency response`
        );
      }
      await this.triggerEmergencyResponse('health_drop', {
        health,
        healthDrop,
      });
    }

    // If health is critically low, flee immediately
    if (health < 8) {
      if (this.shouldLog('critical-health', this.logThrottleMs)) {
        console.log(
          `[SafetyMonitor] 🚨 Critical health (${health})! Fleeing immediately`
        );
      }
      await this.triggerEmergencyResponse('critical_health', { health });
    }
  }

  /**
   * Handle entity movement - now handled by ThreatPerceptionManager for consistency.
   * Kept for backward compatibility; main logic moved to assessThreats.
   */
  private async handleEntityMovement(entity: any): Promise<void> {
    // Lightweight check for immediate threats (<3 blocks) to maintain reactivity
    if (this.isHostileEntity(entity)) {
      if (!entity?.position) return;
      const distance = this.bot.entity.position.distanceTo(entity.position);
      const entityKey = this.getEntityKey(entity);
      if (!this.shouldHandleEntity(entityKey, distance)) {
        return;
      }
      if (distance < 3) {
        if (this.shouldLog('immediate-threat', this.logThrottleMs)) {
          console.log(
            `[SafetyMonitor] 🚨 Immediate threat: ${entity.name} at ${distance.toFixed(
              1
            )} blocks! Triggering response`
          );
        }
        await this.triggerEmergencyResponse('hostile_nearby', {
          entity: entity.name,
          entityId: entityKey,
          distance: distance,
        });
      }
    }
  }

  /**
   * Perform periodic safety check
   */
  private async performSafetyCheck(): Promise<void> {
    // Reset flee backoff if bot has moved significantly (e.g. player teleported, or
    // the bot was moved by another system). This prevents stale backoffs.
    if (this.lastFleePos && this.bot.entity) {
      const distFromLastFlee = this.bot.entity.position.distanceTo(this.lastFleePos);
      if (distFromLastFlee > 5) {
        this.fleeFailCount = 0;
        this.fleeBackoffUntil = 0;
        this.lastFleePos = null;
      }
    }

    try {
      // Use belief snapshot when available (no duplicate entity scan)
      if (this.beliefBus) {
        const snapshot = this.beliefBus.getCurrentSnapshot();
        const reflexResult = assessReflexThreats(snapshot);

        // Check for actionable threats: high/critical always, medium if close
        const hasHighOrAbove = reflexResult.threats.some(
          (t) => t.threatLevel === 'critical' || t.threatLevel === 'high'
        );
        // Medium threats in melee range (distBucket ≤ 2 ≈ ≤4 blocks) also
        // need evaluation — the fight decision logic handles medium+melee.
        const hasMediumMelee = !hasHighOrAbove && reflexResult.threats.some(
          (t) => t.threatLevel === 'medium' && t.distBucket <= 2
        );

        if (hasHighOrAbove || hasMediumMelee) {
          const threatLevel = reflexResult.hasCriticalThreat
            ? 'critical'
            : hasHighOrAbove
              ? 'high'
              : 'medium';
          const reason = reflexResult.hasCriticalThreat
            ? 'critical_threat'
            : hasHighOrAbove
              ? 'high_threat'
              : 'medium_melee_threat';

          if (this.shouldLog(`${threatLevel}-threat`, this.logThrottleMs)) {
            const icon = threatLevel === 'critical' ? '🚨' : threatLevel === 'high' ? '⚠️' : '⚔️';
            console.log(
              `[SafetyMonitor] ${icon} ${threatLevel} threat from belief snapshot`
            );
          }
          await this.triggerEmergencyResponse(reason, {
            threatLevel,
            threats: reflexResult.threats.map((t) => ({
              type: t.classLabel,
              distance: t.distBucket * 2,
              threatLevel: t.threatLevel === 'critical' ? 100 : 70,
            })),
            recommendedAction: threatLevel, // Let triggerEmergencyResponse re-assess
          });
        }
        return;
      }

      // Legacy fallback: direct entity scan via ThreatPerceptionManager
      const threatAssessment = await this.assessThreats();

      if (threatAssessment.threatLevel === 'critical') {
        if (this.shouldLog('critical-threat', this.logThrottleMs)) {
          console.log(
            '[SafetyMonitor] 🚨 Critical threat level detected! Taking immediate action'
          );
        }
        await this.triggerEmergencyResponse(
          'critical_threat',
          threatAssessment
        );
      } else if (threatAssessment.threatLevel === 'high') {
        if (this.shouldLog('high-threat', this.logThrottleMs)) {
          console.log(
            '[SafetyMonitor] ⚠️ High threat level detected! Taking defensive action'
          );
        }
        await this.triggerEmergencyResponse('high_threat', threatAssessment);
      }
    } catch (error) {
      console.error('Error during safety check:', error);
    }
  }

  /**
   * Assess current threats using the new localized perception manager.
   */
  private async assessThreats(): Promise<ThreatAssessment> {
    const result = await this.threatPerceptionManager.assessThreats();

    // Convert to original ThreatAssessment format for compatibility
    const threats: ThreatAssessment['threats'] = result.threats.map((t) => ({
      type: t.type,
      distance: t.distance,
      threatLevel: t.threatLevel,
    }));

    return {
      threatLevel: result.overallThreatLevel,
      threats,
      recommendedAction: result.recommendedAction,
    };
  }

  /**
   * Trigger emergency response
   */
  private async triggerEmergencyResponse(
    reason: string,
    context: any
  ): Promise<void> {
    if (!this.shouldTriggerEmergency(reason, context)) {
      if (this.shouldLog('emergency-suppressed', this.logThrottleMs)) {
        console.log(
          `[SafetyMonitor] 🚫 Emergency response suppressed (cooldown): ${reason}`
        );
      }
      return;
    }
    if (this.shouldLog(`emergency-${reason}`, this.logThrottleMs)) {
      console.log(
        `[SafetyMonitor] 🚨 Emergency response triggered: ${reason}`,
        context
      );
    }

    try {
      const threatAssessment = await this.assessThreats();

      switch (threatAssessment.recommendedAction) {
        case 'attack':
          if (this.config.autoAttackEnabled) {
            await this.attackNearestThreat(threatAssessment);
          }
          break;

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
          if (this.shouldLog('no-emergency', this.logThrottleMs)) {
            console.log('[SafetyMonitor] No emergency action needed');
          }
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
    if (this.shouldLog('flee', this.logThrottleMs)) {
      console.log('[SafetyMonitor] 🏃 Fleeing from threats...');
    }

    // Lease context propagated through action parameters.
    // executeNavigate() will acquire the lease as 'safety-monitor' with 'emergency'
    // priority, which preempts any normal-priority holder. No pre-acquisition needed.
    const leaseParams: NavLeaseParams = {
      navLeaseHolder: 'safety-monitor',
      navigationPriority: 'emergency',
    };

    const startPos = this.bot.entity.position.clone();

    try {
      // Move away from current position
      const currentPos = this.bot.entity.position;
      const fleeDirection = this.calculateFleeDirection();
      const fleeTarget = this.computeFleeTarget(currentPos, fleeDirection);

      if (fleeTarget) {
        await this.actionTranslator.executeAction({
          type: 'navigate',
          parameters: {
            target: fleeTarget,
            range: 2,
            sprint: true,
            ...leaseParams,
          },
          timeout: 12000,
        });
      } else {
        await this.actionTranslator.executeAction({
          type: 'move_forward',
          parameters: {
            distance: this.config.maxFleeDistance,
            direction: fleeDirection,
          },
          timeout: 10000,
        });
      }

      // Check if the bot actually moved meaningfully
      const endPos = this.bot.entity.position;
      const distanceMoved = startPos.distanceTo(endPos);

      if (distanceMoved < 2) {
        // Flee failed — bot didn't move. Apply escalating backoff.
        this.fleeFailCount++;
        const backoffMs = Math.min(30000, 1000 * Math.pow(4, this.fleeFailCount));
        this.fleeBackoffUntil = Date.now() + backoffMs;
        this.lastFleePos = startPos;
        if (this.shouldLog('flee-stuck', this.logThrottleMs)) {
          console.log(
            `[SafetyMonitor] ⚠️ Flee failed (moved ${distanceMoved.toFixed(1)} blocks). ` +
            `Backoff ${(backoffMs / 1000).toFixed(0)}s (attempt #${this.fleeFailCount})`
          );
        }
      } else {
        // Flee succeeded — reset backoff
        this.fleeFailCount = 0;
        this.fleeBackoffUntil = 0;
        this.lastFleePos = null;
        if (this.shouldLog('flee-complete', this.logThrottleMs)) {
          console.log('[SafetyMonitor] ✅ Flee action completed');
        }
      }
    } catch (error) {
      // Navigate threw — treat as a failed flee
      this.fleeFailCount++;
      const backoffMs = Math.min(30000, 1000 * Math.pow(4, this.fleeFailCount));
      this.fleeBackoffUntil = Date.now() + backoffMs;
      this.lastFleePos = startPos;
      console.error(
        `Flee action failed (backoff ${(backoffMs / 1000).toFixed(0)}s, attempt #${this.fleeFailCount}):`,
        error
      );
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
        parameters: {
          priority: 'high',
          navLeaseHolder: 'safety-monitor',
          navigationPriority: 'emergency',
        },
        timeout: 15000,
      });

      console.log('✅ Shelter found');
    } catch (error) {
      console.error('Find shelter action failed:', error);
    }
  }

  /**
   * Engage the nearest hostile entity in combat.
   * Equips best weapon first, then delegates to the attack_entity action.
   * Falls back to flee if no valid target found or combat fails.
   */
  private async attackNearestThreat(assessment: ThreatAssessment): Promise<void> {
    // Prevent re-entry: calling pvp.attack() while already attacking resets the
    // PVP plugin and fires stoppedAttacking on the previous engagement, causing
    // 0ms duration combat.
    if (this.combatInProgress) {
      if (this.shouldLog('attack-reentry', this.logThrottleMs)) {
        console.log('[SafetyMonitor] ⚔️ Combat already in progress, skipping re-entry');
      }
      return;
    }

    if (this.shouldLog('attack', this.logThrottleMs)) {
      console.log('[SafetyMonitor] Engaging nearest threat...');
    }

    // Find nearest hostile entity from bot.entities
    let nearest: any = null;
    let nearestDist = Infinity;
    for (const entity of Object.values(this.bot.entities)) {
      if (!this.isHostileEntity(entity) || !entity?.position) continue;
      const dist = this.bot.entity.position.distanceTo(entity.position);
      if (dist < nearestDist && dist < 16) {
        nearest = entity;
        nearestDist = dist;
      }
    }

    if (!nearest) {
      if (this.shouldLog('attack-no-target', this.logThrottleMs)) {
        console.log('[SafetyMonitor] No valid target found, falling back to flee');
      }
      if (this.config.autoFleeEnabled) await this.fleeFromThreats();
      return;
    }

    this.combatInProgress = true;
    try {
      // Equip best weapon first
      await this.actionTranslator.executeAction({
        type: 'equip_weapon',
        parameters: { preferredType: 'any' },
        timeout: 3000,
      });

      // Attack the entity
      await this.actionTranslator.executeAction({
        type: 'attack_entity',
        parameters: {
          entityId: nearest.id,
          radius: 16,
          duration: 10000,
          retreatHealth: 6,
        },
        timeout: 15000,
      });

      if (this.shouldLog('attack-complete', this.logThrottleMs)) {
        console.log('[SafetyMonitor] ✅ Combat engagement completed');
      }
    } catch (error) {
      console.error('Combat engagement failed, falling back to flee:', error);
      if (this.config.autoFleeEnabled) await this.fleeFromThreats();
    } finally {
      this.combatInProgress = false;
    }
  }

  /**
   * Enhanced water detection with depth and current analysis
   */
  private isInWater(): boolean {
    if (!this.bot.entity) return false;

    const pos = this.bot.entity.position;
    const block = this.bot.blockAt(pos);

    if (block && block.type !== 0) {
      // Block type 0 is air
      if (block.name.includes('water')) {
        if (this.shouldLog('water-block', this.logThrottleMs)) {
          console.log(
            `[SafetyMonitor] 💧 Bot is in water block: ${block.name} at ${pos.x.toFixed(
              1
            )}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`
          );
        }
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
            if (this.shouldLog('water-near', this.logThrottleMs)) {
              console.log(
                `[SafetyMonitor] 💧 Bot is near water block: ${checkBlock.name} at ${checkPos.x.toFixed(
                  1
                )}, ${checkPos.y.toFixed(1)}, ${checkPos.z.toFixed(1)}`
              );
            }
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Analyze water environment around the bot
   */
  private analyzeWaterEnvironment(): {
    isInWater: boolean;
    waterDepth: number;
    surfaceLevel: number;
    hasCurrent: boolean;
    currentDirection: { x: number; y: number; z: number };
    safeSurfacePositions: Array<{ x: number; y: number; z: number }>;
    nearestSurface: { x: number; y: number; z: number };
  } {
    if (!this.bot.entity) {
      return {
        isInWater: false,
        waterDepth: 0,
        surfaceLevel: 0,
        hasCurrent: false,
        currentDirection: { x: 0, y: 0, z: 0 },
        safeSurfacePositions: [],
        nearestSurface: { x: 0, y: 0, z: 0 },
      };
    }

    const pos = this.bot.entity.position;
    const isInWater = this.isInWater();

    if (!isInWater) {
      return {
        isInWater: false,
        waterDepth: 0,
        surfaceLevel: pos.y,
        hasCurrent: false,
        currentDirection: { x: 0, y: 0, z: 0 },
        safeSurfacePositions: [{ x: pos.x, y: pos.y, z: pos.z }],
        nearestSurface: { x: pos.x, y: pos.y, z: pos.z },
      };
    }

    // Find surface level
    let surfaceLevel = pos.y;
    let waterDepth = 0;

    // Look upward to find air blocks (surface)
    for (let y = pos.y; y < pos.y + 30; y++) {
      const checkPos = new Vec3(pos.x, y, pos.z);
      const block = this.bot.blockAt(checkPos);

      if (block && block.type === 0) {
        // Found air block - this is the surface
        surfaceLevel = y;
        break;
      }
    }

    // Calculate water depth
    waterDepth = Math.max(0, surfaceLevel - pos.y);

    // Find safe surface positions
    const safeSurfacePositions: Array<{ x: number; y: number; z: number }> = [];
    const searchRadius = 5;

    // Look for accessible surface positions within radius
    for (let x = -searchRadius; x <= searchRadius; x++) {
      for (let z = -searchRadius; z <= searchRadius; z++) {
        // Check multiple heights for each horizontal position
        for (let yOffset = -2; yOffset <= 3; yOffset++) {
          const surfacePos = new Vec3(
            pos.x + x,
            surfaceLevel + yOffset,
            pos.z + z
          );
          const block = this.bot.blockAt(surfacePos);

          // Check if this is a safe surface position
          if (block && block.type === 0) {
            // Air block at surface level
            const belowPos = new Vec3(
              pos.x + x,
              surfaceLevel + yOffset - 1,
              pos.z + z
            );
            const belowBlock = this.bot.blockAt(belowPos);

            // Has solid ground below and not obstructed
            if (
              belowBlock &&
              belowBlock.type !== 0 &&
              !belowBlock.name.includes('water')
            ) {
              safeSurfacePositions.push(surfacePos);
            }
          }
        }
      }
    }

    // Find nearest safe surface position
    let nearestSurface = { x: pos.x, y: pos.y + 2, z: pos.z }; // Default fallback
    let nearestDistance = Infinity;

    for (const surfacePos of safeSurfacePositions) {
      const distance = Math.sqrt(
        Math.pow(surfacePos.x - pos.x, 2) +
          Math.pow(surfacePos.y - pos.y, 2) +
          Math.pow(surfacePos.z - pos.z, 2)
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSurface = surfacePos;
      }
    }

    // Analyze water currents (simplified - would need more complex logic in real implementation)
    const hasCurrent = Math.random() < 0.3; // 30% chance of current for demo
    const currentDirection = hasCurrent
      ? {
          x: (Math.random() - 0.5) * 0.5,
          y: 0,
          z: (Math.random() - 0.5) * 0.5,
        }
      : { x: 0, y: 0, z: 0 };

    console.log(`🌊 Water environment analysis:`, {
      waterDepth,
      surfaceLevel,
      safeSurfacePositions: safeSurfacePositions.length,
      hasCurrent,
      nearestDistance: nearestDistance.toFixed(2),
    });

    return {
      isInWater: true,
      waterDepth,
      surfaceLevel,
      hasCurrent,
      currentDirection,
      safeSurfacePositions,
      nearestSurface,
    };
  }

  /**
   * Enhanced water navigation strategy selection with buoyancy considerations
   */
  private selectWaterNavigationStrategy(
    waterEnv: ReturnType<typeof this.analyzeWaterEnvironment>
  ): {
    strategy:
      | 'surface_escape'
      | 'deep_dive'
      | 'lateral_swim'
      | 'stay_submerged'
      | 'buoyancy_float';
    targetPosition: { x: number; y: number; z: number };
    reasoning: string;
    buoyancyStrategy?: 'float_up' | 'controlled_sink' | 'neutral_buoyancy';
  } {
    const {
      waterDepth,
      surfaceLevel,
      nearestSurface,
      hasCurrent,
      currentDirection,
      safeSurfacePositions,
    } = waterEnv;

    // Strategy 1: Emergency deep water - if depth > 15, prioritize buoyancy-based escape
    if (waterDepth > 15) {
      if (safeSurfacePositions.length > 0) {
        return {
          strategy: 'surface_escape',
          targetPosition: nearestSurface,
          reasoning: `Critical depth (${waterDepth} blocks) - emergency surface escape required`,
          buoyancyStrategy: 'float_up',
        };
      } else {
        return {
          strategy: 'buoyancy_float',
          targetPosition: {
            x: nearestSurface.x,
            y: Math.max(nearestSurface.y - 5, 0),
            z: nearestSurface.z,
          },
          reasoning: `Extreme depth with no surface access - using buoyancy to find safe depth`,
          buoyancyStrategy: 'neutral_buoyancy',
        };
      }
    }

    // Strategy 2: Deep water (10-15 blocks) - controlled ascent
    if (waterDepth > 10) {
      if (safeSurfacePositions.length > 0) {
        return {
          strategy: 'surface_escape',
          targetPosition: nearestSurface,
          reasoning: `Deep water (${waterDepth} blocks) - controlled ascent to surface`,
          buoyancyStrategy: 'controlled_sink',
        };
      } else {
        return {
          strategy: 'deep_dive',
          targetPosition: {
            x: nearestSurface.x,
            y: Math.max(nearestSurface.y - 8, 0),
            z: nearestSurface.z,
          },
          reasoning: `No safe surface found - diving to find alternative escape route`,
          buoyancyStrategy: 'neutral_buoyancy',
        };
      }
    }

    // Strategy 3: Medium water (5-10 blocks) - intelligent navigation
    if (waterDepth > 5) {
      // Check for strong currents that might help or hinder
      const currentStrength = Math.sqrt(
        currentDirection.x ** 2 + currentDirection.z ** 2
      );

      if (hasCurrent && currentStrength > 0.4) {
        // Use current to assist movement
        return {
          strategy: 'lateral_swim',
          targetPosition: {
            x: nearestSurface.x + currentDirection.x * 15,
            y: nearestSurface.y,
            z: nearestSurface.z + currentDirection.z * 15,
          },
          reasoning: `Strong current detected (${currentStrength.toFixed(2)}) - using current-assisted swimming`,
          buoyancyStrategy: 'float_up',
        };
      }

      // Standard medium-depth navigation
      return {
        strategy: 'surface_escape',
        targetPosition: nearestSurface,
        reasoning: `Medium water depth (${waterDepth} blocks) - ascending to surface`,
        buoyancyStrategy: 'controlled_sink',
      };
    }

    // Strategy 4: Shallow water (< 5 blocks) - flexible strategies
    if (waterDepth <= 5) {
      // If current is strong, use it for navigation
      if (
        hasCurrent &&
        Math.sqrt(currentDirection.x ** 2 + currentDirection.z ** 2) > 0.3
      ) {
        return {
          strategy: 'lateral_swim',
          targetPosition: {
            x: nearestSurface.x + currentDirection.x * 8,
            y: nearestSurface.y,
            z: nearestSurface.z + currentDirection.z * 8,
          },
          reasoning: `Strong current detected - current-assisted lateral swimming`,
          buoyancyStrategy: 'float_up',
        };
      }

      // If surface is obstructed, consider staying submerged briefly
      if (safeSurfacePositions.length === 0) {
        return {
          strategy: 'stay_submerged',
          targetPosition: {
            x: nearestSurface.x,
            y: nearestSurface.y - 2,
            z: nearestSurface.z,
          },
          reasoning: `Shallow water with obstructed surface - staying submerged temporarily`,
          buoyancyStrategy: 'neutral_buoyancy',
        };
      }

      // Default shallow water strategy
      return {
        strategy: 'surface_escape',
        targetPosition: nearestSurface,
        reasoning: `Shallow water (${waterDepth} blocks) - easy surface access`,
        buoyancyStrategy: 'float_up',
      };
    }

    // Fallback strategy
    return {
      strategy: 'surface_escape',
      targetPosition: nearestSurface,
      reasoning: `Fallback water escape strategy`,
      buoyancyStrategy: 'float_up',
    };
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

    // Check if we're surrounded by solid walls above us
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
            // Not air — but only count truly solid, impassable blocks.
            // Skip transparent/passable blocks like leaves, logs, fences, etc.
            // that commonly appear in forests and cause false pit detection.
            if (checkBlock.boundingBox !== 'block') break;
            const name = checkBlock.name;
            if (
              name.includes('leaves') ||
              name.includes('log') ||
              name.includes('wood') ||
              name.includes('glass') ||
              name.includes('fence') ||
              name.includes('vine') ||
              name.includes('flower') ||
              name.includes('grass') ||
              name.includes('sapling') ||
              name.includes('torch') ||
              name.includes('carpet') ||
              name.includes('banner')
            ) {
              break;
            }
            wallCount++;
            break; // Found a solid wall at this horizontal position
          }
        }
      }
    }

    // If we're surrounded by walls above us, we're likely in a pit.
    // Threshold raised to 12 (50% of ~24 positions) to reduce false positives
    // from natural terrain features like overhangs.
    const pitThreshold = 12;
    const isPit = wallCount >= pitThreshold;

    if (isPit && this.shouldLog('pit-detected', this.logThrottleMs)) {
      console.log(
        `[SafetyMonitor] 🕳️ Bot appears to be in a pit with ${wallCount} walls above`
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
      if (this.shouldLog('pit-escape', this.logThrottleMs)) {
        console.log(
          `[SafetyMonitor] 🛤️ Found escape position: ${bestEscapePos.x.toFixed(
            1
          )}, ${bestEscapePos.y.toFixed(1)}, ${bestEscapePos.z.toFixed(1)}`
        );
      }
      return bestEscapePos;
    }

    // If no good escape found, try to go up
    if (this.shouldLog('pit-no-escape', this.logThrottleMs)) {
      console.log(
        `[SafetyMonitor] ⚠️ No good escape found, trying to go up from current position`
      );
    }
    return { x: pos.x, y: pos.y + 3, z: pos.z };
  }

  /**
   * Calculate flee direction (away from threats)
   */
  private calculateFleeDirection(): { x: number; y: number; z: number } {
    const botPos = this.bot.entity.position;
    let totalX = 0,
      totalZ = 0;

    if (this.shouldLog('flee-direction', this.logThrottleMs)) {
      console.log(
        `[SafetyMonitor] 🏃 Calculating flee direction from position: ${botPos.x.toFixed(
          1
        )}, ${botPos.y.toFixed(1)}, ${botPos.z.toFixed(1)}`
      );
    }

    // Enhanced water navigation with intelligent strategy selection and buoyancy
    if (this.isInWater()) {
      const waterEnv = this.analyzeWaterEnvironment();
      const waterStrategy = this.selectWaterNavigationStrategy(waterEnv);

      const strategyKey = `${waterStrategy.strategy}:${waterStrategy.buoyancyStrategy}:${Math.round(
        waterEnv.waterDepth
      )}:${waterEnv.hasCurrent ? 'current' : 'still'}`;
      const now = Date.now();
      if (
        this.lastWaterStrategyKey !== strategyKey ||
        now - this.lastWaterStrategyLogAt > this.waterLogThrottleMs
      ) {
        console.log(
          `[SafetyMonitor] 🌊 WaterNav ${waterStrategy.strategy} (${waterStrategy.buoyancyStrategy}) depth=${waterEnv.waterDepth} current=${waterEnv.hasCurrent} safeSurfaces=${waterEnv.safeSurfacePositions.length}`
        );
        this.lastWaterStrategyKey = strategyKey;
        this.lastWaterStrategyLogAt = now;
      }

      const fleeVector = {
        x: waterStrategy.targetPosition.x - botPos.x,
        y: waterStrategy.targetPosition.y - botPos.y,
        z: waterStrategy.targetPosition.z - botPos.z,
      };

      // Apply buoyancy effects to the flee vector
      if (waterStrategy.buoyancyStrategy) {
        switch (waterStrategy.buoyancyStrategy) {
          case 'float_up':
            // Emphasize upward movement for surface escape
            fleeVector.y = Math.max(fleeVector.y, waterEnv.waterDepth * 0.5);
            if (this.observationLogDebug && this.shouldLog('buoyancy-float', this.logThrottleMs)) {
              console.log(
                '[SafetyMonitor] 🆙 Applying buoyancy - emphasizing upward movement'
              );
            }
            break;
          case 'controlled_sink':
            // Reduce upward movement for controlled descent
            fleeVector.y = Math.min(fleeVector.y, waterEnv.waterDepth * 0.2);
            if (this.observationLogDebug && this.shouldLog('buoyancy-sink', this.logThrottleMs)) {
              console.log(
                '[SafetyMonitor] ⚖️ Applying controlled buoyancy - moderating movement'
              );
            }
            break;
          case 'neutral_buoyancy':
            // Balance movement to maintain current depth
            fleeVector.y = 0;
            if (this.observationLogDebug && this.shouldLog('buoyancy-neutral', this.logThrottleMs)) {
              console.log(
                '[SafetyMonitor] 🔄 Applying neutral buoyancy - maintaining depth'
              );
            }
            break;
        }
      }

      if (this.observationLogDebug && this.shouldLog('water-nav-target', this.logThrottleMs)) {
        console.log(
          `[SafetyMonitor] 💧 Water navigation - ${waterStrategy.strategy.replace(
            '_',
            ' '
          )} with ${waterStrategy.buoyancyStrategy}: ${waterStrategy.targetPosition.x.toFixed(
            1
          )}, ${waterStrategy.targetPosition.y.toFixed(1)}, ${waterStrategy.targetPosition.z.toFixed(
            1
          )}`
        );
      }

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
      if (this.shouldLog('pit-up', this.logThrottleMs)) {
        console.log('[SafetyMonitor] 🕳️ In pit - moving upward to escape');
      }
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

  private shouldLog(key: string, intervalMs: number): boolean {
    const now = Date.now();
    const last = this.lastLogAt.get(key) ?? 0;
    if (now - last < intervalMs) return false;
    this.lastLogAt.set(key, now);
    return true;
  }

  private shouldTriggerEmergency(reason: string, context: any): boolean {
    const now = Date.now();

    // If we're in a flee backoff period, suppress flee-related emergencies
    if (now < this.fleeBackoffUntil) {
      return false;
    }

    const entity = context?.entity ?? context?.threats?.[0]?.type;
    const entityId = context?.entityId;
    const key = entityId ? `${reason}:${entityId}` : entity ? `${reason}:${entity}` : reason;
    const last = this.lastEmergencyAt.get(key) ?? 0;
    if (now - last < this.emergencyCooldownMs) return false;
    this.lastEmergencyAt.set(key, now);
    return true;
  }

  private getEntityKey(entity: any): string {
    if (entity?.id != null) return `${entity.id}`;
    const name = entity?.name ?? 'unknown';
    const pos = entity?.position;
    if (pos) {
      return `${name}:${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}`;
    }
    return `${name}:unknown`;
  }

  private shouldHandleEntity(entityKey: string, distance: number): boolean {
    const now = Date.now();
    const last = this.lastEntityObservation.get(entityKey);
    if (last) {
      const age = now - last.lastSeen;
      const movedCloser = last.lastDistance - distance > this.entityDistanceDelta;
      if (age < this.entityObservationCooldownMs && !movedCloser) {
        return false;
      }
    }
    this.lastEntityObservation.set(entityKey, { lastSeen: now, lastDistance: distance });
    return true;
  }

  private computeFleeTarget(
    currentPos: Vec3,
    direction: { x: number; y: number; z: number }
  ): Vec3 | null {
    const magnitude = Math.sqrt(
      direction.x ** 2 + direction.y ** 2 + direction.z ** 2
    );
    if (!Number.isFinite(magnitude) || magnitude === 0) return null;

    const scale = this.config.maxFleeDistance;
    const target = new Vec3(
      currentPos.x + direction.x * scale,
      currentPos.y + direction.y * scale,
      currentPos.z + direction.z * scale
    );

    const block = this.bot.blockAt(target);
    if (block && block.boundingBox === 'block') {
      target.y += 1;
    }
    return target;
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isMonitoring: boolean;
    lastHealth: number;
    config: SafetyMonitorConfig;
    threatManager: ThreatPerceptionManager;
  } {
    return {
      isMonitoring: this.isMonitoring,
      lastHealth: this.lastHealth,
      config: this.config,
      threatManager: this.threatPerceptionManager,
    };
  }

  /**
   * Get the threat perception manager for external access.
   */
  getThreatManager(): ThreatPerceptionManager {
    return this.threatPerceptionManager;
  }
}
