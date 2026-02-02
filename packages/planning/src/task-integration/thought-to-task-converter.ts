/**
 * Thought-to-task conversion: extract action type, title, and parameters
 * from cognitive stream thoughts.
 *
 * Architecture principle: The sanitizer (llm-output-sanitizer.ts) is the single
 * deterministic boundary for goal extraction. This module reads structured
 * metadata (extractedGoal) — it never re-parses goal tags from raw text.
 *
 * @author @darianrosebrook
 */

import type { Task } from '../types/task';
import type { CognitiveStreamThought } from '../modules/cognitive-stream-client';
import { parseRequiredQuantityFromTitle } from '../modules/requirements';

// Import shared parser from cognition boundary — no local regex fork
import type { GoalTagV1 } from '@conscious-bot/cognition';
import type { TaskManagementHandler, ManagementResult } from './task-management-handler';

/**
 * Explicit decision state for task creation — makes "why nothing happened" visible.
 * Downstream consumers (dashboard, telemetry) can read this without guessing.
 */
export type TaskDecision =
  | 'created'              // task was successfully created
  | 'blocked_unroutable'   // canonical action not in ROUTABLE_ACTIONS
  | 'blocked_guard'        // thought filtered by content guard (status text, etc.)
  | 'blocked_not_eligible' // thought has convertEligible=false (low-novelty, dedup noise)
  | 'suppressed_dedup'     // same goal within dedup window
  | 'dropped_sanitizer'    // no extractedGoal and keyword fallback didn't match
  | 'dropped_seen'         // thought ID already processed
  | 'management_applied'          // management action applied successfully
  | 'management_needs_disambiguation' // management action ambiguous — multiple candidates
  | 'management_failed'           // management action target not found or invalid transition
  | 'error';               // exception during conversion

export interface ConvertThoughtResult {
  task: Task | null;
  decision: TaskDecision;
  /** Reason string for debugging (e.g., "action 'explore' not routable") */
  reason?: string;
  /** Management result when a management action was processed */
  managementResult?: ManagementResult;
}

/**
 * Management actions — handled by TaskManagementHandler, not by task creation.
 * Dispatched before ROUTABLE_ACTIONS check.
 */
const MANAGEMENT_ACTIONS = new Set([
  'cancel', 'prioritize', 'pause', 'resume',
]);

/**
 * Routable actions — strict subset of CANONICAL_ACTIONS that resolveRequirement + routeActionPlan can handle.
 * Unroutable actions (check, continue) exist for cognitive observability only.
 */
const ROUTABLE_ACTIONS = new Set([
  'collect', 'mine', 'craft', 'build', 'gather', 'smelt', 'repair',
  'navigate', 'explore', 'find',
]);

/** Maps routable canonical actions to task types */
const ACTION_TO_TASK_TYPE: Record<string, string> = {
  collect: 'gathering',
  mine: 'mining',
  craft: 'crafting',
  build: 'building',
  gather: 'gathering',
  smelt: 'crafting',
  repair: 'building',
  navigate: 'navigation',
  explore: 'exploration',
  find: 'exploration',
};

/** Regex to strip residual [GOAL:...] tags (and optional trailing amount) from display text */
const GOAL_TAG_STRIP = /\s*\[GOAL:[^\]]*\](?:\s*\d+\w*)?/gi;

export function extractActionTitle(
  content: string,
  actionType: string
): string {
  const sentences = content.split(/[.!?]/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(actionType)) {
      return sentence.trim();
    }
  }
  return content;
}

export function extractResourceType(content: string): string {
  // Specific wood types take priority over generic "wood"
  if (content.includes('oak')) return 'oak_log';
  if (content.includes('birch')) return 'birch_log';
  if (content.includes('spruce')) return 'spruce_log';
  if (content.includes('jungle')) return 'jungle_log';
  if (content.includes('acacia')) return 'acacia_log';
  if (content.includes('dark oak') || content.includes('dark_oak')) return 'dark_oak_log';
  if (content.includes('mangrove')) return 'mangrove_log';
  if (content.includes('cherry')) return 'cherry_log';
  // Generic "wood" or "log" → suffix pattern that matches any wood type
  if (content.includes('wood') || content.includes('log')) return '_log';
  if (content.includes('iron')) return 'iron_ore';
  if (content.includes('stone')) return 'cobblestone';
  if (content.includes('diamond')) return 'diamond_ore';
  if (content.includes('food')) return 'bread';
  return '_log';
}

