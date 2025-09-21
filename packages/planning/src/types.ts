/**
 * Core types for planning and goal management system
 *
 * Author: @darianrosebrook
 */

import { z } from 'zod';

// =========================================================================
// Goal Formulation Types
// =========================================================================

export interface Goal {
  id: string;
  type: GoalType;
  priority: number;
  urgency: number;
  utility: number;
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
  CURIOSITY = 'curiosity',
  REACH_LOCATION = 'reach_location',
  ACQUIRE_ITEM = 'acquire_item',
  SURVIVE_THREAT = 'survive_threat',
  RESOURCE_GATHERING = 'resource_gathering',
  // New goal types for primitive operations
  FARMING = 'farming',
  CONTAINER_MANAGEMENT = 'container_management',
  WORLD_MANIPULATION = 'world_manipulation',
  REDSTONE_AUTOMATION = 'redstone_automation',
  STRUCTURE_CONSTRUCTION = 'structure_construction',
  ENVIRONMENTAL_CONTROL = 'environmental_control',
  INVENTORY_ORGANIZATION = 'inventory_organization',
  MECHANISM_OPERATION = 'mechanism_operation',
  COMBAT_TRAINING = 'combat_training',
  AGRICULTURE_DEVELOPMENT = 'agriculture_development',
}

export enum GoalStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SUSPENDED = 'suspended',
}

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
  WEATHER = 'weather',
}

export interface Effect {
  id: string;
  type: EffectType;
  description: string;
  magnitude: number;
  duration: number;
}

export enum EffectType {
  HEALTH_CHANGE = 'health_change',
  HUNGER_CHANGE = 'hunger_change',
  ENERGY_CHANGE = 'energy_change',
  INVENTORY_CHANGE = 'inventory_change',
  KNOWLEDGE_GAIN = 'knowledge_gain',
  RELATIONSHIP_CHANGE = 'relationship_change',
  // New effect types for primitive operations
  RESOURCE_ACQUISITION = 'resource_acquisition',
  SHELTER_IMPROVEMENT = 'shelter_improvement',
  FARM_PRODUCTIVITY = 'farm_productivity',
  INVENTORY_ORGANIZATION = 'inventory_organization',
  SAFETY_ENHANCEMENT = 'safety_enhancement',
  WORLD_MANIPULATION = 'world_manipulation',
  REDSTONE_AUTOMATION = 'redstone_automation',
  ENVIRONMENTAL_COMFORT = 'environmental_comfort',
  STRUCTURAL_STABILITY = 'structural_stability',
  MECHANICAL_ADVANCEMENT = 'mechanical_advancement',
  AGRICULTURAL_GROWTH = 'agricultural_growth',
  DEFENSIVE_CAPABILITY = 'defensive_capability',
}

// =========================================================================
// Homeostasis Types
// =========================================================================

export interface HomeostasisState {
  health: number;
  hunger: number;
  energy: number;
  safety: number;
  curiosity: number;
  social: number;
  achievement: number;
  creativity: number;
  // New homeostasis states for primitive operations
  resourceManagement: number;
  shelterStability: number;
  farmHealth: number;
  inventoryOrganization: number;
  worldKnowledge: number;
  redstoneProficiency: number;
  constructionSkill: number;
  environmentalComfort: number;
  mechanicalAptitude: number;
  agriculturalKnowledge: number;
  defensiveReadiness: number;
  timestamp: number;
}

export interface Need {
  id: string;
  type: NeedType;
  intensity: number;
  urgency: number;
  satisfaction: number;
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
  CURIOSITY = 'curiosity',
  // New needs for primitive operations
  RESOURCE_MANAGEMENT = 'resource_management',
  SHELTER_CONSTRUCTION = 'shelter_construction',
  FARM_MAINTENANCE = 'farm_maintenance',
  INVENTORY_ORGANIZATION = 'inventory_organization',
  DEFENSE_PREPARATION = 'defense_preparation',
  WORLD_EXPLORATION = 'world_exploration',
  REDSTONE_AUTOMATION = 'redstone_automation',
  ENVIRONMENTAL_COMFORT = 'environmental_comfort',
}

