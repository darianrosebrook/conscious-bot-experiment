/**
 * Observed Resources Index - Spatial indexing with confidence tracking
 *
 * Maintains a chunk-based spatial index of observed blocks with confidence decay
 * and efficient nearest-neighbor queries for resource discovery.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  Observation,
  Vec3,
  SpatialQuery,
  IndexStats,
  ChunkKey,
  BlockKey,
  IObservedResourcesIndex,
  worldToChunkKey,
  worldToBlockKey,
  distance,
  validateObservation,
} from '../types';

export interface IndexEvents {
  'observation-added': [Observation];
  'observation-updated': [Observation, Observation]; // old, new
  'observation-expired': [Observation];
  'chunk-activated': [ChunkKey];
  'chunk-deactivated': [ChunkKey];
  'index-stats': [IndexStats];
}

/**
 * Chunk-based spatial index for observed resources
 */
interface ChunkData {
  observations: Map<BlockKey, Observation>;
  lastAccessed: number;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

/**
 * High-performance spatial index with confidence decay
 */
export class ObservedResourcesIndex
  extends EventEmitter<IndexEvents>
  implements IObservedResourcesIndex
{
  private chunks = new Map<ChunkKey, ChunkData>();
  private blockTypeIndex = new Map<string, Set<BlockKey>>();
  private totalObservations = 0;

  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private config: {
      maxChunks: number;
      confidenceDecayRate: number; // per minute
      minConfidence: number;
      cleanupIntervalMs: number;
    } = {
      maxChunks: 1000,
      confidenceDecayRate: 0.02,
      minConfidence: 0.1,
      cleanupIntervalMs: 60000, // 1 minute
    }
  ) {
    super();

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performMaintenance();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Add or update an observation
   */
  upsert(observation: Observation): void {
    validateObservation(observation);

    const chunkKey = worldToChunkKey(observation.pos);
    const blockKey = worldToBlockKey(observation.pos);

    // Get or create chunk
    let chunk = this.chunks.get(chunkKey);
    if (!chunk) {
      chunk = this.createChunk(chunkKey);
      this.chunks.set(chunkKey, chunk);
      this.emit('chunk-activated', chunkKey);
    }

    // Check if observation already exists
    const existing = chunk.observations.get(blockKey);

    if (existing) {
      // Update existing observation
      const oldObs = { ...existing };

      // Keep higher confidence and more recent timestamp
      existing.confidence = Math.max(
        existing.confidence,
        observation.confidence
      );
      existing.lastSeen = Math.max(existing.lastSeen, observation.lastSeen);

      // Update other fields from new observation
      existing.distance = observation.distance;
      existing.normal = observation.normal;
      existing.light = observation.light;
      existing.source = observation.source;
      existing.metadata = { ...existing.metadata, ...observation.metadata };

      this.emit('observation-updated', oldObs, existing);
    } else {
      // Add new observation
      chunk.observations.set(blockKey, { ...observation });
      this.totalObservations++;

      // Update block type index
      this.addToBlockTypeIndex(observation.blockId, blockKey);

      this.emit('observation-added', observation);
    }

    chunk.lastAccessed = Date.now();
  }

  /**
   * Find observations near a position
   */
  lookupNear(query: SpatialQuery): Observation[] {
    const results: Observation[] = [];
    const { center, radius, blockTypes, minConfidence, maxAge } = query;
    const currentTime = Date.now();

    // Calculate chunk range to search
    const minChunkX = Math.floor((center.x - radius) / 16);
    const maxChunkX = Math.floor((center.x + radius) / 16);
    const minChunkZ = Math.floor((center.z - radius) / 16);
    const maxChunkZ = Math.floor((center.z + radius) / 16);

    // Search relevant chunks
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
      for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
        const chunkKey: ChunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(chunkKey);

        if (!chunk) continue;

        // Check all observations in chunk
        for (const observation of chunk.observations.values()) {
          const dist = distance(center, observation.pos);

          // Distance filter
          if (dist > radius) continue;

          // Block type filter
          if (blockTypes && !blockTypes.includes(observation.blockId)) continue;

          // Confidence filter
          if (minConfidence && observation.confidence < minConfidence) continue;

          // Age filter
          if (maxAge && currentTime - observation.lastSeen > maxAge) continue;

          results.push(observation);
        }

        chunk.lastAccessed = currentTime;
      }
    }

    // Sort by distance
    results.sort((a, b) => distance(center, a.pos) - distance(center, b.pos));

