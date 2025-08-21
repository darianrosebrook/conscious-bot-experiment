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
  evidence: string;
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
// Contract System Types
// ============================================================================

/**
 * Long-term commitment and promise tracking
 */
export interface PersonalContract {
  id: string;
  type: ContractType;
  title: string;
  description: string;
  terms: ContractTerm[];
  creationDate: number;
  expirationDate?: number;
  status: ContractStatus;
  importance: number; // 0-1
  stakeholders: string[];
  fulfillmentHistory: FulfillmentRecord[];
  integrityScore: number; // 0-1
  lastReviewed: number;
}

export enum ContractType {
  PROMISE = 'promise',
  COMMITMENT = 'commitment',
  GOAL = 'goal',
  PRINCIPLE = 'principle',
  RELATIONSHIP = 'relationship',
  SOCIAL = 'social',
}

export interface ContractTerm {
  id: string;
  description: string;
  measurable: boolean;
  criteria: string[];
  deadline?: number;
  status: TermStatus;
  fulfillmentPercentage: number; // 0-1
}

export enum TermStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  FULFILLED = 'fulfilled',
  VIOLATED = 'violated',
  RENEGOTIATED = 'renegotiated',
  CANCELLED = 'cancelled',
}

export enum ContractStatus {
  ACTIVE = 'active',
  FULFILLED = 'fulfilled',
  VIOLATED = 'violated',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
  RENEGOTIATED = 'renegotiated',
}

export interface FulfillmentRecord {
  timestamp: number;
  termId: string;
  action: string;
  result: FulfillmentResult;
  evidence: string[];
  impact: number; // -1 to 1, negative for violations
}

export enum FulfillmentResult {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILURE = 'failure',
  EXCUSE = 'excuse',
  RENEGOTIATION = 'renegotiation',
}

// ============================================================================
// Self-Monitor Types
// ============================================================================

/**
 * Self-monitoring and behavior analysis
 */
export interface SelfMonitoringResult {
  timestamp: number;
  behaviorAnalysis: BehaviorAnalysis;
  driftDetection: DriftDetection;
  consistencyCheck: ConsistencyCheck;
  recommendations: string[];
  concernLevel: number; // 0-1
}

export interface BehaviorAnalysis {
  period: {
    start: number;
    end: number;
  };
  patterns: BehaviorPattern[];
  deviations: BehaviorDeviation[];
  trends: BehaviorTrend[];
  alignment: ValueAlignment;
}

export interface BehaviorPattern {
  name: string;
  description: string;
  frequency: number;
  contexts: string[];
  outcomes: string[];
  consistency: number; // 0-1
  valueAlignment: number; // 0-1
}

export interface BehaviorDeviation {
  timestamp: number;
  expectedBehavior: string;
  actualBehavior: string;
  context: string;
  severity: number; // 0-1
  explanation?: string;
  resolved: boolean;
}

export interface BehaviorTrend {
  aspect: string;
  direction: TrendDirection;
  strength: number; // 0-1
  duration: number; // milliseconds
  significance: number; // 0-1
  implications: string[];
}

export enum TrendDirection {
  IMPROVING = 'improving',
  DECLINING = 'declining',
  STABLE = 'stable',
  OSCILLATING = 'oscillating',
  EMERGING = 'emerging',
}

export interface ValueAlignment {
  overall: number; // 0-1
  byValue: Record<string, number>;
  conflicts: ValueConflict[];
  resolutions: string[];
}

export interface ValueConflict {
  value1: string;
  value2: string;
  situation: string;
  resolution: string;
  satisfaction: number; // 0-1
  learnings: string[];
}

export interface DriftDetection {
  overallDrift: number; // 0-1
  aspects: DriftAspect[];
  triggers: string[];
  timeframe: number;
  significance: DriftSignificance;
}

export interface DriftAspect {
  aspect: IdentityAspect;
  previousState: any;
  currentState: any;
  drift: number; // 0-1
  trend: TrendDirection;
  concerning: boolean;
  explanation: string;
}

export enum DriftSignificance {
  MINIMAL = 'minimal',
  MODERATE = 'moderate',
  SIGNIFICANT = 'significant',
  MAJOR = 'major',
  CRITICAL = 'critical',
}

export interface ConsistencyCheck {
  overall: number; // 0-1
  dimensions: ConsistencyDimension[];
  inconsistencies: Inconsistency[];
  improvements: string[];
}

export interface ConsistencyDimension {
  name: string;
  score: number; // 0-1
  examples: string[];
  concerns: string[];
}

export interface Inconsistency {
  type: InconsistencyType;
  description: string;
  severity: number; // 0-1
  evidence: string[];
  suggestedResolution: string;
  resolved: boolean;
}

export enum InconsistencyType {
  VALUE_BEHAVIOR = 'value_behavior',
  PROMISE_ACTION = 'promise_action',
  BELIEF_STATEMENT = 'belief_statement',
  PERSONALITY_BEHAVIOR = 'personality_behavior',
  GOAL_ACTION = 'goal_action',
}

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

export const PersonalContractSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(ContractType),
  title: z.string(),
  description: z.string(),
  terms: z.array(z.any()),
  creationDate: z.number(),
  expirationDate: z.number().optional(),
  status: z.nativeEnum(ContractStatus),
  importance: z.number().min(0).max(1),
  stakeholders: z.array(z.string()),
  fulfillmentHistory: z.array(z.any()),
  integrityScore: z.number().min(0).max(1),
  lastReviewed: z.number(),
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
