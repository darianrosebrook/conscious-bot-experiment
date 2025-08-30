/**
 * Advanced signal processing with fusion, context awareness, and trend analysis.
 *
 * Implements sophisticated signal processing that transforms raw internal signals
 * and external intrusions into structured, context-aware needs.
 *
 * Author: @darianrosebrook
 */

import { HomeostasisState, Need, NeedType } from '../types';

export interface InternalSignal {
  type: SignalType;
  intensity: number; // 0-100 urgency
  source: string; // 'homeostasis', 'intrusion', 'social', etc.
  timestamp: number;
  metadata: Record<string, any>;
}

export enum SignalType {
  HUNGER = 'hunger',
  SAFETY_THREAT = 'safety_threat',
  SOCIAL_ISOLATION = 'social_isolation',
  CURIOSITY = 'curiosity',
  EXPLORATION = 'exploration',
  INTRUSION = 'intrusion',
  ENERGY_DEPLETION = 'energy_depletion',
  HEALTH_DECLINE = 'health_decline',
  ACHIEVEMENT_OPPORTUNITY = 'achievement_opportunity',
  CREATIVITY_DRIVE = 'creativity_drive',
}

export interface FusedSignal {
  type: SignalType;
  intensity: number;
  urgency: number;
  context: SignalContext;
  decay: number;
  lastSatisfied: number;
  trend: TrendAnalysis;
}

export interface SignalContext {
  environmentalFactors: Record<string, any>;
  resourceAvailability: Record<string, boolean>;
  temporalFactors: TemporalContext;
  socialFactors: SocialContext;
}

export interface TemporalContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  season: string;
  urgencyMultiplier: number;
}

export interface SocialContext {
  nearbyPlayers: number;
  socialOpportunities: number;
  isolationLevel: number;
  cooperationPotential: number;
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  rate: number;
  acceleration: number;
  predictedPeak: number;
  predictedPeakTime: number;
}

export interface NeedContext {
  hungerLevel: number;
  foodAvailable: boolean;
  nearFood: boolean;
  timeOfDay: string;
  threats?: any[];
  health?: number;
  armor?: number;
  weapons?: string[];
  lightLevel?: number;
}

/**
 * Advanced signal processor with fusion, context awareness, and trend analysis.
 */
export class AdvancedSignalProcessor {
  private signalHistory: InternalSignal[] = [];
  private readonly maxHistorySize = 100;
  private readonly trendWindowSize = 20;

