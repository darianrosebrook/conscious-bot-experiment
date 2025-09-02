/**
 * Local type definitions for skill integration
 *
 * These types are needed for the skill integration modules but are not
 * exported from the minecraft-interface package.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

// ============================================================================
// Skill Composition Types
// ============================================================================

export interface ComposableLeaf {
  id: string;
  name: string;
  spec: any; // Simplified for now
  instance: any;
}

export interface ExecutionStep {
  stepId: string;
  leafId: string;
  inputs: Record<string, any>;
  expectedOutputs: string[];
  dependencies: string[];
  fallbackStrategy?: string;
}

export interface SkillMetadata {
  creationTime: number;
  lastUsed: number;
  successRate: number;
  executionCount: number;
  complexity: number;
  tags: string[];
  context: Record<string, any>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ComposedSkill {
  id: string;
  name: string;
  description: string;
  leaves: ComposableLeaf[];
  executionPlan: ExecutionStep[];
  metadata: SkillMetadata;
  validation: ValidationResult;
}

export interface ExecutionContext {
  worldState: Record<string, any>;
  availableResources: Record<string, number>;
  timeConstraints: {
    urgency: 'low' | 'medium' | 'high' | 'emergency';
    deadline?: number;
    maxPlanningTime: number;
  };
  safetyConstraints: string[];
  botCapabilities: Record<string, any>;
}

export interface CompositionRule {
  id: string;
  name: string;
  description: string;
  conditions: string[];
  actions: string[];
  priority: number;
}

export interface CompositionType {
  name: string;
  description: string;
  constraints: string[];
  examples: string[];
}

export interface CompositionRequirement {
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  constraints: Record<string, any>;
  alternatives: string[];
}

export interface LeafCombination {
  leaves: ComposableLeaf[];
  inputOutputMapping: Map<string, string>;
  estimatedComplexity: number;
  successProbability: number;
  executionOrder: string[];
}

export interface OptionProposalResponse {
  id: string;
  description: string;
  confidence: number;
  reasoning: string;
}

export interface SkillComposer extends EventEmitter {
  registerLeaf(leaf: ComposableLeaf): void;
  unregisterLeaf(leafId: string): void;
  composeLeaves(
    targetGoal: string,
    context: ExecutionContext
  ): Promise<ComposedSkill>;
}
