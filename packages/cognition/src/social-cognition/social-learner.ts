/**
 * Social Learning System
 *
 * Learns behaviors, strategies, and norms through observation and interaction.
 * Implements observational learning, imitation, and social norm inference.
 *
 * @author @darianrosebrook
 */

import { LLMInterface, LLMContext } from '../cognitive-core/llm-interface';
import { AgentModeler } from './agent-modeler';

// ============================================================================
// Social Learning Core Types
// ============================================================================

export interface ObservedBehavior {
  observerId: string;
  observedAgent: string;
  behaviorSequence: Action[];
  context: SocialContext;
  outcome: BehaviorOutcome;
  successIndicators: SuccessIndicator[];
  learningOpportunity: LearningOpportunity;
  timestamp: number;
}

export interface BehaviorOutcome {
  success: boolean;
  effectiveness: number; // 0-1
  socialReaction: string[];
  unintendedConsequences: string[];
  repeatability: number; // 0-1
  adaptability: number; // 0-1
}

export interface SuccessIndicator {
  type: string;
  description: string;
  confidence: number;
  measurable: boolean;
  timeframe: string;
}

export interface LearningOpportunity {
  type: LearningType;
  difficulty: number;
  relevance: number;
  novelty: number;
  transferability: number;
  prerequisites: string[];
}

export interface LearnedStrategy {
  strategyId: string;
  strategyName: string;
  behaviorPattern: BehaviorPattern;
  successConditions: Condition[];
  applicabilityContexts: Context[];
  confidence: number;
  learningSource: string;
  adaptationHistory: Adaptation[];
  performanceRecord: PerformanceRecord;
}

export interface BehaviorPattern {
  sequence: string[];
  timing: TemporalPattern[];
  conditions: string[];
  variations: Variation[];
  commonMistakes: string[];
  successFactors: string[];
}

export interface TemporalPattern {
  step: number;
  action: string;
  timing: string;
  duration: number;
  synchronization: string[];
}

export interface Variation {
  context: string;
  modifications: string[];
  effectiveness: number;
  usageFrequency: number;
}

export interface StrategyIdentification {
  identifiedStrategies: LearnedStrategy[];
  confidence: number;
  evidence: string[];
  reasoning: string;
  recommendedApplications: string[];
  learningGaps: string[];
}

export interface NormInference {
  detectedNorms: SocialNorm[];
  confidence: number;
  evidence: string[];
  contextSpecificity: string[];
  violationConsequences: string[];
  complianceRewards: string[];
}

export interface SocialNorm {
  normId: string;
  description: string;
  type: NormType;
  strength: number; // 0-1, how strongly enforced
  universality: number; // 0-1, how universal vs. context-specific
  consequences: NormConsequence[];
  variations: NormVariation[];
  learningSource: string;
}

export interface NormConsequence {
  violationType: string;
  consequence: string;
  severity: number;
  frequency: number;
  socialReaction: string[];
}

export interface NormVariation {
  context: string;
  modifications: string[];
  reasoning: string;
  applicability: number;
}

export interface ImitationLearning {
  targetBehavior: string;
  expertAgent: string;
  learnedBehavior: LearnedBehavior;
  imitationAccuracy: number;
  adaptationsMade: string[];
  performanceComparison: PerformanceComparison;
  learningChallenges: string[];
}

export interface LearnedBehavior {
  behaviorId: string;
  description: string;
  steps: LearningStep[];
  conditions: string[];
  expectedOutcomes: string[];
  confidence: number;
  masteryLevel: number;
  transferability: number;
}

export interface LearningStep {
  step: number;
  action: string;
  keyPoints: string[];
  commonErrors: string[];
  successCriteria: string[];
  dependencies: string[];
}

export interface PerformanceComparison {
  expertPerformance: PerformanceMetrics;
  learnerPerformance: PerformanceMetrics;
  improvementAreas: string[];
  strengths: string[];
  recommendations: string[];
}

export interface PerformanceMetrics {
  accuracy: number;
  efficiency: number;
  consistency: number;
  adaptability: number;
  socialAcceptance: number;
}

