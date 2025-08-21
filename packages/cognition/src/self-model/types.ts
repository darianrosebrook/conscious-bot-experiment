/**
 * Types for self-model system
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Identity Core Types
// ============================================================================

/**
 * Core identity information
 */
export interface IdentityCore {
  id: string;
  name: string;
  version: string;
  creationDate: number;
  lastUpdated: number;
  personalityTraits: PersonalityTrait[];
  coreValues: CoreValue[];
  fundamentalBelliefs: string[];
  capabilities: Capability[];
  currentVersion: IdentityVersion;
}

export interface PersonalityTrait {
  name: string;
  description: string;
  strength: number; // 0-1
  stability: number; // 0-1, how stable this trait is over time
  evidence: string[]; // Supporting observations
  lastReinforced: number;
}

export interface CoreValue {
  id: string;
  name: string;
  description: string;
  importance: number; // 0-1
  consistency: number; // 0-1, how consistently this value is upheld
  conflicts: string[]; // Other values this might conflict with
  manifestations: string[]; // How this value shows up in behavior
  origin: ValueOrigin;
}

export enum ValueOrigin {
  PROGRAMMED = 'programmed',
  LEARNED = 'learned',
  EMERGENT = 'emergent',
  SOCIAL = 'social',
}

export interface Capability {
  name: string;
  description: string;
  proficiency: number; // 0-1
  confidence: number; // 0-1
  developmentHistory: CapabilityDevelopment[];
  limitations: string[];
}

export interface CapabilityDevelopment {
  timestamp: number;
  previousLevel: number;
  newLevel: number;
  trigger: string; // What caused this development
  evidence: string[];
}

export interface IdentityVersion {
  version: string;
  timestamp: number;
  majorChanges: string[];
  reasoning: string;
  previousVersion?: string;
}

// ============================================================================
// Narrative Manager Types
// ============================================================================

/**
 * Narrative structures for identity continuity
 */
export interface NarrativeStory {
  id: string;
  title: string;
  description: string;
  chapters: NarrativeChapter[];
  themes: string[];
  timespan: {
    start: number;
    end?: number;
  };
  significance: number; // 0-1
  coherenceScore: number; // 0-1
  lastUpdated: number;
}

export interface NarrativeChapter {
  id: string;
  title: string;
  summary: string;
  keyEvents: string[];
  lessons: string[];
  timespan: {
    start: number;
    end: number;
  };
  significance: number;
  connectionToPrevious: string;
  connectionToNext?: string;
}

export interface ExperienceIntegration {
  experienceId: string;
  integrationDate: number;
  narrativeContext: string;
  lessonsExtracted: string[];
  identityImpact: IdentityImpact[];
  coherenceChanges: CoherenceChange[];
}

export interface IdentityImpact {
  aspect: IdentityAspect;
  type: ImpactType;
  magnitude: number; // 0-1
  description: string;
  evidence: string[];
  timestamp: number;
}

export enum IdentityAspect {
  PERSONALITY = 'personality',
  VALUES = 'values',
  CAPABILITIES = 'capabilities',
  BELIEFS = 'beliefs',
  RELATIONSHIPS = 'relationships',
  GOALS = 'goals',
}

export enum ImpactType {
  REINFORCEMENT = 'reinforcement',
  CHALLENGE = 'challenge',
  EXPANSION = 'expansion',
  CONFLICT = 'conflict',
  INTEGRATION = 'integration',
}

export interface CoherenceChange {
  area: string;
  previousScore: number;
  newScore: number;
  reasoning: string;
  supportingEvidence: string[];
}

// ============================================================================
// Advanced Identity Analysis Types
// ============================================================================

/**
 * Comprehensive identity analysis
 */
export interface IdentityAnalysis {
  id: string;
  timestamp: number;
  personalityAnalysis: PersonalityAnalysis;
  valueSystemAnalysis: ValueSystemAnalysis;
  evolutionAnalysis: IdentityEvolution;
  coherenceAnalysis: IdentityCoherence;
  behaviorPatterns: BehaviorPattern[];
  recommendations: string[];
}

/**
 * Personality trait analysis
 */
export interface PersonalityAnalysis {
  traitInteractions: TraitInteraction[];
  dominantPatterns: string[];
  potentialConflicts: string[];
  stabilityInsights: string[];
  overallCoherence: number;
  recommendations: string[];
}

/**
 * Value system analysis
 */
export interface ValueSystemAnalysis {
  valueHierarchy: string[];
  conflicts: ValueConflict[];
  consistencyInsights: string[];
  evolutionPatterns: string[];
  overallCoherence: number;
  recommendations: string[];
}

/**
 * Identity evolution tracking
 */
export interface IdentityEvolution {
  evolutionPatterns: string[];
  triggers: EvolutionTrigger[];
  stabilityInsights: string[];
  predictions: string[];
  evolutionRate: number;
  authenticityScore: number;
}

/**
 * Identity coherence assessment
 */
export interface IdentityCoherence {
  strengths: string[];
  incoherencies: string[];
  alignments: string[];
  improvements: string[];
  overallCoherence: number;
  confidence: number;
}

/**
 * Behavior pattern for analysis
 */
export interface BehaviorPattern {
  id: string;
  description: string;
  type: string;
  frequency: number;
  context: string;
  timestamp: number;
}

/**
 * Trait interaction analysis
 */
export interface TraitInteraction {
  traits: string[];
  type: 'synergy' | 'conflict' | 'neutral';
  description: string;
  strength: number;
}

/**
 * Value conflict analysis
 */
export interface ValueConflict {
  values: string[];
  description: string;
  severity: number;
  resolution: string;
}

/**
 * Evolution trigger
 */
