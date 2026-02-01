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
export function extractActionableSteps(content: string): Array<{ label: string; estimatedDuration?: number }> {
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
 * Convert a cognitive reflection task into actionable tasks and add them
 * via task integration. Does not mark the reflection task completed when
 * steps are found; only marks completed when no actionable steps are found.
 */
export async function convertCognitiveReflectionToTasks(
  cognitiveTask: { id: string; title?: string; priority?: number; urgency?: number; parameters?: { thoughtContent?: string } },
  taskIntegration: ITaskIntegration
): Promise<void> {
  try {
    console.log(
      '[AUTONOMOUS EXECUTOR] Converting cognitive reflection to actionable tasks:',
      cognitiveTask.title
    );

    const thoughtContent = cognitiveTask.parameters?.thoughtContent || '';
    const steps = extractActionableSteps(thoughtContent);

    if (steps.length > 0) {
      console.log(
        '[AUTONOMOUS EXECUTOR] Found',
        steps.length,
        'actionable steps'
      );

      for (const step of steps) {
        const actionTask = {
          id: `action-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: step.label,
          type: 'action',
          description: step.label,
          priority: cognitiveTask.priority ?? 0.5,
          urgency: cognitiveTask.urgency ?? 0.5,
          parameters: {
            action: determineActionType(step.label),
            estimatedDuration: step.estimatedDuration ?? 5000,
          },
          goal: 'execute_action',
          status: 'pending' as const,
          createdAt: Date.now(),
          completedAt: null,
          parentTaskId: cognitiveTask.id,
          progress: 0,
        };

        await taskIntegration.addTask(actionTask);
        console.log(
          '[AUTONOMOUS EXECUTOR] Created actionable task:',
          actionTask.title
        );
      }

      console.log(
        '[AUTONOMOUS EXECUTOR] Cognitive reflection converted to actionable tasks - keeping reflection active until execution'
      );
    } else {
      console.log(
        '[AUTONOMOUS EXECUTOR] No actionable steps found, marking as completed'
      );
      await taskIntegration.updateTaskStatus(cognitiveTask.id, 'completed');
    }
  } catch (error) {
    console.error(
      '[AUTONOMOUS EXECUTOR] Failed to convert cognitive reflection to tasks:',
      error
    );
    await taskIntegration.updateTaskStatus(cognitiveTask.id, 'failed');
  }
}
