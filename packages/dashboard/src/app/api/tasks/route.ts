import { NextRequest, NextResponse } from 'next/server';
import type { Task } from '@/types';
import { parseCurrentAction } from '@/lib/message-parser';

/**
 * Tasks API
 * Provides task data from the planning system using service discovery
 *
 * @author @darianrosebrook
 */
export async function GET(_request: NextRequest) {
  try {
    // Get service endpoints from environment configuration
    const planningUrl =
      process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';
    const timeoutMs = 5000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Fetch tasks and state from planning system
    const [tasksRes, stateRes] = await Promise.allSettled([
      fetch(`${planningUrl}/tasks`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }),
      fetch(`${planningUrl}/state`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }),
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

    // Convert enhanced task integration tasks to dashboard format
    if (tasksData.success && tasksData.tasks) {
      // Handle nested structure from planning service
      const currentTasks = tasksData.tasks.current || tasksData.tasks;
      const completedTasks = tasksData.tasks.completed || [];

      // Process current tasks
      if (Array.isArray(currentTasks)) {
        for (const task of currentTasks) {
          tasks.push({
            id: task.id,
            title: task.metadata?.titleDisplay ?? task.title,
            priority: task.priority || 0.5,
            progress: task.progress || 0,
            source: task.source || ('planner' as any),
            steps:
              task.steps?.map((step: any) => ({
                id: step.id,
                label: step.label,
                done: step.done,
              })) || [],
            requirement: task.metadata?.requirement || task.requirement,
          });
        }
      }

      // Process completed tasks (optional)
      if (Array.isArray(completedTasks)) {
        for (const task of completedTasks) {
          tasks.push({
            id: task.id,
            title: task.metadata?.titleDisplay ?? task.title,
            priority: task.priority || 0.5,
            progress: 1.0, // Completed tasks have 100% progress
            source: task.source || ('planner' as any),
            steps:
              task.steps?.map((step: any) => ({
                id: step.id,
                label: step.label,
                done: true, // All steps are done for completed tasks
              })) || [],
          });
        }
      }
    }

    // Add enhanced task integration data from state
    if (stateData.enhancedTaskIntegration?.activeTasks) {
      const activeTasks = stateData.enhancedTaskIntegration.activeTasks;
      if (Array.isArray(activeTasks)) {
        for (const task of activeTasks) {
          // Avoid duplicates
          if (!tasks.find((t) => t.id === task.id)) {
            tasks.push({
              id: task.id,
              title: task.metadata?.titleDisplay ?? task.title,
              priority: task.priority || 0.5,
              progress: task.progress || 0,
              source: task.source || ('planner' as any),
              steps:
                task.steps?.map((step: any) => ({
                  id: step.id,
                  label: step.label,
                  done: step.done,
                })) || [],
              requirement: task.metadata?.requirement || task.requirement,
            });
          }
        }
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

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({
      tasks: [],
      fallback: true,
      status: 'degraded',
      error: errorMessage,
      message: 'Planning system temporarily unavailable.',
      timestamp: new Date().toISOString(),
    });
  }
}