export function extractItemType(content: string): string {
  if (content.includes('pickaxe')) return 'wooden_pickaxe';
  if (content.includes('sword')) return 'wooden_sword';
  if (content.includes('axe')) return 'wooden_axe';
  if (content.includes('shovel')) return 'wooden_shovel';
  if (content.includes('table')) return 'crafting_table';
  if (content.includes('planks') || content.includes('plank'))
    return 'oak_planks';
  if (content.includes('stick')) return 'stick';
  return 'oak_planks';
}

export function extractBlockType(content: string): string {
  if (content.includes('iron')) return 'iron_ore';
  if (content.includes('coal')) return 'coal_ore';
  if (content.includes('stone')) return 'stone';
  if (content.includes('diamond')) return 'diamond_ore';
  return 'stone';
}

export function calculateTaskPriority(thought: CognitiveStreamThought): number {
  let priority = 0.5;
  priority += thought.context.confidence * 0.3;
  if (thought.metadata.llmConfidence) {
    priority += thought.metadata.llmConfidence * 0.2;
  }
  if (thought.context.emotionalState === 'urgent') {
    priority += 0.2;
  } else if (thought.context.emotionalState === 'excited') {
    priority += 0.1;
  }
  return Math.min(1.0, priority);
}

export function calculateTaskUrgency(thought: CognitiveStreamThought): number {
  let urgency = 0.3;
  if (thought.context.emotionalState === 'urgent') {
    urgency = 0.8;
  } else if (thought.context.emotionalState === 'excited') {
    urgency = 0.6;
  } else if (thought.context.emotionalState === 'focused') {
    urgency = 0.5;
  }
  urgency += thought.context.confidence * 0.2;
  return Math.min(1.0, urgency);
}

export interface ConvertThoughtToTaskDeps {
  addTask: (taskData: Partial<Task>) => Promise<Task>;
  markThoughtAsProcessed: (thoughtId: string) => Promise<void>;
  seenThoughtIds: Set<string>;
  trimSeenThoughtIds: () => void;
  /** Current inventory for satisfaction-aware dedup. Optional for backward compat. */
  getInventoryBand?: (itemName: string) => string;
  /** Management handler for cancel/pause/resume/prioritize actions. Optional for backward compat. */
  managementHandler?: TaskManagementHandler;
}

/** Recent goal hashes for 5-minute dedup window */
const recentGoalHashes = new Map<string, number>();
const GOAL_DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Check if goal is a duplicate within the dedup window.
 * Key includes inventory band when available so that a re-proposal
 * after the inventory state changed (e.g., items consumed/lost) is NOT suppressed.
 */
function isGoalDuplicate(goal: GoalTagV1, inventoryBand?: string): boolean {
  const invSuffix = inventoryBand ? `:inv=${inventoryBand}` : '';
  const hash = `${goal.action}:${goal.target}:${goal.amount ?? ''}${invSuffix}`;
  const now = Date.now();
  const lastSeen = recentGoalHashes.get(hash);
  if (lastSeen && now - lastSeen < GOAL_DEDUP_WINDOW_MS) {
    return true;
  }
  recentGoalHashes.set(hash, now);
  // Clean old entries
  if (recentGoalHashes.size > 50) {
    for (const [key, ts] of recentGoalHashes) {
      if (now - ts > GOAL_DEDUP_WINDOW_MS) recentGoalHashes.delete(key);
    }
  }
  return false;
}

/**
 * Convert a cognitive thought to a planning task.
 *
 * Primary path: reads `thought.metadata.extractedGoal` (populated by sanitizer).
 * Fallback: keyword-based classification from content.
 * No LLM fallback — the sanitizer is the single boundary.
 *
 * Returns `ConvertThoughtResult` with explicit decision state so callers
 * can distinguish "no task needed" from "task creation failed."
 *
 * Fail-closed: unroutable actions (find, explore, navigate, check, continue) → null.
 */
