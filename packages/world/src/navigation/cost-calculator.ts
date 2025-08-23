/**
 * Dynamic Cost Calculator - Real-time movement cost evaluation
 *
 * Evaluates movement costs based on environmental hazards, lighting conditions,
 * mob presence, and agent preferences for intelligent pathfinding decisions.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  ICostCalculator,
  WorldPosition,
  MovementCost,
  EnvironmentalHazard,
  CostContext,
  NavigationConfig,
  euclideanDistance,
} from './types';

export interface CostCalculatorEvents {
  'hazard-detected': [EnvironmentalHazard];
  'hazard-expired': [{ type: string; position: WorldPosition }];
  'cost-threshold-exceeded': [
    { position: WorldPosition; cost: number; threshold: number },
  ];
  'mob-threat-detected': [{ position: WorldPosition; threatLevel: number }];
}

/**
 * Comprehensive movement cost calculation with environmental awareness
 */
export class DynamicCostCalculator
  extends EventEmitter<CostCalculatorEvents>
  implements ICostCalculator
{
  private hazards = new Map<string, EnvironmentalHazard>();
  private mobHeatmap = new Map<
    string,
    { density: number; lastUpdate: number }
  >();
  private lightingCache = new Map<string, { cost: number; expiry: number }>();
  private costHistory: Array<{
    position: WorldPosition;
    cost: number;
    timestamp: number;
  }> = [];

  constructor(private config: NavigationConfig) {
    super();

    // Start periodic cleanup
    setInterval(() => this.performMaintenance(), 30000); // 30 seconds
  }

  /**
   * Calculate comprehensive movement cost between positions
   */
  calculateCost(
    from: WorldPosition,
    to: WorldPosition,
    context: CostContext
  ): MovementCost {
    // Base movement cost
    const distance = euclideanDistance(from, to);
    let baseCost = this.config.costCalculation.baseMoveCost;

    // Apply distance multipliers
    if (distance > 1.5) {
      // Diagonal movement
      baseCost *= this.config.costCalculation.diagonalMultiplier;
    }

    // Vertical movement penalty
    const verticalDiff = Math.abs(to.y - from.y);
    let verticalPenalty = 0;
    if (verticalDiff > 0) {
      verticalPenalty =
        verticalDiff * (this.config.costCalculation.verticalMultiplier - 1);

      // Special cases for vertical movement
      if (verticalDiff > 1) {
        // Jumping or climbing
        baseCost *= this.config.costCalculation.jumpCost;
      }
    }

    // Calculate environmental penalties
    const hazardPenalty = this.applyHazardPenalties(baseCost, context.hazards);
    const lightingPenalty = this.calculateLightingCost(
      context.lightLevel,
      context.timeOfDay
    );
    const mobPenalty = this.calculateThreatCost(to, context.mobPositions);

    // Apply agent preferences
    const totalCost = this.applyPreferences(
      baseCost + verticalPenalty + hazardPenalty + lightingPenalty + mobPenalty,
      to,
      context.preferences
    );

    // Check for cost threshold warnings
    const costThreshold = baseCost * 10; // Warn if cost is 10x normal
    if (totalCost > costThreshold) {
      this.emit('cost-threshold-exceeded', {
        position: to,
        cost: totalCost,
        threshold: costThreshold,
      });
    }

    // Record in cost history
    this.recordCostHistory(to, totalCost);

    const result: MovementCost = {
      baseCost,
      hazardPenalty,
      lightingPenalty,
      mobPenalty,
      verticalPenalty,
      totalCost,
      factors: {
        distance,
        verticalDiff,
        hazardCount: context.hazards.length,
        mobCount: context.mobPositions.length,
      },
    };

    return result;
  }

  /**
   * Apply environmental hazard penalties
   */
  applyHazardPenalties(
    baseCost: number,
    hazards: EnvironmentalHazard[]
  ): number {
    let totalPenalty = 0;

    for (const hazard of hazards) {
      // For this simplified implementation, we apply a base penalty for each hazard
      const distance = 1; // Simplified - hazards contain position info

      if (distance <= hazard.radius) {
        // Direct hazard exposure
        let penalty = this.getHazardBasePenalty(hazard.type) * hazard.severity;

        // Scale penalty by distance (closer = more dangerous)
        const proximityFactor = 1 - distance / hazard.radius;
        penalty *= 0.5 + 0.5 * proximityFactor; // 50-100% penalty based on proximity

        totalPenalty += penalty;

        // Emit hazard detection
        if (penalty > baseCost) {
          this.emit('hazard-detected', hazard);
        }
      } else if (hazard.avoidanceRadius && distance <= hazard.avoidanceRadius) {
        // Avoidance zone (reduced penalty)
        const avoidancePenalty = this.getHazardBasePenalty(hazard.type) * 0.2; // 20% of full penalty
        const proximityFactor = 1 - distance / hazard.avoidanceRadius;
        totalPenalty += avoidancePenalty * proximityFactor;
      }
    }

    return totalPenalty;
  }

  /**
   * Calculate lighting-based cost modifiers
   */
  calculateLightingCost(lightLevel: number, timeOfDay: number): number {
    const cacheKey = `${lightLevel}-${Math.floor(timeOfDay / 1000)}`;
    const cached = this.lightingCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.cost;
    }

    let lightingCost = 0;

    // Base darkness penalty
    if (lightLevel < 7) {
      lightingCost =
        (this.config.hazardCosts.darknessPenalty * (7 - lightLevel)) / 7;
    }

    // Time of day modifiers
    const isNight = timeOfDay > 13000 || timeOfDay < 1000; // Minecraft night
    if (isNight && lightLevel < 10) {
      lightingCost *= 1.5; // 50% additional penalty at night
    }

    // Cache the result
    this.lightingCache.set(cacheKey, {
      cost: lightingCost,
      expiry: Date.now() + 60000, // Cache for 1 minute
    });

    return lightingCost;
  }

  /**
   * Evaluate mob threat cost penalties
   */
  calculateThreatCost(
    position: WorldPosition,
    mobPositions: WorldPosition[]
  ): number {
    let threatCost = 0;
    let maxThreatLevel = 0;

    for (const mobPos of mobPositions) {
      const distance = euclideanDistance(position, mobPos);

      if (distance < 10) {
        // Threat detection radius
        // Base threat cost
        let mobThreat = this.config.hazardCosts.mobProximity;

        // Distance-based threat scaling
        if (distance < 5) {
          mobThreat *= 2; // Double threat within 5 blocks
        }

        // Apply distance falloff
        const threatFactor = Math.max(0, 1 - distance / 10);
        const adjustedThreat = mobThreat * threatFactor;

        threatCost += adjustedThreat;
        maxThreatLevel = Math.max(maxThreatLevel, threatFactor);
      }
    }

    // Update mob heatmap
    this.updateMobHeatmap(position, mobPositions.length);

    // Emit threat detection for significant threats
    if (maxThreatLevel > 0.5) {
      this.emit('mob-threat-detected', {
        position,
        threatLevel: maxThreatLevel,
      });
    }

    return threatCost;
  }

  /**
   * Update hazard registry
   */
  updateHazards(hazards: EnvironmentalHazard[]): void {
    const currentTime = Date.now();

    // Clear expired hazards
    for (const [key, hazard] of this.hazards) {
      if (hazard.timeDecay && currentTime > hazard.timeDecay) {
        this.hazards.delete(key);
        this.emit('hazard-expired', {
          type: hazard.type,
          position: hazard.position,
        });
      }
    }

    // Add/update current hazards
    for (const hazard of hazards) {
      const key = `${hazard.type}-${hazard.position.x}-${hazard.position.y}-${hazard.position.z}`;
      this.hazards.set(key, hazard);
    }
  }

  /**
   * Apply agent-specific movement preferences
   */
  applyPreferences(
    baseCost: number,
    position: WorldPosition,
    preferences?: CostContext['preferences']
  ): number {
    if (!preferences) return baseCost;

    let adjustedCost = baseCost;

    // Risk tolerance adjustment
    if (preferences.riskTolerance < 0.5) {
      // Risk-averse agent - increase cost for potentially dangerous areas
      const riskMultiplier = 1 + (0.5 - preferences.riskTolerance) * 2;
      adjustedCost *= riskMultiplier;
    }

    // Speed preference - willingness to take risks for faster routes
    if (preferences.speedPreference > 0.7) {
      // Speed-focused agent - reduce some hazard penalties
      adjustedCost *= 0.8; // 20% cost reduction
    }

    // Safety margin - prefer paths farther from hazards
    if (preferences.safetyMargin > 2) {
      const nearbyHazards = this.getHazardsNearPosition(
        position,
        preferences.safetyMargin
      );
      if (nearbyHazards.length > 0) {
        adjustedCost *= 1 + nearbyHazards.length * 0.3; // 30% penalty per nearby hazard
      }
    }

    return adjustedCost;
  }

  /**
   * Get hazard statistics for area
   */
  getHazardStatistics(
    center: WorldPosition,
    radius: number
  ): {
    totalHazards: number;
    hazardsByType: Map<string, number>;
    averageSeverity: number;
    maxThreatRadius: number;
  } {
    const nearbyHazards = this.getHazardsNearPosition(center, radius);
    const hazardsByType = new Map<string, number>();
    let totalSeverity = 0;
    let maxRadius = 0;

    for (const hazard of nearbyHazards) {
      const count = hazardsByType.get(hazard.type) || 0;
      hazardsByType.set(hazard.type, count + 1);
      totalSeverity += hazard.severity;
      maxRadius = Math.max(maxRadius, hazard.radius);
    }

    return {
      totalHazards: nearbyHazards.length,
      hazardsByType,
      averageSeverity:
        nearbyHazards.length > 0 ? totalSeverity / nearbyHazards.length : 0,
      maxThreatRadius: maxRadius,
    };
  }

  /**
   * Get cost analysis for position
   */
  analyzeCost(
    position: WorldPosition,
    context: CostContext
  ): {
    riskLevel: 'low' | 'medium' | 'high' | 'extreme';
    primaryThreats: string[];
    recommendations: string[];
    safetySuggestions: WorldPosition[];
  } {
    const cost = this.calculateCost(position, position, context);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    if (cost.totalCost > this.config.costCalculation.baseMoveCost * 20) {
      riskLevel = 'extreme';
    } else if (cost.totalCost > this.config.costCalculation.baseMoveCost * 10) {
      riskLevel = 'high';
    } else if (cost.totalCost > this.config.costCalculation.baseMoveCost * 5) {
      riskLevel = 'medium';
    }

    // Identify primary threats
    const primaryThreats: string[] = [];
    if (cost.hazardPenalty > cost.baseCost)
      primaryThreats.push('environmental_hazards');
    if (cost.mobPenalty > cost.baseCost) primaryThreats.push('mob_threats');
    if (cost.lightingPenalty > cost.baseCost * 0.5)
      primaryThreats.push('poor_lighting');
    if (cost.verticalPenalty > cost.baseCost)
      primaryThreats.push('difficult_terrain');

    // Generate recommendations
    const recommendations: string[] = [];
    if (cost.lightingPenalty > 0)
      recommendations.push('Improve lighting in area');
    if (cost.mobPenalty > 0) recommendations.push('Clear hostile mobs');
    if (cost.hazardPenalty > 0)
      recommendations.push('Find alternative route avoiding hazards');
    if (cost.verticalPenalty > cost.baseCost)
      recommendations.push('Consider building stairs or ramps');

    // Generate safety suggestions (simplified)
    const safetySuggestions = this.generateSafetySuggestions(position, 10);

    return {
      riskLevel,
      primaryThreats,
      recommendations,
      safetySuggestions,
    };
  }

  // ===== PRIVATE METHODS =====

  private getHazardBasePenalty(
    hazardType: EnvironmentalHazard['type']
  ): number {
    switch (hazardType) {
      case 'lava':
        return this.config.hazardCosts.lavaProximity;
      case 'void':
        return this.config.hazardCosts.voidFall;
      case 'mob':
        return this.config.hazardCosts.mobProximity;
      case 'darkness':
        return this.config.hazardCosts.darknessPenalty;
      case 'water':
        return this.config.hazardCosts.waterPenalty || 20;
      case 'fire':
        return this.config.hazardCosts.lavaProximity * 0.8; // Slightly less than lava
      case 'fall_damage':
        return this.config.hazardCosts.voidFall * 0.3; // Much less than void
      default:
        return this.config.costCalculation.baseMoveCost * 5;
    }
  }

  private getHazardsNearPosition(
    position: WorldPosition,
    radius: number
  ): EnvironmentalHazard[] {
    const nearbyHazards: EnvironmentalHazard[] = [];

    for (const hazard of this.hazards.values()) {
      const distance = euclideanDistance(position, hazard.position);
      if (distance <= radius) {
        nearbyHazards.push(hazard);
      }
    }

    return nearbyHazards;
  }

  private updateMobHeatmap(position: WorldPosition, mobCount: number): void {
    const gridKey = `${Math.floor(position.x / 16)},${Math.floor(position.z / 16)}`;

    this.mobHeatmap.set(gridKey, {
      density: mobCount,
      lastUpdate: Date.now(),
    });
  }

  private recordCostHistory(position: WorldPosition, cost: number): void {
    this.costHistory.push({
      position: { ...position },
      cost,
      timestamp: Date.now(),
    });

    // Keep only recent history
    if (this.costHistory.length > 1000) {
      this.costHistory = this.costHistory.slice(-500);
    }
  }

  private generateSafetySuggestions(
    center: WorldPosition,
    count: number
  ): WorldPosition[] {
    const suggestions: WorldPosition[] = [];
    const radius = 10;

    // Generate positions in a circle around the center
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      const distance = radius * 0.7; // Slightly inside the radius

      suggestions.push({
        x: center.x + Math.cos(angle) * distance,
        y: center.y + 1, // Slightly above current level
        z: center.z + Math.sin(angle) * distance,
      });
    }

    return suggestions;
  }

  private performMaintenance(): void {
    const currentTime = Date.now();

    // Clean expired lighting cache
    for (const [key, entry] of this.lightingCache) {
      if (entry.expiry < currentTime) {
        this.lightingCache.delete(key);
      }
    }

    // Clean old mob heatmap data
    for (const [key, entry] of this.mobHeatmap) {
      if (currentTime - entry.lastUpdate > 300000) {
        // 5 minutes
        this.mobHeatmap.delete(key);
      }
    }

    // Clean old cost history
    const cutoff = currentTime - 600000; // 10 minutes
    this.costHistory = this.costHistory.filter(
      (entry) => entry.timestamp > cutoff
    );

    // Clean expired hazards
    for (const [key, hazard] of this.hazards) {
      if (hazard.timeDecay && currentTime > hazard.timeDecay) {
        this.hazards.delete(key);
        this.emit('hazard-expired', {
          type: hazard.type,
          position: hazard.position,
        });
      }
    }
  }

  /**
   * Get current cost calculator statistics
   */
  getStatistics(): {
    activeHazards: number;
    mobHeatmapSize: number;
    lightingCacheSize: number;
    costHistorySize: number;
    memoryUsage: number;
  } {
    return {
      activeHazards: this.hazards.size,
      mobHeatmapSize: this.mobHeatmap.size,
      lightingCacheSize: this.lightingCache.size,
      costHistorySize: this.costHistory.length,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  private estimateMemoryUsage(): number {
    // Rough estimation in bytes
    return (
      this.hazards.size * 300 + // Hazard objects
      this.mobHeatmap.size * 50 + // Heatmap entries
      this.lightingCache.size * 30 + // Cache entries
      this.costHistory.length * 100 // History entries
    );
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.hazards.clear();
    this.mobHeatmap.clear();
    this.lightingCache.clear();
    this.costHistory = [];
    this.removeAllListeners();
  }
}
