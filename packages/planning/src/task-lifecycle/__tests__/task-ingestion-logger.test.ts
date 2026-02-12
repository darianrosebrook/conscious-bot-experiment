/**
 * Tests for TaskIngestionLogger structured logging.
 *
 * Validates: event shape, JSON serialization, source enum coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logTaskIngestion,
  type TaskIngestionEvent,
  type TaskIngestionSource,
} from '../task-ingestion-logger';

describe('logTaskIngestion', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('emits [TaskIngestion] prefix with JSON payload', () => {
    logTaskIngestion({
      _diag_version: 1,
      source: 'thought_converter',
      task_id: 'task-123',
      decision: 'created',
      task_type: 'sterling_ir',
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
    const [prefix, payload] = consoleSpy.mock.calls[0];
    expect(prefix).toBe('[TaskIngestion]');

    const parsed = JSON.parse(payload);
    expect(parsed._diag_version).toBe(1);
    expect(parsed.source).toBe('thought_converter');
    expect(parsed.task_id).toBe('task-123');
    expect(parsed.decision).toBe('created');
    expect(parsed.task_type).toBe('sterling_ir');
  });

  it('handles error decision with reason', () => {
    logTaskIngestion({
      _diag_version: 1,
      source: 'http_post_task',
      decision: 'error',
      reason: 'connection_refused',
    });

    const parsed = JSON.parse(consoleSpy.mock.calls[0][1]);
    expect(parsed.decision).toBe('error');
    expect(parsed.reason).toBe('connection_refused');
    expect(parsed.task_id).toBeUndefined();
  });

  it('handles deduped decision', () => {
    logTaskIngestion({
      _diag_version: 1,
      source: 'reflex_registry',
      decision: 'deduped',
      reason: 'goalKey_guard',
    });

    const parsed = JSON.parse(consoleSpy.mock.calls[0][1]);
    expect(parsed.decision).toBe('deduped');
  });

  it('includes parent_task_id when provided', () => {
    logTaskIngestion({
      _diag_version: 1,
      source: 'crafting_table_subtask',
      task_id: 'child-1',
      parent_task_id: 'parent-1',
      decision: 'created',
      task_type: 'crafting',
    });

    const parsed = JSON.parse(consoleSpy.mock.calls[0][1]);
    expect(parsed.parent_task_id).toBe('parent-1');
  });

  it('all source enum values are valid', () => {
    const allSources: TaskIngestionSource[] = [
      'thought_converter',
      'http_post_task',
      'http_post_goal',
      'reflex_registry',
      'cognitive_reflection',
      'crafting_table_subtask',
      'resource_gathering_subtask',
      'complex_crafting_subtask',
      'executor_explore_subtask',
      'mcp_explore_subtask',
    ];
    expect(allSources).toHaveLength(10);

    for (const source of allSources) {
      logTaskIngestion({ _diag_version: 1, source, decision: 'created' });
    }
    expect(consoleSpy).toHaveBeenCalledTimes(10);
  });
});
