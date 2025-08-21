/**
 * Core types for planning and goal management system
 * 
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Goal Formulation Types
// ============================================================================

/**
 * Represents a goal that the agent wants to achieve
 */
export interface Goal {
  id: string;
  type: GoalType;
  priority: number; // 0-1, higher is more important
  urgency: number; // 0-1, higher is more urgent
  utility: number; // 0-1, overall value
  description: string;
  preconditions: Precondition[];
  effects: Effect[];
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
  deadline?: number;
  parentGoalId?: string;
  subGoals: string[];
}

export enum GoalType {
  SURVIVAL = 'survival',
  SAFETY = 'safety',
  EXPLORATION = 'exploration',
  SOCIAL = 'social',
  ACHIEVEMENT = 'achievement',
  CREATIVITY = 'creativity',
  CURIOSITY = 'curiosity'
}

export enum GoalStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SUSPENDED = 'suspended'
}

/**
 * Precondition that must be met for a goal to be achievable
 */
export interface Precondition {
  id: string;
  type: PreconditionType;
  condition: string;
  isSatisfied: boolean;
  requiredResources?: Resource[];
}

export enum PreconditionType {
  LOCATION = 'location',
  INVENTORY = 'inventory',
  HEALTH = 'health',
  SKILL = 'skill',
  TIME = 'time',
  WEATHER = 'weather'
}

/**
 * Effect that will occur when a goal is achieved
 */
export interface Effect {
  id: string;
  type: EffectType;
  description: string;
  magnitude: number; // 0-1, strength of the effect
  duration: number; // milliseconds
}

export enum EffectType {
  HEALTH_CHANGE = 'health_change',
  HUNGER_CHANGE = 'hunger_change',
  ENERGY_CHANGE = 'energy_change',
  INVENTORY_CHANGE = 'inventory_change',
  KNOWLEDGE_GAIN = 'knowledge_gain',
  RELATIONSHIP_CHANGE = 'relationship_change'
}

// ============================================================================
// Homeostasis Types
// ============================================================================

/**
 * Represents the agent's internal state and needs
 */
export interface HomeostasisState {
  health: number; // 0-1
  hunger: number; // 0-1, higher means more hungry
  energy: number; // 0-1, higher means more energetic
  safety: number; // 0-1, higher means safer
  curiosity: number; // 0-1, higher means more curious
  social: number; // 0-1, higher means more social need
  achievement: number; // 0-1, higher means more achievement need
  creativity: number; // 0-1, higher means more creative need
  timestamp: number;
}

/**
 * Need that drives goal generation
 */
export interface Need {
  id: string;
  type: NeedType;
  intensity: number; // 0-1, how strong the need is
  urgency: number; // 0-1, how urgent the need is
  satisfaction: number; // 0-1, how satisfied the need is
  description: string;
  createdAt: number;
  updatedAt: number;
}

export enum NeedType {
  SURVIVAL = 'survival',
  SAFETY = 'safety',
  EXPLORATION = 'exploration',
  SOCIAL = 'social',
  ACHIEVEMENT = 'achievement',
  CREATIVITY = 'creativity',
  CURIOSITY = 'curiosity'
}

// ============================================================================
// Planning Types
// ============================================================================

/**
 * Represents a plan to achieve a goal
 */
export interface Plan {
  id: string;
  goalId: string;
  steps: PlanStep[];
  status: PlanStatus;
  priority: number;
  estimatedDuration: number;
  actualDuration?: number;
  createdAt: number;
  updatedAt: number;
  successProbability: number; // 0-1
}

export enum PlanStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SUSPENDED = 'suspended'
}

/**
 * A single step in a plan
 */
export interface PlanStep {
  id: string;
  planId: string;
  action: Action;
  preconditions: Precondition[];
  effects: Effect[];
  status: PlanStepStatus;
  order: number;
  estimatedDuration: number;
  actualDuration?: number;
  dependencies: string[]; // IDs of steps that must complete first
}

export enum PlanStepStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * Represents an action the agent can take
 */
export interface Action {
  id: string;
  name: string;
  description: string;
  type: ActionType;
  preconditions: Precondition[];
  effects: Effect[];
  cost: number; // Resource cost
  duration: number; // Estimated duration in milliseconds
  successProbability: number; // 0-1
  failureEffects?: Effect[];
}

export enum ActionType {
  MOVEMENT = 'movement',
  INTERACTION = 'interaction',
  CRAFTING = 'crafting',
  COMBAT = 'combat',
  SOCIAL = 'social',
  EXPLORATION = 'exploration'
}

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Represents a resource that can be consumed or produced
 */
export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  quantity: number;
  maxQuantity: number;
  unit: string;
  value: number; // Relative value for utility calculations
}

export enum ResourceType {
  HEALTH = 'health',
  HUNGER = 'hunger',
  ENERGY = 'energy',
  INVENTORY_ITEM = 'inventory_item',
  TIME = 'time',
  KNOWLEDGE = 'knowledge',
  RELATIONSHIP = 'relationship'
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Utility function for evaluating goals and actions
 */
export interface UtilityFunction {
  id: string;
  name: string;
  weights: Record<string, number>; // Weights for different factors
  calculate: (context: UtilityContext) => number;
}

export interface UtilityContext {
  homeostasis: HomeostasisState;
  goals: Goal[];
  needs: Need[];
  resources: Resource[];
  worldState: any; // Current world state
  time: number;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const GoalSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(GoalType),
  priority: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  utility: z.number().min(0).max(1),
  description: z.string(),
  preconditions: z.array(z.any()), // PreconditionSchema
  effects: z.array(z.any()), // EffectSchema
  status: z.nativeEnum(GoalStatus),
  createdAt: z.number(),
  updatedAt: z.number(),
  deadline: z.number().optional(),
  parentGoalId: z.string().optional(),
  subGoals: z.array(z.string())
});

export const HomeostasisStateSchema = z.object({
  health: z.number().min(0).max(1),
  hunger: z.number().min(0).max(1),
  energy: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
  curiosity: z.number().min(0).max(1),
  social: z.number().min(0).max(1),
  achievement: z.number().min(0).max(1),
  creativity: z.number().min(0).max(1),
  timestamp: z.number()
});

export const NeedSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(NeedType),
  intensity: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  satisfaction: z.number().min(0).max(1),
  description: z.string(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const PlanSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  steps: z.array(z.any()), // PlanStepSchema
  status: z.nativeEnum(PlanStatus),
  priority: z.number(),
  estimatedDuration: z.number(),
  actualDuration: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  successProbability: z.number().min(0).max(1)
});
