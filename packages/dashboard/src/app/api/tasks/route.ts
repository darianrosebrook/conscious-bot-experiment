import { NextRequest, NextResponse } from 'next/server';
import type { Task } from '@/types';
import { 
  parseTaskDescription, 
  parseStepDescription, 
  parseGoalDescription, 
  parseCurrentAction
} from '@/lib/message-parser';

/**
 * Tasks API
 * Provides task data from the planning system
 *
 * @author @darianrosebrook
 */
export async function GET(_request: NextRequest) {
  try {
    // Fetch tasks directly from planning system
    const tasksRes = await fetch('http://localhost:3002/tasks');
    const stateRes = await fetch('http://localhost:3002/state');

    if (!tasksRes.ok || !stateRes.ok) {
      return NextResponse.json(
        { error: 'Planning system unavailable' },
        { status: 503 }
      );
    }

    const tasksData = await tasksRes.json();
    const stateData = await stateRes.json();
    const tasks: Task[] = [];

    // Convert planning tasks to dashboard tasks
    if (tasksData.tasks && Array.isArray(tasksData.tasks)) {
      for (const task of tasksData.tasks) {
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
                description: task.description
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
      const actionDescription = parseCurrentAction(stateData.reactiveExecutor.currentAction);
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

    // If no tasks found, create a demo task
    if (tasks.length === 0) {
      tasks.push({
        id: `demo-task-${Date.now()}`,
        title: 'Find and collect resources',
        priority: 0.8,
        progress: 0.2,
        source: 'planner' as const,
        steps: [
          { id: 'step-1', label: 'Explore surroundings', done: true },
          { id: 'step-2', label: 'Look for trees', done: false },
          { id: 'step-3', label: 'Gather wood', done: false },
        ],
      });
    }

    return NextResponse.json({
      tasks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Return demo data on error
    return NextResponse.json({
      tasks: [
        {
          id: `demo-task-${Date.now()}`,
          title: 'Find and collect resources',
          priority: 0.8,
          progress: 0.2,
          source: 'planner' as const,
          steps: [
            { id: 'step-1', label: 'Explore surroundings', done: true },
            { id: 'step-2', label: 'Look for trees', done: false },
            { id: 'step-3', label: 'Gather wood', done: false },
          ],
        },
      ],
      timestamp: new Date().toISOString(),
    });
  }
}
