/**
 * Types for constitutional filtering system
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Constitutional Rule Types
// ============================================================================

/**
 * Constitutional rule definition
 */
export interface ConstitutionalRule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  priority: number; // 0-1, higher is more important
  condition: string; // Natural language condition
  action: RuleAction;
  reasoning: string;
  examples: RuleExample[];
  source: RuleSource;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  version: string;
}

// TODO: These enums are defined for future use
// eslint-disable-next-line no-unused-vars
export enum RuleCategory {
  SAFETY = 'safety',
  ETHICS = 'ethics',
  LEGALITY = 'legality',
  SOCIAL_NORMS = 'social_norms',
  GOAL_ALIGNMENT = 'goal_alignment',
  RESOURCE_LIMITS = 'resource_limits',
  COMMUNICATION = 'communication',
}

// TODO: These enums are defined for future use
// eslint-disable-next-line no-unused-vars
export enum RuleAction {
  ALLOW = 'allow',
  DENY = 'deny',
  MODIFY = 'modify',
  FLAG = 'flag',
  ESCALATE = 'escalate',
}

// TODO: These enums are defined for future use
// eslint-disable-next-line no-unused-vars
export enum RuleSource {
  CORE = 'core',
  USER = 'user',
  LEARNED = 'learned',
  DERIVED = 'derived',
}

export interface RuleExample {
  scenario: string;
  expectedAction: RuleAction;
  explanation: string;
}

/**
 * Rule evaluation context
 */
export interface EvaluationContext {
  action?: ActionProposal;
  goal?: GoalProposal;
  message?: MessageProposal;
  intrusion?: IntrusionRequest;
  agentState?: any;
  environmentState?: any;
  timestamp: number;
}

export interface ActionProposal {
  id: string;
  type: string;
  description: string;
  parameters: Record<string, any>;
  target?: string;
  intent?: string;
  urgency: number; // 0-1
  justification?: string;
}

export interface GoalProposal {
  id: string;
  description: string;
  type: string;
  priority: number; // 0-1
  motivation?: string;
  subgoals?: string[];
  constraints?: string[];
}

export interface MessageProposal {
  id: string;
  content: string;
  recipient: string;
  intent?: string;
  context?: any;
}

export interface IntrusionRequest {
  id: string;
  type: string;
  source: string;
  content: any;
  justification?: string;
  urgency: number; // 0-1
}

/**
 * Rule evaluation result
 */
export interface EvaluationResult {
  id: string;
  timestamp: number;
  decision: RuleAction;
  confidence: number; // 0-1
  appliedRules: AppliedRule[];
  explanation: string;
  suggestedModifications?: string[];
  warningFlags?: string[];
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  action: RuleAction;
  priority: number;
  match: number; // 0-1, how well the rule matched
  reasoning: string;
}

/**
 * Conflict resolution
 */
export interface RuleConflict {
  id: string;
  rules: string[];
  type: ConflictType;
  resolution?: ConflictResolution;
  timestamp: number;
}

// TODO: These enums are defined for future use
// eslint-disable-next-line no-unused-vars
export enum ConflictType {
  CONTRADICTORY_ACTIONS = 'contradictory_actions',
  PRIORITY_AMBIGUITY = 'priority_ambiguity',
  CONTEXT_DEPENDENCE = 'context_dependence',
  RULE_OVERLAP = 'rule_overlap',
}

export interface ConflictResolution {
  resolvedAction: RuleAction;
  winningRuleId: string;
  reasoning: string;
  confidence: number; // 0-1
}

/**
 * Ethical reasoning trace
 */
export interface ReasoningTrace {
  id: string;
  context: EvaluationContext;
  steps: ReasoningStep[];
  conclusion: string;
  confidence: number; // 0-1
  timestamp: number;
}

export interface ReasoningStep {
  id: string;
  type: ReasoningStepType;
  content: string;
  evidenceRules: string[];
  confidence: number; // 0-1
}

// TODO: These enums are defined for future use
// eslint-disable-next-line no-unused-vars
export enum ReasoningStepType {
  PRINCIPLE_APPLICATION = 'principle_application',
  CONSEQUENCE_ANALYSIS = 'consequence_analysis',
  PRECEDENT_REFERENCE = 'precedent_reference',
  STAKEHOLDER_CONSIDERATION = 'stakeholder_consideration',
  RISK_ASSESSMENT = 'risk_assessment',
  VALUE_ALIGNMENT = 'value_alignment',
}

/**
 * Compliance monitoring
 */
export interface ComplianceReport {
  id: string;
  period: {
    start: number;
    end: number;
  };
  overallCompliance: number; // 0-1
  violationCount: number;
  flaggedCount: number;
  escalationCount: number;
  byCategory: Record<RuleCategory, number>;
  significantViolations: string[];
  recommendations: string[];
  timestamp: number;
}

export interface NormDrift {
  id: string;
  ruleId: string;
  initialInterpretation: string;
  currentInterpretation: string;
  driftMagnitude: number; // 0-1
  evidence: string[];
  timestamp: number;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const RuleExampleSchema = z.object({
  scenario: z.string(),
  expectedAction: z.nativeEnum(RuleAction),
  explanation: z.string(),
});

export const ConstitutionalRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.nativeEnum(RuleCategory),
  priority: z.number().min(0).max(1),
  condition: z.string(),
  action: z.nativeEnum(RuleAction),
  reasoning: z.string(),
  examples: z.array(RuleExampleSchema),
  source: z.nativeEnum(RuleSource),
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  version: z.string(),
});

export const ActionProposalSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  parameters: z.record(z.any()),
  target: z.string().optional(),
  intent: z.string().optional(),
  urgency: z.number().min(0).max(1),
  justification: z.string().optional(),
});

export const GoalProposalSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.string(),
  priority: z.number().min(0).max(1),
  motivation: z.string().optional(),
  subgoals: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
});

export const EvaluationContextSchema = z.object({
  action: z.any().optional(),
  goal: z.any().optional(),
  message: z.any().optional(),
  intrusion: z.any().optional(),
  agentState: z.any().optional(),
  environmentState: z.any().optional(),
  timestamp: z.number(),
});

export const EvaluationResultSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  decision: z.nativeEnum(RuleAction),
  confidence: z.number().min(0).max(1),
  appliedRules: z.array(z.any()),
  explanation: z.string(),
  suggestedModifications: z.array(z.string()).optional(),
  warningFlags: z.array(z.string()).optional(),
});
