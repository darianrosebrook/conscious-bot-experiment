/**
 * Relationship Manager
 *
 * Tracks and manages social relationships and bonds over time.
 * Provides capabilities for trust calculation, bond tracking, and relationship quality assessment.
 *
 * @author @darianrosebrook
 */

import { LLMInterface, LLMContext } from '../cognitive-core/llm-interface';
import { AgentModeler } from './agent-modeler';

// ============================================================================
// Relationship Core Types
// ============================================================================

export interface Relationship {
  agentId: string;
  relationshipType: RelationshipType;
  trustLevels: Record<string, number>; // Trust by domain
  emotionalBond: EmotionalBond;
  interactionHistory: Interaction[];
  cooperationHistory: CooperationHistory;
  communicationPatterns: CommunicationPatterns;
  sharedExperiences: SharedExperience[];
  reciprocityBalance: ReciprocityBalance;
  relationshipTrajectory: RelationshipTrajectory;
  lastInteraction: number;
  relationshipHealth: number;
  stability: number;
}

export interface EmotionalBond {
  strength: number; // 0-1
  quality: BondQuality;
  trust: number;
  respect: number;
  affection: number;
  loyalty: number;
  understanding: number;
  compatibility: number;
  bondHistory: BondEvent[];
}

export interface BondEvent {
  event: string;
  impact: number; // -1 to 1
  bondAspect: string;
  timestamp: number;
  context: string;
}

export interface Interaction {
  interactionId: string;
  type: InteractionType;
  description: string;
  outcome: InteractionOutcome;
  emotionalTone: EmotionalTone;
  cooperationLevel: number;
  trustImpact: number;
  reciprocityImpact: number;
  timestamp: number;
  context: string;
}

export interface InteractionOutcome {
  success: boolean;
  satisfaction: number; // 0-1
  goalAchievement: number; // 0-1
  unexpectedResults: string[];
  learnings: string[];
  futureImplications: string[];
}

export interface CooperationHistory {
  cooperativeActions: CooperativeAction[];
  successRate: number;
  averageEffectiveness: number;
  reciprocityScore: number;
  conflictResolutions: ConflictResolution[];
  sharedGoals: SharedGoal[];
}

export interface CooperativeAction {
  actionId: string;
  description: string;
  initiator: string;
  collaborationType: CollaborationType;
  outcome: ActionOutcome;
  resourcesShared: Resource[];
  beneficiaries: string[];
  timestamp: number;
}

export interface ConflictResolution {
  conflictId: string;
  description: string;
  resolutionMethod: string;
  outcome: ResolutionOutcome;
  satisfaction: number;
  learnings: string[];
  preventionStrategies: string[];
  timestamp: number;
}

export interface CommunicationPatterns {
  frequency: number;
  style: CommunicationStyle;
  effectiveness: number;
  topicsDiscussed: string[];
  communicationPreferences: string[];
  misunderstandings: Misunderstanding[];
  positiveExchanges: PositiveExchange[];
}

export interface Misunderstanding {
  description: string;
  cause: string;
  resolution: string;
  impact: number;
  prevention: string;
  timestamp: number;
}

export interface PositiveExchange {
  description: string;
  type: string;
  impact: number;
  strengthenedAspects: string[];
  timestamp: number;
}

export interface SharedExperience {
  experienceId: string;
  description: string;
  type: ExperienceType;
  significance: number;
  emotional_impact: number;
  outcomes: string[];
  memories: string[];
  bondingValue: number;
  timestamp: number;
}

export interface ReciprocityBalance {
  overallBalance: number; // -1 to 1
  giveVsTake: number;
  supportProvided: Support[];
  supportReceived: Support[];
  favorsOwed: Favor[];
  favorsOwedTo: Favor[];
  balanceHistory: BalanceEvent[];
}

export interface Support {
  type: string;
  description: string;
  value: number;
  timestamp: number;
  context: string;
  appreciated: boolean;
}

export interface Favor {
  description: string;
  significance: number;
  urgency: number;
  timestamp: number;
  fulfilled: boolean;
}

export interface BalanceEvent {
  event: string;
  impact: number;
  newBalance: number;
  timestamp: number;
}

export interface RelationshipTrajectory {
  direction: TrajectoryDirection;
  momentum: number;
  predictedPath: string[];
  milestones: Milestone[];
  riskFactors: string[];
  opportunities: string[];
  stability: number;
}

export interface Milestone {
  description: string;
  significance: number;
  achieved: boolean;
  targetDate?: number;
  actualDate?: number;
}

export interface TrustAssessment {
  overallTrust: number;
  domainSpecificTrust: Record<string, number>;
  trustConfidence: number;
  trustFactors: TrustFactor[];
  trustHistory: TrustEvent[];
  riskFactors: string[];
  trustTrajectory: string;
}

export interface TrustFactor {
  factor: string;
  impact: number; // -1 to 1
  confidence: number;
  evidence: string[];
  weight: number;
}