export async function convertThoughtToTask(
  thought: CognitiveStreamThought,
  deps: ConvertThoughtToTaskDeps
): Promise<ConvertThoughtResult> {
  try {
    if (thought.processed) return { task: null, decision: 'blocked_guard', reason: 'already processed' };

    const lower = thought.content.trim().toLowerCase();
    if (
      lower.startsWith('health:') ||
      lower.startsWith('hunger:') ||
      /observing\s+environment\s+and\s+deciding/.test(lower) ||
      /^\d+%\.?\s*(health|hunger|observing)/.test(lower) ||
      /is complete\.\s*i have \d+ other tasks/.test(lower)
    ) {
      return { task: null, decision: 'blocked_guard', reason: 'status text filtered' };
    }

    if (deps.seenThoughtIds.has(thought.id)) return { task: null, decision: 'dropped_seen', reason: 'thought ID already seen' };
    deps.seenThoughtIds.add(thought.id);
    if (deps.seenThoughtIds.size > 500) {
      deps.trimSeenThoughtIds();
    }

    // Convert-eligibility gate: if the thought explicitly declares convertEligible=false,
    // skip conversion. Missing field (undefined) defaults to eligible for backwards compat.
    if (thought.convertEligible === false) {
      return { task: null, decision: 'blocked_not_eligible', reason: 'thought marked convertEligible=false' };
    }

    // Primary path: use structured extractedGoal from sanitizer
    const extractedGoal = thought.metadata?.extractedGoal as GoalTagV1 | undefined;

    let actionType = 'general';
    let taskTitle = thought.content;
    let taskDescription = thought.content;

    if (extractedGoal && extractedGoal.action) {
      // Management action dispatch — before ROUTABLE_ACTIONS check
      if (MANAGEMENT_ACTIONS.has(extractedGoal.action)) {
        if (!deps.managementHandler) {
          return { task: null, decision: 'management_failed', reason: 'management handler not available' };
        }
        const mgmtResult = deps.managementHandler.handle(
          extractedGoal as GoalTagV1,
          thought.id,
        );
        await deps.markThoughtAsProcessed(thought.id);
        const decisionMap: Record<string, TaskDecision> = {
          applied: 'management_applied',
          needs_disambiguation: 'management_needs_disambiguation',
          target_not_found: 'management_failed',
          invalid_transition: 'management_failed',
          error: 'management_failed',
        };
        return {
          task: null,
          decision: decisionMap[mgmtResult.decision] ?? 'management_failed',
          reason: mgmtResult.reason ?? `management ${mgmtResult.action}: ${mgmtResult.decision}`,
          managementResult: mgmtResult,
        };
      }

      // Goal acceptance gate: must be routable
      if (!ROUTABLE_ACTIONS.has(extractedGoal.action)) {
        return { task: null, decision: 'blocked_unroutable', reason: `action '${extractedGoal.action}' not routable` };
      }

      // Goal dedup: skip if same goal was created recently
      // Include inventory band if available for satisfaction-aware dedup
      const inventoryBand = deps.getInventoryBand
        ? deps.getInventoryBand(extractedGoal.target.replace(/\s+/g, '_'))
        : undefined;
      if ('version' in extractedGoal && isGoalDuplicate(extractedGoal as GoalTagV1, inventoryBand)) {
        return { task: null, decision: 'suppressed_dedup', reason: `duplicate goal within ${GOAL_DEDUP_WINDOW_MS / 1000}s window` };
      }

      actionType = ACTION_TO_TASK_TYPE[extractedGoal.action] || 'general';
      taskTitle = extractActionTitle(lower, extractedGoal.action);
    } else {
      // Fallback: keyword-based classification (no LLM re-parse)
      const content = lower;
      if (
        content.includes('gather') ||
        content.includes('collect') ||
        content.includes('wood') ||
        content.includes('log')
      ) {
        actionType = 'gathering';
        taskTitle = extractActionTitle(content, 'gather');
      } else if (
        content.includes('craft') ||
        content.includes('build') ||
        content.includes('make') ||
        content.includes('create')
      ) {
        actionType = 'crafting';
        taskTitle = extractActionTitle(content, 'craft');
      } else if (
        content.includes('mine') ||
        content.includes('dig') ||
        content.includes('ore')
      ) {
        actionType = 'mining';
        taskTitle = extractActionTitle(content, 'mine');
      } else if (
        content.includes('farm') ||
        content.includes('plant') ||
        content.includes('harvest')
      ) {
        actionType = 'gathering';
        taskTitle = extractActionTitle(content, 'gather');
      } else {
        // Truly general — not enough signal for a task
        return { task: null, decision: 'dropped_sanitizer', reason: 'no structured goal and keyword fallback did not match' };
      }
    }

    // Strip [GOAL:] tags from title and description
    taskTitle = taskTitle.replace(GOAL_TAG_STRIP, '').trim();
    taskDescription = taskDescription.replace(GOAL_TAG_STRIP, '').trim();

    // Ensure we have a non-empty title
    if (!taskTitle) taskTitle = thought.content.replace(GOAL_TAG_STRIP, '').trim();
    if (!taskTitle) taskTitle = 'Autonomous task';

    const parameters: Record<string, any> = {
      thoughtContent: thought.content,
      thoughtId: thought.id,
      thoughtType: thought.metadata.thoughtType,
      confidence: thought.context.confidence,
      cognitiveSystem: thought.context.cognitiveSystem,
      llmConfidence: thought.metadata.llmConfidence,
      model: thought.metadata.model,
    };

    // Build requirement candidate from structured goal or keyword fallback
    if (extractedGoal && extractedGoal.action && ROUTABLE_ACTIONS.has(extractedGoal.action)) {
      parameters.requirementCandidate = {
        kind: extractedGoal.action,
        outputPattern: extractedGoal.target.replace(/\s+/g, '_'),
        quantity: extractedGoal.amount ||
          (extractedGoal.action === 'mine' ? 3 :
           extractedGoal.action === 'collect' || extractedGoal.action === 'gather' ? 8 : 1),
        extractionMethod: 'goal-tag',
      };
    } else if (actionType === 'crafting') {
      const itemName = extractItemType(lower);
      if (itemName) {
        parameters.requirementCandidate = {
          kind: 'craft',
          outputPattern: itemName,
          quantity: 1,
          extractionMethod: 'thought-content',
        };
      }
    } else if (actionType === 'gathering') {
      const resource = extractResourceType(lower);
      if (resource) {
        parameters.requirementCandidate = {
          kind: 'collect',
          outputPattern: resource,
          quantity: parseRequiredQuantityFromTitle(taskTitle, 8),
          extractionMethod: 'thought-content',
        };
      }
    } else if (actionType === 'mining') {
      const blockType = extractBlockType(lower);
      if (blockType) {
        parameters.requirementCandidate = {
          kind: 'mine',
          outputPattern: blockType,
          quantity: parseRequiredQuantityFromTitle(taskTitle, 3),
          extractionMethod: 'thought-content',
        };
      }
    } else if (actionType === 'building') {
      parameters.requirementCandidate = {
        kind: 'build',
        outputPattern: 'basic_shelter_5x5',
        quantity: 1,
        extractionMethod: 'thought-content',
      };
    } else if (actionType === 'navigation' && extractedGoal) {
      parameters.requirementCandidate = {
        kind: 'navigate',
        outputPattern: extractedGoal.target.replace(/\s+/g, '_'),
        quantity: 1,
        extractionMethod: 'goal-tag',
      };
    } else if (actionType === 'exploration' && extractedGoal) {
      parameters.requirementCandidate = {
        kind: extractedGoal.action === 'find' ? 'find' : 'explore',
        outputPattern: extractedGoal.target.replace(/\s+/g, '_'),
        quantity: extractedGoal.amount || 1,
        extractionMethod: 'goal-tag',
      };
    }

    if (actionType === 'gathering') {
      parameters.resourceType = extractResourceType(lower);
    } else if (actionType === 'crafting') {
      parameters.itemType = extractItemType(lower);
    } else if (actionType === 'mining') {
      parameters.blockType = extractBlockType(lower);
    }

    const extractionMethod =
      parameters.requirementCandidate?.extractionMethod || actionType;
    const contentHash = Array.from(thought.content.slice(0, 80))
      .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
      .toString(36)
      .replace('-', 'n');

    const task: Task = {
      id: `cognitive-task-${thought.id}-${extractionMethod}-${contentHash}`,
      title: taskTitle,
      description: taskDescription,
      type: actionType,
      priority: calculateTaskPriority(thought),
      urgency: calculateTaskUrgency(thought),
      progress: 0,
      status: 'pending',
      source: 'autonomous',
      steps: [],
      parameters,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: ['cognitive', 'autonomous', thought.metadata.thoughtType],
        category: actionType,
      },
    };

    const addedTask = await deps.addTask(task);
    await deps.markThoughtAsProcessed(thought.id);
    return { task: addedTask, decision: 'created' };
  } catch (error) {
    console.error('Error converting thought to task:', error);
    return { task: null, decision: 'error', reason: String(error) };
  }
}
