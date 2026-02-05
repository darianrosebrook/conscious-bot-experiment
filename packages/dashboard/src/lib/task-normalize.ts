import type { Task } from '@/types';

type TasksResponseShape =
  | { tasks?: Task[] }
  | { tasks?: { current?: Task[]; completed?: Task[]; total?: number } };

export function normalizeTasksResponse(data: unknown): Task[] {
  const payload = data as TasksResponseShape | null;
  const tasks = payload?.tasks as
    | Task[]
    | { current?: Task[]; completed?: Task[] }
    | undefined;
  if (Array.isArray(tasks)) return tasks;
  if (tasks && typeof tasks === 'object') {
    const current = (tasks as { current?: Task[] }).current;
    if (Array.isArray(current)) return current;
  }
  return [];
}