export interface TrustEvent {
  event: string;
  impact: number;
  domain: string;
  confidence: number;
  timestamp: number;
}

export interface RelationshipQuality {
  overallQuality: number;
  healthMetrics: HealthMetric[];
  strengths: string[];
  weaknesses: string[];
  improvementAreas: string[];
  satisfactionLevel: number;
  stability: number;
  growth_potential: number;
}

export interface HealthMetric {
  aspect: string;
  score: number;
  trend: string;
  importance: number;
}

export interface RelationshipUpdate {
  agentId: string;
  updateType: UpdateType;
  changedAspects: string[];
  significance: number;
  newInteractions: Interaction[];
  trustChanges: Record<string, number>;
  bondChanges: Record<string, number>;
  timestamp: number;
}

export enum RelationshipType {
  STRANGER = 'stranger',
  ACQUAINTANCE = 'acquaintance',
  FRIEND = 'friend',
  CLOSE_FRIEND = 'close_friend',
  ALLY = 'ally',
  PARTNER = 'partner',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  RIVAL = 'rival',
  ENEMY = 'enemy',
  NEUTRAL = 'neutral',
}

export enum BondQuality {
  WEAK = 'weak',
  DEVELOPING = 'developing',
  STRONG = 'strong',
  DEEP = 'deep',
  UNBREAKABLE = 'unbreakable',
}

export enum InteractionType {
  CONVERSATION = 'conversation',
  COOPERATION = 'cooperation',
  CONFLICT = 'conflict',
  SUPPORT = 'support',
  SHARING = 'sharing',
  COMPETITION = 'competition',
  LEARNING = 'learning',
  SOCIAL = 'social',
}

export enum CollaborationType {
  RESOURCE_SHARING = 'resource_sharing',
  JOINT_PROJECT = 'joint_project',
  MUTUAL_SUPPORT = 'mutual_support',
  KNOWLEDGE_EXCHANGE = 'knowledge_exchange',
  PROBLEM_SOLVING = 'problem_solving',
}

export enum ExperienceType {
  ACHIEVEMENT = 'achievement',
  CHALLENGE = 'challenge',
  ADVENTURE = 'adventure',
  LEARNING = 'learning',
  CONFLICT = 'conflict',
  CELEBRATION = 'celebration',
  DISCOVERY = 'discovery',
}

export enum TrajectoryDirection {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining',
  UNCERTAIN = 'uncertain',
}

export enum UpdateType {
  NEW_INTERACTION = 'new_interaction',
  TRUST_CHANGE = 'trust_change',
  BOND_CHANGE = 'bond_change',
  TYPE_CHANGE = 'type_change',
  QUALITY_CHANGE = 'quality_change',
}

// ============================================================================
// Configuration
// ============================================================================

export interface RelationshipManagerConfig {
  maxTrackedRelationships: number;
  trustUpdateSensitivity: number;
  relationshipDecayRate: number;
  interactionHistoryLimit: number;
  bondStrengthThreshold: number;
  trustCalculationWindow: number; // hours
  enableEmotionalBonding: boolean;
  enableReciprocityTracking: boolean;
}

const DEFAULT_CONFIG: RelationshipManagerConfig = {
  maxTrackedRelationships: 100,
  trustUpdateSensitivity: 0.05,
  relationshipDecayRate: 0.01,
  interactionHistoryLimit: 1000,
  bondStrengthThreshold: 0.7,
  trustCalculationWindow: 168, // 1 week
  enableEmotionalBonding: true,
  enableReciprocityTracking: true,
};

// ============================================================================
// Relationship Manager Implementation
// ============================================================================

export class RelationshipManager {
  private llm: LLMInterface;
  private agentModeler: AgentModeler;
  private config: RelationshipManagerConfig;
  private relationships: Map<string, Relationship> = new Map();

