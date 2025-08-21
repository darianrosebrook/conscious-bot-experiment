/**
 * Task Network models (stub).
 *
 * Author: @darianrosebrook
 */

export type TaskId = string;

export interface Task {
  id: TaskId;
  name: string;
  subTasks?: TaskId[];
}

export interface TaskNetwork {
  root: TaskId;
  tasks: Record<TaskId, Task>;
}
