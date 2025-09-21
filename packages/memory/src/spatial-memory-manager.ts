/**
 * Spatial Memory Manager
 *
 * Tracks spatial locations, paths, environmental features, and spatial patterns
 * to enable sophisticated spatial reasoning and navigation optimization.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface SpatialLocation {
  id: string;
  name: string;
  coordinates: { x: number; y: number; z: number };
  biome: string;
  type:
    | 'structure'
    | 'resource'
    | 'landmark'
    | 'danger'
    | 'safe_zone'
    | 'path'
    | 'area';
  description: string;
  discoveredAt: number;
  lastVisited: number;
  visitCount: number;
  importance: number; // 0-1 based on usefulness/safety
  features: string[]; // e.g., ['water_source', 'shelter', 'resources', 'dangerous_mobs']
  accessibility: number; // 0-1 how easy to reach
  safety: number; // 0-1 how safe the location is
  resourceDensity: number; // 0-1 how rich in resources
  tags: string[]; // Custom tags for categorization
  relationships: {
    nearby?: string[]; // IDs of nearby locations
    connectedTo?: string[]; // IDs of connected locations (paths)
    partOf?: string; // ID of larger structure/area this belongs to
  };
}

export interface SpatialPath {
  id: string;
  name: string;
  startLocationId: string;
  endLocationId: string;
  waypoints: Array<{ x: number; y: number; z: number }>;
  distance: number;
  estimatedTime: number; // in seconds
  difficulty: 'easy' | 'medium' | 'hard' | 'dangerous';
  terrain: string[];
  discoveredAt: number;
  lastUsed: number;
  usageCount: number;
  successRate: number; // 0-1 how often this path works
  dangers: string[]; // e.g., ['lava', 'mobs', 'cliffs']
  shortcuts: Array<{ description: string; timeSaved: number }>;
  conditions: {
    weather?: string[];
    timeOfDay?: string[];
    biome?: string[];
  };
}

export interface SpatialPattern {
  id: string;
  name: string;
  type:
    | 'resource_distribution'
    | 'mob_spawn'
    | 'structure_generation'
    | 'biome_transition'
    | 'navigation_pattern';
  description: string;
  trigger: {
    locationType?: string;
    biome?: string;
    features?: string[];
  };
  outcome: {
    prediction: string;
    confidence: number;
    frequency: number;
  };
  discoveredAt: number;
  lastObserved: number;
  effectiveness: number;
}

export interface SpatialMemoryConfig {
  enabled: boolean;
  maxLocations: number;
  maxPaths: number;
  locationImportanceThreshold: number;
  pathSuccessThreshold: number;
  patternLearningEnabled: boolean;
  pathOptimizationEnabled: boolean;
  spatialClusteringEnabled: boolean;
  memoryRetentionDays: number;
  navigationLearningEnabled: boolean;
}

export const DEFAULT_SPATIAL_MEMORY_CONFIG: Partial<SpatialMemoryConfig> = {
  enabled: true,
  maxLocations: 1000,
  maxPaths: 500,
  locationImportanceThreshold: 0.3,
  pathSuccessThreshold: 0.7,
  patternLearningEnabled: true,
  pathOptimizationEnabled: true,
  spatialClusteringEnabled: true,
  memoryRetentionDays: 30,
  navigationLearningEnabled: true,
};

// ============================================================================
// Spatial Memory Manager
// ============================================================================

export class SpatialMemoryManager {
  private config: Required<SpatialMemoryConfig>;
  private locations: Map<string, SpatialLocation> = new Map();
  private paths: Map<string, SpatialPath> = new Map();
  private patterns: SpatialPattern[] = [];
  private lastCleanup: number = 0;

  constructor(config: Partial<SpatialMemoryConfig> = {}) {
    this.config = {
      ...DEFAULT_SPATIAL_MEMORY_CONFIG,
      ...config,
    } as Required<SpatialMemoryConfig>;
  }

  /**
   * Record a discovered location
   */
  async recordLocation(
    location: Omit<SpatialLocation, 'id' | 'discoveredAt'>
  ): Promise<void> {
    if (!this.config.enabled) return;

    const fullLocation: SpatialLocation = {
      id: this.generateId(),
      discoveredAt: Date.now(),
      ...location,
    };

    this.locations.set(fullLocation.id, fullLocation);

    // Learn patterns if enabled
    if (this.config.patternLearningEnabled) {
      await this.learnSpatialPatterns(fullLocation);
    }

    // Clean up periodically
    if (this.locations.size > this.config.maxLocations) {
      await this.cleanupOldLocations();
    }

    console.log(
      `🗺️ Recorded spatial location: ${fullLocation.name} (${fullLocation.type}) at ${fullLocation.coordinates.x}, ${fullLocation.coordinates.y}, ${fullLocation.coordinates.z}`
    );
  }

  /**
   * Update location information
   */
  async updateLocation(
    locationId: string,
    updates: Partial<SpatialLocation>
  ): Promise<void> {
    if (!this.config.enabled) return;

    const location = this.locations.get(locationId);
    if (!location) return;

    Object.assign(location, updates, { lastVisited: Date.now() });
    location.visitCount++;

    this.locations.set(locationId, location);

    console.log(
      `📍 Updated location: ${location.name} (${location.visitCount} visits)`
    );
  }

  /**
   * Record a path between locations
   */
  async recordPath(
    path: Omit<SpatialPath, 'id' | 'discoveredAt'>
  ): Promise<void> {
    if (!this.config.enabled) return;

    const fullPath: SpatialPath = {
      id: this.generateId(),
      discoveredAt: Date.now(),
      ...path,
    };

    this.paths.set(fullPath.id, fullPath);

    // Update location relationships
    await this.updateLocationRelationships(fullPath);

    console.log(
      `🛤️ Recorded spatial path: ${fullPath.name} (${fullPath.distance}m, ${fullPath.difficulty})`
    );
  }

  /**
   * Find optimal path between locations
   */
  async findOptimalPath(
    startLocationId: string,
    endLocationId: string,
    constraints: {
      maxDistance?: number;
      allowedDifficulty?: string[];
      avoidDangers?: string[];
      preferFeatures?: string[];
    } = {}
  ): Promise<SpatialPath[]> {
    if (!this.config.enabled) return [];

    const startLocation = this.locations.get(startLocationId);
    const endLocation = this.locations.get(endLocationId);

    if (!startLocation || !endLocation) {
      return [];
    }

    // Find direct paths first
    const directPaths = Array.from(this.paths.values())
      .filter(
        (path) =>
          (path.startLocationId === startLocationId &&
            path.endLocationId === endLocationId) ||
          (path.startLocationId === endLocationId &&
            path.endLocationId === startLocationId)
      )
      .filter((path) => this.meetsConstraints(path, constraints))
      .sort((a, b) => b.successRate - a.successRate);

    if (directPaths.length > 0) {
      return directPaths.slice(0, 3); // Return top 3 paths
    }

    // If no direct path, find paths through intermediate locations
    return await this.findPathsThroughIntermediates(
      startLocationId,
      endLocationId,
      constraints
    );
  }

  /**
   * Get location recommendations based on context
   */
  async getLocationRecommendations(
    context: {
      activity?: string; // 'mining', 'building', 'hiding', 'trading'
      requiredFeatures?: string[];
      maxDistance?: number;
      currentLocation?: { x: number; y: number; z: number };
      timeOfDay?: 'day' | 'night';
      weather?: string;
    },
    limit: number = 5
  ): Promise<
    Array<{
      location: SpatialLocation;
      confidence: number;
      reasoning: string;
      estimatedTime: number;
      path?: SpatialPath;
    }>
  > {
    if (!this.config.enabled) return [];

    const recommendations = Array.from(this.locations.values())
      .filter((location) => this.isLocationRelevant(location, context))
      .map((location) => ({
        location,
        confidence: this.calculateLocationConfidence(location, context),
        reasoning: this.generateLocationReasoning(location, context),
        estimatedTime: this.estimateTravelTime(location, context),
        path: context.currentLocation
          ? this.findBestPathToLocation(location, context.currentLocation)
          : undefined,
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return recommendations;
  }

  /**
   * Learn spatial patterns from observations
   */
  private async learnSpatialPatterns(location: SpatialLocation): Promise<void> {
    // Resource distribution patterns
    if (
      location.features.includes('resources') &&
      location.resourceDensity > 0.7
    ) {
      await this.learnResourcePattern(location);
    }

    // Structure generation patterns
    if (location.type === 'structure') {
      await this.learnStructurePattern(location);
    }

    // Biome-specific patterns
    await this.learnBiomePattern(location);
  }

  /**
   * Learn resource distribution patterns
   */
  private async learnResourcePattern(location: SpatialLocation): Promise<void> {
    const pattern: SpatialPattern = {
      id: this.generateId(),
      name: `High resource density in ${location.biome}`,
      type: 'resource_distribution',
      description: `Locations in ${location.biome} biome often have high resource density`,
      trigger: {
        biome: location.biome,
        features: ['resources'],
      },
      outcome: {
        prediction: 'High chance of finding resources',
        confidence: 0.3, // Start low, increase with more observations
        frequency: 1,
      },
      discoveredAt: Date.now(),
      lastObserved: Date.now(),
      effectiveness: location.resourceDensity,
    };

    this.patterns.push(pattern);
  }

  /**
   * Learn structure generation patterns
   */
  private async learnStructurePattern(
    location: SpatialLocation
  ): Promise<void> {
    const pattern: SpatialPattern = {
      id: this.generateId(),
      name: `${location.type} structures in ${location.biome}`,
      type: 'structure_generation',
      description: `${location.type} structures commonly found in ${location.biome}`,
      trigger: {
        locationType: location.type,
        biome: location.biome,
      },
      outcome: {
        prediction: 'Structure likely to contain useful features',
        confidence: 0.4,
        frequency: 1,
      },
      discoveredAt: Date.now(),
      lastObserved: Date.now(),
      effectiveness: location.importance,
    };

    this.patterns.push(pattern);
  }

  /**
   * Learn biome-specific patterns
   */
  private async learnBiomePattern(location: SpatialLocation): Promise<void> {
    const pattern: SpatialPattern = {
      id: this.generateId(),
      name: `${location.biome} biome characteristics`,
      type: 'biome_transition',
      description: `${location.biome} biome has specific characteristics and features`,
      trigger: {
        biome: location.biome,
      },
      outcome: {
        prediction: `Expect ${location.features.join(', ')} features`,
        confidence: 0.2,
        frequency: 1,
      },
      discoveredAt: Date.now(),
      lastObserved: Date.now(),
      effectiveness: 0.5,
    };

    this.patterns.push(pattern);
  }

  /**
   * Update location relationships based on new path
   */
  private async updateLocationRelationships(path: SpatialPath): Promise<void> {
    const startLocation = this.locations.get(path.startLocationId);
    const endLocation = this.locations.get(path.endLocationId);

    if (startLocation) {
      if (!startLocation.relationships.connectedTo) {
        startLocation.relationships.connectedTo = [];
      }
      if (
        !startLocation.relationships.connectedTo.includes(path.endLocationId)
      ) {
        startLocation.relationships.connectedTo.push(path.endLocationId);
      }
      this.locations.set(path.startLocationId, startLocation);
    }

    if (endLocation) {
      if (!endLocation.relationships.connectedTo) {
        endLocation.relationships.connectedTo = [];
      }
      if (
        !endLocation.relationships.connectedTo.includes(path.startLocationId)
      ) {
        endLocation.relationships.connectedTo.push(path.startLocationId);
      }
      this.locations.set(path.endLocationId, endLocation);
    }
  }

  /**
   * Find paths through intermediate locations
   */
  private async findPathsThroughIntermediates(
    startLocationId: string,
    endLocationId: string,
    constraints: any
  ): Promise<SpatialPath[]> {
    const startLocation = this.locations.get(startLocationId);
    const endLocation = this.locations.get(endLocationId);

    if (!startLocation || !endLocation) return [];

    const intermediatePaths: SpatialPath[] = [];

    // Find paths that connect to start location
    const startPaths = Array.from(this.paths.values())
      .filter(
        (path) =>
          path.startLocationId === startLocationId ||
          path.endLocationId === startLocationId
      )
      .filter((path) => this.meetsConstraints(path, constraints));

    // Find paths that connect to end location
    const endPaths = Array.from(this.paths.values())
      .filter(
        (path) =>
          path.startLocationId === endLocationId ||
          path.endLocationId === endLocationId
      )
      .filter((path) => this.meetsConstraints(path, constraints));

    // Look for intermediate locations that connect start and end paths
    for (const startPath of startPaths) {
      for (const endPath of endPaths) {
        const intermediateId =
          startPath.startLocationId === startLocationId
            ? startPath.endLocationId
            : startPath.startLocationId;

        const intermediateToEndId =
          endPath.startLocationId === endLocationId
            ? endPath.endLocationId
            : endPath.startLocationId;

        if (intermediateId === intermediateToEndId) {
          // Direct intermediate connection found
          const combinedPath = await this.createCombinedPath(
            startPath,
            endPath,
            intermediateId
          );
          if (combinedPath) {
            intermediatePaths.push(combinedPath);
          }
        }
      }
    }

    return intermediatePaths
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 3);
  }

  /**
   * Create combined path from two paths through intermediate location
   */
  private async createCombinedPath(
    path1: SpatialPath,
    path2: SpatialPath,
    intermediateId: string
  ): Promise<SpatialPath | null> {
    const intermediateLocation = this.locations.get(intermediateId);
    if (!intermediateLocation) return null;

    // Calculate combined distance and time
    const totalDistance = path1.distance + path2.distance;
    const totalTime = path1.estimatedTime + path2.estimatedTime;

    // Combine dangers and terrain
    const combinedDangers = [...new Set([...path1.dangers, ...path2.dangers])];
    const combinedTerrain = [...new Set([...path1.terrain, ...path2.terrain])];

    // Calculate combined success rate
    const combinedSuccessRate = (path1.successRate + path2.successRate) / 2;

    // Determine difficulty
    const difficulty = this.calculateCombinedDifficulty(
      path1.difficulty,
      path2.difficulty
    );

    const combinedPath: SpatialPath = {
      id: this.generateId(),
      name: `Combined path via ${intermediateLocation.name}`,
      startLocationId: path1.startLocationId,
      endLocationId: path2.endLocationId,
      waypoints: [...path1.waypoints, ...path2.waypoints],
      distance: totalDistance,
      estimatedTime: totalTime,
      difficulty,
      terrain: combinedTerrain,
      discoveredAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 1,
      successRate: combinedSuccessRate,
      dangers: combinedDangers,
      shortcuts: [],
      conditions: {
        ...path1.conditions,
        ...path2.conditions,
      },
    };

    return combinedPath;
  }

  /**
   * Calculate combined difficulty
   */
  private calculateCombinedDifficulty(
    diff1: string,
    diff2: string
  ): SpatialPath['difficulty'] {
    const difficultyLevels = { easy: 1, medium: 2, hard: 3, dangerous: 4 };
    const level1 =
      difficultyLevels[diff1 as keyof typeof difficultyLevels] || 2;
    const level2 =
      difficultyLevels[diff2 as keyof typeof difficultyLevels] || 2;
    const combinedLevel = Math.ceil((level1 + level2) / 2);

    if (combinedLevel <= 1) return 'easy';
    if (combinedLevel <= 2) return 'medium';
    if (combinedLevel <= 3) return 'hard';
    return 'dangerous';
  }

  /**
   * Check if path meets constraints
   */
  private meetsConstraints(path: SpatialPath, constraints: any): boolean {
    if (constraints.maxDistance && path.distance > constraints.maxDistance) {
      return false;
    }

    if (
      constraints.allowedDifficulty &&
      !constraints.allowedDifficulty.includes(path.difficulty)
    ) {
      return false;
    }

    if (
      constraints.avoidDangers &&
      constraints.avoidDangers.some((danger: string) =>
        path.dangers.includes(danger)
      )
    ) {
      return false;
    }

    return true;
  }

  /**
   * Check if location is relevant for context
   */
  private isLocationRelevant(location: SpatialLocation, context: any): boolean {
    if (
      context.activity === 'mining' &&
      !location.features.includes('resources')
    ) {
      return false;
    }

    if (context.activity === 'building' && location.safety < 0.7) {
      return false;
    }

    if (context.activity === 'hiding' && location.safety < 0.8) {
      return false;
    }

    if (
      context.requiredFeatures &&
      !context.requiredFeatures.some((feature: string) =>
        location.features.includes(feature)
      )
    ) {
      return false;
    }

    return location.importance > this.config.locationImportanceThreshold;
  }

  /**
   * Calculate location confidence for context
   */
  private calculateLocationConfidence(
    location: SpatialLocation,
    context: any
  ): number {
    let confidence = 0.5; // Base confidence

    // Importance factor
    confidence += location.importance * 0.3;

    // Visit frequency factor
    confidence += Math.min(location.visitCount / 10, 0.2);

    // Safety factor
    if (context.activity === 'hiding' || context.activity === 'safe_zone') {
      confidence += location.safety * 0.3;
    }

    // Feature relevance
    if (context.requiredFeatures) {
      const featureMatches = context.requiredFeatures.filter(
        (feature: string) => location.features.includes(feature)
      ).length;
      confidence += (featureMatches / context.requiredFeatures.length) * 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate reasoning for location recommendation
   */
  private generateLocationReasoning(
    location: SpatialLocation,
    context: any
  ): string {
    const reasons = [];

    if (location.importance > 0.8) {
      reasons.push(
        `High importance (${(location.importance * 100).toFixed(0)}%)`
      );
    }

    if (location.visitCount > 5) {
      reasons.push(`Frequently visited (${location.visitCount} times)`);
    }

    if (location.safety > 0.8) {
      reasons.push(
        `Very safe location (${(location.safety * 100).toFixed(0)}%)`
      );
    }

    if (location.resourceDensity > 0.7) {
      reasons.push(
        `Rich in resources (${(location.resourceDensity * 100).toFixed(0)}%)`
      );
    }

    if (
      context.requiredFeatures &&
      context.requiredFeatures.some((feature: string) =>
        location.features.includes(feature)
      )
    ) {
      reasons.push(`Has required features: ${location.features.join(', ')}`);
    }

    return reasons.join(', ') || 'No specific reasoning available';
  }

  /**
   * Estimate travel time to location
   */
  private estimateTravelTime(location: SpatialLocation, context: any): number {
    // Base estimate - this would be enhanced with actual pathfinding
    const baseTime = 30; // 30 seconds base travel time

    // Adjust based on accessibility
    const accessibilityFactor = 1 / location.accessibility;

    // Adjust based on safety (safer locations might take longer to reach)
    const safetyFactor = location.safety > 0.8 ? 1.2 : 1.0;

    return Math.ceil(baseTime * accessibilityFactor * safetyFactor);
  }

  /**
   * Find best path to location
   */
  private findBestPathToLocation(
    location: SpatialLocation,
    currentLocation: { x: number; y: number; z: number }
  ): SpatialPath | undefined {
    // Find closest location to current position that connects to target
    const connectedLocationIds = location.relationships.connectedTo || [];
    let bestPath: SpatialPath | undefined;
    let shortestDistance = Infinity;

    for (const connectedId of connectedLocationIds) {
      const connectedLocation = this.locations.get(connectedId);
      if (!connectedLocation) continue;

      const distance = this.calculateDistance(
        currentLocation,
        connectedLocation.coordinates
      );
      if (distance < shortestDistance) {
        shortestDistance = distance;

        // Find path between connected location and target
        const paths = Array.from(this.paths.values()).filter(
          (path) =>
            (path.startLocationId === connectedId &&
              path.endLocationId === location.id) ||
            (path.startLocationId === location.id &&
              path.endLocationId === connectedId)
        );

        if (paths.length > 0) {
          bestPath = paths.sort((a, b) => b.successRate - a.successRate)[0];
        }
      }
    }

    return bestPath;
  }

  /**
   * Calculate distance between two points
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
   * Clean up old locations
   */
  private async cleanupOldLocations(): Promise<void> {
    const cutoff =
      Date.now() - this.config.memoryRetentionDays * 24 * 60 * 60 * 1000;

    // Keep important locations even if old
    const locationsToKeep = Array.from(this.locations.values()).filter(
      (location) => location.importance > 0.7 || location.lastVisited > cutoff
    );

    // Remove old, unimportant locations
    const locationsToRemove = Array.from(this.locations.values()).filter(
      (location) => location.importance <= 0.7 && location.lastVisited <= cutoff
    );

    for (const location of locationsToRemove) {
      this.locations.delete(location.id);
    }

    console.log(
      `🧹 Cleaned up spatial memory: kept ${locationsToKeep.length}, removed ${locationsToRemove.length} locations`
    );
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `spatial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get spatial memory statistics
   */
  getSpatialMemoryStats(): {
    totalLocations: number;
    totalPaths: number;
    locationsByType: Record<string, number>;
    locationsByBiome: Record<string, number>;
    averageImportance: number;
    averageSafety: number;
    patternCount: number;
    mostVisitedLocation?: SpatialLocation;
    bestPath?: SpatialPath;
  } {
    const locations = Array.from(this.locations.values());
    const paths = Array.from(this.paths.values());

    const locationsByType = locations.reduce(
      (dist, loc) => {
        dist[loc.type] = (dist[loc.type] || 0) + 1;
        return dist;
      },
      {} as Record<string, number>
    );

    const locationsByBiome = locations.reduce(
      (dist, loc) => {
        dist[loc.biome] = (dist[loc.biome] || 0) + 1;
        return dist;
      },
      {} as Record<string, number>
    );

    const averageImportance =
      locations.reduce((sum, loc) => sum + loc.importance, 0) /
        locations.length || 0;
    const averageSafety =
      locations.reduce((sum, loc) => sum + loc.safety, 0) / locations.length ||
      0;

    const mostVisitedLocation = locations.sort(
      (a, b) => b.visitCount - a.visitCount
    )[0];
    const bestPath = paths.sort((a, b) => b.successRate - a.successRate)[0];

    return {
      totalLocations: locations.length,
      totalPaths: paths.length,
      locationsByType,
      locationsByBiome,
      averageImportance,
      averageSafety,
      patternCount: this.patterns.length,
      mostVisitedLocation,
      bestPath,
    };
  }
}
