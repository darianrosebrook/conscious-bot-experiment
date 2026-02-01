/**
 * Tests for buildTaskFromRequirement builder.
 *
 * Verifies:
 * - requirementCandidate shape is minimal (kind, outputPattern, quantity only)
 * - provenance stored in metadata.taskProvenance
 * - type auto-inference from kind
 * - title auto-generation
 * - priority defaults
 * - tags include internal + prerequisite
 * - subtaskKey determinism
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  buildTaskFromRequirement,
  computeSubtaskKey,
  type BuildTaskInput,
} from '../build-task-from-requirement';

describe('buildTaskFromRequirement', () => {
  it('craft input → requirementCandidate.kind = "craft"', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'crafting_table', quantity: 1 });
    const candidate = result.parameters?.requirementCandidate;
    expect(candidate).toEqual({ kind: 'craft', outputPattern: 'crafting_table', quantity: 1 });
  });

  it('collect input → requirementCandidate.kind = "collect"', () => {
    const result = buildTaskFromRequirement({ kind: 'collect', outputPattern: 'oak_log', quantity: 4 });
    const candidate = result.parameters?.requirementCandidate;
    expect(candidate).toEqual({ kind: 'collect', outputPattern: 'oak_log', quantity: 4 });
  });

  it('mine input → requirementCandidate.kind = "mine"', () => {
    const result = buildTaskFromRequirement({ kind: 'mine', outputPattern: 'iron_ore', quantity: 3 });
    const candidate = result.parameters?.requirementCandidate;
    expect(candidate).toEqual({ kind: 'mine', outputPattern: 'iron_ore', quantity: 3 });
  });

  it('explore input → requirementCandidate.kind = "explore"', () => {
    const result = buildTaskFromRequirement({ kind: 'explore', outputPattern: 'oak_log', quantity: 1 });
    const candidate = result.parameters?.requirementCandidate;
    expect(candidate).toEqual({ kind: 'explore', outputPattern: 'oak_log', quantity: 1 });
  });

  it('candidate has NO extractionMethod field', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'stick', quantity: 4 });
    const candidate = result.parameters?.requirementCandidate;
    expect(candidate.extractionMethod).toBeUndefined();
    expect(Object.keys(candidate)).toEqual(['kind', 'outputPattern', 'quantity']);
  });

  it('provenance in metadata.taskProvenance', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'stick', quantity: 4 });
    const meta = result.metadata as any;
    expect(meta.taskProvenance).toEqual({
      builder: 'buildTaskFromRequirement',
      source: 'internal',
    });
  });

  it('auto-generates title from kind + outputPattern', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'crafting_table', quantity: 1 });
    expect(result.title).toBe('Craft crafting_table');
  });

  it('auto-generates title with quantity suffix for qty > 1', () => {
    const result = buildTaskFromRequirement({ kind: 'collect', outputPattern: 'oak_log', quantity: 4 });
    expect(result.title).toBe('Collect oak_log x4');
  });

  it('priority defaults to 0.7', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'stick', quantity: 4 });
    expect(result.priority).toBe(0.7);
  });

  it('includes internal + prerequisite tags', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'stick', quantity: 4 });
    const tags = (result.metadata as any)?.tags;
    expect(tags).toContain('internal');
    expect(tags).toContain('prerequisite');
  });

  it('extraParameters merged alongside requirementCandidate', () => {
    const result = buildTaskFromRequirement(
      { kind: 'collect', outputPattern: 'oak_log', quantity: 4 },
      { extraParameters: { targetQuantity: 4, currentQuantity: 0 } }
    );
    expect(result.parameters?.targetQuantity).toBe(4);
    expect(result.parameters?.currentQuantity).toBe(0);
    expect(result.parameters?.requirementCandidate).toBeDefined();
  });

  it('type override respected', () => {
    const result = buildTaskFromRequirement(
      { kind: 'build', outputPattern: 'crafting_table', quantity: 1 },
      { type: 'placement' }
    );
    expect(result.type).toBe('placement');
  });

  it('type auto-inferred from kind', () => {
    expect(buildTaskFromRequirement({ kind: 'craft', outputPattern: 'x', quantity: 1 }).type).toBe('crafting');
    expect(buildTaskFromRequirement({ kind: 'collect', outputPattern: 'x', quantity: 1 }).type).toBe('gathering');
    expect(buildTaskFromRequirement({ kind: 'mine', outputPattern: 'x', quantity: 1 }).type).toBe('mining');
    expect(buildTaskFromRequirement({ kind: 'build', outputPattern: 'x', quantity: 1 }).type).toBe('building');
    expect(buildTaskFromRequirement({ kind: 'explore', outputPattern: 'x', quantity: 1 }).type).toBe('exploration');
    expect(buildTaskFromRequirement({ kind: 'find', outputPattern: 'x', quantity: 1 }).type).toBe('exploration');
    expect(buildTaskFromRequirement({ kind: 'navigate', outputPattern: 'x', quantity: 1 }).type).toBe('navigation');
  });

  it('sets parentTaskId from parentTask option', () => {
    const result = buildTaskFromRequirement(
      { kind: 'craft', outputPattern: 'stick', quantity: 4 },
      { parentTask: { id: 'parent-123' } }
    );
    expect((result.metadata as any)?.parentTaskId).toBe('parent-123');
  });

  it('sets custom source in provenance', () => {
    const result = buildTaskFromRequirement(
      { kind: 'craft', outputPattern: 'stick', quantity: 4 },
      { source: 'executor' }
    );
    expect((result.metadata as any)?.taskProvenance?.source).toBe('executor');
  });

  it('does not set id or steps', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'stick', quantity: 4 });
    expect(result.id).toBeUndefined();
    expect(result.steps).toBeUndefined();
  });

  it('title override respected', () => {
    const result = buildTaskFromRequirement(
      { kind: 'collect', outputPattern: 'oak_log', quantity: 4 },
      { title: 'Gather Wood for Crafting Table' }
    );
    expect(result.title).toBe('Gather Wood for Crafting Table');
  });
});

describe('computeSubtaskKey', () => {
  it('produces deterministic key for same inputs', () => {
    const input: BuildTaskInput = { kind: 'craft', outputPattern: 'stick', quantity: 4 };
    const key1 = computeSubtaskKey(input, 'parent-1');
    const key2 = computeSubtaskKey(input, 'parent-1');
    expect(key1).toBe(key2);
  });

  it('differs when parentTaskId differs', () => {
    const input: BuildTaskInput = { kind: 'craft', outputPattern: 'stick', quantity: 4 };
    const key1 = computeSubtaskKey(input, 'parent-1');
    const key2 = computeSubtaskKey(input, 'parent-2');
    expect(key1).not.toBe(key2);
  });

  it('differs when kind differs', () => {
    const key1 = computeSubtaskKey({ kind: 'craft', outputPattern: 'stick', quantity: 4 }, 'p');
    const key2 = computeSubtaskKey({ kind: 'collect', outputPattern: 'stick', quantity: 4 }, 'p');
    expect(key1).not.toBe(key2);
  });

  it('differs when outputPattern differs', () => {
    const key1 = computeSubtaskKey({ kind: 'craft', outputPattern: 'stick', quantity: 4 }, 'p');
    const key2 = computeSubtaskKey({ kind: 'craft', outputPattern: 'oak_planks', quantity: 4 }, 'p');
    expect(key1).not.toBe(key2);
  });

  it('subtaskKey set on builder output when parentTask provided', () => {
    const result = buildTaskFromRequirement(
      { kind: 'craft', outputPattern: 'stick', quantity: 4 },
      { parentTask: { id: 'parent-1' } }
    );
    const expected = computeSubtaskKey({ kind: 'craft', outputPattern: 'stick', quantity: 4 }, 'parent-1');
    expect((result.metadata as any)?.subtaskKey).toBe(expected);
  });

  it('subtaskKey is undefined when no parentTask', () => {
    const result = buildTaskFromRequirement({ kind: 'craft', outputPattern: 'stick', quantity: 4 });
    expect((result.metadata as any)?.subtaskKey).toBeUndefined();
  });
});
