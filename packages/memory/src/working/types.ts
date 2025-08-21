/**
 * Types for working memory system
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Working Memory Types
// ============================================================================

/**
 * Working memory state
 */
export interface WorkingMemoryState {
  id: string;
  timestamp: number;
  cognitiveLoad: number; // 0-1
  attentionFocus: AttentionState;
  activeGoals: ActiveGoal[];
  contextFrames: ContextFrame[];
  workingItems: WorkingItem[];
  buffers: {
    phonological: PhonologicalItem[];
    visuospatial: VisuospatialItem[];
    episodic: EpisodicItem[];
  };
  processingStages: ProcessingStage[];
}

/**
 * Attention state
 */
export interface AttentionState {
  primaryFocus: string | null;
  secondaryFoci: string[];
  distractions: Distraction[];
  focusStrength: number; // 0-1
  lastShift: number;
  sustainedDuration: number;
}

export interface Distraction {
  source: string;
  strength: number; // 0-1
  timestamp: number;
  handled: boolean;
}

/**
 * Active goal in working memory
 */
export interface ActiveGoal {
  id: string;
  description: string;
  priority: number; // 0-1
  progress: number; // 0-1
  deadline?: number;
  subgoals: string[];
  dependsOn: string[];
  resources: string[];
  status: GoalStatus;
  attention: number; // 0-1, how much attention it's receiving
}

export enum GoalStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Context frame for situation awareness
 */
export interface ContextFrame {
  id: string;
  type: ContextType;
  content: any;
  relevance: number; // 0-1
  timestamp: number;
  expiresAt?: number;
  source: string;
}

export enum ContextType {
  SPATIAL = 'spatial',
  TEMPORAL = 'temporal',
  SOCIAL = 'social',
  TASK = 'task',
  EMOTIONAL = 'emotional',
  ENVIRONMENTAL = 'environmental',
  GOAL = 'goal',
}

/**
 * Working memory item
 */
export interface WorkingItem {
  id: string;
  type: WorkingItemType;
  content: any;
  format: ItemFormat;
  importance: number; // 0-1
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessed: number;
  expiresAt?: number;
  associations: string[];
  source: string;
}

export enum WorkingItemType {
  FACT = 'fact',
  OBSERVATION = 'observation',
  INFERENCE = 'inference',
  PLAN = 'plan',
  DECISION = 'decision',
  QUESTION = 'question',
  HYPOTHESIS = 'hypothesis',
  FEEDBACK = 'feedback',
}

export enum ItemFormat {
  TEXT = 'text',
  VISUAL = 'visual',
  SPATIAL = 'spatial',
  NUMERIC = 'numeric',
  LOGICAL = 'logical',
  PROCEDURAL = 'procedural',
}

/**
 * Phonological loop item (verbal/auditory)
 */
export interface PhonologicalItem {
  id: string;
  content: string;
  timestamp: number;
  duration: number;
  rehearsals: number;
  decayRate: number;
}

/**
 * Visuospatial sketchpad item (visual/spatial)
 */
export interface VisuospatialItem {
  id: string;
  content: any;
  type: 'image' | 'spatial' | 'pattern';
  timestamp: number;
  complexity: number; // 0-1
  decayRate: number;
}

/**
 * Episodic buffer item (integrated experiences)
 */
export interface EpisodicItem {
  id: string;
  experience: any;
  timestamp: number;
  salience: number; // 0-1
  associations: string[];
  decayRate: number;
}

/**
 * Processing stage for multi-step cognitive operations
 */
export interface ProcessingStage {
  id: string;
  type: ProcessingType;
  status: ProcessingStatus;
  priority: number; // 0-1
  inputs: string[];
  outputs: string[];
  progress: number; // 0-1
  startTime: number;
  deadline?: number;
  resources: ResourceAllocation[];
}

export enum ProcessingType {
  REASONING = 'reasoning',
  DECISION_MAKING = 'decision_making',
  PROBLEM_SOLVING = 'problem_solving',
  PLANNING = 'planning',
  LEARNING = 'learning',
  INTEGRATION = 'integration',
}

export enum ProcessingStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Resource allocation for cognitive processing
 */
export interface ResourceAllocation {
  type: ResourceType;
  amount: number; // 0-1
  reserved: boolean;
}

export enum ResourceType {
  ATTENTION = 'attention',
  PROCESSING = 'processing',
  STORAGE = 'storage',
  RETRIEVAL = 'retrieval',
}

/**
 * Working memory configuration
 */
export interface WorkingMemoryConfig {
  maxCapacity: number;
  decayRate: number;
  rehearsalStrength: number;
  distractionThreshold: number;
  attentionInertia: number;
  goalCapacity: number;
  bufferSizes: {
    phonological: number;
    visuospatial: number;
    episodic: number;
  };
}

/**
 * Working memory operation result
 */
export interface MemoryOperationResult {
  success: boolean;
  message: string;
  affectedItems: string[];
  timestamp: number;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const AttentionStateSchema = z.object({
  primaryFocus: z.string().nullable(),
  secondaryFoci: z.array(z.string()),
  distractions: z.array(z.object({
    source: z.string(),
    strength: z.number().min(0).max(1),
    timestamp: z.number(),
    handled: z.boolean(),
  })),
  focusStrength: z.number().min(0).max(1),
  lastShift: z.number(),
  sustainedDuration: z.number(),
});

export const ActiveGoalSchema = z.object({
  id: z.string(),
  description: z.string(),
  priority: z.number().min(0).max(1),
  progress: z.number().min(0).max(1),
  deadline: z.number().optional(),
  subgoals: z.array(z.string()),
  dependsOn: z.array(z.string()),
  resources: z.array(z.string()),
  status: z.nativeEnum(GoalStatus),
  attention: z.number().min(0).max(1),
});

export const ContextFrameSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(ContextType),
  content: z.any(),
  relevance: z.number().min(0).max(1),
  timestamp: z.number(),
  expiresAt: z.number().optional(),
  source: z.string(),
});

export const WorkingItemSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(WorkingItemType),
  content: z.any(),
  format: z.nativeEnum(ItemFormat),
  importance: z.number().min(0).max(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  accessCount: z.number(),
  lastAccessed: z.number(),
  expiresAt: z.number().optional(),
  associations: z.array(z.string()),
  source: z.string(),
});

export const WorkingMemoryStateSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  cognitiveLoad: z.number().min(0).max(1),
  attentionFocus: AttentionStateSchema,
  activeGoals: z.array(ActiveGoalSchema),
  contextFrames: z.array(ContextFrameSchema),
  workingItems: z.array(WorkingItemSchema),
  buffers: z.object({
    phonological: z.array(z.any()),
    visuospatial: z.array(z.any()),
    episodic: z.array(z.any()),
  }),
  processingStages: z.array(z.any()),
});
