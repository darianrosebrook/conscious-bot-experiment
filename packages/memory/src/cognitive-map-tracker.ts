/**
 * Cognitive Map Tracker
 *
 * Neuroscience-inspired system for tracking how memory patterns evolve over time,
 * building cognitive maps similar to hippocampal place cells and episodic memory
 * representations. This creates manifold structures that show learning progression
 * and memory organization patterns.
 *
 * @author @darianrosebrook
 */

import { EnhancedVectorDatabase, EnhancedMemoryChunk } from './vector-database';
import { EmbeddingService } from './embedding-service';
import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface CognitiveMapConfig {
  /** Enable cognitive map tracking */
  enabled: boolean;

  /** How often to update the cognitive map (ms) */
  updateInterval: number;

  /** Maximum number of memories to track in manifold */
  maxManifoldSize: number;

  /** Number of dimensions for manifold representation */
  manifoldDimensions: number;

  /** Minimum similarity for manifold clustering */
  clusteringThreshold: number;

  /** Dependencies */
  vectorDb: EnhancedVectorDatabase;
  embeddingService: EmbeddingService;
}

export interface MemoryManifoldPoint {
  memoryId: string;
  content: string;
  embedding: number[];
  metadata: {
    type: string;
    importance: number;
    timestamp: number;
    entities?: string[];
    topics?: string[];
    position?: { x: number; y: number; z: number };
  };
  manifoldCoordinates: number[]; // 2D or 3D coordinates in cognitive space
  clusterId: string;
  learningProgress: number; // 0-1, how established this memory is
  temporalTrajectory: Array<{
    timestamp: number;
    coordinates: number[];
    strength: number;
  }>;
}

export interface CognitiveMapCluster {
  id: string;
  centroid: number[];
  memories: MemoryManifoldPoint[];
  clusterType: 'semantic' | 'episodic' | 'procedural' | 'emotional' | 'spatial';
  averageImportance: number;
  learningTrajectory: Array<{
    timestamp: number;
    clusterSize: number;
    averageStrength: number;
  }>;
  dominantTopics: string[];
  temporalEvolution: Array<{
    timestamp: number;
    clusterShape: number[]; // Shape parameters
    clusterDensity: number;
  }>;
}

export interface CognitiveMapSnapshot {
  timestamp: number;
  manifold: MemoryManifoldPoint[];
  clusters: CognitiveMapCluster[];
  learningProgression: {
    totalMemories: number;
    averageLearningProgress: number;
    clusterDistribution: Record<string, number>;
    manifoldDimensionality: number;
  };
  trajectories: Array<{
    memoryId: string;
    trajectory: Array<{
      timestamp: number;
      coordinates: number[];
      strength: number;
    }>;
  }>;
}

export interface CognitiveMapStatistics {
  totalMemories: number;
  totalClusters: number;
  averageManifoldDensity: number;
  learningProgressRate: number;
  clusterStability: number;
  memoryDifferentiation: number; // How well memories are separated in cognitive space
}

// ============================================================================
// Cognitive Map Tracker Implementation
// ============================================================================

/**
 * Tracks cognitive map evolution and memory organization patterns
 */
export class CognitiveMapTracker {
  private config: CognitiveMapConfig;
  private manifold: MemoryManifoldPoint[] = [];
  private clusters: CognitiveMapCluster[] = [];
  private snapshots: CognitiveMapSnapshot[] = [];
  private lastUpdate: number = 0;
  private learningTrajectories: Map<
    string,
    Array<{
      timestamp: number;
      progress: number;
      strength: number;
    }>
  > = new Map();

  constructor(config: CognitiveMapConfig) {
    this.config = config;

    if (config.enabled) {
      // Start background updates
      this.startUpdateScheduler();
    }
  }

  /**
   * Add a memory to the cognitive map
   */
  async addToManifold(
    memoryId: string,
    content: string,
    embedding: number[],
    metadata: MemoryManifoldPoint['metadata']
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Check if memory already exists
    const existingIndex = this.manifold.findIndex(
      (m) => m.memoryId === memoryId
    );

    // Calculate manifold coordinates (simplified UMAP-like projection)
    const coordinates = this.calculateManifoldCoordinates(embedding, metadata);

    // Calculate learning progress based on access patterns and time
    const learningProgress = this.calculateLearningProgress(memoryId, metadata);

    const manifoldPoint: MemoryManifoldPoint = {
      memoryId,
      content,
      embedding,
      metadata,
      manifoldCoordinates: coordinates,
      clusterId: this.findNearestCluster(coordinates),
      learningProgress,
      temporalTrajectory: [
        {
          timestamp: Date.now(),
          coordinates,
          strength: metadata.importance,
        },
      ],
    };

    if (existingIndex >= 0) {
      // Update existing point
      this.manifold[existingIndex] = manifoldPoint;
    } else {
      // Add new point
      if (this.manifold.length >= this.config.maxManifoldSize) {
        // Remove oldest memory if manifold is full
        this.manifold.shift();
      }
      this.manifold.push(manifoldPoint);
    }

    // Update learning trajectory
    if (!this.learningTrajectories.has(memoryId)) {
      this.learningTrajectories.set(memoryId, []);
    }
    this.learningTrajectories.get(memoryId)!.push({
      timestamp: Date.now(),
      progress: learningProgress,
      strength: metadata.importance,
    });

    console.log(
      `🗺️ Added memory ${memoryId} to cognitive map at coordinates [${coordinates.map((c) => c.toFixed(2)).join(', ')}]`
    );
  }

