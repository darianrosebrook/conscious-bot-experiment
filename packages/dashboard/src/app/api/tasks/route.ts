import { NextRequest, NextResponse } from 'next/server';
import type { Task } from '@/types';
import {
  parseTaskDescription,
  parseStepDescription,
  parseGoalDescription,
  parseCurrentAction,
} from '@/lib/message-parser';

/**
 * Tasks API
 * Provides task data from the planning system
 *
 * @author @darianrosebrook
 */
export async function GET(_request: NextRequest) {
  try {
    // Fetch tasks directly from planning system with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const [tasksRes, stateRes] = await Promise.allSettled([
      fetch('http://localhost:3002/tasks', { signal: controller.signal }),
      fetch('http://localhost:3002/state', { signal: controller.signal }),
    ]);

    clearTimeout(timeoutId);

    // Check if both requests succeeded
    if (tasksRes.status === 'rejected' || stateRes.status === 'rejected') {
      throw new Error('Planning system connection failed');
    }

    if (!tasksRes.value.ok || !stateRes.value.ok) {
      throw new Error(
        `Planning system returned ${tasksRes.value.status || stateRes.value.status}`
      );
    }

    const tasksData = await tasksRes.value.json();
    const stateData = await stateRes.value.json();
    const tasks: Task[] = [];

    // Convert planning tasks to dashboard tasks with deduplication
    if (tasksData.tasks && Array.isArray(tasksData.tasks)) {
      const seenTasks = new Set<string>();

      for (const task of tasksData.tasks) {
        const taskKey = `${task.type}-${task.description}`;

        // Skip if we've already seen this task
        if (seenTasks.has(taskKey)) {
          continue;
        }
        seenTasks.add(taskKey);

        tasks.push({
          id: task.id || `task-${Date.now()}`,
          title: parseTaskDescription(task),
          priority: task.priority || 0.5,
          progress: task.status === 'completed' ? 1.0 : 0.3,
          source: 'planner' as const,
          steps: [
            {
              id: `step-${task.id}`,
              label: parseStepDescription({
                action: task.type,
                parameters: task.parameters,
                description: task.description,
              }),
              done: task.status === 'completed',
            },
          ],
        });
      }
    }

    // Convert planning goals to tasks
    if (stateData.goalFormulation?.currentGoals) {
      for (const goal of stateData.goalFormulation.currentGoals) {
        tasks.push({
          id: `goal-${goal.id || Date.now()}`,
          title: parseGoalDescription(goal),
          priority: goal.priority || 0.5,
          progress: goal.progress || 0,
          source: 'goal' as const,
          steps:
            goal.steps?.map((step: Record<string, unknown>, index: number) => ({
              id: `step-${index}`,
              label: parseStepDescription(step),
              done: step.done || false,
            })) || [],
        });
      }
    }

    // Add current action as a task if executing
    if (stateData.reactiveExecutor?.currentAction) {
      const actionDescription = parseCurrentAction(
        stateData.reactiveExecutor.currentAction
      );
      tasks.push({
        id: 'current-action',
        title: `Executing: ${actionDescription}`,
        priority: 1.0,
        progress: 0.5, // Assume in progress
        source: 'planner' as const,
        steps: [
          {
            id: 'action-step',
            label: actionDescription,
            done: false,
          },
        ],
      });
    }

    // If no tasks found, create a system status task
    if (tasks.length === 0) {
      tasks.push({
        id: `system-status-${Date.now()}`,
        title: 'System Status: No active tasks',
        priority: 0.3,
        progress: 0,
        source: 'system' as const,
        steps: [
          { id: 'step-1', label: 'Planning system active', done: true },
          { id: 'step-2', label: 'Waiting for goals', done: false },
          { id: 'step-3', label: 'Monitoring world state', done: true },
        ],
      });
    }

    return NextResponse.json({
      tasks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching planning data:', error);

    // Enhanced graceful fallback with better error handling and user feedback
    const isDevelopment = process.env.NODE_ENV === 'development';
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorType =
      error instanceof Error ? error.constructor.name : 'UnknownError';

    if (isDevelopment) {
      // Development mode: Show detailed service status and recovery steps
      return NextResponse.json({
        tasks: [
          {
            id: `service-unavailable-${Date.now()}`,
            title: `Planning service unavailable (${errorType})`,
            priority: 1.0,
            progress: 0,
            source: 'system' as const,
            steps: [
              {
                id: 'step-1',
                label: `Diagnose error: ${errorMessage}`,
                done: false,
                error: true,
              },
              {
                id: 'step-2',
                label: 'Check planning service status',
                done: false,
                action: 'check_service',
              },
              {
                id: 'step-3',
                label: 'Restart planning service if needed',
                done: false,
                action: 'restart_service',
              },
              {
                id: 'step-4',
                label: 'Verify network connectivity',
                done: false,
                action: 'check_network',
              },
              {
                id: 'step-5',
                label: 'Check service logs for details',
                done: false,
                action: 'check_logs',
              },
            ],
          },
          {
            id: `fallback-tasks-${Date.now()}`,
            title: 'System fallback tasks',
            priority: 0.5,
            progress: 0,
            source: 'system' as const,
            steps: [
              { id: 'step-1', label: 'Maintain system stability', done: true },
              { id: 'step-2', label: 'Monitor service health', done: false },
              {
                id: 'step-3',
                label: 'Prepare for service recovery',
                done: false,
              },
            ],
          },
        ],
        timestamp: new Date().toISOString(),
        status: 'degraded',
        error: errorMessage,
        errorType,
        fallback: true,
        recoverySteps: [
          'Check planning service logs',
          'Verify service dependencies',
          'Restart planning service',
          'Check network connectivity',
          'Verify configuration files',
        ],
      });
    }

    // Production mode: Graceful degradation with minimal but informative fallback
    return NextResponse.json({
      tasks: [
        {
          id: `system-maintenance-${Date.now()}`,
          title: 'System maintenance in progress',
          priority: 0.3,
          progress: 0,
          source: 'system' as const,
          steps: [
            { id: 'step-1', label: 'System monitoring active', done: true },
            {
              id: 'step-2',
              label: 'Service recovery in progress',
              done: false,
            },
            { id: 'step-3', label: 'Normal operation resuming', done: false },
          ],
        },
      ],
      timestamp: new Date().toISOString(),
      status: 'maintenance',
      fallback: true,
      message:
        'Planning system temporarily unavailable. Normal operation will resume shortly.',
    });
  }
}