  /**
   * Process raw signals into structured, context-aware needs.
   */
  processSignals(
    signals: InternalSignal[],
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need[] {
    // Update signal history
    this.updateSignalHistory(signals);

    // Fuse related signals
    const fusedSignals = this.fuseSignals(signals);

    // Apply context gates
    const contextAwareSignals = fusedSignals.map((signal) =>
      this.applyContextGates(signal, homeostasis, worldState)
    );

    // Analyze trends
    const trendAwareSignals = contextAwareSignals.map((signal) =>
      this.analyzeTrends(signal)
    );

    // Convert to needs
    const needs: Need[] = [];

    for (const signal of trendAwareSignals) {
      switch (signal.type) {
        case SignalType.HUNGER:
          needs.push(this.processHungerSignal(signal, homeostasis, worldState));
          break;

        case SignalType.SAFETY_THREAT:
          needs.push(this.processThreatSignal(signal, homeostasis, worldState));
          break;

        case SignalType.SOCIAL_ISOLATION:
          needs.push(this.processSocialSignal(signal, homeostasis, worldState));
          break;

        case SignalType.CURIOSITY:
          needs.push(
            this.processCuriositySignal(signal, homeostasis, worldState)
          );
          break;

        case SignalType.INTRUSION:
          needs.push(
            ...this.processIntrusionSignal(signal, homeostasis, worldState)
          );
          break;

        case SignalType.ENERGY_DEPLETION:
          needs.push(this.processEnergySignal(signal, homeostasis, worldState));
          break;

        case SignalType.ACHIEVEMENT_OPPORTUNITY:
          needs.push(
            this.processAchievementSignal(signal, homeostasis, worldState)
          );
          break;

        case SignalType.CREATIVITY_DRIVE:
          needs.push(
            this.processCreativitySignal(signal, homeostasis, worldState)
          );
          break;
      }
    }

    return this.consolidateNeeds(needs);
  }

  /**
   * Fuse related signals to reduce noise and identify patterns.
   */
  private fuseSignals(signals: InternalSignal[]): FusedSignal[] {
    const signalGroups = new Map<SignalType, InternalSignal[]>();

    // Group signals by type
    for (const signal of signals) {
      if (!signalGroups.has(signal.type)) {
        signalGroups.set(signal.type, []);
      }
      signalGroups.get(signal.type)!.push(signal);
    }

    const fusedSignals: FusedSignal[] = [];

    for (const [type, groupSignals] of Array.from(signalGroups)) {
      if (groupSignals.length === 0) continue;

      // Calculate fused intensity (weighted average)
      const totalWeight = groupSignals.reduce((sum, s) => sum + s.intensity, 0);
      const avgIntensity = totalWeight / groupSignals.length;

      // Calculate urgency (max urgency in group)
      const maxUrgency = Math.max(...groupSignals.map((s) => s.intensity));

      // Merge metadata
      const mergedMetadata = groupSignals.reduce(
        (merged, signal) => ({
          ...merged,
          ...signal.metadata,
        }),
        {}
      );

      const fusedSignal: FusedSignal = {
        type,
        intensity: avgIntensity,
        urgency: maxUrgency,
        context: this.extractContext(mergedMetadata),
        decay: this.calculateDecayRate(type),
        lastSatisfied: this.getLastSatisfiedTime(type),
        trend: {
          direction: 'stable',
          rate: 0,
          acceleration: 0,
          predictedPeak: 0,
          predictedPeakTime: 0,
        },
      };

      fusedSignals.push(fusedSignal);
    }

    return fusedSignals;
  }

  /**
   * Apply context gates to adjust signal intensity based on environmental factors.
   */
  private applyContextGates(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): FusedSignal {
    const context = signal.context;

    // Apply temporal context gates
    if (
      signal.type === SignalType.EXPLORATION &&
      context.temporalFactors.timeOfDay === 'night'
    ) {
      signal.intensity *= 0.3; // Reduce exploration at night
    }

    if (
      signal.type === SignalType.SOCIAL_ISOLATION &&
      context.temporalFactors.timeOfDay === 'night'
    ) {
      signal.intensity *= 0.5; // Reduce social needs at night
    }

    // Apply environmental context gates
    if (
      signal.type === SignalType.HUNGER &&
      context.resourceAvailability.food
    ) {
      signal.intensity *= 1.2; // Increase hunger urgency when food is available
    }

    if (
      signal.type === SignalType.SAFETY_THREAT &&
      context.resourceAvailability.weapons
    ) {
      signal.intensity *= 0.8; // Reduce threat urgency when armed
    }

    // Apply social context gates
    if (
      signal.type === SignalType.SOCIAL_ISOLATION &&
      context.socialFactors.nearbyPlayers > 0
    ) {
      signal.intensity *= 1.5; // Increase social needs when players are nearby
    }

    return signal;
  }

  /**
   * Analyze signal trends to predict future urgency.
   */
  private analyzeTrends(signal: FusedSignal): FusedSignal {
    const recentSignals = this.signalHistory
      .filter((s) => s.type === signal.type)
      .slice(-this.trendWindowSize);

    if (recentSignals.length < 3) {
      return signal; // Not enough data for trend analysis
    }

    // Calculate trend direction and rate
    const intensities = recentSignals.map((s) => s.intensity);
    const trend = this.calculateTrend(intensities);

    // Adjust urgency based on trend
    if (trend.direction === 'increasing' && trend.rate > 0.1) {
      signal.urgency *= 1 + trend.rate; // Increase urgency for accelerating trends
    }

    signal.trend = trend;
    return signal;
  }

  /**
   * Process hunger signal with context awareness.
   */
  private processHungerSignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need {
    const hungerLevel = homeostasis.hunger;
    const foodAvailable = signal.context.resourceAvailability.food ?? false;

    // Urgency increases exponentially as hunger approaches critical
    const urgency = Math.pow((100 - hungerLevel * 100) / 100, 2) * 100;

    // Context: harder to satisfy if no food available
    const accessibility = foodAvailable ? 1.0 : 0.3;

    const now = Date.now();
    return {
      id: `need-${now}-hunger`,
      type: NeedType.SURVIVAL,
      intensity: clamp(signal.intensity * accessibility),
      urgency: clamp(urgency * accessibility),
      satisfaction: clamp(1 - hungerLevel),
      description: 'Reduce hunger through food consumption',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Process threat signal with sophisticated threat assessment.
   */
  private processThreatSignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need {
    const threats = signal.context.environmentalFactors.threats || [];
    const playerHealth = homeostasis.health;

    // Threat urgency based on proximity and health
    let maxThreatLevel = 0;
    for (const threat of threats) {
      const threatLevel = this.assessThreat(threat, playerHealth);
      maxThreatLevel = Math.max(maxThreatLevel, threatLevel);
    }

    const now = Date.now();
    return {
      id: `need-${now}-safety`,
      type: NeedType.SAFETY,
      intensity: clamp(signal.intensity),
      urgency: clamp(maxThreatLevel),
      satisfaction: clamp(homeostasis.safety),
      description: 'Increase safety level and reduce risk',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Process social signal with social context awareness.
   */
  private processSocialSignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need {
    const socialLevel = homeostasis.social;
    const nearbyPlayers = signal.context.socialFactors.nearbyPlayers;

    // Social urgency increases with isolation and nearby opportunities
    const isolationUrgency = (1 - socialLevel) * 100;
    const opportunityMultiplier = nearbyPlayers > 0 ? 1.5 : 0.5;

    const now = Date.now();
    return {
      id: `need-${now}-social`,
      type: NeedType.SOCIAL,
      intensity: clamp(signal.intensity * opportunityMultiplier),
      urgency: clamp(isolationUrgency * opportunityMultiplier),
      satisfaction: clamp(socialLevel),
      description: 'Engage in social interaction when appropriate',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Process curiosity signal with exploration context.
   */
  private processCuriositySignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need {
    const curiosityLevel = homeostasis.curiosity;
    const timeOfDay = signal.context.temporalFactors.timeOfDay;

    // Curiosity urgency based on exploration drive and time of day
    const explorationUrgency = curiosityLevel * 100;
    const timeMultiplier = timeOfDay === 'night' ? 0.3 : 1.0;

    const now = Date.now();
    return {
      id: `need-${now}-curiosity`,
      type: NeedType.EXPLORATION, // Map curiosity to exploration need
      intensity: clamp(signal.intensity * timeMultiplier),
      urgency: clamp(explorationUrgency * timeMultiplier),
      satisfaction: clamp(1 - curiosityLevel),
      description: 'Explore environment for opportunities',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Process intrusion signals (external suggestions/commands).
   */
  private processIntrusionSignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need[] {
    const intrusions = signal.context.environmentalFactors.intrusions || [];
    const needs: Need[] = [];

    for (const intrusion of intrusions) {
      const now = Date.now();
      needs.push({
        id: `need-${now}-intrusion-${intrusion.id}`,
        type: NeedType.ACHIEVEMENT, // Treat intrusions as achievement opportunities
        intensity: clamp(signal.intensity * intrusion.priority),
        urgency: clamp(intrusion.urgency || signal.urgency),
        satisfaction: 0,
        description: `External request: ${intrusion.description}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    return needs;
  }

  /**
   * Process energy depletion signal.
   */
  private processEnergySignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need {
    const energyLevel = homeostasis.energy;

    const now = Date.now();
    return {
      id: `need-${now}-energy`,
      type: NeedType.SURVIVAL,
      intensity: clamp(signal.intensity),
      urgency: clamp((1 - energyLevel) * 100),
      satisfaction: clamp(energyLevel),
      description: 'Restore energy through rest or food',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Process achievement opportunity signal.
   */
  private processAchievementSignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need {
    const achievementLevel = homeostasis.achievement;

    const now = Date.now();
    return {
      id: `need-${now}-achievement`,
      type: NeedType.ACHIEVEMENT,
      intensity: clamp(signal.intensity),
      urgency: clamp(achievementLevel * 100),
      satisfaction: clamp(achievementLevel),
      description: 'Pursue progress toward goals',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Process creativity drive signal.
   */
  private processCreativitySignal(
    signal: FusedSignal,
    homeostasis: HomeostasisState,
    worldState?: any
  ): Need {
    const creativityLevel = homeostasis.creativity;

    const now = Date.now();
    return {
      id: `need-${now}-creativity`,
      type: NeedType.CREATIVITY,
      intensity: clamp(signal.intensity),
      urgency: clamp(creativityLevel * 100),
      satisfaction: clamp(creativityLevel),
      description: 'Express creativity through building or crafting',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Consolidate similar needs to reduce redundancy.
   */
  private consolidateNeeds(needs: Need[]): Need[] {
    const consolidated = new Map<NeedType, Need>();

    for (const need of needs) {
      const existing = consolidated.get(need.type);

      if (existing) {
        // Merge similar needs, taking the higher urgency
        existing.intensity = Math.max(existing.intensity, need.intensity);
        existing.urgency = Math.max(existing.urgency, need.urgency);
        existing.satisfaction = Math.min(
          existing.satisfaction,
          need.satisfaction
        );
        existing.updatedAt = Date.now();
      } else {
        consolidated.set(need.type, { ...need });
      }
    }

    return Array.from(consolidated.values());
  }

  // Helper methods
  private updateSignalHistory(signals: InternalSignal[]): void {
    this.signalHistory.push(...signals);

    // Keep history size manageable
    if (this.signalHistory.length > this.maxHistorySize) {
      this.signalHistory = this.signalHistory.slice(-this.maxHistorySize);
    }
  }

  private extractContext(metadata: Record<string, any>): SignalContext {
    return {
      environmentalFactors: metadata.environmental || {},
      resourceAvailability: metadata.resources || {},
      temporalFactors: {
        timeOfDay: metadata.timeOfDay || 'day',
        dayOfWeek: metadata.dayOfWeek || 1,
        season: metadata.season || 'summer',
        urgencyMultiplier: metadata.urgencyMultiplier || 1.0,
      },
      socialFactors: {
        nearbyPlayers: metadata.nearbyPlayers || 0,
        socialOpportunities: metadata.socialOpportunities || 0,
        isolationLevel: metadata.isolationLevel || 0.5,
        cooperationPotential: metadata.cooperationPotential || 0.3,
      },
    };
  }

  private calculateDecayRate(type: SignalType): number {
    const decayRates: Record<SignalType, number> = {
      [SignalType.HUNGER]: 0.1,
      [SignalType.SAFETY_THREAT]: 0.05,
      [SignalType.SOCIAL_ISOLATION]: 0.08,
      [SignalType.CURIOSITY]: 0.15,
      [SignalType.EXPLORATION]: 0.12,
      [SignalType.INTRUSION]: 0.02,
      [SignalType.ENERGY_DEPLETION]: 0.12,
      [SignalType.HEALTH_DECLINE]: 0.03,
      [SignalType.ACHIEVEMENT_OPPORTUNITY]: 0.2,
      [SignalType.CREATIVITY_DRIVE]: 0.18,
    };

    return decayRates[type] || 0.1;
  }

  private getLastSatisfiedTime(type: SignalType): number {
    // This would typically come from a satisfaction history
    // For now, return a reasonable default
    return Date.now() - 300000; // 5 minutes ago
  }

  private calculateTrend(intensities: number[]): TrendAnalysis {
    if (intensities.length < 3) {
      return {
        direction: 'stable',
        rate: 0,
        acceleration: 0,
        predictedPeak: 0,
        predictedPeakTime: 0,
      };
    }

    // Simple linear regression for trend calculation
    const n = intensities.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = intensities;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const rate = slope;

    const direction =
      rate > 0.01 ? 'increasing' : rate < -0.01 ? 'decreasing' : 'stable';

    // Simple peak prediction
    const predictedPeak = Math.max(...intensities) + rate * 10;
    const predictedPeakTime = Date.now() + (rate > 0 ? 300000 : 0); // 5 minutes if increasing

    return {
      direction,
      rate: Math.abs(rate),
      acceleration: 0, // Simplified for now
      predictedPeak,
      predictedPeakTime,
    };
  }

  private assessThreat(threat: any, health: number): number {
    // Simplified threat assessment
    const baseThreat = threat.level || 50;
    const healthMultiplier = health < 0.3 ? 1.5 : health < 0.6 ? 1.2 : 1.0;
    return Math.min(100, baseThreat * healthMultiplier);
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
