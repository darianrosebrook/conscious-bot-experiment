import { test, expect } from 'vitest';
import { normalizeTasksResponse } from './task-normalize.ts';

const taskA = { id: 't1', title: 'A' } as const;
const taskB = { id: 't2', title: 'B' } as const;

test('normalizeTasksResponse handles array payloads', () => {
  const out = normalizeTasksResponse({ tasks: [taskA, taskB] });
  expect(out.length).toBe(2);
  expect(out[0]?.id).toBe('t1');
});

test('normalizeTasksResponse handles planning current/completed shape', () => {
  const out = normalizeTasksResponse({
    tasks: { current: [taskA], completed: [taskB] },
  });
  expect(out.length).toBe(1);
  expect(out[0]?.id).toBe('t1');
});

test('normalizeTasksResponse handles missing tasks', () => {
  const out = normalizeTasksResponse({});
  expect(out.length).toBe(0);
});
