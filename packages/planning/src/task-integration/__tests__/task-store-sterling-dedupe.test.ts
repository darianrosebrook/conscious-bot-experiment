/**
 * TaskStore Sterling dedupe behavior.
 */

import { describe, it, expect } from 'vitest';
import { TaskStore } from '../task-store';
import type { Task } from '../../types/task';

function makeTask(id: string, dedupeKey: { schemaVersion?: string; digest: string }): Task {
  return {
    id,
    title: `task ${id}`,
    description: 'test',
    type: 'sterling_ir',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'pending',
    source: 'autonomous',
    steps: [],
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'sterling_ir',
      sterling: {
        committedIrDigest: dedupeKey.digest,
        schemaVersion: dedupeKey.schemaVersion ?? 'v1',
      },
    },
  };
}

describe('TaskStore Sterling dedupe', () => {
  it('dedupes against history when index entry is stale', () => {
    const store = new TaskStore();
    const taskA = makeTask('task_a', { schemaVersion: 'v1', digest: 'digest_1' });
    const dedupeKey = 'v1:digest_1';

    store.setTask(taskA);
    store.pushHistory(taskA);
    store.deleteTask(taskA.id);

    const hit = store.findBySterlingDedupeKey(dedupeKey);
    expect(hit).toBeDefined();
    expect(hit?.id).toBe('task_a');
  });
});
