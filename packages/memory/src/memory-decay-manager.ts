/**
 * Memory Decay Manager
 *
 * Implements "use it or lose it" memory management that mimics human memory decay.
 * Tracks memory access patterns, calculates decay rates based on importance and
 * recency, and manages memory cleanup during reflection checkpoints.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface MemoryAccessRecord {
  memoryId: string;
  lastAccessed: number;
  accessCount: number;
  accessPattern: 'recent' | 'frequent' | 'occasional' | 'rare' | 'forgotten';
  decayRate: number; // 0-1, higher = faster decay
  importance: number; // 0-1, higher = more important
  shouldRetain: boolean;
  consolidationCandidate: boolean;
}

export interface MemoryDecayProfile {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'spatial';
  baseDecayRate: number; // Base decay rate for this memory type
  importanceMultiplier: number; // How much importance affects decay
  accessBoost: number; // How much recent access reduces decay
  maxRetentionTime: number; // Maximum time to retain even with low access
  consolidationThreshold: number; // When to consider consolidation vs deletion
}

export interface DecayCalculationResult {
  memoryId: string;
  currentDecay: number; // 0-1, 1 = fully decayed
  predictedRetentionDays: number;
  action: 'retain' | 'consolidate' | 'archive' | 'delete';
  confidence: number; // 0-1, how confident in the action
  reasoning: string;
}

export interface MemoryCleanupResult {
  totalMemories: number;
  retainedMemories: number;
  consolidatedMemories: number;
  archivedMemories: number;
  deletedMemories: number;
  spaceSaved: number; // Estimated bytes saved
  consolidationSummary: string[];
}

export interface MemoryDecayConfig {
  /** Enable memory decay system */
  enabled: boolean;

  /** How often to evaluate memory decay (ms) */
  evaluationInterval: number;

  /** Maximum memory retention time regardless of access (days) */
  maxRetentionDays: number;

  /** Minimum access count to be considered "frequent" */
  frequentAccessThreshold: number;

  /** Days without access to be considered "forgotten" */
  forgottenThresholdDays: number;

  /** Enable consolidation of old memories into summaries */
  enableConsolidation: boolean;

  /** Enable archiving of moderately important memories */
  enableArchiving: boolean;

  /** Memory type specific decay profiles */
  decayProfiles: Record<string, MemoryDecayProfile>;

  /** Importance factors for decay calculation */
  importanceFactors: {
    emotionalImpact: number;
    learningValue: number;
    socialSignificance: number;
    taskRelevance: number;
    narrativeImportance: number;
  };

  /** Access pattern thresholds */
  accessThresholds: {
    recent: number; // Hours since last access
    frequent: number; // Minimum access count
    occasional: number; // Days between accesses
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_MEMORY_DECAY_CONFIG: MemoryDecayConfig = {
  enabled: true,
  evaluationInterval: 60 * 60 * 1000, // 1 hour
  maxRetentionDays: 90, // 3 months max retention
  frequentAccessThreshold: 5,
  forgottenThresholdDays: 30,
  enableConsolidation: true,
  enableArchiving: true,
  decayProfiles: {
    emotional: {
      id: 'emotional',
      type: 'emotional',
      baseDecayRate: 0.02, // Very slow decay for emotional memories
      importanceMultiplier: 0.8,
      accessBoost: 0.6,
      maxRetentionTime: 365 * 24 * 60 * 60 * 1000, // 1 year
      consolidationThreshold: 0.3,
    },
    episodic: {
      id: 'episodic',
      type: 'episodic',
      baseDecayRate: 0.05, // Moderate decay for episodic memories
      importanceMultiplier: 0.5,
      accessBoost: 0.4,
      maxRetentionTime: 180 * 24 * 60 * 60 * 1000, // 6 months
      consolidationThreshold: 0.4,
    },
    procedural: {
      id: 'procedural',
      type: 'procedural',
      baseDecayRate: 0.03, // Slow decay for learned skills
      importanceMultiplier: 0.7,
      accessBoost: 0.5,
      maxRetentionTime: 270 * 24 * 60 * 60 * 1000, // 9 months
      consolidationThreshold: 0.2,
    },
    semantic: {
      id: 'semantic',
      type: 'semantic',
      baseDecayRate: 0.01, // Very slow decay for facts
      importanceMultiplier: 0.9,
      accessBoost: 0.7,
      maxRetentionTime: 365 * 24 * 60 * 60 * 1000, // 1 year
      consolidationThreshold: 0.1,
    },
    spatial: {
      id: 'spatial',
      type: 'spatial',
      baseDecayRate: 0.04, // Moderate decay for locations
      importanceMultiplier: 0.6,
      accessBoost: 0.3,
      maxRetentionTime: 180 * 24 * 60 * 60 * 1000, // 6 months
      consolidationThreshold: 0.3,
    },
  },
  importanceFactors: {
    emotionalImpact: 0.3,
    learningValue: 0.25,
    socialSignificance: 0.2,
    taskRelevance: 0.15,
    narrativeImportance: 0.1,
  },
  accessThresholds: {
    recent: 24, // 24 hours
    frequent: 5, // 5+ accesses
    occasional: 7, // 7 days between accesses
  },
};

// ============================================================================
// Memory Decay Manager
// ============================================================================

/**
 * Manages memory decay and cleanup using "use it or lose it" principle
 */
export class MemoryDecayManager {
  private config: MemoryDecayConfig;
  private accessRecords: Map<string, MemoryAccessRecord> = new Map();
  private lastEvaluation: number = 0;
  private cleanupHistory: MemoryCleanupResult[] = [];

  constructor(config: Partial<MemoryDecayConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_DECAY_CONFIG, ...config };
  }

  /**
   * Record memory access for decay calculation
   */
  recordAccess(
    memoryId: string,
    memoryType: string,
    metadata: {
      importance?: number;
      emotionalImpact?: number;
      learningValue?: number;
      socialSignificance?: number;
      taskRelevance?: number;
      narrativeImportance?: number;
    } = {}
  ): MemoryAccessRecord {
    const now = Date.now();
    let record = this.accessRecords.get(memoryId);

    if (!record) {
      // Create new record
      record = {
        memoryId,
        lastAccessed: now,
        accessCount: 1,
        accessPattern: 'recent',
        decayRate: this.calculateBaseDecayRate(memoryType, metadata),
        importance: this.calculateImportance(metadata),
        shouldRetain: true,
        consolidationCandidate: false,
      };
    } else {
      // Update existing record
      record.lastAccessed = now;
      record.accessCount++;
      record.accessPattern = this.updateAccessPattern(record);
      record.decayRate = this.recalculateDecayRate(record, metadata);
      record.importance = this.recalculateImportance(record, metadata);
    }

    this.accessRecords.set(memoryId, record);
    return record;
  }

  /**
   * Calculate decay status for a memory
   */
  calculateDecay(memoryId: string): DecayCalculationResult | null {
    const record = this.accessRecords.get(memoryId);
    if (!record) return null;

    const now = Date.now();
    const hoursSinceAccess = (now - record.lastAccessed) / (1000 * 60 * 60);

    // Calculate current decay level
    const timeDecay = Math.min(
      1.0,
      (hoursSinceAccess / 24) * record.decayRate // Days * decay rate
    );

    // Importance reduces decay
    const importanceProtection = Math.max(0, 1 - record.importance);
    const currentDecay = Math.max(0, timeDecay - importanceProtection);

    // Predict retention time
    const predictedRetentionDays =
      currentDecay >= 1 ? 0 : Math.ceil((1 - currentDecay) / record.decayRate);

    // Determine action based on decay and importance
    let action: DecayCalculationResult['action'] = 'retain';
    let reasoning = '';
    let confidence = 0.8;

    if (currentDecay >= 0.9) {
      action = 'delete';
      reasoning =
        'Memory has decayed significantly and is no longer accessible';
      confidence = 0.9;
    } else if (currentDecay >= 0.7 && record.importance < 0.5) {
      action = record.consolidationCandidate ? 'consolidate' : 'archive';
      reasoning =
        'Memory is decaying but may be worth preserving in condensed form';
      confidence = 0.7;
    } else if (
      currentDecay >= 0.5 &&
      hoursSinceAccess > this.config.forgottenThresholdDays * 24
    ) {
      action = 'archive';
      reasoning =
        "Memory hasn't been accessed recently but has moderate importance";
      confidence = 0.6;
    }

    // Boost confidence for very important memories
    if (record.importance > 0.8) {
      confidence = Math.min(0.95, confidence + 0.1);
      if (action === 'delete') {
        action = 'archive';
        reasoning = 'High importance memory - archiving instead of deleting';
      }
    }

    return {
      memoryId,
      currentDecay,
      predictedRetentionDays,
      action,
      confidence,
      reasoning,
    };
  }

  /**
   * Evaluate all memories and determine cleanup actions
   */
  async evaluateMemories(): Promise<{
    decayResults: DecayCalculationResult[];
    cleanupRecommendations: MemoryCleanupResult;
  }> {
    const now = Date.now();
    const decayResults: DecayCalculationResult[] = [];

    // Evaluate all memory records
    for (const [memoryId, record] of this.accessRecords) {
      const decayResult = this.calculateDecay(memoryId);
      if (decayResult) {
        decayResults.push(decayResult);

        // Update record based on evaluation
        record.shouldRetain = decayResult.action !== 'delete';
        record.consolidationCandidate = decayResult.action === 'consolidate';
      }
    }

    // Generate cleanup recommendations
    const cleanupRecommendations =
      this.generateCleanupRecommendations(decayResults);

    this.lastEvaluation = now;

    return { decayResults, cleanupRecommendations };
  }

  /**
   * Perform memory cleanup based on evaluation results
   */
  async performCleanup(
    decayResults: DecayCalculationResult[]
  ): Promise<MemoryCleanupResult> {
    const result: MemoryCleanupResult = {
      totalMemories: decayResults.length,
      retainedMemories: 0,
      consolidatedMemories: 0,
      archivedMemories: 0,
      deletedMemories: 0,
      spaceSaved: 0,
      consolidationSummary: [],
    };

    const memoriesToDelete: string[] = [];
    const memoriesToArchive: string[] = [];
    const memoriesToConsolidate: string[] = [];

    for (const decayResult of decayResults) {
      switch (decayResult.action) {
        case 'retain':
          result.retainedMemories++;
          break;
        case 'consolidate':
          result.consolidatedMemories++;
          memoriesToConsolidate.push(decayResult.memoryId);
          break;
        case 'archive':
          result.archivedMemories++;
          memoriesToArchive.push(decayResult.memoryId);
          break;
        case 'delete':
          result.deletedMemories++;
          memoriesToDelete.push(decayResult.memoryId);
          break;
      }
    }

    // Generate consolidation summary
    if (memoriesToConsolidate.length > 0) {
      result.consolidationSummary = await this.generateConsolidationSummary(
        memoriesToConsolidate
      );
    }

    // Estimate space saved (rough calculation)
    result.spaceSaved = result.deletedMemories * 1024; // Assume 1KB per memory

    // Record cleanup in history
    this.cleanupHistory.push(result);

    console.log(`🧹 Memory cleanup completed:`);
    console.log(`   Retained: ${result.retainedMemories}`);
    console.log(`   Consolidated: ${result.consolidatedMemories}`);
    console.log(`   Archived: ${result.archivedMemories}`);
    console.log(`   Deleted: ${result.deletedMemories}`);
    console.log(`   Space saved: ${result.spaceSaved} bytes`);

    return result;
  }

  /**
   * Get access statistics for a memory
   */
  getAccessStats(memoryId: string): MemoryAccessRecord | null {
    return this.accessRecords.get(memoryId) || null;
  }

  /**
   * Get all access records
   */
  getAllAccessRecords(): MemoryAccessRecord[] {
    return Array.from(this.accessRecords.values());
  }

  /**
   * Get cleanup history
   */
  getCleanupHistory(): MemoryCleanupResult[] {
    return [...this.cleanupHistory];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MemoryDecayConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Updated memory decay configuration');
  }

  /**
   * Force cleanup of forgotten memories
   */
  async forceCleanup(): Promise<MemoryCleanupResult> {
    const { decayResults } = await this.evaluateMemories();
    return await this.performCleanup(decayResults);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculateBaseDecayRate(memoryType: string, metadata: any): number {
    const profile = this.config.decayProfiles[memoryType];
    if (!profile) {
      return DEFAULT_MEMORY_DECAY_CONFIG.decayProfiles.episodic.baseDecayRate;
    }

    let decayRate = profile.baseDecayRate;

    // Adjust based on metadata
    if (metadata.emotionalImpact && metadata.emotionalImpact > 0.7) {
      decayRate *= 0.5; // High emotional impact = slower decay
    }

    if (metadata.learningValue && metadata.learningValue > 0.8) {
      decayRate *= 0.6; // High learning value = slower decay
    }

    return Math.max(0.001, Math.min(0.1, decayRate)); // Clamp between 0.1% and 10% per day
  }

  private calculateImportance(metadata: any): number {
    if (!metadata) return 0.5;

    const factors = this.config.importanceFactors;
    let importance = 0;

    if (metadata.emotionalImpact !== undefined) {
      importance += metadata.emotionalImpact * factors.emotionalImpact;
    }

    if (metadata.learningValue !== undefined) {
      importance += metadata.learningValue * factors.learningValue;
    }

    if (metadata.socialSignificance !== undefined) {
      importance += metadata.socialSignificance * factors.socialSignificance;
    }

    if (metadata.taskRelevance !== undefined) {
      importance += metadata.taskRelevance * factors.taskRelevance;
    }

    if (metadata.narrativeImportance !== undefined) {
      importance += metadata.narrativeImportance * factors.narrativeImportance;
    }

    return Math.min(1.0, importance);
  }

  private updateAccessPattern(
    record: MemoryAccessRecord
  ): MemoryAccessRecord['accessPattern'] {
    const now = Date.now();
    const hoursSinceAccess = (now - record.lastAccessed) / (1000 * 60 * 60);

    if (record.accessCount >= this.config.frequentAccessThreshold) {
      return 'frequent';
    } else if (hoursSinceAccess <= this.config.accessThresholds.recent) {
      return 'recent';
    } else if (
      hoursSinceAccess <=
      this.config.accessThresholds.occasional * 24
    ) {
      return 'occasional';
    } else {
      return 'forgotten';
    }
  }

  private recalculateDecayRate(
    record: MemoryAccessRecord,
    metadata: any
  ): number {
    const baseRate = this.calculateBaseDecayRate(
      record.memoryId.split('-')[0],
      metadata
    );

    // Recent access reduces decay rate
    const hoursSinceAccess =
      (Date.now() - record.lastAccessed) / (1000 * 60 * 60);
    const accessBoost = Math.max(
      0,
      1 -
        (hoursSinceAccess / 24) *
          this.config.decayProfiles[record.memoryId.split('-')[0]]
            ?.accessBoost || 0.4
    );

    // Importance also reduces decay rate
    const importanceReduction = record.importance * 0.3;

    return Math.max(0.001, baseRate * (1 - accessBoost - importanceReduction));
  }

  private recalculateImportance(
    record: MemoryAccessRecord,
    metadata: any
  ): number {
    // Access frequency increases importance
    const accessBonus = Math.min(0.2, record.accessCount / 20);

    // Recency maintains importance
    const hoursSinceAccess =
      (Date.now() - record.lastAccessed) / (1000 * 60 * 60);
    const recencyBonus = Math.max(0, 0.1 - (hoursSinceAccess / 24) * 0.05);

    return Math.min(1.0, record.importance + accessBonus + recencyBonus);
  }

  private generateCleanupRecommendations(
    decayResults: DecayCalculationResult[]
  ): MemoryCleanupResult {
    const recommendations: MemoryCleanupResult = {
      totalMemories: decayResults.length,
      retainedMemories: decayResults.filter((r) => r.action === 'retain')
        .length,
      consolidatedMemories: decayResults.filter(
        (r) => r.action === 'consolidate'
      ).length,
      archivedMemories: decayResults.filter((r) => r.action === 'archive')
        .length,
      deletedMemories: decayResults.filter((r) => r.action === 'delete').length,
      spaceSaved: 0,
      consolidationSummary: [],
    };

    recommendations.spaceSaved = recommendations.deletedMemories * 1024;

    return recommendations;
  }

  private async generateConsolidationSummary(
    memoryIds: string[]
  ): Promise<string[]> {
    const summary: string[] = [];

    // Group memories by type for consolidation
    const typeGroups: Record<string, string[]> = {};

    for (const memoryId of memoryIds) {
      const type = memoryId.split('-')[0];
      if (!typeGroups[type]) {
        typeGroups[type] = [];
      }
      typeGroups[type].push(memoryId);
    }

    for (const [type, ids] of Object.entries(typeGroups)) {
      summary.push(`Consolidate ${ids.length} ${type} memories into summary`);
    }

    return summary;
  }
}
