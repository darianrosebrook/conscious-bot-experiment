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
    // This would integrate with the enhanced memory system to find salient memories
    // For now, return empty array as placeholder
    console.log('🔍 Finding salient memories (placeholder implementation)');

    // In a real implementation, this would:
    // 1. Query the memory system for memories with high salience
    // 2. Apply context-based relevance boosts
    // 3. Filter by memory type and recency
    // 4. Calculate suggested actions based on memory content

    return [];
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
