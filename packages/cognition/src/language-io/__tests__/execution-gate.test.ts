/**
 * Execution Gate Tests
 *
 * Tests for the execution gate that controls task conversion.
 *
 * Key invariants verified:
 * - canConvertToTask uses is_executable ONLY, not advisory
 * - Advisory presence does NOT grant execution authority
 * - Grounding failure blocks execution even with committed goal
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  canConvertToTask,
  requireExecutable,
  ExecutionGateError,
  getExecutionBlockReason,
  isSemanticEmpty,
} from '../execution-gate';
import type { ReducerResultView } from '../reducer-result-types';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeResult(overrides: Partial<ReducerResultView> = {}): ReducerResultView {
  return {
    committed_goal_prop_id: null,
    committed_ir_digest: 'ling_ir:test123',
    source_envelope_id: 'env_456',
    is_executable: false,
    is_semantically_empty: true,
    advisory: null,
    grounding: null,
    schema_version: '1.1.0',
    reducer_version: 'intent_reducer/v1.0.0',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Execution Gate', () => {
  describe('canConvertToTask', () => {
    it('returns true when is_executable is true', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123',
        is_executable: true,
        is_semantically_empty: false,
        advisory: { intent_family: 'PLAN', intent_type: 'TASK_DECOMPOSE', confidence: 1.0, suggested_domain: 'planning' },
        grounding: { passed: true, reason: 'Grounding passed', world_snapshot_digest: 'snap_abc' },
      });

      expect(canConvertToTask(result)).toBe(true);
    });

    it('returns false when is_executable is false (advisory exists but not sufficient)', () => {
      // THIS IS THE CRITICAL TEST
      // Advisory exists with reasonable confidence, but NO committed goal
      const result = makeResult({
        committed_goal_prop_id: null, // No committed goal!
        is_executable: false, // Therefore not executable
        is_semantically_empty: false, // Has frontier content
        advisory: { intent_family: 'PLAN', intent_type: 'TASK_DECOMPOSE', confidence: 0.7, suggested_domain: 'planning' },
      });

      // Advisory presence does NOT grant execution authority
      expect(canConvertToTask(result)).toBe(false);
    });

    it('returns false when is_executable is false (high confidence advisory)', () => {
      // Even 100% confidence advisory doesn't grant execution
      const result = makeResult({
        committed_goal_prop_id: null,
        is_executable: false,
        advisory: { intent_family: 'PLAN', intent_type: 'TASK_DECOMPOSE', confidence: 1.0, suggested_domain: 'planning' },
      });

      expect(canConvertToTask(result)).toBe(false);
    });

    it('returns false when grounding failed', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123', // Has committed goal
        is_executable: false, // But grounding failed
        is_semantically_empty: false,
        advisory: { intent_family: 'PLAN', intent_type: 'TASK_DECOMPOSE', confidence: 1.0, suggested_domain: 'planning' },
        grounding: { passed: false, reason: 'Entity not found in world', world_snapshot_digest: 'snap_abc' },
      });

      expect(canConvertToTask(result)).toBe(false);
    });

    it('returns false for semantically empty results', () => {
      const result = makeResult({
        committed_goal_prop_id: null,
        is_executable: false,
        is_semantically_empty: true,
        advisory: null,
      });

      expect(canConvertToTask(result)).toBe(false);
    });

    it('returns true without grounding when grounding was not performed', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123',
        is_executable: true,
        is_semantically_empty: false,
        grounding: null, // Grounding not performed
      });

      expect(canConvertToTask(result)).toBe(true);
    });
  });

  describe('requireExecutable', () => {
    it('does not throw when executable', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123',
        is_executable: true,
        is_semantically_empty: false,
      });

      expect(() => requireExecutable(result)).not.toThrow();
    });

    it('throws ExecutionGateError when not executable', () => {
      const result = makeResult({
        committed_goal_prop_id: null,
        is_executable: false,
        is_semantically_empty: true,
        advisory: { intent_family: 'PLAN', intent_type: null, confidence: 0.7, suggested_domain: null },
      });

      expect(() => requireExecutable(result)).toThrow(ExecutionGateError);
    });

    it('includes useful context in error message', () => {
      const result = makeResult({
        committed_goal_prop_id: null,
        is_executable: false,
        advisory: { intent_family: 'NAVIGATE', intent_type: 'EXPLORE', confidence: 0.8, suggested_domain: 'navigation' },
      });

      try {
        requireExecutable(result);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExecutionGateError);
        const error = e as ExecutionGateError;
        expect(error.message).toContain('is_executable=false');
        expect(error.message).toContain('committed_goal_prop_id=null');
        expect(error.message).toContain('NAVIGATE');
      }
    });

    it('includes grounding failure in error message', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123',
        is_executable: false,
        grounding: { passed: false, reason: 'diamond not found', world_snapshot_digest: 'snap_abc' },
      });

      try {
        requireExecutable(result);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExecutionGateError);
        const error = e as ExecutionGateError;
        expect(error.message).toContain('passed=false');
      }
    });
  });

  describe('getExecutionBlockReason', () => {
    it('returns null for executable results', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123',
        is_executable: true,
      });

      expect(getExecutionBlockReason(result)).toBeNull();
    });

    it('explains missing committed goal', () => {
      const result = makeResult({
        committed_goal_prop_id: null,
        is_executable: false,
        advisory: null,
      });

      const reason = getExecutionBlockReason(result);
      expect(reason).toContain('No committed goal');
      expect(reason).toContain('[GOAL: ...]');
    });

    it('explains advisory does not grant authority', () => {
      const result = makeResult({
        committed_goal_prop_id: null,
        is_executable: false,
        advisory: { intent_family: 'PLAN', intent_type: 'CRAFT', confidence: 0.85, suggested_domain: 'planning' },
      });

      const reason = getExecutionBlockReason(result);
      expect(reason).toContain('advisory does not grant execution authority');
      expect(reason).toContain('85%');
      expect(reason).toContain('PLAN');
    });

    it('explains grounding failure', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123',
        is_executable: false,
        grounding: { passed: false, reason: 'iron_ore not found nearby', world_snapshot_digest: 'snap_abc' },
      });

      const reason = getExecutionBlockReason(result);
      expect(reason).toContain('Grounding failed');
      expect(reason).toContain('iron_ore not found nearby');
    });
  });

  describe('isSemanticEmpty', () => {
    it('returns true for empty results', () => {
      const result = makeResult({
        is_semantically_empty: true,
      });

      expect(isSemanticEmpty(result)).toBe(true);
    });

    it('returns false for non-empty results', () => {
      const result = makeResult({
        is_semantically_empty: false,
        advisory: { intent_family: 'NAVIGATE', intent_type: 'EXPLORE', confidence: 0.7, suggested_domain: null },
      });

      expect(isSemanticEmpty(result)).toBe(false);
    });

    it('returns false for executable results', () => {
      const result = makeResult({
        committed_goal_prop_id: 'prop_123',
        is_executable: true,
        is_semantically_empty: false,
      });

      expect(isSemanticEmpty(result)).toBe(false);
    });
  });
});

describe('Three Authority Levels', () => {
  // These tests document the three authority levels:
  // 1. COMMITTED - has committed goal, is executable
  // 2. FRONTIER - has advisory but no committed goal, not executable
  // 3. EMPTY - no semantic content detected

  it('COMMITTED: explicit goal tag grants execution', () => {
    const result = makeResult({
      committed_goal_prop_id: 'prop_craft_wood',
      is_executable: true,
      is_semantically_empty: false,
      advisory: { intent_family: 'PLAN', intent_type: 'CRAFT', confidence: 1.0, suggested_domain: 'planning' },
      grounding: { passed: true, reason: 'All entities found', world_snapshot_digest: 'snap_abc' },
    });

    expect(canConvertToTask(result)).toBe(true);
    expect(isSemanticEmpty(result)).toBe(false);
    expect(result.committed_goal_prop_id).not.toBeNull();
  });

  it('FRONTIER: natural language intent without tag is NOT executable', () => {
    // "I intend to explore the area" - no [GOAL:] tag
    const result = makeResult({
      committed_goal_prop_id: null, // No explicit goal!
      is_executable: false,
      is_semantically_empty: false, // Has frontier content
      advisory: { intent_family: 'NAVIGATE', intent_type: 'EXPLORE', confidence: 0.7, suggested_domain: 'navigation' },
    });

    expect(canConvertToTask(result)).toBe(false);
    expect(isSemanticEmpty(result)).toBe(false);
    expect(result.advisory).not.toBeNull();
  });

  it('EMPTY: no semantic content detected', () => {
    // "The weather is nice today"
    const result = makeResult({
      committed_goal_prop_id: null,
      is_executable: false,
      is_semantically_empty: true,
      advisory: null,
    });

    expect(canConvertToTask(result)).toBe(false);
    expect(isSemanticEmpty(result)).toBe(true);
    expect(result.advisory).toBeNull();
  });
});
