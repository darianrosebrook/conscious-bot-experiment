/**
 * Sharp Wave Ripple Manager
 *
 * Neuroscience-inspired memory tagging and consolidation system based on hippocampal
 * sharp wave ripples. Implements two-phase memory processing:
 * 1. Awake tagging: Important memories are bookmarked during active processing
 * 2. Sleep consolidation: Tagged memories are replayed and consolidated during idle periods
 *
 * This mimics the brain's elegant solution for memory selection and storage.
 *
 * @author @darianrosebrook
 */

import { VectorDatabase, MemoryChunk } from './vector-database';
import { EmbeddingService } from './embedding-service';
import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface SharpWaveRippleConfig {
  /** Enable sharp wave ripple system */
  enabled: boolean;

  /** How often to evaluate and tag memories (ms) */
  taggingInterval: number;

  /** How often to run consolidation (ms) */
  consolidationInterval: number;

  /** Maximum number of memories in SWR queue */
  maxQueueSize: number;

  /** Minimum importance threshold for memory competition */
  competitionThreshold: number;

  /** Ratio for temporal compression during replay */
  temporalCompressionRatio: number;

  /** Dependencies */
  vectorDb: VectorDatabase;
  embeddingService: EmbeddingService;
}

export interface SharpWaveRippleEvent {
  id: string;
  memoryId: string;
  content: string;
  metadata: {
    type: string;
    importance: number;
    emotionalImpact: number;
    learningValue: number;
    socialSignificance: number;
    taskRelevance: number;
    narrativeImportance: number;
    entities?: string[];
    topics?: string[];
    timestamp: number;
  };
  swrStrength: number; // 0-1, higher = stronger ripple
  consolidationPriority: number; // 0-1, higher = more important for consolidation
  taggedAt: number;
  consolidatedAt?: number;
  replayCount: number;
  lastReplayed?: number;
}

export interface MemoryConsolidationResult {
  consolidatedMemories: number;
  totalReplayTime: number;
  averageStrength: number;
  competitionWinners: number;
  spaceOptimized: number; // Bytes saved through consolidation
}

export interface SWRStatistics {
  totalTagged: number;
  totalConsolidated: number;
  averageStrength: number;
  competitionWinRate: number;
  consolidationEfficiency: number;
  temporalCompressionSavings: number;
}

// ============================================================================
// Sharp Wave Ripple Manager Implementation
// ============================================================================

/**
 * Manages neuroscience-inspired memory tagging and consolidation using sharp wave ripples
 */
export class SharpWaveRippleManager {
  private config: SharpWaveRippleConfig;
  private swrQueue: SharpWaveRippleEvent[] = [];
  private consolidationHistory: MemoryConsolidationResult[] = [];
  private lastTaggingEvaluation: number = 0;
  private lastConsolidation: number = 0;
  private statistics: SWRStatistics = {
    totalTagged: 0,
    totalConsolidated: 0,
    averageStrength: 0,
    competitionWinRate: 0,
    consolidationEfficiency: 0,
    temporalCompressionSavings: 0,
  };

  // Performance optimization: Cache frequently calculated values
  private cachedQueueSize = 0;
  private cachedAverageStrength = 0;
  private lastCacheUpdate = 0;
  private readonly CACHE_UPDATE_INTERVAL = 1000; // Update cache every 1 second

  constructor(config: SharpWaveRippleConfig) {
    this.config = config;

    if (config.enabled) {
      // Start background processes for tagging and consolidation
      this.startTaggingScheduler();
      this.startConsolidationScheduler();
    }
  }

  /**
   * Tag a memory with a sharp wave ripple for future consolidation
   */
  async tagMemory(
    memoryId: string,
    content: string,
    metadata: SharpWaveRippleEvent['metadata']
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Check if memory is already tagged
    const existingIndex = this.swrQueue.findIndex(
      (event) => event.memoryId === memoryId
    );

    const swrEvent: SharpWaveRippleEvent = {
      id: `swr-${memoryId}-${Date.now()}`,
      memoryId,
      content,
      metadata,
      swrStrength: this.calculateSWRStrength(metadata),
      consolidationPriority: this.calculateConsolidationPriority(metadata),
      taggedAt: Date.now(),
      replayCount: 0,
    };

    if (existingIndex >= 0) {
      // Update existing event
      this.swrQueue[existingIndex] = swrEvent;
    } else {
      // Add new event
      if (this.swrQueue.length >= this.config.maxQueueSize) {
        // Remove lowest priority event if queue is full
        const lowestPriorityIndex = this.findLowestPriorityIndex();
        this.swrQueue.splice(lowestPriorityIndex, 1);
      }

      this.swrQueue.push(swrEvent);
    }

    this.statistics.totalTagged++;
    console.log(
      `🧠 Tagged memory ${memoryId} with SWR strength ${swrEvent.swrStrength.toFixed(3)}`
    );
  }