    return results;
  }

  /**
   * Find nearest observation of specific block types
   */
  findNearest(
    position: Vec3,
    blockTypes: string[],
    maxDistance: number = 64
  ): Observation | null {
    const query: SpatialQuery = {
      center: position,
      radius: maxDistance,
      blockTypes,
      minConfidence: this.config.minConfidence,
    };

    const results = this.lookupNear(query);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Decay confidence for old observations
   */
  decay(currentTime: number): { expired: number; updated: number } {
    let expired = 0;
    let updated = 0;
    const expiredChunks: ChunkKey[] = [];

    for (const [chunkKey, chunk] of this.chunks) {
      const expiredBlocks: BlockKey[] = [];

      for (const [blockKey, observation] of chunk.observations) {
        const age = currentTime - observation.lastSeen;
        const ageMinutes = age / (60 * 1000);

        // Apply exponential decay
        const decayAmount = this.config.confidenceDecayRate * ageMinutes;
        observation.confidence = Math.max(
          0,
          observation.confidence - decayAmount
        );

        if (observation.confidence < this.config.minConfidence) {
          // Mark for removal
          expiredBlocks.push(blockKey);
          this.emit('observation-expired', observation);
        } else {
          updated++;
        }
      }

      // Remove expired observations
      for (const blockKey of expiredBlocks) {
        const observation = chunk.observations.get(blockKey);
        if (observation) {
          chunk.observations.delete(blockKey);
          this.removeFromBlockTypeIndex(observation.blockId, blockKey);
          this.totalObservations--;
          expired++;
        }
      }

      // Mark empty chunks for removal
      if (chunk.observations.size === 0) {
        expiredChunks.push(chunkKey);
      }
    }

    // Remove empty chunks
    for (const chunkKey of expiredChunks) {
      this.chunks.delete(chunkKey);
      this.emit('chunk-deactivated', chunkKey);
    }

    return { expired, updated };
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats {
    const now = Date.now();
    let oldestTime = now;
    let newestTime = 0;
    let totalConfidence = 0;
    let memoryBytes = 0;

    const uniqueBlocks = new Set<string>();

    for (const chunk of this.chunks.values()) {
      for (const observation of chunk.observations.values()) {
        uniqueBlocks.add(observation.blockId);
        totalConfidence += observation.confidence;
        oldestTime = Math.min(oldestTime, observation.lastSeen);
        newestTime = Math.max(newestTime, observation.lastSeen);

        // Rough memory estimation (observation + overhead)
        memoryBytes += 200; // Approximate bytes per observation
      }
    }

    return {
      totalObservations: this.totalObservations,
      uniqueBlocks: uniqueBlocks.size,
      chunksActive: this.chunks.size,
      averageConfidence:
        this.totalObservations > 0
          ? totalConfidence / this.totalObservations
          : 0,
      oldestObservation: oldestTime === now ? 0 : oldestTime,
      newestObservation: newestTime,
      memoryUsageBytes: memoryBytes,
    };
  }

  /**
   * Clear all observations (for testing)
   */
  clear(): void {
    this.chunks.clear();
    this.blockTypeIndex.clear();
    this.totalObservations = 0;
  }

  /**
   * Get all observations matching block types
   */
  getObservationsByType(blockTypes: string[]): Observation[] {
    const results: Observation[] = [];

    for (const blockType of blockTypes) {
      const blockKeys = this.blockTypeIndex.get(blockType);
      if (!blockKeys) continue;

      for (const blockKey of blockKeys) {
        const observation = this.findObservationByBlockKey(blockKey);
        if (observation) {
          results.push(observation);
        }
      }
    }

    return results;
  }

  /**
   * Get observations in specific chunks
   */
  getObservationsInChunks(chunkKeys: ChunkKey[]): Observation[] {
    const results: Observation[] = [];

    for (const chunkKey of chunkKeys) {
      const chunk = this.chunks.get(chunkKey);
      if (chunk) {
        results.push(...Array.from(chunk.observations.values()));
        chunk.lastAccessed = Date.now();
      }
    }

    return results;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.clear();
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private createChunk(chunkKey: ChunkKey): ChunkData {
    const [xStr, zStr] = chunkKey.split(',');
    const chunkX = parseInt(xStr);
    const chunkZ = parseInt(zStr);

    return {
      observations: new Map(),
      lastAccessed: Date.now(),
      bounds: {
        minX: chunkX * 16,
        maxX: chunkX * 16 + 15,
        minZ: chunkZ * 16,
        maxZ: chunkZ * 16 + 15,
      },
    };
  }

  private addToBlockTypeIndex(blockId: string, blockKey: BlockKey): void {
    let blockSet = this.blockTypeIndex.get(blockId);
    if (!blockSet) {
      blockSet = new Set();
      this.blockTypeIndex.set(blockId, blockSet);
    }
    blockSet.add(blockKey);
  }

  private removeFromBlockTypeIndex(blockId: string, blockKey: BlockKey): void {
    const blockSet = this.blockTypeIndex.get(blockId);
    if (blockSet) {
      blockSet.delete(blockKey);
      if (blockSet.size === 0) {
        this.blockTypeIndex.delete(blockId);
      }
    }
  }

  private findObservationByBlockKey(blockKey: BlockKey): Observation | null {
    // Parse block coordinates from key
    const [xStr, yStr, zStr] = blockKey.split(',');
    const x = parseInt(xStr);
    const z = parseInt(zStr);

    // Find the chunk containing this block
    const chunkKey = worldToChunkKey({ x, y: 0, z });
    const chunk = this.chunks.get(chunkKey);

    return chunk?.observations.get(blockKey) || null;
  }

  private performMaintenance(): void {
    const now = Date.now();

    // Decay confidence for all observations
    const decayResult = this.decay(now);

    // Emit stats periodically
    const stats = this.getStats();
    this.emit('index-stats', stats);

    // Evict least recently used chunks if over limit
    if (this.chunks.size > this.config.maxChunks) {
      this.evictOldestChunks();
    }

    console.log(
      `Index maintenance: ${decayResult.expired} expired, ${decayResult.updated} updated, ${stats.chunksActive} chunks`
    );
  }

  private evictOldestChunks(): void {
    const chunkEntries = Array.from(this.chunks.entries());

    // Sort by last accessed time
    chunkEntries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const toRemove = chunkEntries.length - this.config.maxChunks;

    for (let i = 0; i < toRemove; i++) {
      const [chunkKey, chunk] = chunkEntries[i];

      // Remove all observations in this chunk
      for (const [blockKey, observation] of chunk.observations) {
        this.removeFromBlockTypeIndex(observation.blockId, blockKey);
        this.totalObservations--;
        this.emit('observation-expired', observation);
      }

      this.chunks.delete(chunkKey);
      this.emit('chunk-deactivated', chunkKey);
    }
  }
}
