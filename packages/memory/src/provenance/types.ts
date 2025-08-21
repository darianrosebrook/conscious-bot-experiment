/**
 * Types for provenance memory system
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Decision Tracking Types
// ============================================================================

/**
 * Decision lifecycle stage
 */
export enum DecisionStage {
  INITIATED = 'initiated',
  CONTEXT_CAPTURED = 'context_captured',
  INFORMATION_GATHERED = 'information_gathered',
  ALTERNATIVES_EVALUATED = 'alternatives_evaluated',
  DECISION_MADE = 'decision_made',
  EXECUTED = 'executed',
  OUTCOME_RECORDED = 'outcome_recorded',
  LEARNING_INTEGRATED = 'learning_integrated',
}

/**
 * Decision importance level
 */
export enum DecisionImportance {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  ROUTINE = 'routine',
}

/**
 * Decision outcome status
 */
export enum DecisionOutcomeStatus {
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  PARTIAL = 'partial',
  FAILED = 'failed',
  UNKNOWN = 'unknown',
}

/**
 * Decision record
 */
export interface DecisionRecord {
  id: string;
  title: string;
  description: string;
  domain: string;
  importance: DecisionImportance;
  stage: DecisionStage;
  timestamp: number;
  context: DecisionContext;
  informationSources: InformationSource[];
  alternatives: Alternative[];
  selectedAlternative?: string;
  justification: Justification;
  execution?: Execution;
  outcome?: Outcome;
  learnings?: Learning[];
  tags: string[];
  relatedDecisions: string[];
}

/**
 * Decision context
 */
export interface DecisionContext {
  situation: string;
  goals: string[];
  constraints: string[];
  environment: Record<string, any>;
  timestamp: number;
}

/**
 * Information source
 */
export interface InformationSource {
  id: string;
  type: InformationSourceType;
  description: string;
  content: any;
  reliability: number; // 0-1
  timestamp: number;
  metadata: Record<string, any>;
}

/**
 * Information source type
 */
export enum InformationSourceType {
  OBSERVATION = 'observation',
  MEMORY = 'memory',
  KNOWLEDGE = 'knowledge',
  REASONING = 'reasoning',
  EXTERNAL = 'external',
  USER_INPUT = 'user_input',
  SENSOR_DATA = 'sensor_data',
}

/**
 * Decision alternative
 */
export interface Alternative {
  id: string;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedUtility: number; // 0-1
  confidence: number; // 0-1
  risks: Risk[];
}

/**
 * Risk assessment
 */
export interface Risk {
  description: string;
  probability: number; // 0-1
  impact: number; // 0-1
  mitigationStrategy?: string;
}

/**
 * Decision justification
 */
export interface Justification {
  reasoning: string;
  evidenceIds: string[];
  confidenceScore: number; // 0-1
  ethicalConsiderations: string[];
  timestamp: number;
}

/**
 * Decision execution
 */
export interface Execution {
  actions: Action[];
  startTime: number;
  endTime?: number;
  status: ExecutionStatus;
  metadata: Record<string, any>;
}

/**
 * Action taken as part of decision execution
 */
export interface Action {
  id: string;
  type: string;
  description: string;
  parameters: Record<string, any>;
  timestamp: number;
  status: ActionStatus;
  result?: any;
}

/**
 * Execution status
 */
export enum ExecutionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Action status
 */
export enum ActionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Decision outcome
 */
export interface Outcome {
  status: DecisionOutcomeStatus;
  description: string;
  metrics: Record<string, number>;
  expectedVsActual: Record<string, { expected: any; actual: any }>;
  timestamp: number;
  feedback?: string;
}

/**
 * Learning from decision
 */
export interface Learning {
  id: string;
  insight: string;
  applicability: string[];
  confidence: number; // 0-1
  integratedInto: string[];
  timestamp: number;
}

/**
 * Evidence item
 */
export interface Evidence {
  id: string;
  type: EvidenceType;
  content: any;
  source: string;
  reliability: number; // 0-1
  timestamp: number;
  metadata: Record<string, any>;
}

/**
 * Evidence type
 */
export enum EvidenceType {
  OBSERVATION = 'observation',
  MEASUREMENT = 'measurement',
  CALCULATION = 'calculation',
  INFERENCE = 'inference',
  TESTIMONY = 'testimony',
  DOCUMENT = 'document',
}

/**
 * Audit trail entry
 */
export interface AuditEntry {
  id: string;
  decisionId: string;
  timestamp: number;
  actor: string;
  action: AuditAction;
  details: Record<string, any>;
  previousState?: any;
  newState?: any;
}

/**
 * Audit action
 */
export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  ACCESS = 'access',
  EXECUTE = 'execute',
  EVALUATE = 'evaluate',
}

