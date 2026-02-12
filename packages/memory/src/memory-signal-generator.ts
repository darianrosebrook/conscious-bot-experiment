/**
 * Memory Signal Generator
 *
 * Generates memory-based signals for the core signal processing system.
 * These signals represent memories that have become salient and need attention
 * for goal formulation and decision making.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
// Temporary local type definitions until @conscious-bot/core is available
export interface Signal {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  source: string;
}

export interface MemorySignal extends Signal {
  memoryType: MemoryType;
  confidence: number;
  urgency?: number;
  emotionalImpact?: number;
  intensity?: number;
  trend?: string;
  metadata?: Record<string, any>;
}

export enum MemoryType {
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
  WORKING = 'working',
  EXPERIENCE = 'experience',
  KNOWLEDGE = 'knowledge',
  EMOTIONAL = 'emotional',
}
import { EnhancedMemorySystem } from './memory-system';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface MemorySignalConfig {
  /** Enable memory signal generation */
  enabled: boolean;

  /** How often to scan for salient memories (ms) */
  scanInterval: number;

  /** Minimum salience score to generate a signal */
  minSalienceThreshold: number;

  /** Maximum number of signals to generate per scan */
  maxSignalsPerScan: number;

  /** Memory types that can generate signals */
  allowedMemoryTypes: MemoryType[];

  /** Signal decay rate (0-1, higher = faster decay) */
  signalDecayRate: number;

  /** Context factors that boost signal relevance */
  contextBoosts: {
    /** Boost for memories in current world */
    sameWorldBoost: number;
    /** Boost for memories in current location */
    sameLocationBoost: number;
    /** Boost for recent memories */
    recentMemoryBoost: number;
    /** Boost for memories with high emotional impact */
    emotionalBoost: number;
  };
}

export interface SalientMemory {
  id: string;
  content: string;
  type: MemoryType;
  salience: number;
  emotionalImpact: number;
  lastAccessed: number;
  contextRelevance: number;
  suggestedAction: string;
  urgency: number;
  metadata: Record<string, any>;
}

export interface MemorySignalGenerationResult {
  generatedSignals: MemorySignal[];
  scannedMemories: number;
  skippedMemories: number;
  processingTime: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_MEMORY_SIGNAL_CONFIG: MemorySignalConfig = {
  enabled: true,
  scanInterval: 30000, // 30 seconds
  minSalienceThreshold: 0.3,
  maxSignalsPerScan: 5,
  allowedMemoryTypes: [
    MemoryType.EXPERIENCE,
    MemoryType.KNOWLEDGE,
    MemoryType.EMOTIONAL,
    MemoryType.EPISODIC,
    MemoryType.PROCEDURAL,
  ],
  signalDecayRate: 0.1,
  contextBoosts: {
    sameWorldBoost: 0.2,
    sameLocationBoost: 0.3,
    recentMemoryBoost: 0.25,
    emotionalBoost: 0.4,
  },
};

// ============================================================================
// Memory Signal Generator
// ============================================================================

/**
 * Generates memory-based signals for the core signal processing system
 */
export class MemorySignalGenerator {
  private memorySystem: EnhancedMemorySystem;
  private config: MemorySignalConfig;
  private lastScanTime: number = 0;
  private generatedSignals: Map<string, MemorySignal> = new Map();

  constructor(
    memorySystem: EnhancedMemorySystem,
    config: Partial<MemorySignalConfig> = {}
  ) {
    this.memorySystem = memorySystem;
    this.config = { ...DEFAULT_MEMORY_SIGNAL_CONFIG, ...config };
  }

  /**
   * Generate memory signals based on current context
   */
  async generateSignals(
    currentContext: {
      world?: string;
      location?: any;
      timeOfDay?: string;
      recentEvents?: string[];
      emotionalState?: string;
      currentGoals?: string[];
    } = {}
  ): Promise<MemorySignalGenerationResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return {
        generatedSignals: [],
        scannedMemories: 0,
        skippedMemories: 0,
        processingTime: Date.now() - startTime,
      };
    }