export enum SignalType {
  HUNGER = 'hunger',
  SAFETY_THREAT = 'safety_threat',
  SOCIAL_ISOLATION = 'social_isolation',
  CURIOSITY = 'curiosity',
  EXPLORATION = 'exploration',
  INTRUSION = 'intrusion',
  ENERGY_DEPLETION = 'energy_depletion',
  HEALTH_DECLINE = 'health_decline',
  ACHIEVEMENT_OPPORTUNITY = 'achievement_opportunity',
  CREATIVITY_DRIVE = 'creativity_drive',
  // New signals for primitive operations
  RESOURCE_SCARCITY = 'resource_scarcity',
  INVENTORY_DISORGANIZATION = 'inventory_disorganization',
  FARM_NEGLECT = 'farm_neglect',
  SHELTER_VULNERABILITY = 'shelter_vulnerability',
  REDSTONE_OPPORTUNITY = 'redstone_opportunity',
  CONSTRUCTION_OPPORTUNITY = 'construction_opportunity',
  ENVIRONMENTAL_DISCOMFORT = 'environmental_discomfort',
  MECHANICAL_CHALLENGE = 'mechanical_challenge',
  AGRICULTURAL_NEED = 'agricultural_need',
  DEFENSE_REQUIREMENT = 'defense_requirement',
}

// =========================================================================
// Planning Types
// =========================================================================

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
  successProbability: number;
}

export enum PlanStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SUSPENDED = 'suspended',
}

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
  dependencies: string[];
}

export enum PlanStepStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export interface Action {
  id: string;
  name: string;
  description: string;
  type: ActionType;
  parameters?: Record<string, any>;
  preconditions: Precondition[];
  effects: Effect[];
  cost: number;
  duration: number;
  successProbability: number;
  failureEffects?: Effect[];
}

export enum ActionType {
  MOVEMENT = 'movement',
  INTERACTION = 'interaction',
  CRAFTING = 'crafting',
  COMBAT = 'combat',
  SOCIAL = 'social',
  EXPLORATION = 'exploration',
  // New primitive operations
  CONTAINER_INTERACTION = 'container_interaction',
  FARMING = 'farming',
  WORLD_INTERACTION = 'world_interaction',
  REDSTONE_CONTROL = 'redstone_control',
  STRUCTURE_BUILDING = 'structure_building',
  ENVIRONMENT_CONTROL = 'environment_control',
  INVENTORY_MANAGEMENT = 'inventory_management',
  AGRICULTURE = 'agriculture',
  MECHANISM_OPERATION = 'mechanism_operation',
}

// =========================================================================
// Resource & Utility
// =========================================================================

export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  quantity: number;
  maxQuantity: number;
  unit: string;
  value: number;
}

export enum ResourceType {
  HEALTH = 'health',
  HUNGER = 'hunger',
  ENERGY = 'energy',
  INVENTORY_ITEM = 'inventory_item',
  TIME = 'time',
  KNOWLEDGE = 'knowledge',
  RELATIONSHIP = 'relationship',
  // New resource types for primitive operations
  BUILDING_MATERIALS = 'building_materials',
  REDSTONE_COMPONENTS = 'redstone_components',
  FARMING_SUPPLIES = 'farming_supplies',
  COMBAT_EQUIPMENT = 'combat_equipment',
  CONTAINER_STORAGE = 'container_storage',
  ENVIRONMENTAL_COMFORT = 'environmental_comfort',
  STRUCTURAL_INTEGRITY = 'structural_integrity',
  MECHANICAL_RESOURCES = 'mechanical_resources',
  AGRICULTURAL_RESOURCES = 'agricultural_resources',
  DEFENSIVE_RESOURCES = 'defensive_resources',
}

export interface UtilityFunction {
  id: string;
  name: string;
  weights: Record<string, number>;
  calculate: (context: UtilityContext) => number;
}

export interface UtilityContext {
  homeostasis: HomeostasisState;
  goals: Goal[];
  needs: Need[];
  resources: Resource[];
  worldState: any;
  time: number;
}

// =========================================================================
// Zod Schemas
// =========================================================================

export const GoalSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(GoalType),
  priority: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  utility: z.number().min(0).max(1),
  description: z.string(),
  preconditions: z.array(z.any()),
  effects: z.array(z.any()),
  status: z.nativeEnum(GoalStatus),
  createdAt: z.number(),
  updatedAt: z.number(),
  deadline: z.number().optional(),
  parentGoalId: z.string().optional(),
  subGoals: z.array(z.string()),
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
  timestamp: z.number(),
});

export const NeedSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(NeedType),
  intensity: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  satisfaction: z.number().min(0).max(1),
  description: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const PlanSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  steps: z.array(z.any()),
  status: z.nativeEnum(PlanStatus),
  priority: z.number(),
  estimatedDuration: z.number(),
  actualDuration: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  successProbability: z.number().min(0).max(1),
});