  /**
   * Run consolidation cycle - replay and strengthen important memories
   */
  async runConsolidation(): Promise<MemoryConsolidationResult> {
    if (!this.config.enabled || this.swrQueue.length === 0) {
      return {
        consolidatedMemories: 0,
        totalReplayTime: 0,
        averageStrength: 0,
        competitionWinners: 0,
        spaceOptimized: 0,
      };
    }

    const startTime = Date.now();
    console.log(
      `🌊 Starting Sharp Wave Ripple consolidation (${this.swrQueue.length} memories)`
    );

    // Competition phase: Select memories for consolidation
    const competitionWinners = this.selectCompetitionWinners();
    this.statistics.competitionWinRate =
      competitionWinners.length / this.swrQueue.length;

    // Replay phase: Strengthen winning memories through compressed replay
    const replayPromises = competitionWinners.map((event) =>
      this.replayMemory(event)
    );

    await Promise.all(replayPromises);

    // Update statistics
    const totalReplayTime = Date.now() - startTime;
    const averageStrength =
      competitionWinners.length > 0
        ? competitionWinners.reduce((sum, e) => sum + e.swrStrength, 0) /
          competitionWinners.length
        : 0;

    const result: MemoryConsolidationResult = {
      consolidatedMemories: competitionWinners.length,
      totalReplayTime,
      averageStrength,
      competitionWinners: competitionWinners.length,
      spaceOptimized: this.estimateSpaceOptimization(competitionWinners),
    };

    // Update consolidation history
    this.consolidationHistory.push(result);
    if (this.consolidationHistory.length > 100) {
      this.consolidationHistory = this.consolidationHistory.slice(-100);
    }

    // Update global statistics
    this.updateStatistics();

    console.log(
      `✅ Consolidated ${result.consolidatedMemories} memories in ${totalReplayTime}ms`
    );

    return result;
  }

  /**
   * Get current SWR statistics
   */
  getStatistics(): SWRStatistics {
    return { ...this.statistics };
  }

  /**
   * Get consolidation history
   */
  getConsolidationHistory(): MemoryConsolidationResult[] {
    return [...this.consolidationHistory];
  }

  /**
   * Get current SWR queue status
   */
  getQueueStatus(): {
    queueSize: number;
    averageStrength: number;
    oldestTagged: number;
    newestTagged: number;
  } {
    const now = Date.now();

    // Update cache if needed
    if (now - this.lastCacheUpdate > this.CACHE_UPDATE_INTERVAL) {
      this.cachedQueueSize = this.swrQueue.length;
      // Calculate average strength across all queued items
      this.cachedAverageStrength =
        this.swrQueue.length > 0
          ? this.swrQueue.reduce(
              (sum, event) => sum + this.calculateNeuralStrength(event),
              0
            ) / this.swrQueue.length
          : 0;
      this.lastCacheUpdate = now;
    }

    if (this.swrQueue.length === 0) {
      return {
        queueSize: 0,
        averageStrength: 0,
        oldestTagged: 0,
        newestTagged: 0,
      };
    }

    const timestamps = this.swrQueue.map((e) => e.taggedAt);

    return {
      queueSize: this.cachedQueueSize,
      averageStrength: this.cachedAverageStrength,
      oldestTagged: Math.min(...timestamps),
      newestTagged: Math.max(...timestamps),
    };
  }

  /**
   * Force immediate consolidation (useful for testing or manual triggers)
   */
  async forceConsolidation(): Promise<MemoryConsolidationResult> {
    return await this.runConsolidation();
  }