export interface BehaviorAdaptation {
  originalBehavior: LearnedBehavior;
  adaptedBehavior: LearnedBehavior;
  adaptationReasons: string[];
  contextChanges: string[];
  effectivenessChange: number;
  confidence: number;
}

export enum LearningType {
  OBSERVATIONAL = 'observational',
  IMITATIVE = 'imitative',
  COLLABORATIVE = 'collaborative',
  TRIAL_AND_ERROR = 'trial_and_error',
  INSTRUCTIONAL = 'instructional',
  EXPERIENTIAL = 'experiential',
}

export enum NormType {
  BEHAVIORAL = 'behavioral',
  COMMUNICATION = 'communication',
  RESOURCE_SHARING = 'resource_sharing',
  COOPERATION = 'cooperation',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  SOCIAL_HIERARCHY = 'social_hierarchy',
}

// ============================================================================
// Configuration
// ============================================================================

export interface SocialLearnerConfig {
  enableObservationalLearning: boolean;
  enableImitationLearning: boolean;
  enableNormInference: boolean;
  learningRate: number;
  minimumObservationCount: number;
  confidenceThreshold: number;
  maxStoredBehaviors: number;
  maxStoredNorms: number;
  adaptationSensitivity: number;
}

const DEFAULT_CONFIG: SocialLearnerConfig = {
  enableObservationalLearning: true,
  enableImitationLearning: true,
  enableNormInference: true,
  learningRate: 0.1,
  minimumObservationCount: 3,
  confidenceThreshold: 0.6,
  maxStoredBehaviors: 100,
  maxStoredNorms: 50,
  adaptationSensitivity: 0.2,
};

// ============================================================================
// Social Learning System Implementation
// ============================================================================

export class SocialLearner {
  private llm: LLMInterface;
  private agentModeler: AgentModeler;
  private config: SocialLearnerConfig;
  private observedBehaviors: ObservedBehavior[] = [];
  private learnedStrategies: Map<string, LearnedStrategy> = new Map();
  private detectedNorms: Map<string, SocialNorm> = new Map();
  private learnedBehaviors: Map<string, LearnedBehavior> = new Map();