/**
 * Explanation request
 */
export interface ExplanationRequest {
  decisionId: string;
  format: ExplanationFormat;
  detailLevel: ExplanationDetailLevel;
  focusAreas?: string[];
  audience?: string;
}

/**
 * Explanation format
 */
export enum ExplanationFormat {
  TEXT = 'text',
  STRUCTURED = 'structured',
  SUMMARY = 'summary',
  DETAILED = 'detailed',
  TECHNICAL = 'technical',
  SIMPLE = 'simple',
}

/**
 * Explanation detail level
 */
export enum ExplanationDetailLevel {
  MINIMAL = 'minimal',
  BASIC = 'basic',
  STANDARD = 'standard',
  DETAILED = 'detailed',
  COMPREHENSIVE = 'comprehensive',
}

/**
 * Explanation response
 */
export interface ExplanationResponse {
  decisionId: string;
  format: ExplanationFormat;
  detailLevel: ExplanationDetailLevel;
  content: string | Record<string, any>;
  contextualInformation: Record<string, any>;
  confidenceScore: number; // 0-1
  generatedAt: number;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const DecisionContextSchema = z.object({
  situation: z.string(),
  goals: z.array(z.string()),
  constraints: z.array(z.string()),
  environment: z.record(z.string(), z.any()),
  timestamp: z.number(),
});

export const InformationSourceSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(InformationSourceType),
  description: z.string(),
  content: z.any(),
  reliability: z.number().min(0).max(1),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.any()),
});

export const RiskSchema = z.object({
  description: z.string(),
  probability: z.number().min(0).max(1),
  impact: z.number().min(0).max(1),
  mitigationStrategy: z.string().optional(),
});

export const AlternativeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  estimatedUtility: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  risks: z.array(RiskSchema),
});

export const JustificationSchema = z.object({
  reasoning: z.string(),
  evidenceIds: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1),
  ethicalConsiderations: z.array(z.string()),
  timestamp: z.number(),
});

export const ActionSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.any()),
  timestamp: z.number(),
  status: z.nativeEnum(ActionStatus),
  result: z.any().optional(),
});

export const ExecutionSchema = z.object({
  actions: z.array(ActionSchema),
  startTime: z.number(),
  endTime: z.number().optional(),
  status: z.nativeEnum(ExecutionStatus),
  metadata: z.record(z.string(), z.any()),
});

export const OutcomeSchema = z.object({
  status: z.nativeEnum(DecisionOutcomeStatus),
  description: z.string(),
  metrics: z.record(z.string(), z.number()),
  expectedVsActual: z.record(z.string(), z.object({
    expected: z.any(),
    actual: z.any(),
  })),
  timestamp: z.number(),
  feedback: z.string().optional(),
});

export const LearningSchema = z.object({
  id: z.string(),
  insight: z.string(),
  applicability: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  integratedInto: z.array(z.string()),
  timestamp: z.number(),
});

export const DecisionRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  domain: z.string(),
  importance: z.nativeEnum(DecisionImportance),
  stage: z.nativeEnum(DecisionStage),
  timestamp: z.number(),
  context: DecisionContextSchema,
  informationSources: z.array(InformationSourceSchema),
  alternatives: z.array(AlternativeSchema),
  selectedAlternative: z.string().optional(),
  justification: JustificationSchema,
  execution: ExecutionSchema.optional(),
  outcome: OutcomeSchema.optional(),
  learnings: z.array(LearningSchema).optional(),
  tags: z.array(z.string()),
  relatedDecisions: z.array(z.string()),
});

export const EvidenceSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(EvidenceType),
  content: z.any(),
  source: z.string(),
  reliability: z.number().min(0).max(1),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.any()),
});

export const AuditEntrySchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  timestamp: z.number(),
  actor: z.string(),
  action: z.nativeEnum(AuditAction),
  details: z.record(z.string(), z.any()),
  previousState: z.any().optional(),
  newState: z.any().optional(),
});

export const ExplanationRequestSchema = z.object({
  decisionId: z.string(),
  format: z.nativeEnum(ExplanationFormat),
  detailLevel: z.nativeEnum(ExplanationDetailLevel),
  focusAreas: z.array(z.string()).optional(),
  audience: z.string().optional(),
});

export const ExplanationResponseSchema = z.object({
  decisionId: z.string(),
  format: z.nativeEnum(ExplanationFormat),
  detailLevel: z.nativeEnum(ExplanationDetailLevel),
  content: z.union([z.string(), z.record(z.string(), z.any())]),
  contextualInformation: z.record(z.string(), z.any()),
  confidenceScore: z.number().min(0).max(1),
  generatedAt: z.number(),
});
