import { NextRequest, NextResponse } from 'next/server';
import type { Task } from '@/types';

/**
 * Tasks API
 * Provides task data from the planning system
 * 
 * @author @darianrosebrook
 */
export async function GET(request: NextRequest) {
  try {
    // Fetch data from planning system
    const planningRes = await fetch('http://localhost:3002/state');
    
    if (!planningRes.ok) {
      return NextResponse.json(
        { error: 'Planning system unavailable' },
        { status: 503 }
      );
    }

    const planningData = await planningRes.json();
    const tasks: Task[] = [];

    // Convert planning goals to tasks
    if (planningData.goalFormulation?.currentGoals) {
      for (const goal of planningData.goalFormulation.currentGoals) {
        tasks.push({
          id: `goal-${goal.id || Date.now()}`,
          title: goal.description || goal.type || 'Unknown Goal',
          priority: goal.priority || 0.5,
          progress: goal.progress || 0,
          source: 'goal' as const,
          steps: goal.steps?.map((step: any, index: number) => ({
            id: `step-${index}`,
            label: step.label || step.description || `Step ${index + 1}`,
            done: step.done || false,
          })) || [],
        });
      }
    }

    // Add current action as a task if executing
    if (planningData.reactiveExecutor?.currentAction) {
      tasks.push({
        id: 'current-action',
        title: `Executing: ${planningData.reactiveExecutor.currentAction}`,
        priority: 1.0,
        progress: 0.5, // Assume in progress
        source: 'planner' as const,
        steps: [
          {
            id: 'action-step',
            label: planningData.reactiveExecutor.currentAction,
            done: false,
          },
        ],
      });
    }

    // Add completed tasks
    if (planningData.goalFormulation?.completedTasks) {
      for (const completed of planningData.goalFormulation.completedTasks) {
        tasks.push({
          id: `completed-${completed.id || Date.now()}`,
          title: completed.description || completed.type || 'Completed Task',
          priority: 0.3,
          progress: 1.0,
          source: 'planner' as const,
          steps: [
            {
              id: 'completed-step',
              label: 'Task completed',
              done: true,
            },
          ],
        });
      }
    }

    return NextResponse.json({
      tasks,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Tasks API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
