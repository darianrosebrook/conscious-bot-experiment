import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTasksResponse } from './task-normalize.ts';

const taskA = { id: 't1', title: 'A' } as const;
const taskB = { id: 't2', title: 'B' } as const;

test('normalizeTasksResponse handles array payloads', () => {
  const out = normalizeTasksResponse({ tasks: [taskA, taskB] });
  assert.equal(out.length, 2);
  assert.equal(out[0]?.id, 't1');
});

test('normalizeTasksResponse handles planning current/completed shape', () => {
  const out = normalizeTasksResponse({
    tasks: { current: [taskA], completed: [taskB] },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, 't1');
});

test('normalizeTasksResponse handles missing tasks', () => {
  const out = normalizeTasksResponse({});
  assert.equal(out.length, 0);
});