  /**
   * Update cognitive map with new snapshot
   */
  async updateMap(): Promise<CognitiveMapSnapshot> {
    if (!this.config.enabled || this.manifold.length === 0) {
      return this.createEmptySnapshot();
    }

    console.log(
      `🗺️ Updating cognitive map with ${this.manifold.length} memories...`
    );

    // Recalculate clusters based on current manifold
    this.clusters = this.performClustering();

    // Create snapshot
    const snapshot: CognitiveMapSnapshot = {
      timestamp: Date.now(),
      manifold: [...this.manifold],
      clusters: [...this.clusters],
      learningProgression: this.calculateLearningProgression(),
      trajectories: this.getCurrentTrajectories(),
    };

    // Store snapshot for historical tracking
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 50) {
      // Keep last 50 snapshots
      this.snapshots.shift();
    }

    this.lastUpdate = Date.now();

    console.log(
      `✅ Cognitive map updated: ${this.clusters.length} clusters, ${this.manifold.length} memories`
    );

    return snapshot;
  }

  /**
   * Get current cognitive map statistics
   */
  getStatistics(): CognitiveMapStatistics {
    if (this.manifold.length === 0) {
      return {
        totalMemories: 0,
        totalClusters: 0,
        averageManifoldDensity: 0,
        learningProgressRate: 0,
        clusterStability: 0,
        memoryDifferentiation: 0,
      };
    }

    const recentSnapshots = this.snapshots.slice(-5);
    const learningProgressRate =
      recentSnapshots.length > 1
        ? recentSnapshots[recentSnapshots.length - 1].learningProgression
            .averageLearningProgress -
          recentSnapshots[0].learningProgression.averageLearningProgress
        : 0;

    const clusterStability = this.calculateClusterStability();
    const memoryDifferentiation = this.calculateMemoryDifferentiation();
    const averageManifoldDensity =
      this.manifold.length / Math.pow(this.config.maxManifoldSize, 2);

    return {
      totalMemories: this.manifold.length,
      totalClusters: this.clusters.length,
      averageManifoldDensity,
      learningProgressRate,
      clusterStability,
      memoryDifferentiation,
    };
  }

  /**
   * Get cognitive map snapshots for analysis
   */
  getSnapshots(limit: number = 10): CognitiveMapSnapshot[] {
    return this.snapshots.slice(-limit);
  }

  /**
   * Get learning trajectory for a specific memory
   */
  getLearningTrajectory(memoryId: string): Array<{
    timestamp: number;
    progress: number;
    strength: number;
  }> {
    return this.learningTrajectories.get(memoryId) || [];
  }

  /**
   * Find similar memories in cognitive space
   */
  findSimilarMemories(
    referenceMemoryId: string,
    maxDistance: number = 0.5
  ): MemoryManifoldPoint[] {
    const referencePoint = this.manifold.find(
      (m) => m.memoryId === referenceMemoryId
    );
    if (!referencePoint) return [];

    return this.manifold
      .filter((point) => point.memoryId !== referenceMemoryId)
      .filter((point) => {
        const distance = this.calculateCognitiveDistance(
          referencePoint.manifoldCoordinates,
          point.manifoldCoordinates
        );
        return distance <= maxDistance;
      })
      .sort((a, b) => {
        const distA = this.calculateCognitiveDistance(
          referencePoint.manifoldCoordinates,
          a.manifoldCoordinates
        );
        const distB = this.calculateCognitiveDistance(
          referencePoint.manifoldCoordinates,
          b.manifoldCoordinates
        );
        return distA - distB;
      });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculate manifold coordinates for a memory (simplified UMAP-like projection)
   */
  private calculateManifoldCoordinates(
    embedding: number[],
    metadata: MemoryManifoldPoint['metadata']
  ): number[] {
    const dimensions = this.config.manifoldDimensions;
    const coordinates: number[] = [];

    // Base coordinates from embedding (reduce dimensionality)
    for (let i = 0; i < dimensions; i++) {
      let coord = 0;
      const step = Math.floor(embedding.length / dimensions);

      for (let j = i * step; j < (i + 1) * step && j < embedding.length; j++) {
        coord += embedding[j] * (1 / step);
      }

      coordinates.push(coord);
    }

    // Adjust coordinates based on memory type (creates natural clustering)
    const typeAdjustments: Record<string, number[]> = {
      knowledge: [0.2, 0.1],
      experience: [0.1, 0.3],
      thought: [-0.1, 0.2],
      observation: [0.3, -0.1],
      dialogue: [-0.2, 0.1],
    };

    const adjustment = typeAdjustments[metadata.type] || [0, 0];
    for (let i = 0; i < Math.min(dimensions, adjustment.length); i++) {
      coordinates[i] += adjustment[i];
    }

    // Normalize coordinates to [-1, 1] range
    const maxCoord = Math.max(...coordinates.map(Math.abs));
    if (maxCoord > 0) {
      for (let i = 0; i < coordinates.length; i++) {
        coordinates[i] = coordinates[i] / maxCoord;
      }
    }

    return coordinates;
  }

  /**
   * Calculate learning progress for a memory
   */
  private calculateLearningProgress(
    memoryId: string,
    metadata: MemoryManifoldPoint['metadata']
  ): number {
    const trajectory = this.learningTrajectories.get(memoryId) || [];

    // Base progress from importance
    let progress = metadata.importance * 0.4;

    // Progress from time (older memories tend to be more established)
    const hoursSinceCreation =
      (Date.now() - metadata.timestamp) / (1000 * 60 * 60);
    const timeProgress = Math.min(0.3, hoursSinceCreation / 24); // Max 30% from time
    progress += timeProgress;

    // Progress from trajectory length (more revisits = more learned)
    const trajectoryProgress = Math.min(0.3, trajectory.length * 0.05);
    progress += trajectoryProgress;

    return Math.min(1.0, Math.max(0.0, progress));
  }

  /**
   * Find nearest cluster for a point
   */
  private findNearestCluster(coordinates: number[]): string {
    if (this.clusters.length === 0) {
      return 'unclustered';
    }

    let nearestClusterId = this.clusters[0].id;
    let nearestDistance = this.calculateCognitiveDistance(
      coordinates,
      this.clusters[0].centroid
    );

    for (let i = 1; i < this.clusters.length; i++) {
      const distance = this.calculateCognitiveDistance(
        coordinates,
        this.clusters[i].centroid
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestClusterId = this.clusters[i].id;
      }
    }

    return nearestDistance <= this.config.clusteringThreshold
      ? nearestClusterId
      : 'unclustered';
  }

  /**
   * Perform clustering on manifold points
   */
  private performClustering(): CognitiveMapCluster[] {
    if (this.manifold.length < 3) {
      return [];
    }

    // Simple clustering algorithm (could be replaced with more sophisticated method)
    const clusters: CognitiveMapCluster[] = [];
    const used = new Set<string>();

    for (const point of this.manifold) {
      if (used.has(point.memoryId)) continue;

      // Start new cluster
      const clusterId = `cluster-${clusters.length + 1}`;
      const cluster: CognitiveMapCluster = {
        id: clusterId,
        centroid: [...point.manifoldCoordinates],
        memories: [point],
        clusterType: this.determineClusterType([point]),
        averageImportance: point.metadata.importance,
        learningTrajectory: [
          {
            timestamp: Date.now(),
            clusterSize: 1,
            averageStrength: point.metadata.importance,
          },
        ],
        dominantTopics: point.metadata.topics || [],
        temporalEvolution: [
          {
            timestamp: Date.now(),
            clusterShape: [1.0, 1.0], // Placeholder shape parameters
            clusterDensity: 1.0,
          },
        ],
      };

      used.add(point.memoryId);

      // Find nearby points
      for (const otherPoint of this.manifold) {
        if (used.has(otherPoint.memoryId)) continue;

        const distance = this.calculateCognitiveDistance(
          point.manifoldCoordinates,
          otherPoint.manifoldCoordinates
        );

        if (distance <= this.config.clusteringThreshold) {
          cluster.memories.push(otherPoint);
          used.add(otherPoint.memoryId);

          // Update centroid
          for (let i = 0; i < cluster.centroid.length; i++) {
            cluster.centroid[i] =
              (cluster.centroid[i] * (cluster.memories.length - 1) +
                otherPoint.manifoldCoordinates[i]) /
              cluster.memories.length;
          }

          // Update average importance
          cluster.averageImportance =
            cluster.memories.reduce(
              (sum, m) => sum + m.metadata.importance,
              0
            ) / cluster.memories.length;

          // Update dominant topics
          const allTopics = cluster.memories.flatMap(
            (m) => m.metadata.topics || []
          );
          cluster.dominantTopics = this.findDominantTopics(allTopics);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Determine cluster type based on memory characteristics
   */
  private determineClusterType(
    memories: MemoryManifoldPoint[]
  ): CognitiveMapCluster['clusterType'] {
    const typeCounts: Record<string, number> = {};

    for (const memory of memories) {
      typeCounts[memory.metadata.type] =
        (typeCounts[memory.metadata.type] || 0) + 1;
    }

    const dominantType = Object.entries(typeCounts).sort(
      ([, a], [, b]) => b - a
    )[0]?.[0];

    const typeMapping: Record<string, CognitiveMapCluster['clusterType']> = {
      knowledge: 'semantic',
      experience: 'episodic',
      thought: 'procedural',
      observation: 'episodic',
      dialogue: 'semantic',
    };

    return typeMapping[dominantType] || 'semantic';
  }

  /**
   * Find dominant topics in a cluster
   */
  private findDominantTopics(topics: string[]): string[] {
    const topicCounts: Record<string, number> = {};

    for (const topic of topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }

    return Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  /**
   * Calculate cognitive distance between two points
   */
  private calculateCognitiveDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return 1;

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }

    return Math.sqrt(sum);
  }

  /**
   * Calculate learning progression metrics
   */
  private calculateLearningProgression(): CognitiveMapSnapshot['learningProgression'] {
    const averageLearningProgress =
      this.manifold.length > 0
        ? this.manifold.reduce((sum, m) => sum + m.learningProgress, 0) /
          this.manifold.length
        : 0;

    const clusterDistribution: Record<string, number> = {};
    for (const cluster of this.clusters) {
      clusterDistribution[cluster.clusterType] =
        (clusterDistribution[cluster.clusterType] || 0) +
        cluster.memories.length;
    }

    return {
      totalMemories: this.manifold.length,
      averageLearningProgress,
      clusterDistribution,
      manifoldDimensionality: this.config.manifoldDimensions,
    };
  }

  /**
   * Get current trajectories for all memories
   */
  private getCurrentTrajectories(): Array<{
    memoryId: string;
    trajectory: Array<{
      timestamp: number;
      coordinates: number[];
      strength: number;
    }>;
  }> {
    const trajectories: Array<{
      memoryId: string;
      trajectory: Array<{
        timestamp: number;
        coordinates: number[];
        strength: number;
      }>;
    }> = [];

    for (const point of this.manifold) {
      trajectories.push({
        memoryId: point.memoryId,
        trajectory: point.temporalTrajectory,
      });
    }

    return trajectories;
  }

  /**
   * Calculate cluster stability over time
   */
  private calculateClusterStability(): number {
    if (this.snapshots.length < 2) return 0;

    const recentSnapshots = this.snapshots.slice(-3);
    let totalStability = 0;

    for (let i = 1; i < recentSnapshots.length; i++) {
      const prevSnapshot = recentSnapshots[i - 1];
      const currSnapshot = recentSnapshots[i];

      const prevClusters = prevSnapshot.clusters.map((c) => c.id);
      const currClusters = currSnapshot.clusters.map((c) => c.id);

      const intersection = prevClusters.filter((id) =>
        currClusters.includes(id)
      ).length;
      const union = new Set([...prevClusters, ...currClusters]).size;

      totalStability += intersection / union;
    }

    return totalStability / (recentSnapshots.length - 1);
  }

  /**
   * Calculate memory differentiation in cognitive space
   */
  private calculateMemoryDifferentiation(): number {
    if (this.manifold.length < 2) return 0;

    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < this.manifold.length; i++) {
      for (let j = i + 1; j < this.manifold.length; j++) {
        const distance = this.calculateCognitiveDistance(
          this.manifold[i].manifoldCoordinates,
          this.manifold[j].manifoldCoordinates
        );
        totalDistance += distance;
        count++;
      }
    }

    const averageDistance = totalDistance / count;
    return Math.min(1.0, averageDistance * 2); // Normalize to 0-1
  }

  /**
   * Create empty snapshot
   */
  private createEmptySnapshot(): CognitiveMapSnapshot {
    return {
      timestamp: Date.now(),
      manifold: [],
      clusters: [],
      learningProgression: {
        totalMemories: 0,
        averageLearningProgress: 0,
        clusterDistribution: {},
        manifoldDimensionality: this.config.manifoldDimensions,
      },
      trajectories: [],
    };
  }

  /**
   * Start background update scheduler
   */
  private startUpdateScheduler(): void {
    setInterval(async () => {
      await this.updateMap();
    }, this.config.updateInterval);
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_COGNITIVE_MAP_CONFIG: Partial<CognitiveMapConfig> = {
  enabled: true,
  updateInterval: 60000, // 1 minute
  maxManifoldSize: 500,
  manifoldDimensions: 3, // 3D cognitive space
  clusteringThreshold: 0.3,
};