export interface EvolutionTrigger {
  type: string;
  description: string;
  impact: number;
  timestamp: number;
}

// ============================================================================
// Narrative Intelligence Types
// ============================================================================

/**
 * Story synthesis from experiences
 */
export interface StorySynthesis {
  id: string;
  timestamp: number;
  storyElements: StoryElement[];
  themes: ThemeExtraction[];
  plotDevelopment: PlotDevelopment;
  characterArc: CharacterArc;
  coherence: NarrativeCoherence;
  insights: NarrativeInsight[];
}

/**
 * Story element extraction
 */
export interface StoryElement {
  id: string;
  category: string;
  description: string;
  significance: number;
  timestamp: number;
}

/**
 * Theme extraction from experiences
 */
export interface ThemeExtraction {
  id: string;
  name: string;
  description: string;
  evidence: string[];
  significance: number;
  developmentPattern: string;
  timestamp: number;
}

/**
 * Plot development analysis
 */
export interface PlotDevelopment {
  structure: string[];
  climaxPoints: string[];
  subplots: string[];
  pacing: string[];
  complexity: number;
  coherence: number;
}

/**
 * Character arc analysis
 */
export interface CharacterArc {
  growthAreas: string[];
  personalityChanges: string[];
  skillDevelopment: string[];
  relationshipDevelopment: string[];
  valueEvolution: string[];
  arcType: string;
  completeness: number;
}

/**
 * Narrative coherence assessment
 */
export interface NarrativeCoherence {
  strengths: string[];
  weaknesses: string[];
  inconsistencies: string[];
  improvements: string[];
  overallCoherence: number;
  metrics: CoherenceMetric[];
}

/**
 * Narrative insight
 */
export interface NarrativeInsight {
  id: string;
  description: string;
  type: string;
  significance: number;
  timestamp: number;
}

/**
 * Coherence metric
 */
export interface CoherenceMetric {
  name: string;
  value: number;
  threshold: number;
  trend: string;
}

/**
 * Experience analysis for narrative
 */
export interface ExperienceAnalysis {
  id: string;
  description: string;
  outcome: string;
  context?: any;
  timestamp: number;
}

// ============================================================================
// Contract System Types
// ============================================================================

/**
 * Commitment tracking
 */
export interface Commitment {
  id: string;
  description: string;
  category: string;
  deadline: number;
  priority: number;
  createdAt: number;
  lastUpdated?: number;
  status: CommitmentStatus;
  progress: number;
  integrityScore: number;
  evidence: string[];
}

/**
 * Promise monitoring
 */
export interface Promise {
  id: string;
  description: string;
  recipient: string;
  deadline?: number;
  createdAt: number;
  fulfilledAt?: number;
  brokenAt?: number;
  status: PromiseStatus;
  fulfillmentScore: number;
  trustImpact: number;
  breakReason?: string;
  breakImpact?: string;
  evidence: string[];
}

/**
 * Contract management
 */
export interface Contract {
  id: string;
  title: string;
  description: string;
  parties: string[];
  terms: string[];
  startDate: number;
  endDate?: number;
  createdAt: number;
  status: string;
  integrityScore: number;
  trustScore: number;
}

/**
 * Integrity assessment
 */
export interface IntegrityAssessment {
  id: string;
  timestamp: number;
  commitmentIntegrity: number;
  promiseIntegrity: number;
  contractIntegrity: number;
  trustScore: TrustScore;
  metrics: IntegrityMetric[];
  recommendations: string[];
}

/**
 * Trust score calculation
 */
export interface TrustScore {
  overall: number;
  commitmentTrust: number;
  promiseTrust: number;
  contractTrust: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: number;
}

/**
 * Integrity metric
 */
export interface IntegrityMetric {
  name: string;
  value: number;
  threshold: number;
  trend: string;
}

/**
 * Accountability report
 */
export interface AccountabilityReport {
  id: string;
  timestamp: number;
  activeCommitments: number;
  pendingPromises: number;
  overallIntegrity: number;
  areasOfConcern: string[];
  improvementAreas: string[];
  recommendations: string[];
}

/**
 * Commitment status enum
 */
export enum CommitmentStatus {
  ACTIVE = 'active',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

/**
 * Promise status enum
 */
export enum PromiseStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  BROKEN = 'broken',
  MODIFIED = 'modified',
}

// ============================================================================
// Legacy Type Aliases for Backward Compatibility
// ============================================================================

export type CommitmentTracker = Commitment[];
export type PromiseMonitor = Promise[];
export type ContractManager = Contract[];

// ============================================================================
// Zod Schemas
// ============================================================================

export const PersonalityTraitSchema = z.object({
  name: z.string(),
  description: z.string(),
  strength: z.number().min(0).max(1),
  stability: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  lastReinforced: z.number(),
});

export const CoreValueSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  importance: z.number().min(0).max(1),
  consistency: z.number().min(0).max(1),
  conflicts: z.array(z.string()),
  manifestations: z.array(z.string()),
  origin: z.nativeEnum(ValueOrigin),
});

export const IdentityCoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  creationDate: z.number(),
  lastUpdated: z.number(),
  personalityTraits: z.array(PersonalityTraitSchema),
  coreValues: z.array(CoreValueSchema),
  fundamentalBelliefs: z.array(z.string()),
  capabilities: z.array(z.any()),
  currentVersion: z.any(),
});

export const NarrativeStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  chapters: z.array(z.any()),
  themes: z.array(z.string()),
  timespan: z.object({
    start: z.number(),
    end: z.number().optional(),
  }),
  significance: z.number().min(0).max(1),
  coherenceScore: z.number().min(0).max(1),
  lastUpdated: z.number(),
});
