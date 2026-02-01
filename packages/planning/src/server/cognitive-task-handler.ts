/**
 * Cognitive thought to task conversion handler.
 * Converts cognitive reflection tasks into actionable tasks and detects
 * actionable steps in thought content. Used by the autonomous executor
 * for intrusive task handling.
 *
 * @author @darianrosebrook
 */

import type { ITaskIntegration } from '../interfaces/task-integration';

const ACTIONABLE_KEYWORDS = [
  'approach',
  'chop',
  'craft',
  'build',
  'gather',
  'collect',
  'use',
  'move',
  'identify',
  'return',
  'place',
  'set up',
  'choose',
  'begin',
  'start',
  'scan',
  'mark',
  'transport',
  'break',
  'cut down',
  'observe',
];

/**
 * Detect if cognitive reflection content contains actionable steps.
 */
export function detectActionableSteps(thoughtContent: string): boolean {
  const content = thoughtContent.toLowerCase();
  return ACTIONABLE_KEYWORDS.some((keyword) => content.includes(keyword));
}

/**
 * Extract actionable steps from cognitive reflection content (sentence-level).
 */
export function extractActionableSteps(
  content: string
): Array<{ label: string; estimatedDuration?: number }> {
  const steps: Array<{ label: string; estimatedDuration?: number }> = [];
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const stepTerms = [
    'approach',
    'chop',
    'craft',
    'build',
    'gather',
    'collect',
    'use',
    'move',
    'identify',
    'scan',
  ];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (stepTerms.some((term) => lower.includes(term))) {
      steps.push({
        label: sentence.trim(),
        estimatedDuration: 5000,
      });
    }
  }
  return steps;
}

/**
 * Map step description to action type for task parameters.
 */
export function determineActionType(stepDescription: string): string {
  const description = stepDescription.toLowerCase();

  if (
    description.includes('approach') ||
    description.includes('move') ||
    description.includes('walk')
  ) {
    return 'move_to';
  }
  if (description.includes('chop') || description.includes('cut')) {
    return 'dig_block';
  }
  if (description.includes('craft')) {
    return 'craft_recipe';
  }
  if (description.includes('build') || description.includes('construct')) {
    return 'build_structure';
  }
  if (description.includes('gather') || description.includes('collect')) {
    return 'gather_resources';
  }

  return 'generic_action';
}

/**
 * Convert a cognitive reflection task into advisory action tasks and add them
 * via task integration. Does not mark the reflection task completed when
 * steps are found; only marks completed when no actionable steps are found.
 *
 * Tasks are created with type='advisory_action' because the NL sentence parser
 * cannot produce deterministic `requirementCandidate` values. Advisory actions
 * bypass `generateDynamicSteps` and serve as observable markers of the cognitive
 * boundary's intent. A follow-up commit may add deterministic inference to
 * promote these to executable tasks via `buildTaskFromRequirement`.
 */
export async function convertCognitiveReflectionToTasks(
  cognitiveTask: {
    id: string;
    title?: string;
    priority?: number;
    urgency?: number;
    parameters?: { thoughtContent?: string };
    metadata?: Record<string, any>;
  },
  taskIntegration: ITaskIntegration
): Promise<void> {
  try {
    // Idempotency: if we already spawned advisory actions for this reflection, bail out.
    // Prevents duplicate spawns if the executor re-selects the same cognitive_reflection.
    if (cognitiveTask.metadata?.advisorySpawned) {
      console.log(
        `[CognitiveHandler] Skipping already-spawned reflection: ${cognitiveTask.id}`
      );
      return;
    }

    console.log(
      '[CognitiveHandler] Converting cognitive reflection to advisory actions:',
      cognitiveTask.title
    );

    const thoughtContent = cognitiveTask.parameters?.thoughtContent || '';
    const steps = extractActionableSteps(thoughtContent);

    if (steps.length > 0) {
      const spawnMetrics = steps.map((step) => ({
        label: step.label,
        actionType: determineActionType(step.label),
      }));
      console.log(
        `[CognitiveHandler] Found ${steps.length} actionable steps:`,
        JSON.stringify(spawnMetrics)
      );

      for (const step of steps) {
        const actionType = determineActionType(step.label);
        const actionTask = {
          title: step.label,
          // advisory_action: NL-parsed intent without deterministic requirement inference.
          // Does not enter compiler/solver step generation. Safe marker task.
          type: 'advisory_action',
          description: step.label,
          source: 'autonomous' as const,
          priority: cognitiveTask.priority ?? 0.5,
          urgency: cognitiveTask.urgency ?? 0.5,
          parameters: {
            action: actionType,
            estimatedDuration: step.estimatedDuration ?? 5000,
          },
          goal: 'execute_action',
          status: 'pending' as const,
          progress: 0,
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            retryCount: 0,
            maxRetries: 1,
            childTaskIds: [],
            tags: ['cognitive', 'advisory'],
            category: 'advisory_action',
            parentTaskId: cognitiveTask.id,
            taskProvenance: {
              builder: 'convertCognitiveReflectionToTasks',
              source: 'cognitive_reflection',
              actionType,
            },
          },
        };

        await taskIntegration.addTask(actionTask);
        console.log(
          `[CognitiveHandler] Created advisory action: "${actionTask.title}" (${actionType})`
        );
      }

      // Mark the parent reflection as processed and non-selectable.
      // blockedReason prevents the executor from re-selecting this reflection,
      // avoiding an idle spin (selected → handler exits → re-selected → ...).
      taskIntegration.updateTaskMetadata(cognitiveTask.id, {
        advisorySpawned: true,
        advisorySpawnedAt: Date.now(),
        advisoryCount: steps.length,
        blockedReason: 'advisory_spawned',
      });

      console.log(
        '[CognitiveHandler] Cognitive reflection converted — parent blocked (advisory_spawned)'
      );
    } else {
      console.log(
        '[CognitiveHandler] No actionable steps found, marking as completed'
      );
      await taskIntegration.updateTaskStatus(cognitiveTask.id, 'completed');
    }
  } catch (error) {
    console.error(
      '[CognitiveHandler] Failed to convert cognitive reflection to tasks:',
      error
    );
    await taskIntegration.updateTaskStatus(cognitiveTask.id, 'failed');
  }
}