  constructor(
    llm: LLMInterface,
    agentModeler: AgentModeler,
    config: Partial<RelationshipManagerConfig> = {}
  ) {
    this.llm = llm;
    this.agentModeler = agentModeler;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initializeRelationship(
    agentId: string,
    firstInteraction: Interaction
  ): Promise<Relationship> {
    const agentModel = this.agentModeler.getAgentModel(agentId);

    const relationship: Relationship = {
      agentId,
      relationshipType: RelationshipType.STRANGER,
      trustLevels: { general: 0.5 }, // Neutral starting trust
      emotionalBond: this.initializeEmotionalBond(),
      interactionHistory: [firstInteraction],
      cooperationHistory: this.initializeCooperationHistory(),
      communicationPatterns: this.initializeCommunicationPatterns(),
      sharedExperiences: [],
      reciprocityBalance: this.initializeReciprocityBalance(),
      relationshipTrajectory: this.initializeTrajectory(),
      lastInteraction: firstInteraction.timestamp,
      relationshipHealth: 0.5,
      stability: 0.5,
    };

    // Analyze first interaction for initial relationship characteristics
    await this.analyzeInitialInteraction(relationship, firstInteraction);

    this.relationships.set(agentId, relationship);
    return relationship;
  }

  async updateRelationship(
    agentId: string,
    newInteraction: Interaction
  ): Promise<RelationshipUpdate> {
    const relationship = this.relationships.get(agentId);
    if (!relationship) {
      throw new Error(`Relationship with ${agentId} not found`);
    }

    const changedAspects: string[] = [];
    const previousTrust = { ...relationship.trustLevels };
    const previousBond = {
      strength: relationship.emotionalBond.strength,
      trust: relationship.emotionalBond.trust,
      respect: relationship.emotionalBond.respect,
    };

    // Add interaction to history
    relationship.interactionHistory.push(newInteraction);
    if (
      relationship.interactionHistory.length >
      this.config.interactionHistoryLimit
    ) {
      relationship.interactionHistory = relationship.interactionHistory.slice(
        -this.config.interactionHistoryLimit
      );
    }

    // Update trust based on interaction
    const trustChanges = await this.updateTrustFromInteraction(
      relationship,
      newInteraction
    );
    if (Object.keys(trustChanges).length > 0) {
      changedAspects.push('trust');
    }

    // Update emotional bond
    if (this.config.enableEmotionalBonding) {
      const bondChanges = await this.updateEmotionalBond(
        relationship,
        newInteraction
      );
      if (bondChanges) {
        changedAspects.push('emotionalBond');
      }
    }

    // Update communication patterns
    this.updateCommunicationPatterns(relationship, newInteraction);
    changedAspects.push('communicationPatterns');

    // Update reciprocity balance
    if (this.config.enableReciprocityTracking) {
      this.updateReciprocityBalance(relationship, newInteraction);
      changedAspects.push('reciprocityBalance');
    }

    // Check for relationship type changes
    const newType = await this.assessRelationshipType(relationship);
    if (newType !== relationship.relationshipType) {
      relationship.relationshipType = newType;
      changedAspects.push('relationshipType');
    }

    // Update trajectory
    await this.updateRelationshipTrajectory(relationship);
    changedAspects.push('trajectory');

    // Update overall health and stability
    relationship.relationshipHealth =
      this.calculateRelationshipHealth(relationship);
    relationship.stability = this.calculateStability(relationship);
    relationship.lastInteraction = newInteraction.timestamp;

    const update: RelationshipUpdate = {
      agentId,
      updateType: this.determineUpdateType(changedAspects),
      changedAspects,
      significance: this.calculateUpdateSignificance(
        newInteraction,
        changedAspects
      ),
      newInteractions: [newInteraction],
      trustChanges: this.calculateTrustChanges(
        previousTrust,
        relationship.trustLevels
      ),
      bondChanges: this.calculateBondChanges(
        previousBond,
        relationship.emotionalBond
      ),
      timestamp: Date.now(),
    };

    return update;
  }

  async calculateTrustLevel(
    agentId: string,
    trustDomain: string = 'general'
  ): Promise<TrustAssessment> {
    const relationship = this.relationships.get(agentId);
    if (!relationship) {
      throw new Error(`Relationship with ${agentId} not found`);
    }

    const context: LLMContext = {
      systemPrompt: `You are calculating trust levels based on interaction history and relationship patterns.`,
      messages: [
        {
          role: 'user',
          content: `Calculate trust level for agent ${agentId} in domain "${trustDomain}".

Relationship Information:
${JSON.stringify(relationship, null, 2)}

Please assess:
1. Overall trust level (0.0 to 1.0)
2. Domain-specific trust levels
3. Factors contributing to trust
4. Trust trajectory (improving/stable/declining)
5. Risk factors that might affect trust
6. Confidence in the trust assessment

Base assessment on interaction patterns, cooperation history, and reliability.
Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 800,
    };

    try {
      const response = await this.llm.generateResponse(context);
      return this.parseTrustAssessment(response, agentId, trustDomain);
    } catch (error) {
      console.warn(`Failed to calculate trust for ${agentId}:`, error);
      return this.createEmptyTrustAssessment(agentId, trustDomain);
    }
  }

  async assessRelationshipQuality(
    agentId: string
  ): Promise<RelationshipQuality> {
    const relationship = this.relationships.get(agentId);
    if (!relationship) {
      throw new Error(`Relationship with ${agentId} not found`);
    }

    const context: LLMContext = {
      systemPrompt: `You are assessing the overall quality and health of a relationship.`,
      messages: [
        {
          role: 'user',
          content: `Assess the quality of relationship with agent ${agentId}.

Relationship Information:
${JSON.stringify(relationship, null, 2)}

Please evaluate:
1. Overall relationship quality (0.0 to 1.0)
2. Health metrics for different aspects
3. Relationship strengths
4. Areas for improvement
5. Current satisfaction level
6. Stability and growth potential

Consider trust, communication, cooperation, and emotional bond.
Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 800,
    };

    try {
      const response = await this.llm.generateResponse(context);
      return this.parseRelationshipQuality(response, relationship);
    } catch (error) {
      console.warn(
        `Failed to assess relationship quality for ${agentId}:`,
        error
      );
      return this.createEmptyRelationshipQuality();
    }
  }

  async predictRelationshipTrajectory(
    agentId: string,
    hypotheticalInteractions: Interaction[]
  ): Promise<RelationshipTrajectory> {
    const relationship = this.relationships.get(agentId);
    if (!relationship) {
      throw new Error(`Relationship with ${agentId} not found`);
    }

    const context: LLMContext = {
      systemPrompt: `You are predicting how a relationship might evolve given hypothetical future interactions.`,
      messages: [
        {
          role: 'user',
          content: `Predict relationship trajectory for agent ${agentId} given these hypothetical interactions.

Current Relationship:
${JSON.stringify(relationship, null, 2)}

Hypothetical Interactions:
${JSON.stringify(hypotheticalInteractions, null, 2)}

Please predict:
1. Direction of relationship development
2. Momentum and rate of change
3. Likely future milestones
4. Risk factors and opportunities
5. Overall stability prediction
6. Key factors that would influence the trajectory

Respond in JSON format.`,
        },
      ],
      temperature: 0.4,
      maxTokens: 800,
    };

    try {
      const response = await this.llm.generateResponse(context);
      return this.parseRelationshipTrajectory(response);
    } catch (error) {
      console.warn(
        `Failed to predict relationship trajectory for ${agentId}:`,
        error
      );
      return this.createEmptyTrajectory();
    }
  }

  // ============================================================================
  // Private Update Methods
  // ============================================================================

  private async analyzeInitialInteraction(
    relationship: Relationship,
    interaction: Interaction
  ): Promise<void> {
    // Set initial trust based on interaction outcome
    if (interaction.outcome.success && interaction.trustImpact > 0) {
      relationship.trustLevels.general = Math.min(
        0.7,
        0.5 + interaction.trustImpact
      );
    } else if (interaction.trustImpact < 0) {
      relationship.trustLevels.general = Math.max(
        0.3,
        0.5 + interaction.trustImpact
      );
    }

    // Set initial emotional bond strength
    if (interaction.emotionalTone && interaction.emotionalTone.valence > 0) {
      relationship.emotionalBond.strength = Math.min(
        0.6,
        0.2 + interaction.emotionalTone.intensity
      );
    }

    // Determine initial relationship type
    relationship.relationshipType =
      await this.assessRelationshipType(relationship);
  }

  private async updateTrustFromInteraction(
    relationship: Relationship,
    interaction: Interaction
  ): Promise<Record<string, number>> {
    const changes: Record<string, number> = {};

    // Calculate trust impact
    let trustChange =
      interaction.trustImpact * this.config.trustUpdateSensitivity;

    // Adjust based on interaction outcome
    if (interaction.outcome.success) {
      trustChange *= 1.2; // Successful interactions have more positive impact
    } else {
      trustChange *= 1.5; // Failed interactions have more negative impact
    }

    // Update general trust
    const oldTrust = relationship.trustLevels.general || 0.5;
    const newTrust = Math.max(0, Math.min(1, oldTrust + trustChange));

    if (Math.abs(newTrust - oldTrust) > 0.01) {
      relationship.trustLevels.general = newTrust;
      changes.general = trustChange;
    }

    // Update domain-specific trust if applicable
    if (interaction.type === InteractionType.COOPERATION) {
      const cooperationTrust = relationship.trustLevels.cooperation || 0.5;
      const newCooperationTrust = Math.max(
        0,
        Math.min(1, cooperationTrust + trustChange)
      );
      if (Math.abs(newCooperationTrust - cooperationTrust) > 0.01) {
        relationship.trustLevels.cooperation = newCooperationTrust;
        changes.cooperation = trustChange;
      }
    }

    return changes;
  }

  private async updateEmotionalBond(
    relationship: Relationship,
    interaction: Interaction
  ): Promise<boolean> {
    let changed = false;
    const bond = relationship.emotionalBond;

    // Update based on emotional tone
    if (interaction.emotionalTone) {
      const impact =
        interaction.emotionalTone.intensity *
        interaction.emotionalTone.valence *
        0.1;

      // Update affection
      const newAffection = Math.max(0, Math.min(1, bond.affection + impact));
      if (Math.abs(newAffection - bond.affection) > 0.01) {
        bond.affection = newAffection;
        changed = true;
      }

      // Update understanding based on communication success
      if (
        interaction.type === InteractionType.CONVERSATION &&
        interaction.outcome.success
      ) {
        const understandingIncrease = 0.05 * interaction.outcome.satisfaction;
        bond.understanding = Math.max(
          0,
          Math.min(1, bond.understanding + understandingIncrease)
        );
        changed = true;
      }
    }

    // Update respect based on cooperation
    if (
      interaction.type === InteractionType.COOPERATION &&
      interaction.cooperationLevel > 0.7
    ) {
      const respectIncrease = 0.03 * interaction.cooperationLevel;
      bond.respect = Math.max(0, Math.min(1, bond.respect + respectIncrease));
      changed = true;
    }

    // Update overall bond strength
    if (changed) {
      bond.strength =
        (bond.trust + bond.respect + bond.affection + bond.understanding) / 4;

      // Update bond quality
      if (bond.strength >= 0.9) bond.quality = BondQuality.UNBREAKABLE;
      else if (bond.strength >= 0.7) bond.quality = BondQuality.DEEP;
      else if (bond.strength >= 0.5) bond.quality = BondQuality.STRONG;
      else if (bond.strength >= 0.3) bond.quality = BondQuality.DEVELOPING;
      else bond.quality = BondQuality.WEAK;

      // Record bond event
      bond.bondHistory.push({
        event: interaction.description,
        impact: interaction.emotionalTone?.intensity || 0,
        bondAspect: 'overall',
        timestamp: interaction.timestamp,
        context: interaction.context,
      });
    }

    return changed;
  }

  private updateCommunicationPatterns(
    relationship: Relationship,
    interaction: Interaction
  ): void {
    const patterns = relationship.communicationPatterns;

    // Update frequency (simple count-based for now)
    patterns.frequency += 1;

    // Update effectiveness based on interaction outcome
    if (interaction.type === InteractionType.CONVERSATION) {
      const currentEffectiveness = patterns.effectiveness;
      const newEffectiveness =
        (currentEffectiveness + interaction.outcome.satisfaction) / 2;
      patterns.effectiveness = newEffectiveness;

      // Track misunderstandings
      if (interaction.outcome.satisfaction < 0.5) {
        patterns.misunderstandings.push({
          description: interaction.description,
          cause: 'Communication breakdown',
          resolution: 'Unknown',
          impact: -0.1,
          prevention: 'Better clarification',
          timestamp: interaction.timestamp,
        });
      } else if (interaction.outcome.satisfaction > 0.8) {
        // Track positive exchanges
        patterns.positiveExchanges.push({
          description: interaction.description,
          type: 'effective_communication',
          impact: 0.1,
          strengthenedAspects: ['understanding', 'rapport'],
          timestamp: interaction.timestamp,
        });
      }
    }
  }

  private updateReciprocityBalance(
    relationship: Relationship,
    interaction: Interaction
  ): void {
    const balance = relationship.reciprocityBalance;

    // Simple reciprocity calculation based on cooperation level
    if (interaction.type === InteractionType.COOPERATION) {
      const cooperationImpact = interaction.cooperationLevel - 0.5; // -0.5 to 0.5
      balance.overallBalance = Math.max(
        -1,
        Math.min(1, balance.overallBalance + cooperationImpact * 0.1)
      );

      balance.balanceHistory.push({
        event: interaction.description,
        impact: cooperationImpact * 0.1,
        newBalance: balance.overallBalance,
        timestamp: interaction.timestamp,
      });
    }
  }

  private async assessRelationshipType(
    relationship: Relationship
  ): Promise<RelationshipType> {
    const trustLevel = relationship.trustLevels.general || 0.5;
    const bondStrength = relationship.emotionalBond.strength;
    const interactionCount = relationship.interactionHistory.length;
    const cooperationRate = this.calculateCooperationRate(relationship);

    // Simple rule-based relationship type assessment
    if (trustLevel >= 0.8 && bondStrength >= 0.8 && cooperationRate >= 0.7) {
      return RelationshipType.CLOSE_FRIEND;
    } else if (trustLevel >= 0.7 && bondStrength >= 0.6) {
      return RelationshipType.FRIEND;
    } else if (trustLevel >= 0.8 && cooperationRate >= 0.8) {
      return RelationshipType.ALLY;
    } else if (trustLevel <= 0.3 && bondStrength <= 0.3) {
      return RelationshipType.ENEMY;
    } else if (
      trustLevel >= 0.6 &&
      this.hasTeachingRelationship(relationship)
    ) {
      return RelationshipType.MENTOR; // or MENTEE
    } else if (interactionCount > 3 && trustLevel >= 0.4) {
      return RelationshipType.ACQUAINTANCE;
    } else {
      return RelationshipType.STRANGER;
    }
  }

  private async updateRelationshipTrajectory(
    relationship: Relationship
  ): Promise<void> {
    const trajectory = relationship.relationshipTrajectory;

    // Calculate momentum based on recent interactions
    const recentInteractions = relationship.interactionHistory.slice(-5);
    const positiveInteractions = recentInteractions.filter(
      (i) => i.outcome.success && i.trustImpact > 0
    ).length;
    const negativeInteractions = recentInteractions.filter(
      (i) => !i.outcome.success || i.trustImpact < 0
    ).length;

    if (positiveInteractions > negativeInteractions) {
      trajectory.direction = TrajectoryDirection.IMPROVING;
      trajectory.momentum =
        (positiveInteractions - negativeInteractions) /
        recentInteractions.length;
    } else if (negativeInteractions > positiveInteractions) {
      trajectory.direction = TrajectoryDirection.DECLINING;
      trajectory.momentum =
        (negativeInteractions - positiveInteractions) /
        recentInteractions.length;
    } else {
      trajectory.direction = TrajectoryDirection.STABLE;
      trajectory.momentum = 0;
    }

    // Update stability
    const trustVariance = this.calculateTrustVariance(relationship);
    trajectory.stability = Math.max(0, 1 - trustVariance);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculateCooperationRate(relationship: Relationship): number {
    const cooperativeInteractions = relationship.interactionHistory.filter(
      (i) => i.type === InteractionType.COOPERATION && i.cooperationLevel > 0.5
    ).length;

    return (
      cooperativeInteractions /
      Math.max(relationship.interactionHistory.length, 1)
    );
  }

  private hasTeachingRelationship(relationship: Relationship): boolean {
    return relationship.interactionHistory.some(
      (i) =>
        i.type === InteractionType.LEARNING ||
        i.description.includes('teach') ||
        i.description.includes('learn')
    );
  }

  private calculateTrustVariance(relationship: Relationship): number {
    if (relationship.interactionHistory.length < 2) return 0;

    const trustImpacts = relationship.interactionHistory.map(
      (i) => i.trustImpact
    );
    const mean =
      trustImpacts.reduce((sum, impact) => sum + impact, 0) /
      trustImpacts.length;
    const variance =
      trustImpacts.reduce(
        (sum, impact) => sum + Math.pow(impact - mean, 2),
        0
      ) / trustImpacts.length;

    return Math.sqrt(variance);
  }

  private calculateRelationshipHealth(relationship: Relationship): number {
    const trustScore = relationship.trustLevels.general || 0.5;
    const bondScore = relationship.emotionalBond.strength;
    const communicationScore = relationship.communicationPatterns.effectiveness;
    const cooperationScore = this.calculateCooperationRate(relationship);

    return (trustScore + bondScore + communicationScore + cooperationScore) / 4;
  }

  private calculateStability(relationship: Relationship): number {
    return 1 - this.calculateTrustVariance(relationship);
  }

  private determineUpdateType(changedAspects: string[]): UpdateType {
    if (changedAspects.includes('relationshipType'))
      return UpdateType.TYPE_CHANGE;
    if (changedAspects.includes('trust')) return UpdateType.TRUST_CHANGE;
    if (changedAspects.includes('emotionalBond')) return UpdateType.BOND_CHANGE;
    return UpdateType.NEW_INTERACTION;
  }

  private calculateUpdateSignificance(
    interaction: Interaction,
    changedAspects: string[]
  ): number {
    let significance = 0.5; // Base significance

    // Increase significance for major interactions
    if (interaction.type === InteractionType.CONFLICT) significance += 0.3;
    if (
      interaction.type === InteractionType.COOPERATION &&
      interaction.cooperationLevel > 0.8
    )
      significance += 0.2;
    if (Math.abs(interaction.trustImpact) > 0.2) significance += 0.2;

    // Increase significance for major changes
    if (changedAspects.includes('relationshipType')) significance += 0.4;

    return Math.min(1, significance);
  }

  private calculateTrustChanges(
    previous: Record<string, number>,
    current: Record<string, number>
  ): Record<string, number> {
    const changes: Record<string, number> = {};

    Object.keys(current).forEach((domain) => {
      const oldValue = previous[domain] || 0.5;
      const newValue = current[domain];
      const change = newValue - oldValue;

      if (Math.abs(change) > 0.01) {
        changes[domain] = change;
      }
    });

    return changes;
  }

  private calculateBondChanges(
    previous: any,
    current: EmotionalBond
  ): Record<string, number> {
    const changes: Record<string, number> = {};

    const aspects = [
      'strength',
      'trust',
      'respect',
      'affection',
      'understanding',
    ];
    aspects.forEach((aspect) => {
      const oldValue = previous[aspect] || 0.5;
      const newValue = (current as any)[aspect];
      const change = newValue - oldValue;

      if (Math.abs(change) > 0.01) {
        changes[aspect] = change;
      }
    });

    return changes;
  }

  // ============================================================================
  // Initialization Methods
  // ============================================================================

  private initializeEmotionalBond(): EmotionalBond {
    return {
      strength: 0.2,
      quality: BondQuality.WEAK,
      trust: 0.5,
      respect: 0.5,
      affection: 0.3,
      loyalty: 0.3,
      understanding: 0.3,
      compatibility: 0.5,
      bondHistory: [],
    };
  }

  private initializeCooperationHistory(): CooperationHistory {
    return {
      cooperativeActions: [],
      successRate: 0,
      averageEffectiveness: 0,
      reciprocityScore: 0,
      conflictResolutions: [],
      sharedGoals: [],
    };
  }

  private initializeCommunicationPatterns(): CommunicationPatterns {
    return {
      frequency: 0,
      style: CommunicationStyle.NEUTRAL,
      effectiveness: 0.5,
      topicsDiscussed: [],
      communicationPreferences: [],
      misunderstandings: [],
      positiveExchanges: [],
    };
  }

  private initializeReciprocityBalance(): ReciprocityBalance {
    return {
      overallBalance: 0,
      giveVsTake: 0,
      supportProvided: [],
      supportReceived: [],
      favorsOwed: [],
      favorsOwedTo: [],
      balanceHistory: [],
    };
  }

  private initializeTrajectory(): RelationshipTrajectory {
    return {
      direction: TrajectoryDirection.UNCERTAIN,
      momentum: 0,
      predictedPath: [],
      milestones: [],
      riskFactors: [],
      opportunities: [],
      stability: 0.5,
    };
  }

  // ============================================================================
  // Response Parsing Methods
  // ============================================================================

  private parseTrustAssessment(
    response: string,
    agentId: string,
    domain: string
  ): TrustAssessment {
    try {
      const parsed = JSON.parse(response);
      return {
        overallTrust: parsed.overallTrust || 0.5,
        domainSpecificTrust: parsed.domainTrust || { [domain]: 0.5 },
        trustConfidence: parsed.confidence || 0.5,
        trustFactors: this.parseTrustFactors(parsed.factors || []),
        trustHistory: this.parseTrustHistory(parsed.history || []),
        riskFactors: parsed.riskFactors || [],
        trustTrajectory: parsed.trajectory || 'stable',
      };
    } catch (error) {
      console.warn('Failed to parse trust assessment:', error);
      return this.createEmptyTrustAssessment(agentId, domain);
    }
  }

  private parseRelationshipQuality(
    response: string,
    relationship: Relationship
  ): RelationshipQuality {
    try {
      const parsed = JSON.parse(response);
      return {
        overallQuality: parsed.quality || 0.5,
        healthMetrics: this.parseHealthMetrics(parsed.healthMetrics || []),
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        improvementAreas: parsed.improvements || [],
        satisfactionLevel: parsed.satisfaction || 0.5,
        stability: parsed.stability || 0.5,
        growth_potential: parsed.growthPotential || 0.5,
      };
    } catch (error) {
      console.warn('Failed to parse relationship quality:', error);
      return this.createEmptyRelationshipQuality();
    }
  }

  private parseRelationshipTrajectory(
    response: string
  ): RelationshipTrajectory {
    try {
      const parsed = JSON.parse(response);
      return {
        direction: this.parseTrajectoryDirection(parsed.direction),
        momentum: parsed.momentum || 0,
        predictedPath: parsed.path || [],
        milestones: this.parseMilestones(parsed.milestones || []),
        riskFactors: parsed.riskFactors || [],
        opportunities: parsed.opportunities || [],
        stability: parsed.stability || 0.5,
      };
    } catch (error) {
      console.warn('Failed to parse relationship trajectory:', error);
      return this.createEmptyTrajectory();
    }
  }

  // ============================================================================
  // Sub-parsing Methods
  // ============================================================================

  private parseTrustFactors(factors: any[]): TrustFactor[] {
    return factors.map((factor) => ({
      factor: factor.factor || factor.toString(),
      impact: factor.impact || 0,
      confidence: factor.confidence || 0.5,
      evidence: factor.evidence || [],
      weight: factor.weight || 0.5,
    }));
  }

  private parseTrustHistory(history: any[]): TrustEvent[] {
    return history.map((event) => ({
      event: event.event || event.toString(),
      impact: event.impact || 0,
      domain: event.domain || 'general',
      confidence: event.confidence || 0.5,
      timestamp: event.timestamp || Date.now(),
    }));
  }

  private parseHealthMetrics(metrics: any[]): HealthMetric[] {
    return metrics.map((metric) => ({
      aspect: metric.aspect || 'unknown',
      score: metric.score || 0.5,
      trend: metric.trend || 'stable',
      importance: metric.importance || 0.5,
    }));
  }

  private parseMilestones(milestones: any[]): Milestone[] {
    return milestones.map((milestone) => ({
      description: milestone.description || milestone.toString(),
      significance: milestone.significance || 0.5,
      achieved: milestone.achieved || false,
      targetDate: milestone.targetDate,
      actualDate: milestone.actualDate,
    }));
  }

  private parseTrajectoryDirection(direction: string): TrajectoryDirection {
    const directionMap = {
      improving: TrajectoryDirection.IMPROVING,
      stable: TrajectoryDirection.STABLE,
      declining: TrajectoryDirection.DECLINING,
      uncertain: TrajectoryDirection.UNCERTAIN,
    };

    return (
      directionMap[direction?.toLowerCase()] || TrajectoryDirection.UNCERTAIN
    );
  }

  // ============================================================================
  // Factory Methods for Empty Objects
  // ============================================================================

  private createEmptyTrustAssessment(
    agentId: string,
    domain: string
  ): TrustAssessment {
    return {
      overallTrust: 0.5,
      domainSpecificTrust: { [domain]: 0.5 },
      trustConfidence: 0,
      trustFactors: [],
      trustHistory: [],
      riskFactors: ['No assessment available'],
      trustTrajectory: 'unknown',
    };
  }

  private createEmptyRelationshipQuality(): RelationshipQuality {
    return {
      overallQuality: 0.5,
      healthMetrics: [],
      strengths: [],
      weaknesses: ['No assessment available'],
      improvementAreas: [],
      satisfactionLevel: 0.5,
      stability: 0.5,
      growth_potential: 0.5,
    };
  }

  private createEmptyTrajectory(): RelationshipTrajectory {
    return {
      direction: TrajectoryDirection.UNCERTAIN,
      momentum: 0,
      predictedPath: [],
      milestones: [],
      riskFactors: ['No prediction available'],
      opportunities: [],
      stability: 0.5,
    };
  }

  // ============================================================================
  // Public Query Methods
  // ============================================================================

  getRelationship(agentId: string): Relationship | undefined {
    return this.relationships.get(agentId);
  }

  getAllRelationships(): Relationship[] {
    return Array.from(this.relationships.values());
  }

  getRelationshipsByType(type: RelationshipType): Relationship[] {
    return Array.from(this.relationships.values()).filter(
      (rel) => rel.relationshipType === type
    );
  }

  getStrongestRelationships(limit: number = 5): Relationship[] {
    return Array.from(this.relationships.values())
      .sort((a, b) => b.emotionalBond.strength - a.emotionalBond.strength)
      .slice(0, limit);
  }

  getMostTrustedAgents(limit: number = 5): Relationship[] {
    return Array.from(this.relationships.values())
      .sort(
        (a, b) => (b.trustLevels.general || 0) - (a.trustLevels.general || 0)
      )
      .slice(0, limit);
  }

  getStats() {
    const relationships = Array.from(this.relationships.values());

    return {
      totalRelationships: relationships.length,
      relationshipTypes: this.getRelationshipTypeDistribution(),
      averageTrust: this.getAverageTrust(),
      averageBondStrength: this.getAverageBondStrength(),
      averageRelationshipHealth: this.getAverageRelationshipHealth(),
      totalInteractions: relationships.reduce(
        (sum, rel) => sum + rel.interactionHistory.length,
        0
      ),
    };
  }

  private getRelationshipTypeDistribution(): Record<RelationshipType, number> {
    const distribution = {} as Record<RelationshipType, number>;

    Object.values(RelationshipType).forEach((type) => {
      distribution[type] = 0;
    });

    this.relationships.forEach((rel) => {
      distribution[rel.relationshipType]++;
    });

    return distribution;
  }

  private getAverageTrust(): number {
    const relationships = Array.from(this.relationships.values());
    if (relationships.length === 0) return 0;

    const sum = relationships.reduce(
      (sum, rel) => sum + (rel.trustLevels.general || 0.5),
      0
    );
    return sum / relationships.length;
  }

  private getAverageBondStrength(): number {
    const relationships = Array.from(this.relationships.values());
    if (relationships.length === 0) return 0;

    const sum = relationships.reduce(
      (sum, rel) => sum + rel.emotionalBond.strength,
      0
    );
    return sum / relationships.length;
  }

  private getAverageRelationshipHealth(): number {
    const relationships = Array.from(this.relationships.values());
    if (relationships.length === 0) return 0;

    const sum = relationships.reduce(
      (sum, rel) => sum + rel.relationshipHealth,
      0
    );
    return sum / relationships.length;
  }
}

// ============================================================================
// Supporting Interfaces
// ============================================================================

export interface EmotionalTone {
  valence: number; // -1 to 1 (negative to positive)
  intensity: number; // 0 to 1
  dominantEmotion: string;
  secondaryEmotions: string[];
}

export interface ActionOutcome {
  success: boolean;
  effectiveness: number;
  unintendedConsequences: string[];
  learnings: string[];
}

export interface ResolutionOutcome {
  resolved: boolean;
  satisfaction: number;
  durability: number;
  learnings: string[];
}

export interface SharedGoal {
  description: string;
  progress: number;
  participants: string[];
  deadline?: number;
}

export interface Resource {
  type: string;
  amount: number;
  value: number;
}

export enum CommunicationStyle {
  FORMAL = 'formal',
  CASUAL = 'casual',
  FRIENDLY = 'friendly',
  PROFESSIONAL = 'professional',
  NEUTRAL = 'neutral',
}
