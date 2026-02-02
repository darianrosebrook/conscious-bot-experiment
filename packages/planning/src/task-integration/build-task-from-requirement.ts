/**
 * Canonical task builder for internal sub-tasks.
 *
 * Guarantees every sub-task carries `parameters.requirementCandidate`
 * so that `resolveRequirement()` succeeds in strict mode and the
 * compiler/solver backend can produce executable steps.
 *
 * @author @darianrosebrook
 */

import type { Task } from '../types/task';

export interface BuildTaskInput {
  kind: string;           // 'craft' | 'collect' | 'mine' | 'build' | 'explore' | 'find' | 'navigate'
  outputPattern: string;  // 'oak_log', 'crafting_table', 'stone', etc.
  quantity: number;
}

export interface BuildTaskOptions {
  title?: string;
  description?: string;
  parentTask?: { id: string; priority?: number; urgency?: number; metadata?: any };
  tags?: string[];
  extraParameters?: Record<string, any>;
  source?: string;
  type?: string;          // override auto-inferred type
}

/** Map requirement kind → task type */
const KIND_TO_TYPE: Record<string, string> = {
  craft: 'crafting',
  collect: 'gathering',
  mine: 'mining',
  build: 'building',
  explore: 'exploration',
  find: 'exploration',
  navigate: 'navigation',
};

/** Compute a deterministic dedupe key for a sub-task. */
export function computeSubtaskKey(
  input: BuildTaskInput,
  parentTaskId: string
): string {
  return `${input.kind}|${input.outputPattern}|${input.quantity}|${parentTaskId}`;
}

/**
 * Build a partial Task with `parameters.requirementCandidate` guaranteed.
 *
 * The returned object is suitable for passing to `taskIntegration.addTask()`.
 * Does NOT set `id` or `steps` — `addTask` handles both.
 */
export function buildTaskFromRequirement(
  input: BuildTaskInput,
  options?: BuildTaskOptions
): Partial<Task> {
  const parentTaskId = options?.parentTask?.id;
  const autoType = options?.type ?? KIND_TO_TYPE[input.kind] ?? 'general';

  // Auto-generate title
  const qtyStr = input.quantity > 1 ? ` x${input.quantity}` : '';
  const kindLabel = input.kind.charAt(0).toUpperCase() + input.kind.slice(1);
  const autoTitle = `${kindLabel} ${input.outputPattern}${qtyStr}`;

  const subtaskKey = parentTaskId
    ? computeSubtaskKey(input, parentTaskId)
    : undefined;

  return {
    title: options?.title ?? autoTitle,
    description:
      options?.description ??
      `${kindLabel} ${input.quantity}x ${input.outputPattern}`,
    type: autoType,
    priority: 0.7,
    urgency: 0.7,
    source: 'autonomous' as const,
    parameters: {
      ...options?.extraParameters,
      requirementCandidate: {
        kind: input.kind,
        outputPattern: input.outputPattern,
        quantity: input.quantity,
      },
    },
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [
        'internal',
        'prerequisite',
        ...(options?.tags ?? []),
      ],
      category: autoType,
      parentTaskId,
      subtaskKey,
      taskProvenance: {
        builder: 'buildTaskFromRequirement',
        source: options?.source ?? 'internal',
      },
    },
  };
}
