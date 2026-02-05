/**
 * Task Stream Hook
 *
 * Manages task updates via SSE push and slow-poll fallback.
 * Extracted from page.tsx to reduce component complexity.
 *
 * @author @darianrosebrook
 */

import { useEffect, useCallback } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import { useSSE } from '@/hooks/use-sse';
import { mapPlanningTaskToDashboard } from '@/lib/task-utils';
import { normalizeTasksResponse } from '@/lib/task-normalize';
import type { Task } from '@/types';

const TASK_POLL_MS = 60_000;

export function useTaskStream() {
  const { setTasks, setTasksFallback, updateTask, addTask } =
    useDashboardStore();

  // Poll tasks as fallback (push via SSE is primary)
  useEffect(() => {
    const pollTasks = async () => {
      try {
        const res = await fetch('/api/tasks', {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          const normalized = normalizeTasksResponse(data);
          if (import.meta.env.VITE_DEBUG_DASHBOARD === '1') {
            console.debug('[Dashboard] /api/tasks', {
              status: res.status,
              taskCount: normalized.length,
              fallback: data.fallback,
            });
          }
          setTasks(normalized);
          setTasksFallback(!!data.fallback);
        } else if (import.meta.env.VITE_DEBUG_DASHBOARD === '1') {
          console.debug('[Dashboard] /api/tasks non-OK', {
            status: res.status,
          });
        }
      } catch {
        // Non-fatal; next poll will retry
        if (import.meta.env.VITE_DEBUG_DASHBOARD === '1') {
          console.debug('[Dashboard] /api/tasks fetch failed');
        }
      }
    };
    const interval = setInterval(pollTasks, TASK_POLL_MS);
    return () => clearInterval(interval);
  }, [setTasks, setTasksFallback]);

  // Subscribe to task-updates SSE
  const handleTaskSSE = useCallback(
    (data: unknown) => {
      const msg = data as {
        type?: string;
        event?: string;
        data?: {
          task?: {
            id: string;
            title?: string;
            priority?: number;
            progress?: number;
            source?: string;
            steps?: { id: string; label?: string; done?: boolean }[];
            requirement?: unknown;
            metadata?: { titleDisplay?: string; [key: string]: unknown };
          };
        };
      };
      if (msg.type !== 'task_update' || !msg.data?.task?.id) return;
      const { event, data: taskData } = msg;
      const task = taskData.task;
      if (!task) return;

      if (event === 'taskAdded') {
        addTask(mapPlanningTaskToDashboard(task));
        return;
      }
      if (event === 'taskMetadataUpdated') {
        const mapped = mapPlanningTaskToDashboard(task);
        updateTask(task.id, {
          progress:
            typeof task.progress === 'number' ? task.progress : undefined,
          steps: mapped.steps,
          requirement: mapped.requirement,
        });
        return;
      }
      if (
        event === 'taskProgressUpdated' ||
        event === 'taskStepCompleted' ||
        event === 'taskStepStarted' ||
        event === 'taskStepsInserted'
      ) {
        const mapped = mapPlanningTaskToDashboard(task);
        const updates: Partial<Task> = {
          progress:
            typeof task.progress === 'number' ? task.progress : undefined,
        };
        if (mapped.steps) {
          updates.steps = mapped.steps;
        }
        if (mapped.requirement) {
          updates.requirement = mapped.requirement;
        }
        if (
          updates.progress !== undefined ||
          updates.steps !== undefined ||
          updates.requirement !== undefined
        ) {
          updateTask(task.id, updates);
        }
      }
    },
    [updateTask, addTask],
  );

  useSSE({ url: '/api/task-updates', onMessage: handleTaskSSE });
}
