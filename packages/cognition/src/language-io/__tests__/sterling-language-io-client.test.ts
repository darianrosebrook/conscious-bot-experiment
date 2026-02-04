/**
 * Sterling Language IO Client Tests
 *
 * Tests for the single-point-of-entry language IO processing client.
 *
 * Key invariants verified:
 * - Explicit [GOAL:] tags produce executable results
 * - Natural language intent produces advisory-only (NOT executable)
 * - Execution gate is enforced before task conversion
 * - Fallback mode extracts explicit goals only
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SterlingLanguageIOClient,
  getDefaultLanguageIOClient,
  setDefaultLanguageIOClient,
  ExecutionGateError,
} from '../sterling-language-io-client';
import type { ReduceResult, ReduceError, FallbackResult } from '../sterling-language-io-client';

// =============================================================================
// Test Helpers
// =============================================================================

function isReduceResult(outcome: ReduceResult | ReduceError): outcome is ReduceResult {
  return !('code' in outcome);
}

function isFallbackResult(
  outcome: ReduceResult | FallbackResult,
): outcome is FallbackResult {
  return 'mode' in outcome && outcome.mode === 'fallback';
}

// =============================================================================
// Tests
// =============================================================================

describe('SterlingLanguageIOClient', () => {
  let client: SterlingLanguageIOClient;

  beforeEach(async () => {
    client = new SterlingLanguageIOClient({ enabled: true });
    await client.connect();
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('reduce()', () => {
    describe('Explicit Goal Tags', () => {
      it('returns executable result for explicit [GOAL:] tag', async () => {
        const outcome = await client.reduce('I see trees. [GOAL: craft wood]');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.canConvert).toBe(true);
        expect(outcome.blockReason).toBeNull();
        expect(outcome.result.is_executable).toBe(true);
        expect(outcome.result.committed_goal_prop_id).not.toBeNull();
      });

      it('preserves envelope for provenance', async () => {
        const outcome = await client.reduce('[GOAL: mine stone]', {
          modelId: 'mlx-qwen-7b',
        });

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.envelope.raw_text_verbatim).toBe('[GOAL: mine stone]');
        expect(outcome.envelope.model_id).toBe('mlx-qwen-7b');
        expect(outcome.envelope.declared_markers).toHaveLength(1);
      });

      it('handles multiple goal tags', async () => {
        const outcome = await client.reduce('[GOAL: mine stone] then [GOAL: craft pickaxe]');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.canConvert).toBe(true);
        expect(outcome.envelope.declared_markers).toHaveLength(2);
      });
    });

    describe('Natural Language Intent (CRITICAL: NOT Executable)', () => {
      it('returns NON-executable result for natural language intent', async () => {
        // THIS IS THE CRITICAL TEST
        // "I intend to explore" has advisory but NO committed goal
        const outcome = await client.reduce('I intend to explore the nearby mountains.');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.canConvert).toBe(false);
        expect(outcome.result.is_executable).toBe(false);
        expect(outcome.result.committed_goal_prop_id).toBeNull();

        // Advisory should exist for routing hints
        expect(outcome.result.advisory).not.toBeNull();
        expect(outcome.result.advisory!.intent_family).toBe('PLAN');
        expect(outcome.result.advisory!.confidence).toBeLessThan(1.0);

        // Block reason should explain why
        expect(outcome.blockReason).toContain('advisory does not grant execution');
      });

      it('returns NON-executable for "I want to" pattern', async () => {
        const outcome = await client.reduce('I want to craft a wooden pickaxe.');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.canConvert).toBe(false);
        expect(outcome.result.is_executable).toBe(false);
      });

      it('returns NON-executable for "I will" pattern', async () => {
        const outcome = await client.reduce('I will gather wood from the trees.');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.canConvert).toBe(false);
        expect(outcome.result.is_executable).toBe(false);
      });
    });

    describe('Semantically Empty Input', () => {
      it('returns non-executable for observation-only text', async () => {
        const outcome = await client.reduce('The weather is nice today.');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.canConvert).toBe(false);
        expect(outcome.result.is_executable).toBe(false);
        expect(outcome.result.is_semantically_empty).toBe(true);
        expect(outcome.result.advisory).toBeNull();
      });

      it('returns non-executable for empty string', async () => {
        const outcome = await client.reduce('');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.canConvert).toBe(false);
        expect(outcome.result.is_semantically_empty).toBe(true);
      });
    });

    describe('Duration Tracking', () => {
      it('reports duration for successful reduce', async () => {
        const outcome = await client.reduce('[GOAL: test]');

        expect(isReduceResult(outcome)).toBe(true);
        if (!isReduceResult(outcome)) return;

        expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('reduceAndRequireExecutable()', () => {
    it('returns result when executable', async () => {
      const result = await client.reduceAndRequireExecutable('[GOAL: craft wood]');

      expect(result.canConvert).toBe(true);
      expect(result.result.is_executable).toBe(true);
    });

    it('throws ExecutionGateError when not executable', async () => {
      await expect(
        client.reduceAndRequireExecutable('I intend to explore.')
      ).rejects.toThrow(ExecutionGateError);
    });

    it('throws ExecutionGateError for semantically empty input', async () => {
      await expect(
        client.reduceAndRequireExecutable('The sky is blue.')
      ).rejects.toThrow(ExecutionGateError);
    });

    it('error includes diagnostic information', async () => {
      try {
        await client.reduceAndRequireExecutable('I want to mine ore.');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExecutionGateError);
        const error = e as ExecutionGateError;
        expect(error.message).toContain('is_executable=false');
        expect(error.result).toBeDefined();
        expect(error.result.advisory).not.toBeNull();
      }
    });
  });

  describe('reduceWithFallback()', () => {
    it('returns ReduceResult when Sterling available', async () => {
      const outcome = await client.reduceWithFallback('[GOAL: craft wood]');

      expect(isFallbackResult(outcome)).toBe(false);
      if (isFallbackResult(outcome)) return;

      expect(outcome.canConvert).toBe(true);
    });

    it('returns FallbackResult with explicit goal when Sterling unavailable', async () => {
      // Create a disabled client to simulate unavailability
      const unavailableClient = new SterlingLanguageIOClient({ enabled: false });

      const outcome = await unavailableClient.reduceWithFallback(
        'I see trees. [GOAL: craft wood]'
      );

      expect(isFallbackResult(outcome)).toBe(true);
      if (!isFallbackResult(outcome)) return;

      expect(outcome.mode).toBe('fallback');
      expect(outcome.hasExplicitGoal).toBe(true);
      expect(outcome.fallbackReason).toContain('not available');
    });

    it('returns FallbackResult without goal for natural language intent', async () => {
      const unavailableClient = new SterlingLanguageIOClient({ enabled: false });

      const outcome = await unavailableClient.reduceWithFallback(
        'I intend to explore the area.'
      );

      expect(isFallbackResult(outcome)).toBe(true);
      if (!isFallbackResult(outcome)) return;

      // CRITICAL: Natural language intent in fallback mode = NO goal
      expect(outcome.hasExplicitGoal).toBe(false);
    });
  });
});

describe('Default Client Singleton', () => {
  afterEach(() => {
    setDefaultLanguageIOClient(null);
  });

  it('returns singleton instance', () => {
    const client1 = getDefaultLanguageIOClient();
    const client2 = getDefaultLanguageIOClient();

    expect(client1).toBe(client2);
  });

  it('can be replaced for testing', () => {
    const customClient = new SterlingLanguageIOClient({ enabled: false });
    setDefaultLanguageIOClient(customClient);

    const retrieved = getDefaultLanguageIOClient();
    expect(retrieved).toBe(customClient);
  });
});

describe('Three Authority Levels (Integration)', () => {
  let client: SterlingLanguageIOClient;

  beforeEach(async () => {
    client = new SterlingLanguageIOClient({ enabled: true });
    await client.connect();
  });

  afterEach(() => {
    client.disconnect();
  });

  it('COMMITTED: [GOAL:] tag → executable, canConvert=true', async () => {
    const outcome = await client.reduce('[GOAL: craft wood_planks]');

    expect(isReduceResult(outcome)).toBe(true);
    if (!isReduceResult(outcome)) return;

    expect(outcome.result.committed_goal_prop_id).not.toBeNull();
    expect(outcome.result.is_executable).toBe(true);
    expect(outcome.canConvert).toBe(true);
    expect(outcome.result.advisory?.confidence).toBe(1.0);
  });

  it('FRONTIER: "I intend to" → advisory only, canConvert=false', async () => {
    const outcome = await client.reduce('I intend to explore the mountains.');

    expect(isReduceResult(outcome)).toBe(true);
    if (!isReduceResult(outcome)) return;

    expect(outcome.result.committed_goal_prop_id).toBeNull();
    expect(outcome.result.is_executable).toBe(false);
    expect(outcome.canConvert).toBe(false);
    expect(outcome.result.advisory).not.toBeNull();
    expect(outcome.result.advisory!.confidence).toBeLessThan(1.0);
  });

  it('EMPTY: observation only → no advisory, canConvert=false', async () => {
    const outcome = await client.reduce('I see a tree nearby.');

    expect(isReduceResult(outcome)).toBe(true);
    if (!isReduceResult(outcome)) return;

    expect(outcome.result.committed_goal_prop_id).toBeNull();
    expect(outcome.result.is_executable).toBe(false);
    expect(outcome.result.is_semantically_empty).toBe(true);
    expect(outcome.canConvert).toBe(false);
  });
});
