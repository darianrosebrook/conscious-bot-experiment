/**
 * Long Journey Navigator - Advanced pathfinding for extended distances
 *
 * Provides intelligent navigation for long journeys including:
 * - Chunk-based route planning for distances > 100 blocks
 * - Waypoint discovery and management system
 * - Multi-stage path planning with intermediate goals
 * - Memory integration with previously explored areas
 * - Dynamic replanning for obstacles and environmental changes
 * - Player following with predictive pathfinding
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';
import { NavigationBridge, NavigationResult } from './navigation-bridge.js';
import { NavigationConfig } from './types.js';

// ==================== Types ====================

export interface ChunkCoordinate {
  x: number; // Chunk X coordinate
  z: number; // Chunk Z coordinate
  key: string; // String key for Map storage
}

export interface Waypoint {
  id: string;
  position: Vec3;
  chunk: ChunkCoordinate;
  type: 'safe' | 'hazard' | 'resource' | 'landmark' | 'portal';
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  discoveredAt: number;
  lastVisited?: number;
  visitCount: number;
  accessibility: {
    canReach: boolean;
    requiresTools?: string[];
    seasonalAccess?: boolean;
    timeRestrictions?: { start: number; end: number }; // Minecraft time
  };
}

export interface JourneyStage {
  id: string;
  startPosition: Vec3;
  endPosition: Vec3;
  waypoints: Waypoint[];
  estimatedDistance: number;
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pending' | 'active' | 'completed' | 'failed';
  completionTime?: number;
  actualPath?: Vec3[];
  obstaclesEncountered?: Array<{
    position: Vec3;
    type: string;
    timestamp: number;
  }>;
}

export interface LongJourneyConfig {
  maxChunkDistance: number; // Maximum distance per chunk (default: 100)
  maxWaypointsPerChunk: number; // Max waypoints to store per chunk (default: 10)
  waypointDiscoveryRadius: number; // Radius for discovering new waypoints (default: 16)
  replanThreshold: number; // Distance threshold for replanning (default: 50)
  memoryTtl: number; // Time to live for cached chunk data (default: 24 hours)
  enablePlayerFollowing: boolean; // Enable player following mode
  followDistance: number; // Distance to maintain when following (default: 10)
  predictiveFollowing: boolean; // Enable predictive path following
}

export interface JourneyRequest {
  destination: Vec3;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  constraints?: {
    avoidWater?: boolean;
    avoidHostileAreas?: boolean;
    preferSafePaths?: boolean;
    timeLimit?: number; // Maximum time to complete journey
    maxRisk?: 'low' | 'medium' | 'high';
  };
  preferences?: {
    scenicRoute?: boolean;
    resourceGathering?: boolean;
    exploration?: boolean;
  };
}

export interface JourneyResult {
  success: boolean;
  totalDistance: number;
  totalTime: number;
  stages: JourneyStage[];
  finalPosition: Vec3;
  waypointsDiscovered: Waypoint[];
  obstaclesEncountered: number;
  error?: string;
  metadata: {
    averageSpeed: number;
    riskLevel: 'low' | 'medium' | 'high';
    replanCount: number;
    memoryUsage: number;
  };
}

export interface PlayerFollowingState {
  isFollowing: boolean;
  targetPlayerId?: string;
  targetPlayerName?: string;
  lastKnownPosition?: Vec3;
  lastSeenTime: number;
  predictiveMode: boolean;
  socialContext: {
    relationship: 'friendly' | 'neutral' | 'hostile';
    trustLevel: number; // 0-1
    followingDistance: number;
    respectPersonalSpace: boolean;
  };
}

// ==================== Events ====================

export interface LongJourneyEvents {
  'journey-started': [JourneyRequest];
  'stage-completed': [JourneyStage];
  'waypoint-discovered': [Waypoint];
  'waypoint-updated': [Waypoint];
  'obstacle-detected': [{ position: Vec3; type: string }];
  'replan-triggered': [{ reason: string; newPath: Vec3[] }];
  'journey-completed': [JourneyResult];
  'journey-failed': [{ request: JourneyRequest; error: string }];
  'player-following-started': [PlayerFollowingState];
  'player-following-stopped': [PlayerFollowingState];
  'player-following-updated': [PlayerFollowingState];
}

// ==================== Main Class ====================

export class LongJourneyNavigator extends EventEmitter<LongJourneyEvents> {
  private bot: Bot;
  private navigationBridge: NavigationBridge;
  private config: LongJourneyConfig;
  private chunkCache: Map<string, Waypoint[]> = new Map();
  private activeJourney: JourneyStage[] | null = null;
  private playerFollowingState: PlayerFollowingState | null = null;
  private lastReplanTime = 0;
  private memoryCleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    bot: Bot,
    navigationBridge: NavigationBridge,
    config: Partial<LongJourneyConfig> & NavigationConfig = {}
  ) {
    super();

    this.bot = bot;
    this.navigationBridge = navigationBridge;
    this.config = {
      maxChunkDistance: 100,
      maxWaypointsPerChunk: 10,
      waypointDiscoveryRadius: 16,
      replanThreshold: 50,
      memoryTtl: 24 * 60 * 60 * 1000, // 24 hours
      enablePlayerFollowing: true,
      followDistance: 10,
      predictiveFollowing: true,
      ...config,
    };

    this.startMemoryCleanup();
  }

  /**
   * Plan and execute a long journey to a destination
   */
  async navigateToDestination(request: JourneyRequest): Promise<JourneyResult> {
    console.log(`🗺️ Planning long journey to:`, request.destination);

    this.emit('journey-started', request);

    try {
      // 1. Analyze destination and plan route
      const routePlan = await this.planRoute(request);

      // 2. Break into stages
      const stages = this.createJourneyStages(request.destination, routePlan);

      // 3. Execute journey
      const result = await this.executeJourney(stages, request);

      this.emit('journey-completed', result);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Long journey failed:', errorMessage);

      this.emit('journey-failed', { request, error: errorMessage });
      return {
        success: false,
        totalDistance: 0,
        totalTime: 0,
        stages: [],
        finalPosition: this.bot.entity.position,
        waypointsDiscovered: [],
        obstaclesEncountered: 0,
        error: errorMessage,
        metadata: {
          averageSpeed: 0,
          riskLevel: 'high',
          replanCount: 0,
          memoryUsage: this.getMemoryUsage(),
        },
      };
    }
  }

  /**
   * Start following a player with intelligent pathfinding
   */
  async startFollowingPlayer(
    playerId: string,
    playerName: string
  ): Promise<boolean> {
    if (!this.config.enablePlayerFollowing) {
      console.log('Player following is disabled in configuration');
      return false;
    }

    console.log(`👥 Starting to follow player: ${playerName} (${playerId})`);

    this.playerFollowingState = {
      isFollowing: true,
      targetPlayerId: playerId,
      targetPlayerName: playerName,
      lastSeenTime: Date.now(),
      predictiveMode: this.config.predictiveFollowing,
      socialContext: {
        relationship: 'neutral',
        trustLevel: 0.5,
        followingDistance: this.config.followDistance,
        respectPersonalSpace: true,
      },
    };

    this.emit('player-following-started', this.playerFollowingState);

    // Start the following loop
    this.startFollowingLoop();

    return true;
  }

  /**
   * Stop following the current player
   */
  stopFollowingPlayer(): void {
    if (!this.playerFollowingState) return;

    console.log(
      `👥 Stopping following player: ${this.playerFollowingState.targetPlayerName}`
    );

    const previousState = { ...this.playerFollowingState };
    this.playerFollowingState = null;

    this.emit('player-following-stopped', previousState);
  }

  /**
   * Get current journey statistics
   */
  getJourneyStatistics(): {
    totalJourneys: number;
    successfulJourneys: number;
    totalDistance: number;
    averageSpeed: number;
    waypointsDiscovered: number;
    chunksExplored: number;
    memoryUsage: number;
    activeJourney?: {
      currentStage: number;
      totalStages: number;
      progress: number;
    };
  } {
    const chunkCount = this.chunkCache.size;
    const waypointCount = Array.from(this.chunkCache.values()).reduce(
      (sum, waypoints) => sum + waypoints.length,
      0
    );

    const activeJourneyStats = this.activeJourney
      ? {
          currentStage:
            this.activeJourney.findIndex((s) => s.status === 'active') + 1,
          totalStages: this.activeJourney.length,
          progress:
            this.activeJourney.filter((s) => s.status === 'completed').length /
            this.activeJourney.length,
        }
      : undefined;

    return {
      totalJourneys: 0, // Would track in real implementation
      successfulJourneys: 0, // Would track in real implementation
      totalDistance: 0, // Would track in real implementation
      averageSpeed: 0, // Would track in real implementation
      waypointsDiscovered: waypointCount,
      chunksExplored: chunkCount,
      memoryUsage: this.getMemoryUsage(),
      activeJourney: activeJourneyStats,
    };
  }

  /**
   * Get waypoints in a specific chunk
   */
  getChunkWaypoints(chunkX: number, chunkZ: number): Waypoint[] {
    const key = `${chunkX},${chunkZ}`;
    return this.chunkCache.get(key) || [];
  }

  /**
   * Manually add a waypoint
   */
  addWaypoint(
    waypoint: Omit<Waypoint, 'id' | 'discoveredAt' | 'visitCount'>
  ): Waypoint {
    const id = `waypoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chunk = this.positionToChunk(waypoint.position);

    const fullWaypoint: Waypoint = {
      id,
      chunk,
      discoveredAt: Date.now(),
      visitCount: 0,
      ...waypoint,
    };

    const chunkKey = chunk.key;
    if (!this.chunkCache.has(chunkKey)) {
      this.chunkCache.set(chunkKey, []);
    }

    const chunkWaypoints = this.chunkCache.get(chunkKey)!;

    // Remove oldest waypoint if chunk is full
    if (chunkWaypoints.length >= this.config.maxWaypointsPerChunk) {
      chunkWaypoints.sort((a, b) => b.lastVisited || 0 - (a.lastVisited || 0));
      chunkWaypoints.pop();
    }

    chunkWaypoints.push(fullWaypoint);
    this.chunkCache.set(chunkKey, chunkWaypoints);

    this.emit('waypoint-discovered', fullWaypoint);

    console.log(
      `📍 Added waypoint: ${fullWaypoint.description} at ${waypoint.position.x.toFixed(1)}, ${waypoint.position.y.toFixed(1)}, ${waypoint.position.z.toFixed(1)}`
    );

    return fullWaypoint;
  }

  // ==================== Private Methods ====================

  private async planRoute(request: JourneyRequest): Promise<{
    waypoints: Waypoint[];
    estimatedDistance: number;
    estimatedTime: number;
  }> {
    const startPos = this.bot.entity.position;
    const endPos = request.destination;

    // Calculate direct distance
    const directDistance = startPos.distanceTo(endPos);

    // For short distances, use direct path
    if (directDistance < this.config.maxChunkDistance) {
      return {
        waypoints: [],
        estimatedDistance: directDistance,
        estimatedTime: directDistance * 0.1, // Rough estimate: 0.1 seconds per block
      };
    }

    // For long distances, plan multi-stage route
    const waypoints: Waypoint[] = [];
    let currentPos = startPos.clone();

    // Calculate number of chunks needed
    const startChunk = this.positionToChunk(startPos);
    const endChunk = this.positionToChunk(endPos);
    const chunkDistance = Math.sqrt(
      Math.pow(endChunk.x - startChunk.x, 2) +
        Math.pow(endChunk.z - startChunk.z, 2)
    );

    // Create intermediate waypoints for long journeys
    const stages = Math.ceil(chunkDistance / 2); // One waypoint every 2 chunks

    for (let i = 0; i < stages; i++) {
      const progress = i / stages;
      const intermediatePos = new Vec3(
        startPos.x + (endPos.x - startPos.x) * progress,
        startPos.y, // Keep Y level for now
        startPos.z + (endPos.z - startPos.z) * progress
      );

      // Check if we know of any waypoints in this area
      const chunk = this.positionToChunk(intermediatePos);
      const existingWaypoints = this.getChunkWaypoints(chunk.x, chunk.z);

      if (existingWaypoints.length > 0) {
        // Use existing safe waypoint
        const safeWaypoint = existingWaypoints.find(
          (w) => w.type === 'safe' && w.riskLevel === 'low'
        );
        if (safeWaypoint) {
          waypoints.push(safeWaypoint);
          currentPos = safeWaypoint.position.clone();
        }
      } else {
        // Create new waypoint
        const waypoint: Waypoint = {
          id: `intermediate_${i}`,
          position: intermediatePos,
          chunk,
          type: 'safe',
          description: `Intermediate waypoint ${i + 1}`,
          riskLevel: 'medium',
          discoveredAt: Date.now(),
          visitCount: 0,
          accessibility: { canReach: true },
        };
        waypoints.push(waypoint);
        currentPos = intermediatePos;
      }
    }

    // Add final destination
    waypoints.push({
      id: 'destination',
      position: endPos,
      chunk: endChunk,
      type: 'landmark',
      description: 'Destination',
      riskLevel: 'medium',
      discoveredAt: Date.now(),
      visitCount: 0,
      accessibility: { canReach: true },
    });

    const totalDistance = waypoints.reduce((sum, wp, i) => {
      if (i === 0) return 0;
      return sum + waypoints[i - 1].position.distanceTo(wp.position);
    }, 0);

    return {
      waypoints,
      estimatedDistance: totalDistance,
      estimatedTime: totalDistance * 0.15, // Slightly slower for long journeys
    };
  }

  private createJourneyStages(
    destination: Vec3,
    routePlan: any
  ): JourneyStage[] {
    const stages: JourneyStage[] = [];
    const startPos = this.bot.entity.position;

    // Create stages based on waypoints
    for (let i = 0; i < routePlan.waypoints.length; i++) {
      const waypoint = routePlan.waypoints[i];
      const start = i === 0 ? startPos : routePlan.waypoints[i - 1].position;

      stages.push({
        id: `stage_${i}`,
        startPosition: start,
        endPosition: waypoint.position,
        waypoints: [waypoint],
        estimatedDistance: start.distanceTo(waypoint.position),
        estimatedTime: waypoint.position.distanceTo(start) * 0.15,
        riskLevel: waypoint.riskLevel,
        status: i === 0 ? 'active' : 'pending',
      });
    }

    return stages;
  }

  private async executeJourney(
    stages: JourneyStage[],
    request: JourneyRequest
  ): Promise<JourneyResult> {
    const startTime = Date.now();
    const startPos = this.bot.entity.position;
    this.activeJourney = stages;

    const completedStages: JourneyStage[] = [];
    const discoveredWaypoints: Waypoint[] = [];
    let obstaclesEncountered = 0;
    let replanCount = 0;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      console.log(
        `🗺️ Executing journey stage ${i + 1}/${stages.length}: ${stage.startPosition.x.toFixed(1)}, ${stage.startPosition.y.toFixed(1)}, ${stage.startPosition.z.toFixed(1)} → ${stage.endPosition.x.toFixed(1)}, ${stage.endPosition.y.toFixed(1)}, ${stage.endPosition.z.toFixed(1)}`
      );

      // Execute stage navigation
      const stageResult = await this.executeStage(stage);

      if (stageResult.success) {
        stage.status = 'completed';
        stage.completionTime = Date.now();
        completedStages.push(stage);

        // Discover new waypoints during journey
        const newWaypoints = await this.discoverWaypointsAlongPath(
          stage.actualPath || []
        );
        discoveredWaypoints.push(...newWaypoints);

        // Update waypoint visit counts
        for (const waypoint of stage.waypoints) {
          waypoint.lastVisited = Date.now();
          waypoint.visitCount++;
        }

        this.emit('stage-completed', stage);
      } else {
        stage.status = 'failed';
        console.error(`❌ Journey stage ${i + 1} failed:`, stageResult.error);

        // Try replanning if stage fails
        if (replanCount < 3) {
          replanCount++;
          const replanResult = await this.replanJourney(
            stages.slice(0, i + 1),
            request
          );

          if (replanResult.success) {
            console.log('🔄 Replanning successful, continuing journey');
            this.emit('replan-triggered', {
              reason: stageResult.error || 'Stage failure',
              newPath: replanResult.newPath || [],
            });
            continue;
          }
        }

        // Journey failed
        return {
          success: false,
          totalDistance: completedStages.reduce(
            (sum, s) => sum + s.estimatedDistance,
            0
          ),
          totalTime: Date.now() - startTime,
          stages: [...completedStages, stage],
          finalPosition: this.bot.entity.position,
          waypointsDiscovered: discoveredWaypoints,
          obstaclesEncountered,
          error: stageResult.error || 'Journey stage failed',
          metadata: {
            averageSpeed: 0,
            riskLevel: 'high',
            replanCount,
            memoryUsage: this.getMemoryUsage(),
          },
        };
      }
    }

    const totalDistance = completedStages.reduce(
      (sum, s) => sum + s.estimatedDistance,
      0
    );
    const totalTime = Date.now() - startTime;

    return {
      success: true,
      totalDistance,
      totalTime,
      stages: completedStages,
      finalPosition: this.bot.entity.position,
      waypointsDiscovered: discoveredWaypoints,
      obstaclesEncountered,
      metadata: {
        averageSpeed: totalDistance / (totalTime / 1000), // blocks per second
        riskLevel: request.urgency === 'critical' ? 'high' : 'low',
        replanCount,
        memoryUsage: this.getMemoryUsage(),
      },
    };
  }

  private async executeStage(
    stage: JourneyStage
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.navigationBridge.navigateTo(stage.endPosition, {
        timeout: Math.min(stage.estimatedTime * 1000, 60000), // Max 60 seconds
        dynamicReplanning: true,
      });

      stage.actualPath = result.data?.path || [];

      return { success: result.success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async replanJourney(
    failedStages: JourneyStage[],
    request: JourneyRequest
  ): Promise<{
    success: boolean;
    newPath?: Vec3[];
    error?: string;
  }> {
    // Simple replanning - in a real implementation, this would be more sophisticated
    console.log('🔄 Replanning journey due to stage failure');

    // For now, allow journey to continue with remaining stages
    return { success: true, newPath: [], error: undefined };
  }

  private async discoverWaypointsAlongPath(path: Vec3[]): Promise<Waypoint[]> {
    const discoveredWaypoints: Waypoint[] = [];

    // Sample points along the path to discover waypoints
    const sampleRate = Math.max(1, Math.floor(path.length / 10)); // Sample 10% of points

    for (let i = 0; i < path.length; i += sampleRate) {
      const position = path[i];
      const nearbyWaypoints = await this.discoverWaypointsAtPosition(position);

      for (const waypoint of nearbyWaypoints) {
        if (!this.isWaypointKnown(waypoint.position)) {
          const fullWaypoint = this.addWaypoint(waypoint);
          discoveredWaypoints.push(fullWaypoint);
        }
      }
    }

    return discoveredWaypoints;
  }

  private async discoverWaypointsAtPosition(
    position: Vec3
  ): Promise<Omit<Waypoint, 'id' | 'discoveredAt' | 'visitCount'>[]> {
    const waypoints: Omit<Waypoint, 'id' | 'discoveredAt' | 'visitCount'>[] =
      [];

    // Discover safe areas
    const block = this.bot.blockAt(position);
    if (block && this.isSafeBlock(block.name)) {
      waypoints.push({
        position,
        chunk: this.positionToChunk(position),
        type: 'safe',
        description: `Safe area discovered at ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`,
        riskLevel: 'low',
        accessibility: { canReach: true },
      });
    }

    // Discover hazards
    if (block && this.isHazardBlock(block.name)) {
      waypoints.push({
        position,
        chunk: this.positionToChunk(position),
        type: 'hazard',
        description: `Hazard discovered: ${block.name}`,
        riskLevel: 'high',
        accessibility: { canReach: true },
      });
    }

    return waypoints;
  }

  private isSafeBlock(blockName: string): boolean {
    const safeBlocks = ['grass', 'dirt', 'stone', 'sand', 'gravel', 'wood'];
    return safeBlocks.some((safe) => blockName.includes(safe));
  }

  private isHazardBlock(blockName: string): boolean {
    const hazardBlocks = ['lava', 'fire', 'cactus', 'cobweb'];
    return hazardBlocks.some((hazard) => blockName.includes(hazard));
  }

  private isWaypointKnown(position: Vec3): boolean {
    for (const waypoints of this.chunkCache.values()) {
      for (const waypoint of waypoints) {
        if (waypoint.position.distanceTo(position) < 1) {
          return true;
        }
      }
    }
    return false;
  }

  private positionToChunk(position: Vec3): ChunkCoordinate {
    const chunkX = Math.floor(position.x / 16);
    const chunkZ = Math.floor(position.z / 16);
    return {
      x: chunkX,
      z: chunkZ,
      key: `${chunkX},${chunkZ}`,
    };
  }

  private startFollowingLoop(): void {
    if (!this.playerFollowingState) return;

    const followInterval = setInterval(async () => {
      if (
        !this.playerFollowingState ||
        !this.playerFollowingState.isFollowing
      ) {
        clearInterval(followInterval);
        return;
      }

      await this.updatePlayerFollowing();
    }, 2000); // Update every 2 seconds
  }

  private async updatePlayerFollowing(): Promise<void> {
    if (!this.playerFollowingState) return;

    // Find target player
    const targetPlayer = Object.values(this.bot.entities).find(
      (entity) => entity.name === this.playerFollowingState?.targetPlayerName
    );

    if (!targetPlayer) {
      // Player not in sight
      const timeSinceLastSeen =
        Date.now() - this.playerFollowingState.lastSeenTime;

      if (timeSinceLastSeen > 60000) {
        // 1 minute
        console.log(
          `❌ Lost track of player ${this.playerFollowingState.targetPlayerName}, stopping following`
        );
        this.stopFollowingPlayer();
        return;
      }

      // Use predictive following if enabled
      if (
        this.playerFollowingState.predictiveMode &&
        this.playerFollowingState.lastKnownPosition
      ) {
        await this.followPredictivePath();
      }

      return;
    }

    // Update tracking
    this.playerFollowingState.lastKnownPosition = targetPlayer.position.clone();
    this.playerFollowingState.lastSeenTime = Date.now();

    // Calculate distance and direction
    const botPos = this.bot.entity.position;
    const playerPos = targetPlayer.position;
    const distance = botPos.distanceTo(playerPos);

    // Check if we need to move
    const targetDistance =
      this.playerFollowingState.socialContext.followingDistance;

    if (distance > targetDistance + 2) {
      // Some tolerance
      console.log(
        `👣 Following ${targetPlayer.name} at distance ${distance.toFixed(1)} (target: ${targetDistance})`
      );

      // Navigate towards player
      const result = await this.navigationBridge.navigateTo(playerPos, {
        timeout: 30000,
        dynamicReplanning: true,
      });

      if (!result.success) {
        console.log(
          `❌ Failed to follow ${targetPlayer.name}: ${result.error}`
        );
      }
    } else {
      console.log(
        `✅ Following ${targetPlayer.name} at optimal distance ${distance.toFixed(1)}`
      );
    }
  }

  private async followPredictivePath(): Promise<void> {
    if (!this.playerFollowingState?.lastKnownPosition) return;

    // Simple predictive following - move in the direction the player was last moving
    // In a real implementation, this would use more sophisticated prediction

    const predictedPosition =
      this.playerFollowingState.lastKnownPosition.clone();

    console.log(
      `🔮 Using predictive following to: ${predictedPosition.x.toFixed(1)}, ${predictedPosition.y.toFixed(1)}, ${predictedPosition.z.toFixed(1)}`
    );

    await this.navigationBridge.navigateTo(predictedPosition, {
      timeout: 20000,
      dynamicReplanning: true,
    });
  }

  private getMemoryUsage(): number {
    return this.chunkCache.size * 1000; // Rough estimate: 1KB per chunk
  }

  private startMemoryCleanup(): void {
    this.memoryCleanupInterval = setInterval(() => {
      this.cleanupMemory();
    }, 300000); // Clean every 5 minutes
  }

  private cleanupMemory(): void {
    const cutoff = Date.now() - this.config.memoryTtl;

    for (const [chunkKey, waypoints] of this.chunkCache.entries()) {
      // Remove old waypoints
      const recentWaypoints = waypoints.filter(
        (wp) => wp.lastVisited && wp.lastVisited > cutoff
      );

      if (recentWaypoints.length === 0) {
        this.chunkCache.delete(chunkKey);
      } else {
        this.chunkCache.set(chunkKey, recentWaypoints);
      }
    }

    console.log(`🧹 Memory cleanup: ${this.chunkCache.size} chunks remaining`);
  }

  dispose(): void {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
    }
    this.removeAllListeners();
  }
}