    try {
      // Get salient memories from the memory system
      const salientMemories = await this.findSalientMemories(currentContext);

      // Convert to signals
      const signals = await this.convertToSignals(
        salientMemories,
        currentContext
      );

      // Apply decay to existing signals
      this.applySignalDecay();

      // Add new signals
      signals.forEach((signal) => {
        this.generatedSignals.set(signal.id, signal);
      });

      return {
        generatedSignals: signals,
        scannedMemories: salientMemories.length,
        skippedMemories: 0, // Would track filtered memories
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Error generating memory signals:', error);
      return {
        generatedSignals: [],
        scannedMemories: 0,
        skippedMemories: 0,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Get all active memory signals
   */
  getActiveSignals(): MemorySignal[] {
    return Array.from(this.generatedSignals.values()).filter(
      (signal) => this.calculateSignalStrength(signal) > 0
    );
  }

  /**
   * Get memory signals by type
   */
  getSignalsByType(type: MemoryType): MemorySignal[] {
    return this.getActiveSignals().filter(
      (signal) => signal.memoryType === type
    );
  }

  /**
   * Get signals relevant to a specific context
   */
  getContextualSignals(
    context: {
      urgency?: number;
      emotionalValence?: number;
      memoryTypes?: MemoryType[];
      minStrength?: number;
    } = {}
  ): MemorySignal[] {
    return this.getActiveSignals()
      .filter((signal) => {
        // Filter by memory type
        if (
          context.memoryTypes &&
          !context.memoryTypes.includes(signal.memoryType)
        ) {
          return false;
        }

        // Filter by urgency
        if (
          context.urgency !== undefined &&
          (signal.urgency ?? 0) < context.urgency
        ) {
          return false;
        }

        // Filter by emotional valence
        if (context.emotionalValence !== undefined) {
          const signalValence = signal.emotionalImpact ?? 0;
          if (
            Math.sign(signalValence) !== Math.sign(context.emotionalValence)
          ) {
            return false;
          }
        }

        // Filter by signal strength
        if (context.minStrength !== undefined) {
          const strength = this.calculateSignalStrength(signal);
          if (strength < context.minStrength) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const strengthA = this.calculateSignalStrength(a);
        const strengthB = this.calculateSignalStrength(b);
        return strengthB - strengthA;
      });
  }

  /**
   * Clear old or weak signals
   */
  cleanup(): void {
    const activeSignals: MemorySignal[] = [];

    for (const signal of this.generatedSignals.values()) {
      if (this.calculateSignalStrength(signal) > 0.1) {
        activeSignals.push(signal);
      }
    }

    this.generatedSignals.clear();
    activeSignals.forEach((signal) => {
      this.generatedSignals.set(signal.id, signal);
    });

    console.log(
      `🧹 Cleaned up memory signals. Active: ${activeSignals.length}`
    );
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MemorySignalConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Updated memory signal configuration');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async findSalientMemories(context: any): Promise<SalientMemory[]> {
    try {
      // Build a query from recent events, goals, and emotional state
      const queryParts: string[] = [];
      if (context.recentEvents?.length) {
        queryParts.push(context.recentEvents.slice(0, 3).join(', '));
      }
      if (context.currentGoals?.length) {
        queryParts.push(context.currentGoals.slice(0, 2).join(', '));
      }
      if (context.emotionalState) {
        queryParts.push(context.emotionalState);
      }

      // Fall back to a broad recency query if no context is available
      const query = queryParts.length > 0
        ? queryParts.join(' ')
        : 'recent experiences and observations';

      const searchResponse = await this.memorySystem.searchMemories({
        query,
        types: this.config.allowedMemoryTypes,
        limit: this.config.maxSignalsPerScan * 2, // fetch extra, filter by salience
        minConfidence: this.config.minSalienceThreshold,
        maxAge: 3600000, // 1 hour — focus on recent memories
        world: context.world,
        smartMode: true,
      });

      if (!searchResponse?.results?.length) {
        return [];
      }

      // Map search results to SalientMemory with context-based relevance boosts
      const salientMemories: SalientMemory[] = searchResponse.results
        .map((result) => {
          let salience = result.score || result.hybridScore || 0;

          // Apply context boosts
          if (context.world && result.metadata?.world === context.world) {
            salience += this.config.contextBoosts.sameWorldBoost;
          }
          if (result.temporalContext?.timestamp) {
            const ageMs = Date.now() - result.temporalContext.timestamp;
            if (ageMs < 300000) { // < 5 min
              salience += this.config.contextBoosts.recentMemoryBoost;
            }
          }

          // Map memory type from metadata
          const typeStr = result.metadata?.type || 'experience';
          const memoryType = Object.values(MemoryType).includes(typeStr as MemoryType)
            ? (typeStr as MemoryType)
            : MemoryType.EXPERIENCE;

          // Derive emotional impact from sentiment
          const emotionalImpact = result.metadata?.sentiment === 'negative' ? -0.5
            : result.metadata?.sentiment === 'positive' ? 0.5
            : 0;

          return {
            id: result.id,
            content: result.content,
            type: memoryType,
            salience: Math.min(1, salience),
            emotionalImpact,
            lastAccessed: result.temporalContext?.timestamp ?? Date.now(),
            contextRelevance: result.score || 0,
            suggestedAction: this.inferAction(result.content, memoryType),
            urgency: salience > 0.7 ? 0.8 : salience > 0.5 ? 0.5 : 0.2,
            metadata: result.metadata || {},
          };
        })
        .filter((m) => m.salience >= this.config.minSalienceThreshold)
        .slice(0, this.config.maxSignalsPerScan);

      return salientMemories;
    } catch (error) {
      console.warn(
        '[MemorySignalGenerator] findSalientMemories failed, returning empty:',
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Infer a suggested action from memory content and type.
   * Simple heuristic — maps memory type to action category.
   */
  private inferAction(content: string, type: MemoryType): string {
    switch (type) {
      case MemoryType.EMOTIONAL:
        return 'process_emotion';
      case MemoryType.PROCEDURAL:
        return 'apply_skill';
      case MemoryType.KNOWLEDGE:
        return 'use_knowledge';
      default:
        // Check content for danger/threat keywords
        if (/die|death|damage|hurt|attack|creeper|zombie|skeleton/i.test(content)) {
          return 'assess_danger';
        }
        return 'reflect';
    }
  }

  private async convertToSignals(
    memories: SalientMemory[],
    context: any
  ): Promise<MemorySignal[]> {
    const signals: MemorySignal[] = [];

    for (const memory of memories.slice(0, this.config.maxSignalsPerScan)) {
      const signal = await this.createMemorySignal(memory, context);
      if (signal) {
        signals.push(signal);
      }
    }

    return signals;
  }

  private async createMemorySignal(
    memory: SalientMemory,
    context: any
  ): Promise<MemorySignal | null> {
    // Calculate signal strength based on memory salience and context
    const signalStrength = this.calculateSignalStrengthFromMemory(
      memory,
      context
    );

    if (signalStrength < this.config.minSalienceThreshold) {
      return null;
    }

    // Create the signal
    const signal: MemorySignal = {
      id: `memory_${memory.id}_${Date.now()}`,
      type: 'memory' as any,
      data: {
        memoryId: memory.id,
        memoryType: memory.type,
        suggestedAction: memory.suggestedAction,
        emotionalImpact: memory.emotionalImpact,
        originalContent: memory.content,
      },
      timestamp: Date.now(),
      source: 'memory-system',
      memoryType: memory.type,
      confidence: memory.contextRelevance,
      intensity: memory.salience,
      urgency: memory.urgency,
      trend: 'stable', // Memory signals don't have trends
      emotionalImpact: memory.emotionalImpact,
    };

    return signal;
  }

  private calculateSignalStrengthFromMemory(
    memory: SalientMemory,
    context: any
  ): number {
    let strength = memory.salience;

    // Apply context boosts
    if (context.world && memory.metadata.world === context.world) {
      strength += this.config.contextBoosts.sameWorldBoost;
    }

    if (context.location && memory.metadata.location) {
      const distance = this.calculateDistance(
        context.location,
        memory.metadata.location
      );
      if (distance < 100) {
        // Within 100 blocks
        strength += this.config.contextBoosts.sameLocationBoost;
      }
    }

    if (memory.lastAccessed > Date.now() - 60000) {
      // Last hour
      strength += this.config.contextBoosts.recentMemoryBoost;
    }

    if (Math.abs(memory.emotionalImpact) > 0.5) {
      strength += this.config.contextBoosts.emotionalBoost;
    }

    return Math.min(1.0, strength);
  }

  private calculateDistance(pos1: any, pos2: any): number {
    if (!pos1 || !pos2) return Infinity;

    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private calculateSignalStrength(signal: MemorySignal): number {
    const age = Date.now() - signal.timestamp;
    const ageMinutes = age / 60000; // Convert to minutes

    // Apply decay based on signal's decay rate
    const decayedIntensity =
      (signal.intensity ?? 0) *
      Math.pow(1 - this.config.signalDecayRate, ageMinutes);

    return Math.max(0, decayedIntensity);
  }

  private applySignalDecay(): void {
    const updatedSignals: MemorySignal[] = [];

    for (const signal of this.generatedSignals.values()) {
      const strength = this.calculateSignalStrength(signal);
      if (strength > 0) {
        signal.intensity = strength;
        updatedSignals.push(signal);
      }
    }

    this.generatedSignals.clear();
    updatedSignals.forEach((signal) => {
      this.generatedSignals.set(signal.id, signal);
    });
  }
}