  constructor(
    llm: LLMInterface,
    agentModeler: AgentModeler,
    config: Partial<SocialLearnerConfig> = {}
  ) {
    this.llm = llm;
    this.agentModeler = agentModeler;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async observeAndLearnBehavior(
    observedBehavior: ObservedBehavior,
    context: LearningContext
  ): Promise<LearningOutcome> {
    if (!this.config.enableObservationalLearning) {
      return this.createEmptyLearningOutcome();
    }

    // Store observation
    this.observedBehaviors.push(observedBehavior);

    // Limit stored behaviors
    if (this.observedBehaviors.length > this.config.maxStoredBehaviors) {
      this.observedBehaviors = this.observedBehaviors.slice(
        -this.config.maxStoredBehaviors
      );
    }

    // Analyze the observed behavior
    const analysis = await this.analyzeBehaviorForLearning(
      observedBehavior,
      context
    );

    // Extract learnable patterns
    const patterns = await this.extractLearnablePatterns(observedBehavior);

    // Store learned patterns if confidence is high enough
    if (analysis.confidence >= this.config.confidenceThreshold) {
      await this.storeLearningFromObservation(
        observedBehavior,
        patterns,
        analysis
      );
    }

    return {
      success: analysis.confidence >= this.config.confidenceThreshold,
      confidence: analysis.confidence,
      learnedPatterns: patterns,
      insights: analysis.insights,
      applicability: analysis.applicability,
      recommendations: analysis.recommendations,
    };
  }

  async identifySuccessfulStrategies(
    strategyObservations: StrategyObservation[]
  ): Promise<StrategyIdentification> {
    if (strategyObservations.length < this.config.minimumObservationCount) {
      return {
        identifiedStrategies: [],
        confidence: 0,
        evidence: [],
        reasoning: 'Insufficient observations for strategy identification',
        recommendedApplications: [],
        learningGaps: ['Need more observations'],
      };
    }

    const context: LLMContext = {
      systemPrompt: `You are analyzing behavioral observations to identify successful strategies that can be learned and applied.`,
      messages: [
        {
          role: 'user',
          content: `Analyze these strategy observations to identify successful patterns: ${JSON.stringify(strategyObservations, null, 2)}

Please identify:
1. Successful strategies that appear consistently
2. Key behavioral patterns that lead to success
3. Conditions where these strategies work best
4. Steps to replicate these strategies
5. Common variations and adaptations
6. Potential applications for these strategies

Focus on strategies with clear success indicators and good repeatability.
Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    };

    try {
      const response = await this.llm.generateResponse(context);
      return this.parseStrategyIdentification(response, strategyObservations);
    } catch (error) {
      console.warn('Failed to identify successful strategies:', error);
      return this.createEmptyStrategyIdentification();
    }
  }

  async inferSocialNorms(
    socialInteractions: SocialInteraction[]
  ): Promise<NormInference> {
    if (!this.config.enableNormInference) {
      return this.createEmptyNormInference();
    }

    if (socialInteractions.length < this.config.minimumObservationCount) {
      return {
        detectedNorms: [],
        confidence: 0,
        evidence: [],
        contextSpecificity: [],
        violationConsequences: [],
        complianceRewards: [],
      };
    }

    const context: LLMContext = {
      systemPrompt: `You are analyzing social interactions to infer implicit social norms and rules.`,
      messages: [
        {
          role: 'user',
          content: `Analyze these social interactions to infer social norms: ${JSON.stringify(socialInteractions, null, 2)}

Please identify:
1. Implicit social rules that govern behavior
2. Behavioral expectations in different contexts
3. Consequences of norm violations
4. Rewards for norm compliance
5. Variations of norms across different contexts
6. Strength and universality of each norm

Look for patterns in:
- What behaviors are consistently rewarded/punished
- What behaviors are avoided or encouraged
- How people react to different behaviors
- Context-specific behavioral expectations

Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    };

    try {
      const response = await this.llm.generateResponse(context);
      const inference = this.parseNormInference(response, socialInteractions);

      // Store detected norms
      inference.detectedNorms.forEach((norm) => {
        this.detectedNorms.set(norm.normId, norm);
      });

      return inference;
    } catch (error) {
      console.warn('Failed to infer social norms:', error);
      return this.createEmptyNormInference();
    }
  }

  async learnThroughImitation(
    targetBehavior: string,
    expertAgent: string
  ): Promise<ImitationLearning> {
    if (!this.config.enableImitationLearning) {
      throw new Error('Imitation learning is disabled');
    }

    const expertModel = this.agentModeler.getAgentModel(expertAgent);
    if (!expertModel) {
      throw new Error(`Expert agent model for ${expertAgent} not found`);
    }

    // Find observations of the expert performing the target behavior
    const relevantObservations = this.observedBehaviors.filter(
      (obs) =>
        obs.observedAgent === expertAgent &&
        obs.behaviorSequence.some((action) =>
          action.description.includes(targetBehavior)
        )
    );

    if (relevantObservations.length === 0) {
      throw new Error(
        `No observations of ${expertAgent} performing ${targetBehavior}`
      );
    }

    const context: LLMContext = {
      systemPrompt: `You are learning a behavior through imitation of an expert. Break down the behavior into learnable steps.`,
      messages: [
        {
          role: 'user',
          content: `Learn the behavior "${targetBehavior}" by imitating expert agent ${expertAgent}.

Expert Agent Profile:
${JSON.stringify(expertModel, null, 2)}

Observed Behaviors:
${JSON.stringify(relevantObservations, null, 2)}

Please provide:
1. Step-by-step breakdown of the behavior
2. Key points to focus on for each step
3. Common errors to avoid
4. Success criteria for each step
5. Dependencies between steps
6. Overall mastery indicators

Make the learning practical and actionable.
Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    };

    try {
      const response = await this.llm.generateResponse(context);
      const imitation = this.parseImitationLearning(
        response,
        targetBehavior,
        expertAgent
      );

      // Store the learned behavior
      this.learnedBehaviors.set(
        imitation.learnedBehavior.behaviorId,
        imitation.learnedBehavior
      );

      return imitation;
    } catch (error) {
      console.warn(
        `Failed to learn through imitation: ${targetBehavior}`,
        error
      );
      return this.createEmptyImitationLearning(targetBehavior, expertAgent);
    }
  }

  async adaptLearnedBehavior(
    learnedBehavior: LearnedBehavior,
    newContext: Context
  ): Promise<BehaviorAdaptation> {
    const context: LLMContext = {
      systemPrompt: `You are adapting a learned behavior to work in a new context. Maintain the core functionality while adjusting for the new environment.`,
      messages: [
        {
          role: 'user',
          content: `Adapt this learned behavior to work in a new context:

Original Behavior:
${JSON.stringify(learnedBehavior, null, 2)}

New Context:
${JSON.stringify(newContext, null, 2)}

Please provide:
1. Necessary adaptations to the behavior steps
2. Reasoning for each adaptation
3. Changes to conditions and expected outcomes
4. Potential effectiveness changes
5. New challenges or considerations
6. Confidence in the adapted behavior

Maintain the core purpose while adapting to the new context.
Respond in JSON format.`,
        },
      ],
      temperature: 0.4,
      maxTokens: 1000,
    };

    try {
      const response = await this.llm.generateResponse(context);
      const adaptation = this.parseBehaviorAdaptation(
        response,
        learnedBehavior,
        newContext
      );

      // Store the adapted behavior if confidence is high
      if (adaptation.confidence >= this.config.confidenceThreshold) {
        this.learnedBehaviors.set(
          adaptation.adaptedBehavior.behaviorId,
          adaptation.adaptedBehavior
        );
      }

      return adaptation;
    } catch (error) {
      console.warn('Failed to adapt learned behavior:', error);
      return this.createEmptyBehaviorAdaptation(learnedBehavior, newContext);
    }
  }

  // ============================================================================
  // Private Analysis Methods
  // ============================================================================

  private async analyzeBehaviorForLearning(
    observedBehavior: ObservedBehavior,
    context: LearningContext
  ): Promise<BehaviorAnalysis> {
    const context_: LLMContext = {
      systemPrompt: `You are analyzing observed behavior to determine its learning value and applicability.`,
      messages: [
        {
          role: 'user',
          content: `Analyze this observed behavior for learning opportunities:

Observed Behavior:
${JSON.stringify(observedBehavior, null, 2)}

Learning Context:
${JSON.stringify(context, null, 2)}

Please assess:
1. Learning value of this behavior (how useful to learn)
2. Difficulty level of learning this behavior
3. Confidence in the analysis
4. Key insights about the behavior
5. Applicability to different contexts
6. Recommendations for learning

Focus on practical learning value and transferability.
Respond in JSON format.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 800,
    };

    try {
      const response = await this.llm.generateResponse(context_);
      return this.parseBehaviorAnalysis(response);
    } catch (error) {
      console.warn('Failed to analyze behavior for learning:', error);
      return this.createEmptyBehaviorAnalysis();
    }
  }

  private async extractLearnablePatterns(
    observedBehavior: ObservedBehavior
  ): Promise<string[]> {
    // Extract patterns from the behavior sequence
    const patterns: string[] = [];

    // Sequence patterns
    if (observedBehavior.behaviorSequence.length > 1) {
      patterns.push(
        `Sequential execution: ${observedBehavior.behaviorSequence.map((a) => a.type).join(' -> ')}`
      );
    }

    // Timing patterns
    const timings = observedBehavior.behaviorSequence.map((a) => a.timestamp);
    if (timings.length > 1) {
      const intervals = timings.slice(1).map((t, i) => t - timings[i]);
      const avgInterval =
        intervals.reduce((sum, interval) => sum + interval, 0) /
        intervals.length;
      patterns.push(`Average interval between actions: ${avgInterval}ms`);
    }

    // Context patterns
    if (observedBehavior.context) {
      patterns.push(
        `Context dependency: ${JSON.stringify(observedBehavior.context)}`
      );
    }

    // Success patterns
    if (observedBehavior.outcome.success) {
      patterns.push(
        `Success pattern: ${observedBehavior.outcome.effectiveness} effectiveness`
      );
    }

    return patterns;
  }

  private async storeLearningFromObservation(
    observedBehavior: ObservedBehavior,
    patterns: string[],
    analysis: BehaviorAnalysis
  ): Promise<void> {
    // Create a learned strategy from the observation
    const strategy: LearnedStrategy = {
      strategyId: `strategy_${Date.now()}`,
      strategyName: `Learned from ${observedBehavior.observedAgent}`,
      behaviorPattern: {
        sequence: observedBehavior.behaviorSequence.map((a) => a.description),
        timing: [],
        conditions: patterns,
        variations: [],
        commonMistakes: [],
        successFactors: analysis.insights,
      },
      successConditions: [
        {
          type: 'effectiveness',
          description: `Effectiveness >= ${observedBehavior.outcome.effectiveness}`,
          confidence: analysis.confidence,
        },
      ],
      applicabilityContexts: [observedBehavior.context],
      confidence: analysis.confidence,
      learningSource: observedBehavior.observedAgent,
      adaptationHistory: [],
      performanceRecord: {
        successRate: observedBehavior.outcome.success ? 1 : 0,
        averageEffectiveness: observedBehavior.outcome.effectiveness,
        usageCount: 1,
        lastUsed: Date.now(),
        improvements: [],
      },
    };

    this.learnedStrategies.set(strategy.strategyId, strategy);
  }

  // ============================================================================
  // Response Parsing Methods
  // ============================================================================

  private parseStrategyIdentification(
    response: string,
    observations: StrategyObservation[]
  ): StrategyIdentification {
    try {
      const parsed = JSON.parse(response);
      return {
        identifiedStrategies: this.parseLearnedStrategies(
          parsed.strategies || []
        ),
        confidence: parsed.confidence || 0.5,
        evidence: parsed.evidence || [],
        reasoning: parsed.reasoning || 'Strategy analysis',
        recommendedApplications: parsed.applications || [],
        learningGaps: parsed.gaps || [],
      };
    } catch (error) {
      console.warn('Failed to parse strategy identification:', error);
      return this.createEmptyStrategyIdentification();
    }
  }

  private parseNormInference(
    response: string,
    interactions: SocialInteraction[]
  ): NormInference {
    try {
      const parsed = JSON.parse(response);
      return {
        detectedNorms: this.parseSocialNorms(parsed.norms || []),
        confidence: parsed.confidence || 0.5,
        evidence: parsed.evidence || [],
        contextSpecificity: parsed.contextSpecificity || [],
        violationConsequences: parsed.violationConsequences || [],
        complianceRewards: parsed.complianceRewards || [],
      };
    } catch (error) {
      console.warn('Failed to parse norm inference:', error);
      return this.createEmptyNormInference();
    }
  }

  private parseImitationLearning(
    response: string,
    targetBehavior: string,
    expertAgent: string
  ): ImitationLearning {
    try {
      const parsed = JSON.parse(response);
      return {
        targetBehavior,
        expertAgent,
        learnedBehavior: this.parseLearnedBehavior(
          parsed.learnedBehavior || {}
        ),
        imitationAccuracy: parsed.accuracy || 0.5,
        adaptationsMade: parsed.adaptations || [],
        performanceComparison: this.parsePerformanceComparison(
          parsed.comparison || {}
        ),
        learningChallenges: parsed.challenges || [],
      };
    } catch (error) {
      console.warn('Failed to parse imitation learning:', error);
      return this.createEmptyImitationLearning(targetBehavior, expertAgent);
    }
  }

  private parseBehaviorAdaptation(
    response: string,
    original: LearnedBehavior,
    context: Context
  ): BehaviorAdaptation {
    try {
      const parsed = JSON.parse(response);
      return {
        originalBehavior: original,
        adaptedBehavior: this.parseLearnedBehavior(
          parsed.adaptedBehavior || {}
        ),
        adaptationReasons: parsed.reasons || [],
        contextChanges: parsed.contextChanges || [],
        effectivenessChange: parsed.effectivenessChange || 0,
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      console.warn('Failed to parse behavior adaptation:', error);
      return this.createEmptyBehaviorAdaptation(original, context);
    }
  }

  private parseBehaviorAnalysis(response: string): BehaviorAnalysis {
    try {
      const parsed = JSON.parse(response);
      return {
        learningValue: parsed.learningValue || 0.5,
        difficulty: parsed.difficulty || 0.5,
        confidence: parsed.confidence || 0.5,
        insights: parsed.insights || [],
        applicability: parsed.applicability || [],
        recommendations: parsed.recommendations || [],
      };
    } catch (error) {
      console.warn('Failed to parse behavior analysis:', error);
      return this.createEmptyBehaviorAnalysis();
    }
  }

  // ============================================================================
  // Sub-parsing Methods
  // ============================================================================

  private parseLearnedStrategies(strategies: any[]): LearnedStrategy[] {
    return strategies.map((strategy, index) => ({
      strategyId: strategy.id || `strategy_${index}`,
      strategyName: strategy.name || 'Unnamed strategy',
      behaviorPattern: this.parseBehaviorPattern(strategy.pattern || {}),
      successConditions: this.parseConditions(strategy.conditions || []),
      applicabilityContexts: strategy.contexts || [],
      confidence: strategy.confidence || 0.5,
      learningSource: strategy.source || 'unknown',
      adaptationHistory: [],
      performanceRecord: this.parsePerformanceRecord(
        strategy.performance || {}
      ),
    }));
  }

  private parseSocialNorms(norms: any[]): SocialNorm[] {
    return norms.map((norm, index) => ({
      normId: norm.id || `norm_${index}`,
      description: norm.description || 'Unnamed norm',
      type: this.parseNormType(norm.type),
      strength: norm.strength || 0.5,
      universality: norm.universality || 0.5,
      consequences: this.parseNormConsequences(norm.consequences || []),
      variations: this.parseNormVariations(norm.variations || []),
      learningSource: norm.source || 'inferred',
    }));
  }

  private parseLearnedBehavior(behavior: any): LearnedBehavior {
    return {
      behaviorId: behavior.id || `behavior_${Date.now()}`,
      description: behavior.description || 'Learned behavior',
      steps: this.parseLearningSteps(behavior.steps || []),
      conditions: behavior.conditions || [],
      expectedOutcomes: behavior.outcomes || [],
      confidence: behavior.confidence || 0.5,
      masteryLevel: behavior.mastery || 0.5,
      transferability: behavior.transferability || 0.5,
    };
  }

  private parseBehaviorPattern(pattern: any): BehaviorPattern {
    return {
      sequence: pattern.sequence || [],
      timing: this.parseTemporalPatterns(pattern.timing || []),
      conditions: pattern.conditions || [],
      variations: this.parseVariations(pattern.variations || []),
      commonMistakes: pattern.mistakes || [],
      successFactors: pattern.successFactors || [],
    };
  }

  private parseConditions(conditions: any[]): Condition[] {
    return conditions.map((condition) => ({
      type: condition.type || 'unknown',
      description: condition.description || condition.toString(),
      confidence: condition.confidence || 0.5,
    }));
  }

  private parsePerformanceRecord(record: any): PerformanceRecord {
    return {
      successRate: record.successRate || 0,
      averageEffectiveness: record.effectiveness || 0,
      usageCount: record.usage || 0,
      lastUsed: record.lastUsed || Date.now(),
      improvements: record.improvements || [],
    };
  }

  private parsePerformanceComparison(comparison: any): PerformanceComparison {
    return {
      expertPerformance: this.parsePerformanceMetrics(comparison.expert || {}),
      learnerPerformance: this.parsePerformanceMetrics(
        comparison.learner || {}
      ),
      improvementAreas: comparison.improvements || [],
      strengths: comparison.strengths || [],
      recommendations: comparison.recommendations || [],
    };
  }

  private parsePerformanceMetrics(metrics: any): PerformanceMetrics {
    return {
      accuracy: metrics.accuracy || 0,
      efficiency: metrics.efficiency || 0,
      consistency: metrics.consistency || 0,
      adaptability: metrics.adaptability || 0,
      socialAcceptance: metrics.socialAcceptance || 0,
    };
  }

  private parseLearningSteps(steps: any[]): LearningStep[] {
    return steps.map((step, index) => ({
      step: index + 1,
      action: step.action || step.toString(),
      keyPoints: step.keyPoints || [],
      commonErrors: step.errors || [],
      successCriteria: step.criteria || [],
      dependencies: step.dependencies || [],
    }));
  }

  private parseTemporalPatterns(patterns: any[]): TemporalPattern[] {
    return patterns.map((pattern, index) => ({
      step: index + 1,
      action: pattern.action || 'action',
      timing: pattern.timing || 'immediate',
      duration: pattern.duration || 0,
      synchronization: pattern.sync || [],
    }));
  }

  private parseVariations(variations: any[]): Variation[] {
    return variations.map((variation) => ({
      context: variation.context || 'general',
      modifications: variation.modifications || [],
      effectiveness: variation.effectiveness || 0.5,
      usageFrequency: variation.frequency || 0,
    }));
  }

  private parseNormConsequences(consequences: any[]): NormConsequence[] {
    return consequences.map((consequence) => ({
      violationType: consequence.type || 'general',
      consequence: consequence.consequence || consequence.toString(),
      severity: consequence.severity || 0.5,
      frequency: consequence.frequency || 0.5,
      socialReaction: consequence.reactions || [],
    }));
  }

  private parseNormVariations(variations: any[]): NormVariation[] {
    return variations.map((variation) => ({
      context: variation.context || 'general',
      modifications: variation.modifications || [],
      reasoning: variation.reasoning || 'contextual adaptation',
      applicability: variation.applicability || 0.5,
    }));
  }

  private parseNormType(type: string): NormType {
    const typeMap = {
      behavioral: NormType.BEHAVIORAL,
      communication: NormType.COMMUNICATION,
      resource: NormType.RESOURCE_SHARING,
      cooperation: NormType.COOPERATION,
      conflict: NormType.CONFLICT_RESOLUTION,
      hierarchy: NormType.SOCIAL_HIERARCHY,
    };

    return typeMap[type?.toLowerCase()] || NormType.BEHAVIORAL;
  }

  // ============================================================================
  // Factory Methods for Empty Objects
  // ============================================================================

  private createEmptyLearningOutcome(): LearningOutcome {
    return {
      success: false,
      confidence: 0,
      learnedPatterns: [],
      insights: [],
      applicability: [],
      recommendations: [],
    };
  }

  private createEmptyStrategyIdentification(): StrategyIdentification {
    return {
      identifiedStrategies: [],
      confidence: 0,
      evidence: [],
      reasoning: 'No analysis performed',
      recommendedApplications: [],
      learningGaps: ['Insufficient data'],
    };
  }

  private createEmptyNormInference(): NormInference {
    return {
      detectedNorms: [],
      confidence: 0,
      evidence: [],
      contextSpecificity: [],
      violationConsequences: [],
      complianceRewards: [],
    };
  }

  private createEmptyImitationLearning(
    targetBehavior: string,
    expertAgent: string
  ): ImitationLearning {
    return {
      targetBehavior,
      expertAgent,
      learnedBehavior: {
        behaviorId: 'empty',
        description: 'No learning performed',
        steps: [],
        conditions: [],
        expectedOutcomes: [],
        confidence: 0,
        masteryLevel: 0,
        transferability: 0,
      },
      imitationAccuracy: 0,
      adaptationsMade: [],
      performanceComparison: {
        expertPerformance: {
          accuracy: 0,
          efficiency: 0,
          consistency: 0,
          adaptability: 0,
          socialAcceptance: 0,
        },
        learnerPerformance: {
          accuracy: 0,
          efficiency: 0,
          consistency: 0,
          adaptability: 0,
          socialAcceptance: 0,
        },
        improvementAreas: [],
        strengths: [],
        recommendations: [],
      },
      learningChallenges: ['No learning performed'],
    };
  }

  private createEmptyBehaviorAdaptation(
    original: LearnedBehavior,
    context: Context
  ): BehaviorAdaptation {
    return {
      originalBehavior: original,
      adaptedBehavior: original,
      adaptationReasons: ['No adaptation performed'],
      contextChanges: [],
      effectivenessChange: 0,
      confidence: 0,
    };
  }

  private createEmptyBehaviorAnalysis(): BehaviorAnalysis {
    return {
      learningValue: 0,
      difficulty: 0,
      confidence: 0,
      insights: [],
      applicability: [],
      recommendations: [],
    };
  }

  // ============================================================================
  // Public Query Methods
  // ============================================================================

  getLearnedStrategies(): LearnedStrategy[] {
    return Array.from(this.learnedStrategies.values());
  }

  getDetectedNorms(): SocialNorm[] {
    return Array.from(this.detectedNorms.values());
  }

  getLearnedBehaviors(): LearnedBehavior[] {
    return Array.from(this.learnedBehaviors.values());
  }

  getObservationHistory(): ObservedBehavior[] {
    return [...this.observedBehaviors];
  }

  getLearnedStrategy(strategyId: string): LearnedStrategy | undefined {
    return this.learnedStrategies.get(strategyId);
  }

  getDetectedNorm(normId: string): SocialNorm | undefined {
    return this.detectedNorms.get(normId);
  }

  getLearnedBehavior(behaviorId: string): LearnedBehavior | undefined {
    return this.learnedBehaviors.get(behaviorId);
  }

  getStats() {
    return {
      totalObservedBehaviors: this.observedBehaviors.length,
      learnedStrategies: this.learnedStrategies.size,
      detectedNorms: this.detectedNorms.size,
      learnedBehaviors: this.learnedBehaviors.size,
      observationalLearningEnabled: this.config.enableObservationalLearning,
      imitationLearningEnabled: this.config.enableImitationLearning,
      normInferenceEnabled: this.config.enableNormInference,
      learningRate: this.config.learningRate,
    };
  }
}

// ============================================================================
// Supporting Interfaces
// ============================================================================

export interface Action {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  outcome?: string;
  parameters?: any;
}

export interface SocialContext {
  situation: string;
  participants: string[];
  environment: any;
  timeContext?: string;
  socialDynamics?: string[];
}

export interface LearningContext {
  goals: string[];
  constraints: string[];
  priorities: string[];
  timeframe: string;
  successCriteria: string[];
}

export interface StrategyObservation {
  strategy: string;
  context: string;
  outcome: string;
  effectiveness: number;
  repeatability: number;
  evidence: string[];
}

export interface SocialInteraction {
  participants: string[];
  type: string;
  description: string;
  outcome: string;
  reactions: string[];
  context: string;
  timestamp: number;
}

export interface LearningOutcome {
  success: boolean;
  confidence: number;
  learnedPatterns: string[];
  insights: string[];
  applicability: string[];
  recommendations: string[];
}

export interface BehaviorAnalysis {
  learningValue: number;
  difficulty: number;
  confidence: number;
  insights: string[];
  applicability: string[];
  recommendations: string[];
}

export interface Condition {
  type: string;
  description: string;
  confidence: number;
}

export interface Context {
  environment: string;
  participants: string[];
  goals: string[];
  constraints: string[];
  timeframe: string;
}

export interface Adaptation {
  reason: string;
  change: string;
  effectiveness: number;
  timestamp: number;
}

export interface PerformanceRecord {
  successRate: number;
  averageEffectiveness: number;
  usageCount: number;
  lastUsed: number;
  improvements: string[];
}
