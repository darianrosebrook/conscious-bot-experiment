/**
 * Advanced Need Generator
 *
 * Implements context-aware need processing, trend tracking, and memory signal integration
 * for sophisticated homeostatic control in the conscious bot.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Core Types
// ============================================================================

export interface Need {
  id: string;
  type: NeedType;
  intensity: number; // 0-1
  urgency: number; // 0-1
  trend: TrendDirection;
  trendStrength: number; // 0-1
  context: NeedContext;
  memoryInfluence: number; // 0-1
  noveltyScore: number; // 0-1
  commitmentBoost: number; // 0-1
  timestamp: number;
  history: NeedHistoryEntry[];
}

export interface NeedContext {
  timeOfDay: TimeOfDay;
  location: LocationType;
  socialContext: SocialContext;
  environmentalFactors: EnvironmentalFactor[];
  recentEvents: string[];
  currentGoals: string[];
  availableResources: string[];
}

export interface NeedHistoryEntry {
  timestamp: number;
  intensity: number;
  urgency: number;
  context: Partial<NeedContext>;
  triggers: string[];
  satisfaction: number; // 0-1, how well the need was met
}

export interface TrendAnalysis {
  direction: TrendDirection;
  strength: number; // 0-1
  velocity: number; // rate of change
  acceleration: number; // rate of velocity change
  stability: number; // 0-1, how stable the trend is
  prediction: TrendPrediction;
}

export interface TrendPrediction {
  shortTerm: number; // predicted intensity in 1-5 minutes
  mediumTerm: number; // predicted intensity in 5-30 minutes
  longTerm: number; // predicted intensity in 30+ minutes
  confidence: number; // 0-1, confidence in predictions
}

export interface EnhancedNeed extends Need {
  priorityScore: number; // 0-1, computed priority
  opportunityCost: number; // 0-1, cost of not addressing
  feasibilityScore: number; // 0-1, how feasible to address
  socialImpact: number; // 0-1, impact on social relationships
  learningValue: number; // 0-1, potential learning from addressing
}

export interface MemorySignal {
  type: 'promise' | 'commitment' | 'experience' | 'goal' | 'relationship';
  content: string;
  relevance: number; // 0-1
  emotionalValence: number; // -1 to 1
  urgency: number; // 0-1
  timestamp: number;
  decayRate: number; // 0-1, how quickly it fades
}

export interface ContextGate {
  condition: string;
  multiplier: number;
  description: string;
  priority: number; // 0-1, importance of this gate
}

export enum NeedType {
  SAFETY = 'safety',
  NUTRITION = 'nutrition',
  PROGRESS = 'progress',
  SOCIAL = 'social',
  CURIOSITY = 'curiosity',
  INTEGRITY = 'integrity',
  ACHIEVEMENT = 'achievement',
  BELONGING = 'belonging',
  AUTONOMY = 'autonomy',
  MASTERY = 'mastery',
}

export enum TrendDirection {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  STABLE = 'stable',
  OSCILLATING = 'oscillating',
  VOLATILE = 'volatile',
  UNKNOWN = 'unknown',
}

export enum TimeOfDay {
  DAWN = 'dawn',
  MORNING = 'morning',
  NOON = 'noon',
  AFTERNOON = 'afternoon',
  DUSK = 'dusk',
  NIGHT = 'night',
  MIDNIGHT = 'midnight',
  UNKNOWN = 'unknown',
}

export enum LocationType {
  VILLAGE = 'village',
  WILDERNESS = 'wilderness',
  CAVE = 'cave',
  OCEAN = 'ocean',
  NETHER = 'nether',
  END = 'end',
  UNKNOWN = 'unknown',
}

export enum SocialContext {
  ALONE = 'alone',
  WITH_PLAYERS = 'with_players',
  WITH_NPCS = 'with_npcs',
  IN_GROUP = 'in_group',
  IN_CONFLICT = 'in_conflict',
  LEADING = 'leading',
  FOLLOWING = 'following',
}

export interface EnvironmentalFactor {
  type: string;
  intensity: number; // 0-1
  impact: number; // -1 to 1
  description: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface AdvancedNeedGeneratorConfig {
  trendAnalysisWindow: number; // samples for trend calculation
  contextGatePriority: number; // 0-1, how much context gates affect needs
  memoryInfluenceWeight: number; // 0-1, how much memory affects needs
  noveltyDecayRate: number; // 0-1, how quickly novelty fades
  commitmentBoostDecay: number; // 0-1, how quickly commitment boost fades
  predictionConfidenceThreshold: number; // 0-1, minimum confidence for predictions
  enableAdvancedContextGates: boolean;
  enableMemoryIntegration: boolean;
  enableTrendPrediction: boolean;
}

const DEFAULT_CONFIG: AdvancedNeedGeneratorConfig = {
  trendAnalysisWindow: 20,
  contextGatePriority: 0.3,
  memoryInfluenceWeight: 0.4,
  noveltyDecayRate: 0.95,
  commitmentBoostDecay: 0.98,
  predictionConfidenceThreshold: 0.6,
  enableAdvancedContextGates: true,
  enableMemoryIntegration: true,
  enableTrendPrediction: true,
};

// ============================================================================
// Advanced Need Generator Implementation
// ============================================================================

export class AdvancedNeedGenerator extends EventEmitter {
  private config: AdvancedNeedGeneratorConfig;
  private needs: Map<NeedType, Need> = new Map();
  private contextGates: Map<string, ContextGate[]> = new Map();
  private memorySignals: MemorySignal[] = [];
  private trendAnalyzers: Map<NeedType, TrendAnalyzer> = new Map();

  constructor(config: Partial<AdvancedNeedGeneratorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeNeeds();
    this.initializeContextGates();
  }

  /**
   * Generate enhanced needs with context awareness and trend analysis
   */
  async generateEnhancedNeeds(
    baseNeeds: Need[],
    context: NeedContext,
    memorySignals: MemorySignal[] = []
  ): Promise<EnhancedNeed[]> {
    // Update memory signals
    this.updateMemorySignals(memorySignals);

    // Process each need with advanced features
    const enhancedNeeds: EnhancedNeed[] = [];

    for (const baseNeed of baseNeeds) {
      // Apply context gates
      const contextAdjustedNeed = this.applyContextGates(baseNeed, context);

      // Track trends
      const trendAnalysis = this.analyzeTrends(baseNeed);

      // Integrate memory signals
      const memoryInfluence = this.calculateMemoryInfluence(baseNeed);

      // Calculate novelty and commitment boosts
      const noveltyScore = this.calculateNoveltyScore(baseNeed, context);
      const commitmentBoost = this.calculateCommitmentBoost(baseNeed);

      // Create enhanced need
      const enhancedNeed: EnhancedNeed = {
        ...contextAdjustedNeed,
        trend: trendAnalysis.direction,
        trendStrength: trendAnalysis.strength,
        memoryInfluence,
        noveltyScore,
        commitmentBoost,
        priorityScore: this.calculatePriorityScore(
          contextAdjustedNeed,
          trendAnalysis,
          memoryInfluence,
          noveltyScore,
          commitmentBoost
        ),
        opportunityCost: this.calculateOpportunityCost(
          contextAdjustedNeed,
          context
        ),
        feasibilityScore: this.calculateFeasibilityScore(
          contextAdjustedNeed,
          context
        ),
        socialImpact: this.calculateSocialImpact(contextAdjustedNeed, context),
        learningValue: this.calculateLearningValue(
          contextAdjustedNeed,
          context
        ),
      };

      enhancedNeeds.push(enhancedNeed);

      // Update need history
      this.updateNeedHistory(enhancedNeed);
    }

    // Sort by priority score
    enhancedNeeds.sort((a, b) => b.priorityScore - a.priorityScore);

    return enhancedNeeds;
  }

  /**
   * Apply context gates to adjust need intensity and urgency
   */
  private applyContextGates(need: Need, context: NeedContext): Need {
    if (!this.config.enableAdvancedContextGates) {
      return need;
    }

    let intensityMultiplier = 1.0;
    let urgencyMultiplier = 1.0;
    const appliedGates: string[] = [];

    // Time-based context gates
    const timeGates = this.contextGates.get('time') || [];
    for (const gate of timeGates) {
      if (this.evaluateTimeGate(gate, context.timeOfDay)) {
        intensityMultiplier *= gate.multiplier;
        urgencyMultiplier *= gate.multiplier;
        appliedGates.push(gate.description);
      }
    }

    // Location-based context gates
    const locationGates = this.contextGates.get('location') || [];
    for (const gate of locationGates) {
      if (this.evaluateLocationGate(gate, context.location)) {
        intensityMultiplier *= gate.multiplier;
        urgencyMultiplier *= gate.multiplier;
        appliedGates.push(gate.description);
      }
    }

    // Social context gates
    const socialGates = this.contextGates.get('social') || [];
    for (const gate of socialGates) {
      if (this.evaluateSocialGate(gate, context.socialContext)) {
        intensityMultiplier *= gate.multiplier;
        urgencyMultiplier *= gate.multiplier;
        appliedGates.push(gate.description);
      }
    }

    // Environmental factor gates
    const environmentalGates = this.contextGates.get('environmental') || [];
    for (const gate of environmentalGates) {
      if (this.evaluateEnvironmentalGate(gate, context.environmentalFactors)) {
        intensityMultiplier *= gate.multiplier;
        urgencyMultiplier *= gate.multiplier;
        appliedGates.push(gate.description);
      }
    }

    return {
      ...need,
      intensity: Math.min(1.0, need.intensity * intensityMultiplier),
      urgency: Math.min(1.0, need.urgency * urgencyMultiplier),
      context: {
        ...need.context,
        recentEvents: [...need.context.recentEvents, ...appliedGates],
      },
    };
  }

  /**
   * Analyze trends in need intensity over time
   */
  private analyzeTrends(need: Need): TrendAnalysis {
    if (!this.config.enableTrendPrediction) {
      return {
        direction: TrendDirection.UNKNOWN,
        strength: 0,
        velocity: 0,
        acceleration: 0,
        stability: 0,
        prediction: {
          shortTerm: need.intensity,
          mediumTerm: need.intensity,
          longTerm: need.intensity,
          confidence: 0,
        },
      };
    }

    const history = need.history.slice(-this.config.trendAnalysisWindow);
    if (history.length < 3) {
      return {
        direction: TrendDirection.UNKNOWN,
        strength: 0,
        velocity: 0,
        acceleration: 0,
        stability: 0,
        prediction: {
          shortTerm: need.intensity,
          mediumTerm: need.intensity,
          longTerm: need.intensity,
          confidence: 0,
        },
      };
    }

    // Calculate velocity (rate of change)
    const recentIntensities = history.map((entry) => entry.intensity);
    const velocity = this.calculateVelocity(recentIntensities);

    // Calculate acceleration (rate of velocity change)
    const acceleration = this.calculateAcceleration(recentIntensities);

    // Determine trend direction
    const direction = this.determineTrendDirection(velocity, acceleration);

    // Calculate trend strength
    const strength = Math.abs(velocity) + Math.abs(acceleration) * 0.5;

    // Calculate stability
    const stability = this.calculateStability(recentIntensities);

    // Generate predictions
    const prediction = this.generatePredictions(
      need.intensity,
      velocity,
      acceleration,
      stability
    );

    return {
      direction,
      strength: Math.min(1.0, strength),
      velocity,
      acceleration,
      stability,
      prediction,
    };
  }

  /**
   * Calculate memory influence on need
   */
  private calculateMemoryInfluence(need: Need): number {
    if (!this.config.enableMemoryIntegration) {
      return 0;
    }

    const relevantSignals = this.memorySignals.filter((signal) =>
      this.isSignalRelevantToNeed(signal, need)
    );

    if (relevantSignals.length === 0) {
      return 0;
    }

    // Calculate weighted influence based on relevance, emotional valence, and recency
    const totalInfluence = relevantSignals.reduce((sum, signal) => {
      const recencyFactor = this.calculateRecencyFactor(signal.timestamp);
      const emotionalFactor = Math.abs(signal.emotionalValence);
      const relevanceFactor = signal.relevance;

      return (
        sum + signal.urgency * emotionalFactor * relevanceFactor * recencyFactor
      );
    }, 0);

    return Math.min(1.0, totalInfluence * this.config.memoryInfluenceWeight);
  }

  /**
   * Calculate novelty score for need
   */
  private calculateNoveltyScore(need: Need, context: NeedContext): number {
    const recentHistory = need.history.slice(-10);
    if (recentHistory.length === 0) {
      return 1.0; // Maximum novelty for new needs
    }

    // Check if this need context is similar to recent history
    const contextSimilarity = this.calculateContextSimilarity(
      context,
      recentHistory.map((h) => h.context)
    );

    // Novelty decreases with context similarity
    const noveltyScore = 1.0 - contextSimilarity;

    // Apply decay over time
    const timeSinceLastSimilar = this.getTimeSinceLastSimilarContext(
      context,
      recentHistory
    );
    const decayedNovelty =
      noveltyScore *
      Math.pow(this.config.noveltyDecayRate, timeSinceLastSimilar / 60000); // 1 minute

    return Math.max(0, decayedNovelty);
  }

  /**
   * Calculate commitment boost for need
   */
  private calculateCommitmentBoost(need: Need): number {
    const recentHistory = need.history.slice(-5);
    if (recentHistory.length === 0) {
      return 0;
    }

    // Check for recent commitments or promises related to this need
    const commitmentSignals = this.memorySignals.filter(
      (signal) =>
        (signal.type === 'promise' || signal.type === 'commitment') &&
        this.isSignalRelevantToNeed(signal, need)
    );

    if (commitmentSignals.length === 0) {
      return 0;
    }

    // Calculate boost based on commitment strength and recency
    const totalBoost = commitmentSignals.reduce((sum, signal) => {
      const recencyFactor = this.calculateRecencyFactor(signal.timestamp);
      const strengthFactor = signal.urgency;

      return sum + strengthFactor * recencyFactor;
    }, 0);

    return Math.min(1.0, totalBoost);
  }

  /**
   * Calculate overall priority score for need
   */
  private calculatePriorityScore(
    need: Need,
    trendAnalysis: TrendAnalysis,
    memoryInfluence: number,
    noveltyScore: number,
    commitmentBoost: number
  ): number {
    // Base priority from intensity and urgency
    let priority = need.intensity * 0.6 + need.urgency * 0.4;

    // Adjust for trend direction
    if (trendAnalysis.direction === TrendDirection.INCREASING) {
      priority += trendAnalysis.strength * 0.2;
    } else if (trendAnalysis.direction === TrendDirection.DECREASING) {
      priority -= trendAnalysis.strength * 0.1;
    }

    // Add memory influence
    priority += memoryInfluence * 0.15;

    // Add novelty bonus (but not too much)
    priority += noveltyScore * 0.1;

    // Add commitment boost
    priority += commitmentBoost * 0.2;

    return Math.min(1.0, Math.max(0, priority));
  }

  /**
   * Calculate opportunity cost of not addressing need
   */
  private calculateOpportunityCost(need: Need, context: NeedContext): number {
    // Higher cost for urgent needs
    let cost = need.urgency * 0.4;

    // Higher cost for needs that are trending upward
    if (need.trend === TrendDirection.INCREASING) {
      cost += need.trendStrength * 0.3;
    }

    // Higher cost in social contexts for social needs
    if (
      need.type === NeedType.SOCIAL &&
      context.socialContext !== SocialContext.ALONE
    ) {
      cost += 0.2;
    }

    // Higher cost for safety needs in dangerous environments
    if (need.type === NeedType.SAFETY && this.isDangerousEnvironment(context)) {
      cost += 0.3;
    }

    return Math.min(1.0, cost);
  }

  /**
   * Calculate feasibility score for addressing need
   */
  private calculateFeasibilityScore(need: Need, context: NeedContext): number {
    let feasibility = 0.5; // Base feasibility

    // Check resource availability
    const resourceFeasibility = this.checkResourceFeasibility(need, context);
    feasibility += resourceFeasibility * 0.3;

    // Check environmental feasibility
    const environmentalFeasibility = this.checkEnvironmentalFeasibility(
      need,
      context
    );
    feasibility += environmentalFeasibility * 0.2;

    // Check social feasibility
    const socialFeasibility = this.checkSocialFeasibility(need, context);
    feasibility += socialFeasibility * 0.2;

    return Math.min(1.0, Math.max(0, feasibility));
  }

  /**
   * Calculate social impact of addressing need
   */
  private calculateSocialImpact(need: Need, context: NeedContext): number {
    if (context.socialContext === SocialContext.ALONE) {
      return 0;
    }

    let impact = 0;

    // Social needs have high social impact
    if (need.type === NeedType.SOCIAL) {
      impact += 0.6;
    }

    // Safety needs affect group safety
    if (
      need.type === NeedType.SAFETY &&
      context.socialContext === SocialContext.WITH_PLAYERS
    ) {
      impact += 0.4;
    }

    // Progress needs can inspire others
    if (
      need.type === NeedType.PROGRESS &&
      context.socialContext === SocialContext.LEADING
    ) {
      impact += 0.3;
    }

    return Math.min(1.0, impact);
  }

  /**
   * Calculate learning value of addressing need
   */
  private calculateLearningValue(need: Need, context: NeedContext): number {
    let learningValue = 0;

    // Novel situations have higher learning value
    if (need.noveltyScore > 0.7) {
      learningValue += 0.4;
    }

    // Social interactions provide learning opportunities
    if (context.socialContext !== SocialContext.ALONE) {
      learningValue += 0.2;
    }

    // Complex environments provide learning opportunities
    if (context.environmentalFactors.length > 3) {
      learningValue += 0.2;
    }

    // Curiosity needs have inherent learning value
    if (need.type === NeedType.CURIOSITY) {
      learningValue += 0.3;
    }

    return Math.min(1.0, learningValue);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private initializeNeeds(): void {
    Object.values(NeedType).forEach((needType) => {
      this.needs.set(needType, {
        id: uuidv4(),
        type: needType,
        intensity: 0.5,
        urgency: 0.5,
        trend: TrendDirection.STABLE,
        trendStrength: 0,
        context: this.createEmptyContext(),
        memoryInfluence: 0,
        noveltyScore: 0,
        commitmentBoost: 0,
        timestamp: Date.now(),
        history: [],
      });
    });
  }

  private initializeContextGates(): void {
    // Time-based gates
    this.contextGates.set('time', [
      {
        condition: 'night',
        multiplier: 1.3,
        description: 'Night safety concern',
        priority: 0.8,
      },
      {
        condition: 'dawn',
        multiplier: 1.1,
        description: 'Dawn activity boost',
        priority: 0.6,
      },
      {
        condition: 'midnight',
        multiplier: 1.4,
        description: 'Midnight danger',
        priority: 0.9,
      },
    ]);

    // Location-based gates
    this.contextGates.set('location', [
      {
        condition: 'village',
        multiplier: 1.5,
        description: 'Village social boost',
        priority: 0.7,
      },
      {
        condition: 'cave',
        multiplier: 1.2,
        description: 'Cave safety concern',
        priority: 0.8,
      },
      {
        condition: 'wilderness',
        multiplier: 1.1,
        description: 'Wilderness exploration',
        priority: 0.5,
      },
    ]);

    // Social context gates
    this.contextGates.set('social', [
      {
        condition: 'with_players',
        multiplier: 2.0,
        description: 'Player interaction boost',
        priority: 0.9,
      },
      {
        condition: 'in_conflict',
        multiplier: 1.8,
        description: 'Conflict urgency',
        priority: 0.8,
      },
      {
        condition: 'leading',
        multiplier: 1.3,
        description: 'Leadership responsibility',
        priority: 0.7,
      },
    ]);

    // Environmental gates
    this.contextGates.set('environmental', [
      {
        condition: 'dangerous',
        multiplier: 1.5,
        description: 'Dangerous environment',
        priority: 0.9,
      },
      {
        condition: 'resource_rich',
        multiplier: 0.8,
        description: 'Resource abundance',
        priority: 0.4,
      },
      {
        condition: 'hostile_mobs',
        multiplier: 1.6,
        description: 'Hostile mob presence',
        priority: 0.9,
      },
    ]);
  }

  private createEmptyContext(): NeedContext {
    return {
      timeOfDay: TimeOfDay.UNKNOWN,
      location: LocationType.UNKNOWN,
      socialContext: SocialContext.ALONE,
      environmentalFactors: [],
      recentEvents: [],
      currentGoals: [],
      availableResources: [],
    };
  }

  private updateMemorySignals(newSignals: MemorySignal[]): void {
    this.memorySignals = [...this.memorySignals, ...newSignals];

    // Remove old signals (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    this.memorySignals = this.memorySignals.filter(
      (signal) => signal.timestamp > oneHourAgo
    );
  }

  private updateNeedHistory(need: EnhancedNeed): void {
    const existingNeed = this.needs.get(need.type);
    if (existingNeed) {
      existingNeed.history.push({
        timestamp: need.timestamp,
        intensity: need.intensity,
        urgency: need.urgency,
        context: need.context,
        triggers: need.context.recentEvents,
        satisfaction: 0, // Will be updated when need is addressed
      });

      // Limit history size
      if (existingNeed.history.length > 100) {
        existingNeed.history = existingNeed.history.slice(-100);
      }
    }
  }

  private evaluateTimeGate(gate: ContextGate, timeOfDay: TimeOfDay): boolean {
    return gate.condition === timeOfDay.toString();
  }

  private evaluateLocationGate(
    gate: ContextGate,
    location: LocationType
  ): boolean {
    return gate.condition === location.toString();
  }

  private evaluateSocialGate(
    gate: ContextGate,
    socialContext: SocialContext
  ): boolean {
    return gate.condition === socialContext.toString();
  }

  private evaluateEnvironmentalGate(
    gate: ContextGate,
    factors: EnvironmentalFactor[]
  ): boolean {
    return factors.some((factor) => factor.type === gate.condition);
  }

  private calculateVelocity(intensities: number[]): number {
    if (intensities.length < 2) return 0;

    const changes = [];
    for (let i = 1; i < intensities.length; i++) {
      changes.push(intensities[i] - intensities[i - 1]);
    }

    return changes.reduce((sum, change) => sum + change, 0) / changes.length;
  }

  private calculateAcceleration(intensities: number[]): number {
    if (intensities.length < 3) return 0;

    const velocities = [];
    for (let i = 1; i < intensities.length; i++) {
      velocities.push(intensities[i] - intensities[i - 1]);
    }

    const velocityChanges = [];
    for (let i = 1; i < velocities.length; i++) {
      velocityChanges.push(velocities[i] - velocities[i - 1]);
    }

    return (
      velocityChanges.reduce((sum, change) => sum + change, 0) /
      velocityChanges.length
    );
  }

  private determineTrendDirection(
    velocity: number,
    acceleration: number
  ): TrendDirection {
    if (Math.abs(velocity) < 0.01) {
      return TrendDirection.STABLE;
    }

    if (velocity > 0) {
      return acceleration > 0
        ? TrendDirection.INCREASING
        : TrendDirection.OSCILLATING;
    } else {
      return acceleration < 0
        ? TrendDirection.DECREASING
        : TrendDirection.OSCILLATING;
    }
  }

  private calculateStability(intensities: number[]): number {
    if (intensities.length < 2) return 1.0;

    const mean =
      intensities.reduce((sum, val) => sum + val, 0) / intensities.length;
    const variance =
      intensities.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      intensities.length;

    // Convert variance to stability (0-1)
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  private generatePredictions(
    currentIntensity: number,
    velocity: number,
    acceleration: number,
    stability: number
  ): TrendPrediction {
    const timeHorizons = {
      shortTerm: 2, // 2 minutes
      mediumTerm: 15, // 15 minutes
      longTerm: 60, // 60 minutes
    };

    const predictions = {
      shortTerm:
        currentIntensity +
        velocity * timeHorizons.shortTerm +
        0.5 * acceleration * Math.pow(timeHorizons.shortTerm, 2),
      mediumTerm:
        currentIntensity +
        velocity * timeHorizons.mediumTerm +
        0.5 * acceleration * Math.pow(timeHorizons.mediumTerm, 2),
      longTerm:
        currentIntensity +
        velocity * timeHorizons.longTerm +
        0.5 * acceleration * Math.pow(timeHorizons.longTerm, 2),
    };

    // Clamp predictions to 0-1 range
    const clampedPredictions = {
      shortTerm: Math.min(1.0, Math.max(0, predictions.shortTerm)),
      mediumTerm: Math.min(1.0, Math.max(0, predictions.mediumTerm)),
      longTerm: Math.min(1.0, Math.max(0, predictions.longTerm)),
    };

    // Confidence decreases with time horizon and increases with stability
    const confidence = Math.min(
      1.0,
      stability * (1 - 0.1 * Math.log(timeHorizons.longTerm))
    );

    return {
      ...clampedPredictions,
      confidence: Math.max(
        this.config.predictionConfidenceThreshold,
        confidence
      ),
    };
  }

  private isSignalRelevantToNeed(signal: MemorySignal, need: Need): boolean {
    // Simple keyword matching - could be enhanced with semantic analysis
    const needKeywords: Record<NeedType, string[]> = {
      [NeedType.SAFETY]: ['safe', 'danger', 'threat', 'protect', 'defend'],
      [NeedType.NUTRITION]: ['hunger', 'food', 'eat', 'nutrition', 'health'],
      [NeedType.SOCIAL]: ['social', 'friend', 'player', 'interact', 'help'],
      [NeedType.CURIOSITY]: [
        'explore',
        'discover',
        'learn',
        'investigate',
        'curious',
      ],
      [NeedType.PROGRESS]: ['progress', 'goal', 'achieve', 'complete', 'build'],
      [NeedType.INTEGRITY]: [
        'promise',
        'commitment',
        'trust',
        'honor',
        'integrity',
      ],
      [NeedType.ACHIEVEMENT]: [
        'achieve',
        'complete',
        'master',
        'excel',
        'succeed',
      ],
      [NeedType.BELONGING]: ['belong', 'group', 'team', 'community', 'family'],
      [NeedType.AUTONOMY]: [
        'freedom',
        'choice',
        'independent',
        'self_determine',
      ],
      [NeedType.MASTERY]: [
        'master',
        'skill',
        'expertise',
        'competence',
        'proficiency',
      ],
    };

    const keywords = needKeywords[need.type] || [];
    return keywords.some((keyword) =>
      signal.content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private calculateRecencyFactor(timestamp: number): number {
    const ageMs = Date.now() - timestamp;
    const ageMinutes = ageMs / 60000;
    return Math.max(0, Math.exp(-ageMinutes / 30)); // 30-minute half-life
  }

  private calculateContextSimilarity(
    current: NeedContext,
    historical: Partial<NeedContext>[]
  ): number {
    if (historical.length === 0) return 0;

    const similarities = historical.map((h) => {
      let similarity = 0;
      let factors = 0;

      if (h.timeOfDay && h.timeOfDay === current.timeOfDay) {
        similarity += 0.3;
        factors++;
      }
      if (h.location && h.location === current.location) {
        similarity += 0.3;
        factors++;
      }
      if (h.socialContext && h.socialContext === current.socialContext) {
        similarity += 0.2;
        factors++;
      }

      return factors > 0 ? similarity / factors : 0;
    });

    return (
      similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
    );
  }

  private getTimeSinceLastSimilarContext(
    context: NeedContext,
    history: NeedHistoryEntry[]
  ): number {
    const now = Date.now();
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (this.calculateContextSimilarity(context, [entry.context]) > 0.7) {
        return now - entry.timestamp;
      }
    }
    return Infinity;
  }

  private isDangerousEnvironment(context: NeedContext): boolean {
    return context.environmentalFactors.some(
      (factor) => factor.type === 'dangerous' || factor.type === 'hostile_mobs'
    );
  }

  private checkResourceFeasibility(need: Need, context: NeedContext): number {
    // Simple resource checking - could be enhanced with inventory analysis
    const resourceRequirements: Record<NeedType, string[]> = {
      [NeedType.NUTRITION]: ['food', 'crops', 'animals'],
      [NeedType.SAFETY]: ['weapons', 'armor', 'shelter'],
      [NeedType.PROGRESS]: ['tools', 'materials', 'crafting_table'],
      [NeedType.SOCIAL]: ['communication_tools', 'gifts', 'shared_resources'],
      [NeedType.CURIOSITY]: ['exploration_tools', 'lighting', 'mapping_tools'],
      [NeedType.INTEGRITY]: ['trust_mechanisms', 'verification_tools'],
      [NeedType.ACHIEVEMENT]: ['goal_tracking', 'progress_indicators'],
      [NeedType.BELONGING]: ['group_identifiers', 'shared_spaces'],
      [NeedType.AUTONOMY]: ['decision_tools', 'independent_resources'],
      [NeedType.MASTERY]: ['skill_training', 'practice_areas'],
    };

    const requirements = resourceRequirements[need.type] || [];
    const available = context.availableResources;

    if (requirements.length === 0) return 0.5;

    const availableCount = requirements.filter((req) =>
      available.some((resource) => resource.includes(req))
    ).length;

    return availableCount / requirements.length;
  }

  private checkEnvironmentalFeasibility(
    need: Need,
    context: NeedContext
  ): number {
    // Check if environment supports need fulfillment
    const environmentalSupport: Record<NeedType, string[]> = {
      [NeedType.NUTRITION]: ['farmland', 'animals', 'water'],
      [NeedType.SAFETY]: ['shelter', 'defensive_position', 'escape_routes'],
      [NeedType.SOCIAL]: ['village', 'players', 'npcs'],
      [NeedType.CURIOSITY]: ['exploration_areas', 'undiscovered_regions'],
      [NeedType.PROGRESS]: ['workshops', 'resource_areas', 'building_sites'],
      [NeedType.INTEGRITY]: ['trusted_environments', 'verification_systems'],
      [NeedType.ACHIEVEMENT]: ['challenge_areas', 'goal_locations'],
      [NeedType.BELONGING]: ['community_spaces', 'group_territories'],
      [NeedType.AUTONOMY]: ['independent_spaces', 'decision_points'],
      [NeedType.MASTERY]: ['training_areas', 'skill_development_zones'],
    };

    const supports = environmentalSupport[need.type] || [];
    const factors = context.environmentalFactors;

    if (supports.length === 0) return 0.5;

    const supportCount = supports.filter((support) =>
      factors.some((factor) => factor.type.includes(support))
    ).length;

    return supportCount / supports.length;
  }

  private checkSocialFeasibility(need: Need, context: NeedContext): number {
    if (
      need.type === NeedType.SOCIAL &&
      context.socialContext === SocialContext.ALONE
    ) {
      return 0.1; // Low feasibility for social needs when alone
    }

    if (
      need.type === NeedType.SAFETY &&
      context.socialContext === SocialContext.WITH_PLAYERS
    ) {
      return 0.8; // High feasibility for safety needs with others
    }

    return 0.5; // Default feasibility
  }

  // ============================================================================
  // Public Interface
  // ============================================================================

  getNeedHistory(needType: NeedType): NeedHistoryEntry[] {
    const need = this.needs.get(needType);
    return need ? need.history : [];
  }

  getTrendAnalysis(needType: NeedType): TrendAnalysis | null {
    const need = this.needs.get(needType);
    if (!need) return null;

    return this.analyzeTrends(need);
  }

  getMemorySignals(): MemorySignal[] {
    return [...this.memorySignals];
  }

  addContextGate(category: string, gate: ContextGate): void {
    const gates = this.contextGates.get(category) || [];
    gates.push(gate);
    this.contextGates.set(category, gates);
  }

  getStats() {
    return {
      totalNeeds: this.needs.size,
      totalMemorySignals: this.memorySignals.length,
      contextGateCategories: Array.from(this.contextGates.keys()),
      averageNeedHistoryLength:
        Array.from(this.needs.values()).reduce(
          (sum, need) => sum + need.history.length,
          0
        ) / this.needs.size,
    };
  }
}

// ============================================================================
// Trend Analyzer Helper Class
// ============================================================================

class TrendAnalyzer {
  private windowSize: number;
  private data: number[] = [];

  constructor(windowSize: number = 20) {
    this.windowSize = windowSize;
  }

  addDataPoint(value: number): void {
    this.data.push(value);
    if (this.data.length > this.windowSize) {
      this.data.shift();
    }
  }

  getTrend(): TrendAnalysis {
    if (this.data.length < 3) {
      return {
        direction: TrendDirection.UNKNOWN,
        strength: 0,
        velocity: 0,
        acceleration: 0,
        stability: 0,
        prediction: {
          shortTerm: this.data[this.data.length - 1] || 0,
          mediumTerm: this.data[this.data.length - 1] || 0,
          longTerm: this.data[this.data.length - 1] || 0,
          confidence: 0,
        },
      };
    }

    // Calculate velocity
    const velocity = this.calculateVelocity();

    // Calculate acceleration
    const acceleration = this.calculateAcceleration();

    // Determine direction
    const direction = this.determineDirection(velocity, acceleration);

    // Calculate strength
    const strength = Math.abs(velocity) + Math.abs(acceleration) * 0.5;

    // Calculate stability
    const stability = this.calculateStability();

    // Generate predictions
    const prediction = this.generatePredictions(
      velocity,
      acceleration,
      stability
    );

    return {
      direction,
      strength: Math.min(1.0, strength),
      velocity,
      acceleration,
      stability,
      prediction,
    };
  }

  private calculateVelocity(): number {
    const changes = [];
    for (let i = 1; i < this.data.length; i++) {
      changes.push(this.data[i] - this.data[i - 1]);
    }
    return changes.reduce((sum, change) => sum + change, 0) / changes.length;
  }

  private calculateAcceleration(): number {
    const velocities = [];
    for (let i = 1; i < this.data.length; i++) {
      velocities.push(this.data[i] - this.data[i - 1]);
    }

    const velocityChanges = [];
    for (let i = 1; i < velocities.length; i++) {
      velocityChanges.push(velocities[i] - velocities[i - 1]);
    }

    return (
      velocityChanges.reduce((sum, change) => sum + change, 0) /
      velocityChanges.length
    );
  }

  private determineDirection(
    velocity: number,
    acceleration: number
  ): TrendDirection {
    if (Math.abs(velocity) < 0.01) {
      return TrendDirection.STABLE;
    }

    if (velocity > 0) {
      return acceleration > 0
        ? TrendDirection.INCREASING
        : TrendDirection.OSCILLATING;
    } else {
      return acceleration < 0
        ? TrendDirection.DECREASING
        : TrendDirection.OSCILLATING;
    }
  }

  private calculateStability(): number {
    const mean =
      this.data.reduce((sum, val) => sum + val, 0) / this.data.length;
    const variance =
      this.data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      this.data.length;
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  private generatePredictions(
    velocity: number,
    acceleration: number,
    stability: number
  ): TrendPrediction {
    const current = this.data[this.data.length - 1] || 0;
    const timeHorizons = { shortTerm: 2, mediumTerm: 15, longTerm: 60 };

    const predictions = {
      shortTerm:
        current +
        velocity * timeHorizons.shortTerm +
        0.5 * acceleration * Math.pow(timeHorizons.shortTerm, 2),
      mediumTerm:
        current +
        velocity * timeHorizons.mediumTerm +
        0.5 * acceleration * Math.pow(timeHorizons.mediumTerm, 2),
      longTerm:
        current +
        velocity * timeHorizons.longTerm +
        0.5 * acceleration * Math.pow(timeHorizons.longTerm, 2),
    };

    return {
      shortTerm: Math.min(1.0, Math.max(0, predictions.shortTerm)),
      mediumTerm: Math.min(1.0, Math.max(0, predictions.mediumTerm)),
      longTerm: Math.min(1.0, Math.max(0, predictions.longTerm)),
      confidence: Math.max(
        0.6,
        stability * (1 - 0.1 * Math.log(timeHorizons.longTerm))
      ),
    };
  }
}
