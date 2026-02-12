import type { Task } from '../task-integration.js';

export type TaskEventType =
  | 'task_added'
  | 'task_status_updated'
  | 'task_progress_updated'
  | 'task_lifecycle';

export interface TaskEventPayload {
  task: Task;
  previousStatus?: string;
  previousProgress?: number;
  lifecycleEventType?: string;
}

export interface PlanningEventStoreConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  worldSeed: string;
  maxConnections?: number;
  enabled?: boolean;
}

export interface PlanningEventStoreStatus {
  enabled: boolean;
  initialized: boolean;
  error: string | null;
  database: string | null;
}
