/**
 * Social Cognition Types
 *
 * Common type definitions for the social cognition module.
 * Includes types for agent modeling, theory of mind, social learning, and relationship management.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// Re-export main types from component modules
export * from './agent-modeler';
export * from './social-learner';
export * from './relationship-manager';

// ============================================================================
// Core Social Cognition Types
// ============================================================================

export interface SocialCognitionState {
  trackedAgents: string[];
  activeRelationships: string[];
  learnedBehaviors: string[];
  detectedNorms: string[];
  mentalStateInferences: string[];
  lastUpdate: number;
}

export interface SocialEvent {
  eventId: string;
  type: SocialEventType;
  participants: string[];
  description: string;
  context: SocialEventContext;
  significance: number;
  timestamp: number;
  outcomes: string[];
}

export interface SocialContext {
  location?: string;
  participants?: string[];
  setting?: string;
  mood?: string;
  purpose?: string;
  dynamics?: string[];
}

export interface SocialEventContext {
  location: string;
  timeOfDay: string;
  socialSetting: string;
  witnesses: string[];
  precedingEvents: string[];
  environmentalFactors: string[];
}

export interface SocialGoal {
  goalId: string;
  description: string;
  type: SocialGoalType;
  targetAgents: string[];
  priority: number;
  progress: number;
  strategy: string[];
  obstacles: string[];
  deadline?: number;
  success_criteria: string[];
}

export interface SocialMemory {
  memoryId: string;
  type: SocialMemoryType;
  content: string;
  participants: string[];
  emotionalSalience: number;
  accuracy: number;
  lastAccessed: number;
  relatedMemories: string[];
  context: SocialEventContext;
}

export interface SocialInference {
  inferenceId: string;
  type: SocialInferenceType;
  targetAgent: string;
  inference: string;
  confidence: number;
  evidence: string[];
  reasoning: string;
  timestamp: number;
  validityPeriod: number;
}

export interface SocialAction {
  actionId: string;
  type: SocialActionType;
  description: string;
  targetAgents: string[];
  intent: string;
  expectedOutcome: string;
  actualOutcome?: string;
  socialConsequences: string[];
  timestamp: number;
}

export interface SocialFeedback {
  feedbackId: string;
  source: string;
  type: SocialFeedbackType;
  content: string;
  valence: number; // -1 to 1
  intensity: number; // 0 to 1
  credibility: number;
  actionabilityScore: number;
  timestamp: number;
}

// ============================================================================
// Enums
// ============================================================================

export enum SocialEventType {
  FIRST_MEETING = 'first_meeting',
  CONVERSATION = 'conversation',
  COOPERATION = 'cooperation',
  CONFLICT = 'conflict',
  CELEBRATION = 'celebration',
  COMPETITION = 'competition',
  TEACHING = 'teaching',
  LEARNING = 'learning',
  SHARING = 'sharing',
  HELPING = 'helping',
  NEGOTIATION = 'negotiation',
  GROUP_FORMATION = 'group_formation',
  ALLIANCE_BUILDING = 'alliance_building',
  NORM_ESTABLISHMENT = 'norm_establishment',
  NORM_VIOLATION = 'norm_violation',
}

export enum SocialGoalType {
  BUILD_RELATIONSHIP = 'build_relationship',
  IMPROVE_TRUST = 'improve_trust',
  LEARN_SKILL = 'learn_skill',
  TEACH_SKILL = 'teach_skill',
  RESOLVE_CONFLICT = 'resolve_conflict',
  FORM_ALLIANCE = 'form_alliance',
  GAIN_INFLUENCE = 'gain_influence',
  REPUTATION_MANAGEMENT = 'reputation_management',
  NORM_COMPLIANCE = 'norm_compliance',
  SOCIAL_INTEGRATION = 'social_integration',
}

export enum SocialMemoryType {
  INTERACTION_MEMORY = 'interaction_memory',
  RELATIONSHIP_MEMORY = 'relationship_memory',
  NORM_MEMORY = 'norm_memory',
  SKILL_MEMORY = 'skill_memory',
  EMOTIONAL_MEMORY = 'emotional_memory',
  REPUTATION_MEMORY = 'reputation_memory',
  GROUP_MEMORY = 'group_memory',
  CONFLICT_MEMORY = 'conflict_memory',
}

export enum SocialInferenceType {
  PERSONALITY_INFERENCE = 'personality_inference',
  INTENTION_INFERENCE = 'intention_inference',
  BELIEF_INFERENCE = 'belief_inference',
  EMOTION_INFERENCE = 'emotion_inference',
  CAPABILITY_INFERENCE = 'capability_inference',
  RELATIONSHIP_INFERENCE = 'relationship_inference',
  NORM_INFERENCE = 'norm_inference',
  STATUS_INFERENCE = 'status_inference',
}

export enum SocialActionType {
  COMMUNICATE = 'communicate',
  COOPERATE = 'cooperate',
  COMPETE = 'compete',
  SUPPORT = 'support',
  CHALLENGE = 'challenge',
  TEACH = 'teach',
  LEARN = 'learn',
  NEGOTIATE = 'negotiate',
  MEDIATE = 'mediate',
  INFLUENCE = 'influence',
  CONFORM = 'conform',
  LEAD = 'lead',
  FOLLOW = 'follow',
}

export enum SocialFeedbackType {
  PERFORMANCE_FEEDBACK = 'performance_feedback',
  BEHAVIORAL_FEEDBACK = 'behavioral_feedback',
  SOCIAL_APPROVAL = 'social_approval',
  SOCIAL_DISAPPROVAL = 'social_disapproval',
  RELATIONSHIP_FEEDBACK = 'relationship_feedback',
  NORM_FEEDBACK = 'norm_feedback',
  SKILL_FEEDBACK = 'skill_feedback',
  REPUTATION_FEEDBACK = 'reputation_feedback',
}

// ============================================================================
// Agent Modeling Extended Types
// ============================================================================

export interface AgentModel {
  agentId: string;
  name?: string;
  description?: string;
  capabilities: CapabilityAssessment;
  personality: PersonalityAssessment;
  behaviors: BehavioralPattern[];
  relationships: string[];
  trustScore: number;
  reputation: number;
  lastSeen: number;
  confidence: number;
  observations: Observation[];
  beliefs: string[];
  goals: string[];
  emotions: string[];
  history: string[];
  predictions: string[];
  intentions: string[];
  context: string;
  timestamp: number;
  source: string;
  lastUpdated: number;
  lastInteraction: number;
  lastObservation: number;
  lastPrediction: number;
  lastIntention: number;
  lastBehavior: number;
  // Additional properties used in theory of mind
  inferredPersonality?: any;
  goalInferences?: any;
  beliefStates?: any;
  behavioralPatterns?: any;
  socialRole?: any;
  relationshipStatus?: any;
}

export interface Entity {
  id: string;
  type: string;
  name?: string;
  properties: Record<string, any>;
  lastObserved: number;
  confidence: number;
}

export interface Observation {
  id: string;
  agentId: string;
  type: string;
  description: string;
  context: SocialContext;
  timestamp: number;
  reliability: number;
  confidence: number;
  metadata: Record<string, any>;
}

export interface Action {
  id: string;
  type: string;
  description: string;
  parameters: Record<string, any>;
  timestamp: number;
  outcome?: string;
  success?: boolean;
}

export interface CapabilityInference {
  domain: string;
  capability: string;
  confidence: number;
  evidence: string[];
  implications: string[];
}

export interface PersonalityInference {
  trait: string;
  strength: number;
  confidence: number;
  evidence: string[];
  manifestations: string[];
}

export interface BehavioralPattern {
  id: string;
  pattern: string;
  frequency: number;
  contexts: string[];
  triggers: string[];
  confidence: number;
}

export interface ModelUpdate {
  agentId: string;
  updateType?: string;
  changes: string[];
  confidence: number;
  timestamp: number;
  newObservations?: number;
  updated?: boolean;
  reason?: string;
}

export interface AgentInteraction {
  id: string;
  participants: string[];
  type: string;
  description: string;
  outcome: string;
  timestamp: number;
  context: SocialContext;
}

export interface Intention {
  id: string;
  type: string;
  description: string;
  confidence: number;
  timeframe: string;
  prerequisites: string[];
}

export interface AgentModelingResult {
  agentModel: AgentModel;
  confidence: number;
  gaps: string[];
  recommendations: string[];
  nextSteps: string[];
}

export interface PersonalityAssessment {
  traits: PersonalityTrait[];
  confidence: number;
  evidence: Evidence[];
  stability: number;
  consistency: number;
  development_areas: string[];
}

export interface PersonalityTrait {
  name: string;
  strength: number; // 0-1
  confidence: number;
  manifestations: string[];
  opposing_traits: string[];
  contextual_variations: string[];
}

export interface Evidence {
  description: string;
  strength: number;
  source: string;
  timestamp: number;
  reliability: number;
}

export interface CapabilityAssessment {
  domains: CapabilityDomain[];
  overallCapability: number;
  learningRate: number;
  adaptability: number;
  transferability: number;
  growth_potential: number;
}

export interface CapabilityDomain {
  name: string;
  level: number; // 0-1
  confidence: number;
  evidence: Evidence[];
  subskills: Subskill[];
  benchmarks: Benchmark[];
}

export interface Subskill {
  name: string;
  level: number;
  importance: number;
  development_stage: string;
}

export interface Benchmark {
  description: string;
  achieved: boolean;
  difficulty: number;
  evidence: string[];
}

// ============================================================================
// Theory of Mind Extended Types
// ============================================================================

export interface MentalModel {
  agentId: string;
  beliefs: BeliefModel[];
  goals: GoalModel[];
  emotions: EmotionModel[];
  knowledge: KnowledgeModel;
  personality: PersonalityModel;
  socialAwareness: SocialAwarenessModel;
  confidence: number;
  lastUpdated: number;
}

export interface BeliefModel {
  belief: string;
  confidence: number;
  accuracy: boolean | null;
  source: BeliefSource;
  importance: number;
  stability: number;
  conflicts: string[];
}

export interface GoalModel {
  goal: string;
  priority: number;
  urgency: number;
  progress: number;
  obstacles: string[];
  strategies: string[];
  dependencies: string[];
  timeline: string;
}

export interface EmotionModel {
  emotion: string;
  intensity: number;
  duration: number;
  triggers: string[];
  regulation_strategies: string[];
  impact_on_behavior: string[];
  social_expression: string;
}

export interface KnowledgeModel {
  domains: KnowledgeDomain[];
  expertise_areas: string[];
  learning_preferences: string[];
  knowledge_gaps: string[];
  misinformation: string[];
  confidence_calibration: number;
}

export interface KnowledgeDomain {
  domain: string;
  level: number;
  confidence: number;
  key_concepts: string[];
  misconceptions: string[];
  information_sources: string[];
}

export interface PersonalityModel {
  traits: PersonalityTrait[];
  values: Value[];
  motivations: string[];
  behavioral_patterns: string[];
  decision_making_style: string;
  social_style: string;
}

export interface Value {
  name: string;
  importance: number;
  manifestations: string[];
  conflicts: string[];
  development: string;
}

export interface SocialAwarenessModel {
  social_intelligence: number;
  empathy_level: number;
  perspective_taking_ability: number;
  social_norm_awareness: number;
  relationship_awareness: RelationshipAwareness[];
  group_dynamics_understanding: number;
}

export interface RelationshipAwareness {
  otherAgent: string;
  perceivedRelationship: string;
  understanding_accuracy: number;
  mutual_awareness: boolean;
  relationship_goals: string[];
}

export enum BeliefSource {
  DIRECT_OBSERVATION = 'direct_observation',
  INFERENCE = 'inference',
  COMMUNICATION = 'communication',
  ASSUMPTION = 'assumption',
  SOCIAL_LEARNING = 'social_learning',
  EXPERT_TESTIMONY = 'expert_testimony',
  EXPERIENCE = 'experience',
}

// ============================================================================
// Social Learning Extended Types
// ============================================================================

export interface SocialLearningOutcome {
  learningType: LearningType;
  learnedContent: LearnedContent;
  effectiveness: number;
  transferability: number;
  retention: number;
  application_examples: string[];
  improvement_areas: string[];
}

export interface LearnedContent {
  contentId: string;
  type: ContentType;
  description: string;
  source: string;
  confidence: number;
  mastery_level: number;
  prerequisites: string[];
  applications: string[];
  variations: string[];
}

export interface LearningStrategy {
  strategyId: string;
  name: string;
  description: string;
  effectiveness: number;
  applicability: string[];
  requirements: string[];
  steps: LearningStep[];
  success_indicators: string[];
  common_pitfalls: string[];
}

export interface LearningStep {
  step: number;
  description: string;
  duration: string;
  difficulty: number;
  success_criteria: string[];
  common_errors: string[];
  tips: string[];
}

export interface SocialNormModel {
  normId: string;
  description: string;
  strength: number; // How strongly enforced
  scope: NormScope;
  violationConsequences: Consequence[];
  complianceRewards: Reward[];
  contextualVariations: ContextualVariation[];
  evolution: NormEvolution;
}

export interface Consequence {
  type: string;
  severity: number;
  probability: number;
  description: string;
  enforcement_agent: string;
  social_impact: number;
}

export interface Reward {
  type: string;
  value: number;
  probability: number;
  description: string;
  source: string;
  social_recognition: number;
}

export interface ContextualVariation {
  context: string;
  modification: string;
  strength_modifier: number;
  applicability: number;
  examples: string[];
}

export interface NormEvolution {
  origin: string;
  development_stage: string;
  stability: number;
  change_drivers: string[];
  future_predictions: string[];
}

export enum LearningType {
  OBSERVATIONAL = 'observational',
  IMITATIVE = 'imitative',
  COLLABORATIVE = 'collaborative',
  TRIAL_ERROR = 'trial_error',
  INSTRUCTIONAL = 'instructional',
  EXPERIENTIAL = 'experiential',
  SOCIAL_MODELING = 'social_modeling',
  PEER_LEARNING = 'peer_learning',
}

export enum ContentType {
  SKILL = 'skill',
  KNOWLEDGE = 'knowledge',
  STRATEGY = 'strategy',
  NORM = 'norm',
  PATTERN = 'pattern',
  BEHAVIOR = 'behavior',
  ATTITUDE = 'attitude',
  VALUE = 'value',
}

export enum NormScope {
  UNIVERSAL = 'universal',
  CULTURAL = 'cultural',
  GROUP_SPECIFIC = 'group_specific',
  SITUATIONAL = 'situational',
  CONTEXTUAL = 'contextual',
  PERSONAL = 'personal',
}

// ============================================================================
// Relationship Management Extended Types
// ============================================================================

export interface RelationshipDynamics {
  powerBalance: PowerBalance;
  influencePatterns: InfluencePattern[];
  dependencyRelations: Dependency[];
  conflictTendencies: ConflictTendency[];
  cooperationPotential: number;
  growth_trajectory: string;
}

export interface PowerBalance {
  overall_balance: number; // -1 to 1
  power_sources: PowerSource[];
  power_dynamics: string[];
  balance_stability: number;
  change_drivers: string[];
}

export interface PowerSource {
  type: string;
  strength: number;
  legitimacy: number;
  scope: string[];
  sustainability: number;
}

export interface InfluencePattern {
  type: InfluenceType;
  effectiveness: number;
  frequency: number;
  contexts: string[];
  resistance_factors: string[];
  enhancement_factors: string[];
}

export interface Dependency {
  type: string;
  strength: number;
  symmetry: number; // How mutual the dependency is
  criticality: number;
  alternatives: string[];
  vulnerability: number;
}

export interface ConflictTendency {
  trigger: string;
  probability: number;
  intensity: number;
  duration: string;
  resolution_patterns: string[];
  prevention_strategies: string[];
}

export interface RelationshipMetrics {
  satisfaction: number;
  stability: number;
  growth: number;
  trust: number;
  communication: number;
  cooperation: number;
  mutual_benefit: number;
  longevity_prediction: number;
}

export interface RelationshipIntervention {
  interventionId: string;
  type: InterventionType;
  description: string;
  target_metrics: string[];
  expected_outcomes: string[];
  risks: string[];
  timeline: string;
  success_criteria: string[];
  implementation_steps: string[];
}

export enum InfluenceType {
  PERSUASION = 'persuasion',
  AUTHORITY = 'authority',
  EXPERTISE = 'expertise',
  SOCIAL_PROOF = 'social_proof',
  RECIPROCITY = 'reciprocity',
  COMMITMENT = 'commitment',
  LIKING = 'liking',
  SCARCITY = 'scarcity',
}

export enum InterventionType {
  COMMUNICATION_IMPROVEMENT = 'communication_improvement',
  TRUST_BUILDING = 'trust_building',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  COOPERATION_ENHANCEMENT = 'cooperation_enhancement',
  BOND_STRENGTHENING = 'bond_strengthening',
  EXPECTATION_ALIGNMENT = 'expectation_alignment',
  RECIPROCITY_BALANCING = 'reciprocity_balancing',
  BOUNDARY_SETTING = 'boundary_setting',
}

// ============================================================================
// Integration and Coordination Types
// ============================================================================

export interface SocialCognitionContext {
  activeGoals: SocialGoal[];
  currentSituation: SocialSituation;
  relevantNorms: string[];
  activeRelationships: string[];
  recentEvents: SocialEvent[];
  environmental_factors: string[];
}

export interface SocialSituation {
  situationId: string;
  type: string;
  description: string;
  participants: string[];
  setting: string;
  social_dynamics: string[];
  opportunities: string[];
  constraints: string[];
  urgency: number;
  complexity: number;
}

export interface SocialDecision {
  decisionId: string;
  description: string;
  options: SocialOption[];
  selectedOption: string;
  reasoning: string[];
  expected_consequences: string[];
  actual_consequences?: string[];
  satisfaction: number;
  learning_outcomes: string[];
}

export interface SocialOption {
  optionId: string;
  description: string;
  probability_of_success: number;
  potential_benefits: string[];
  potential_risks: string[];
  resource_requirements: string[];
  social_impact: number;
  alignment_with_values: number;
}

export interface SocialPerformanceMetrics {
  relationship_quality: number;
  social_influence: number;
  cooperation_success_rate: number;
  conflict_resolution_rate: number;
  norm_compliance_rate: number;
  learning_effectiveness: number;
  adaptation_speed: number;
  social_integration_level: number;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const SocialEventSchema = z.object({
  eventId: z.string(),
  type: z.nativeEnum(SocialEventType),
  participants: z.array(z.string()),
  description: z.string(),
  context: z.any(),
  significance: z.number().min(0).max(1),
  timestamp: z.number(),
  outcomes: z.array(z.string()),
});

export const SocialGoalSchema = z.object({
  goalId: z.string(),
  description: z.string(),
  type: z.nativeEnum(SocialGoalType),
  targetAgents: z.array(z.string()),
  priority: z.number().min(0).max(1),
  progress: z.number().min(0).max(1),
  strategy: z.array(z.string()),
  obstacles: z.array(z.string()),
  deadline: z.number().optional(),
  success_criteria: z.array(z.string()),
});

export const SocialMemorySchema = z.object({
  memoryId: z.string(),
  type: z.nativeEnum(SocialMemoryType),
  content: z.string(),
  participants: z.array(z.string()),
  emotionalSalience: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(1),
  lastAccessed: z.number(),
  relatedMemories: z.array(z.string()),
  context: z.any(),
});

export const SocialInferenceSchema = z.object({
  inferenceId: z.string(),
  type: z.nativeEnum(SocialInferenceType),
  targetAgent: z.string(),
  inference: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  reasoning: z.string(),
  timestamp: z.number(),
  validityPeriod: z.number(),
});

export const PersonalityTraitSchema = z.object({
  name: z.string(),
  strength: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  manifestations: z.array(z.string()),
  opposing_traits: z.array(z.string()),
  contextual_variations: z.array(z.string()),
});

export const CapabilityDomainSchema = z.object({
  name: z.string(),
  level: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.any()),
  subskills: z.array(z.any()),
  benchmarks: z.array(z.any()),
});

// ============================================================================
// Utility Types
// ============================================================================

export type SocialCognitionModule =
  | 'agent_modeler'
  | 'theory_of_mind'
  | 'social_learner'
  | 'relationship_manager'
  | 'communication_interpreter'
  | 'norm_tracker'
  | 'group_dynamics'
  | 'social_strategy';

export type SocialCognitionCapability =
  | 'personality_assessment'
  | 'intention_prediction'
  | 'perspective_taking'
  | 'false_belief_reasoning'
  | 'norm_detection'
  | 'relationship_management'
  | 'social_learning'
  | 'cooperation_planning'
  | 'conflict_resolution'
  | 'influence_understanding';

export type SocialMetric =
  | 'trust_level'
  | 'bond_strength'
  | 'cooperation_rate'
  | 'communication_effectiveness'
  | 'norm_compliance'
  | 'social_influence'
  | 'relationship_stability'
  | 'learning_rate'
  | 'adaptation_speed'
  | 'social_intelligence';

// ============================================================================
// Configuration Types
// ============================================================================

export interface SocialCognitionConfig {
  agentModeler: {
    maxTrackedAgents: number;
    personalityInferenceThreshold: number;
    capabilityAssessmentMinObservations: number;
    beliefUpdateSensitivity: number;
  };
  theoryOfMind: {
    enableFirstOrderToM: boolean;
    enableSecondOrderToM: boolean;
    enableFalseBeliefReasoning: boolean;
    tomReasoningDepth: number;
    confidenceThreshold: number;
  };
  socialLearner: {
    enableObservationalLearning: boolean;
    enableImitationLearning: boolean;
    enableNormInference: boolean;
    learningRate: number;
    minimumObservationCount: number;
  };
  relationshipManager: {
    maxTrackedRelationships: number;
    trustUpdateSensitivity: number;
    relationshipDecayRate: number;
    enableEmotionalBonding: boolean;
    enableReciprocityTracking: boolean;
  };
  integration: {
    socialMemoryIntegration: boolean;
    socialPlanningIntegration: boolean;
    normConstitutionalIntegration: boolean;
    socialGoalCoordination: boolean;
  };
}