  /**
   * Clear SWR queue (useful for cleanup or reset)
   */
  clearQueue(): void {
    const clearedCount = this.swrQueue.length;
    this.swrQueue = [];
    console.log(`🗑️ Cleared ${clearedCount} memories from SWR queue`);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculate SWR strength based on memory characteristics
   */
  private calculateSWRStrength(
    metadata: SharpWaveRippleEvent['metadata']
  ): number {
    // Base strength from importance
    let strength = metadata.importance * 0.4;

    // Boost for emotional impact (like winning lottery vs breakfast)
    strength += metadata.emotionalImpact * 0.25;

    // Boost for learning value (new discoveries)
    strength += metadata.learningValue * 0.15;

    // Boost for social significance (interactions with others)
    strength += metadata.socialSignificance * 0.1;

    // Boost for narrative importance (story-worthy events)
    strength += metadata.narrativeImportance * 0.1;

    return Math.min(1.0, Math.max(0.0, strength));
  }

  /**
   * Calculate consolidation priority for competition
   */
  private calculateConsolidationPriority(
    metadata: SharpWaveRippleEvent['metadata']
  ): number {
    let priority = metadata.importance * 0.5;

    // Recent memories get priority boost
    const hoursSinceTagging =
      (Date.now() - metadata.timestamp) / (1000 * 60 * 60);
    const recencyBoost = Math.max(0, 1 - hoursSinceTagging / 24); // Decays over 24 hours
    priority += recencyBoost * 0.3;

    // Task-relevant memories get priority
    priority += metadata.taskRelevance * 0.2;

    return Math.min(1.0, Math.max(0.0, priority));
  }

  /**
   * Select winners in memory competition for consolidation
   */
  private selectCompetitionWinners(): SharpWaveRippleEvent[] {
    if (this.swrQueue.length === 0) return [];

    // Neuroscience-inspired competition: stronger patterns win
    const now = Date.now();

    // Sort by consolidation priority (neural strength)
    const sorted = [...this.swrQueue].sort(
      (a, b) => b.consolidationPriority - a.consolidationPriority
    );

    // Apply neural competition dynamics
    const winners: SharpWaveRippleEvent[] = [];
    const maxWinners = Math.min(10, Math.ceil(this.swrQueue.length * 0.3)); // Max 30% of queue

    for (let i = 0; i < sorted.length && winners.length < maxWinners; i++) {
      const candidate = sorted[i];

      // Check if this memory can compete (meets threshold)
      if (candidate.consolidationPriority < this.config.competitionThreshold) {
        break; // No more candidates meet threshold
      }

      // Simulate neural competition - check against existing winners
      const canWin = this.canMemoryWinCompetition(candidate, winners);

      if (canWin) {
        winners.push(candidate);
        console.log(
          `🏆 Memory ${candidate.memoryId} won competition with priority ${candidate.consolidationPriority.toFixed(3)}`
        );
      } else {
        console.log(
          `❌ Memory ${candidate.memoryId} lost competition to stronger patterns`
        );
      }
    }

    // If no memories met threshold but we have some, take the strongest ones
    if (winners.length === 0 && sorted.length > 0) {
      const fallbackWinners = sorted.slice(0, Math.min(3, sorted.length));
      fallbackWinners.forEach((winner) => {
        winners.push(winner);
        console.log(`⚠️ Memory ${winner.memoryId} selected as fallback winner`);
      });
    }

    return winners;
  }

  /**
   * Determine if a memory can win against existing winners in neural competition
   */
  private canMemoryWinCompetition(
    candidate: SharpWaveRippleEvent,
    winners: SharpWaveRippleEvent[]
  ): boolean {
    // Base case: no competition if no winners yet
    if (winners.length === 0) return true;

    // Calculate neural strength based on multiple factors
    const candidateStrength = this.calculateNeuralStrength(candidate);
    const winnerStrengths = winners.map((w) => this.calculateNeuralStrength(w));

    // Must be significantly stronger than at least one existing winner
    const mustBeat = Math.min(...winnerStrengths);
    const strengthAdvantage = candidateStrength - mustBeat;

    // Require at least 0.1 strength advantage to win competition
    const competitionMargin = 0.1;

    // Also consider temporal factors (recent memories get slight boost)
    const now = Date.now();
    const hoursSinceTagging = (now - candidate.taggedAt) / (1000 * 60 * 60);
    const recencyBoost = Math.max(0, 0.05 * (1 - hoursSinceTagging / 24)); // Max 5% boost for very recent

    const adjustedStrength = candidateStrength + recencyBoost;

    return adjustedStrength >= mustBeat + competitionMargin;
  }

  /**
   * Calculate neural strength for memory competition
   */
  private calculateNeuralStrength(event: SharpWaveRippleEvent): number {
    // Base neural strength from SWR strength
    let strength = event.swrStrength * 0.4;

    // Boost for emotional impact (like lottery win vs breakfast)
    strength += event.metadata.emotionalImpact * 0.25;

    // Boost for learning value (new discoveries)
    strength += event.metadata.learningValue * 0.15;

    // Boost for task relevance (important for current goals)
    strength += event.metadata.taskRelevance * 0.1;

    // Boost for narrative importance (story-worthy events)
    strength += event.metadata.narrativeImportance * 0.1;

    // Slight boost for replay count (strengthened through repetition)
    strength += Math.min(0.1, event.replayCount * 0.02);

    return Math.min(1.0, Math.max(0.0, strength));
  }

  /**
   * Replay a memory with temporal compression for consolidation
   */
  private async replayMemory(event: SharpWaveRippleEvent): Promise<void> {
    const startTime = Date.now();

    // Calculate temporal compression based on memory importance and SWR strength
    const baseProcessingTime = 100; // Base time in ms
    const importanceFactor = event.metadata.importance;
    const swrStrengthFactor = event.swrStrength;

    // Higher importance = more compression (like brain prioritizing important memories)
    // SWR strength also affects compression rate
    const dynamicCompressionRatio =
      this.config.temporalCompressionRatio *
      (1 + importanceFactor * 0.5) *
      (1 + swrStrengthFactor * 0.3);

    const compressedTime = Math.max(
      10,
      baseProcessingTime * dynamicCompressionRatio
    );

    console.log(
      `🧠 Replaying memory ${event.memoryId} with ${dynamicCompressionRatio.toFixed(2)}x compression (${compressedTime.toFixed(0)}ms)`
    );

    // Simulate neuroscience-inspired replay process
    try {
      // Phase 1: Neural reactivation (embedding generation)
      const embedding = await this.config.embeddingService.embed(event.content);

      // Phase 2: Pattern strengthening through compressed repetition
      const replayCycles = Math.max(1, Math.floor(importanceFactor * 5)); // 1-5 cycles based on importance

      for (let cycle = 0; cycle < replayCycles; cycle++) {
        // Simulate ripple-like neural activity pattern
        const ripplePattern = this.generateRipplePattern(
          event,
          cycle,
          replayCycles
        );

        // Apply temporal compression within each cycle
        const cycleTime = compressedTime / replayCycles;
        await new Promise((resolve) => setTimeout(resolve, cycleTime));

        // Simulate inhibitory inter-neurons creating competition windows
        if (cycle > 0 && Math.random() < 0.3) {
          // 30% chance of competition
          const competitionResult = await this.simulateNeuralCompetition(
            event,
            ripplePattern
          );
          if (!competitionResult) {
            console.log(
              `⚡ Memory ${event.memoryId} lost neural competition in cycle ${cycle + 1}`
            );
            break; // Stop replay if lost competition
          }
        }
      }

      // Phase 3: Consolidation transfer (update memory statistics)
      event.replayCount++;
      event.lastReplayed = Date.now();
      event.consolidatedAt = Date.now();

      // Strengthen the memory based on successful replay
      const strengtheningFactor = Math.min(0.2, importanceFactor * 0.1);
      event.swrStrength = Math.min(
        1.0,
        event.swrStrength + strengtheningFactor
      );

      // Update event in queue
      const queueIndex = this.swrQueue.findIndex((e) => e.id === event.id);
      if (queueIndex >= 0) {
        this.swrQueue[queueIndex] = event;
      }

      // Track temporal compression savings
      const originalEstimatedTime = baseProcessingTime * replayCycles;
      const actualTime = Date.now() - startTime;
      this.statistics.temporalCompressionSavings +=
        originalEstimatedTime - actualTime;
      this.statistics.totalConsolidated++;

      console.log(
        `✅ Memory ${event.memoryId} consolidated after ${replayCycles} cycles (${actualTime.toFixed(0)}ms)`
      );
    } catch (error) {
      console.error(`❌ Failed to replay memory ${event.memoryId}: ${error}`);
    }
  }

  /**
   * Generate ripple pattern for neural replay simulation
   */
  private generateRipplePattern(
    event: SharpWaveRippleEvent,
    cycle: number,
    totalCycles: number
  ): any {
    // Simulate sharp wave ripple pattern based on neuroscience
    return {
      memoryId: event.memoryId,
      cycle: cycle + 1,
      totalCycles,
      timestamp: Date.now(),
      pattern: {
        // Sharp wave component (excitation) - reduced randomness
        excitationLevel: 0.7 + event.metadata.importance * 0.2,
        // Ripple frequency (high-frequency oscillation) - importance-based
        rippleFrequency: 150 + event.metadata.importance * 30, // Hz
        // Temporal compression factor
        compressionRatio:
          this.config.temporalCompressionRatio *
          (1 + event.metadata.importance * 0.5),
        // Neural competition window - deterministic based on cycle
        competitionWindow: cycle % 3 === 0, // Every 3rd cycle
      },
    };
  }

  /**
   * Simulate neural competition during replay
   * Optimized for performance with reduced randomness
   */
  private async simulateNeuralCompetition(
    event: SharpWaveRippleEvent,
    ripplePattern: any
  ): Promise<boolean> {
    // Simulate inhibitory inter-neurons creating competition
    if (!ripplePattern.pattern.competitionWindow) {
      return true; // No competition in this window
    }

    // Calculate competition success based on memory strength
    // Use pre-calculated values to reduce computation
    const competitionSuccess =
      event.swrStrength * 0.6 + // Base strength
      event.metadata.importance * 0.3; // Importance factor

    // Competition threshold based on current consolidation load
    const currentLoad = this.swrQueue.length / this.config.maxQueueSize;
    const competitionThreshold = 0.5 + currentLoad * 0.3; // Higher load = harder competition

    return competitionSuccess > competitionThreshold;
  }

  /**
   * Find index of lowest priority memory for queue management
   */
  private findLowestPriorityIndex(): number {
    let lowestIndex = 0;
    let lowestPriority = this.swrQueue[0]?.consolidationPriority || 0;

    for (let i = 1; i < this.swrQueue.length; i++) {
      if (this.swrQueue[i].consolidationPriority < lowestPriority) {
        lowestPriority = this.swrQueue[i].consolidationPriority;
        lowestIndex = i;
      }
    }

    return lowestIndex;
  }

  /**
   * Estimate space optimization from consolidation
   */
  private estimateSpaceOptimization(winners: SharpWaveRippleEvent[]): number {
    // Rough estimate: each consolidated memory saves ~1KB through compression
    return winners.length * 1024;
  }

  /**
   * Update global statistics
   */
  private updateStatistics(): void {
    if (this.statistics.totalTagged > 0) {
      const recentHistory = this.consolidationHistory.slice(-10);

      this.statistics.averageStrength =
        recentHistory.length > 0
          ? recentHistory.reduce((sum, r) => sum + r.averageStrength, 0) /
            recentHistory.length
          : 0;

      this.statistics.consolidationEfficiency =
        this.statistics.totalConsolidated / this.statistics.totalTagged;

      // Calculate temporal compression savings per consolidation
      this.statistics.temporalCompressionSavings =
        recentHistory.reduce((sum, r) => sum + r.totalReplayTime, 0) /
        Math.max(1, recentHistory.length);
    }
  }

  /**
   * Start background tagging scheduler
   */
  private startTaggingScheduler(): void {
    setInterval(() => {
      this.evaluateTaggingOpportunities();
    }, this.config.taggingInterval);
  }

  /**
   * Start background consolidation scheduler
   */
  private startConsolidationScheduler(): void {
    setInterval(async () => {
      await this.runConsolidation();
    }, this.config.consolidationInterval);
  }

  /**
   * Evaluate memories for tagging opportunities
   */
  private async evaluateTaggingOpportunities(): Promise<void> {
    if (!this.config.enabled) return;

    // This could be enhanced to proactively look for important memories
    // that haven't been tagged yet by querying the vector database
    // For now, we rely on explicit tagging during memory ingestion

    // Clean up old tagged memories that have been consolidated
    this.cleanupConsolidatedMemories();
  }

  /**
   * Clean up memories that have been consolidated
   */
  private cleanupConsolidatedMemories(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    this.swrQueue = this.swrQueue.filter((event) => {
      // Remove consolidated memories after 24 hours
      if (event.consolidatedAt && now - event.consolidatedAt > maxAge) {
        return false;
      }

      // Remove very old untagged memories
      if (now - event.taggedAt > maxAge * 2) {
        return false;
      }

      return true;
    });
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_SWR_CONFIG: Partial<SharpWaveRippleConfig> = {
  enabled: true,
  taggingInterval: 30000, // 30 seconds
  consolidationInterval: 300000, // 5 minutes
  maxQueueSize: 100,
  competitionThreshold: 0.7,
  temporalCompressionRatio: 0.1, // 10x speed compression
};
